import type { Env } from "../lib/env";
import { queryAll, queryFirst, execute, now, nanoid } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

// ---------- GET /v1/agent-feed/export ----------
// Returns a compact operational digest for the Paperclip agent plane.
// Auth: bearer token == TF_WEBHOOK_HMAC_SECRET (same as the non-release
// internal callback surfaces).

export async function handleAgentFeedExport(env: Env): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError(
      { code: "db_unavailable", message: "TEAMFORGE_DB binding not set.", retryable: true },
      503,
    );
  }

  const openProjects = await queryAll<{ id: string; slug: string | null; name: string; status: string; client_name: string | null; updated_at: string }>(
    env.TEAMFORGE_DB,
    `SELECT id, slug, name, status, client_name, updated_at
     FROM projects
     WHERE status IN ('active','in_progress','planning')
     ORDER BY updated_at DESC
     LIMIT 200`,
  ).catch(() => []);

  const syncConflicts = await queryAll<{ id: string; project_id: string; conflict_type: string; detected_at: string; resolved_at: string | null }>(
    env.TEAMFORGE_DB,
    `SELECT id, project_id, conflict_type, detected_at, resolved_at
     FROM sync_conflicts
     WHERE resolved_at IS NULL
     ORDER BY detected_at DESC
     LIMIT 100`,
  ).catch(() => []);

  const recentJournal = await queryAll<{ id: string; project_id: string; operation: string; status: string; created_at: string }>(
    env.TEAMFORGE_DB,
    `SELECT id, project_id, operation, status, created_at
     FROM sync_journal
     ORDER BY created_at DESC
     LIMIT 50`,
  ).catch(() => []);

  return jsonOk({
    generated_at: now(),
    environment: env.TF_ENV,
    counts: {
      open_projects: openProjects.length,
      unresolved_conflicts: syncConflicts.length,
      recent_journal_entries: recentJournal.length,
    },
    open_projects: openProjects,
    unresolved_conflicts: syncConflicts,
    recent_journal: recentJournal,
  });
}

// ---------- POST /v1/projects/scaffold ----------
// Accepts: { name, client_name?, project_type?, preferred_slug? }
// Returns: { slug, id, scaffold: { templates_to_populate: [...], frontmatter: {...} } }
// Enforces slug uniqueness; if preferred_slug collides, auto-suffix with -2, -3, etc.

interface ScaffoldRequest {
  name?: string;
  client_name?: string;
  project_type?: string;
  preferred_slug?: string;
  owner?: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "project";
}

export async function handleProjectScaffold(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "TEAMFORGE_DB binding not set.", retryable: true }, 503);
  }

  let body: ScaffoldRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  const name = body.name?.trim();
  if (!name) {
    return jsonError({ code: "missing_fields", message: "name is required.", retryable: false }, 400);
  }

  const base = slugify(body.preferred_slug ?? body.client_name ?? name);
  let slug = base;
  let suffix = 2;
  while (await queryFirst(env.TEAMFORGE_DB, `SELECT 1 FROM projects WHERE slug = ?`, slug)) {
    slug = `${base}-${suffix++}`;
    if (suffix > 100) {
      return jsonError({ code: "slug_exhausted", message: "Could not mint a unique slug after 100 attempts.", retryable: false }, 409);
    }
  }

  const id = nanoid();
  const ts = now();
  const workspaceId = "default"; // TODO: resolve from env/context when multi-workspace lands
  try {
    await execute(
      env.TEAMFORGE_DB,
      `INSERT INTO projects (id, workspace_id, name, slug, client_name, project_type, status, visibility, sync_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'planning', 'private', 'manual', ?, ?)`,
      id, workspaceId, name, slug, body.client_name ?? null, body.project_type ?? null, ts, ts,
    );
  } catch (e) {
    return jsonError(
      { code: "scaffold_insert_failed", message: `Failed to insert project row: ${(e as Error).message}`, retryable: true },
      500,
    );
  }

  return jsonOk({
    slug,
    id,
    created_at: ts,
    scaffold: {
      vault_path: `01-Projects/thoughtseed/${slug}/`,
      templates_to_populate: [
        { source: "80-templates/project-brief-template.md", dest: `${slug}/project-brief.md` },
        { source: "80-templates/technical-spec-template.md", dest: `${slug}/technical-spec.md` },
        { source: "60-client-ecosystem/client-profile-template.md", dest: `${slug}/client-profile.md` },
      ],
      frontmatter: {
        project_id: slug,
        client_id: body.client_name ? slugify(body.client_name) : null,
        owner: body.owner ?? null,
        status: "draft",
        created: ts.slice(0, 10),
        updated: ts.slice(0, 10),
      },
    },
  });
}

// ---------- GET /v1/projects/{slug}/closeout ----------
// Returns a closeout bundle for a completed project: markdown summary + etag.
// CEO polls this and writes the markdown to the vault, skipping if etag already recorded.

export async function handleProjectCloseout(env: Env, slug: string): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "TEAMFORGE_DB binding not set.", retryable: true }, 503);
  }

  const project = await queryFirst<{ id: string; slug: string | null; name: string; status: string; client_name: string | null; created_at: string; updated_at: string }>(
    env.TEAMFORGE_DB,
    `SELECT id, slug, name, status, client_name, created_at, updated_at FROM projects WHERE slug = ? LIMIT 1`,
    slug,
  );

  if (!project) {
    return jsonError({ code: "project_not_found", message: `No project with slug '${slug}'.`, retryable: false }, 404);
  }

  if (project.status !== "completed") {
    return jsonOk({
      slug,
      ready: false,
      reason: `Project status is '${project.status}', not 'completed'. Closeout not available.`,
    });
  }

  // Build closeout markdown from available ops data.
  // Milestones aren't stored directly in D1 — they live in GitHub/Huly via project_github_links
  // and project_huly_links. For now the closeout just surfaces link counts; richer milestone
  // detail can flow in via a follow-up once the Queue consumer lands.
  const githubLinks = await queryAll<{ repo_owner: string; repo_name: string }>(
    env.TEAMFORGE_DB,
    `SELECT repo_owner, repo_name FROM project_github_links WHERE project_id = ?`,
    project.id,
  ).catch(() => []);
  const hulyLinks = await queryAll<{ huly_project_id: string }>(
    env.TEAMFORGE_DB,
    `SELECT huly_project_id FROM project_huly_links WHERE project_id = ?`,
    project.id,
  ).catch(() => []);

  const markdown = [
    "---",
    `project_id: ${project.slug ?? slug}`,
    `closeout_date: ${now().slice(0, 10)}`,
    `generated_at: ${now()}`,
    `author_agent: ceo`,
    "---",
    "",
    `# Closeout — ${project.name}`,
    "",
    `**Client:** ${project.client_name ?? "—"}`,
    `**Started:** ${project.created_at.slice(0, 10)}`,
    `**Completed:** ${project.updated_at.slice(0, 10)}`,
    "",
    "## Integrations",
    githubLinks.length
      ? githubLinks.map((l) => `- GitHub: ${l.repo_owner}/${l.repo_name}`).join("\n")
      : "- (no GitHub repos linked)",
    hulyLinks.length
      ? hulyLinks.map((l) => `- Huly: ${l.huly_project_id}`).join("\n")
      : "- (no Huly projects linked)",
    "",
    "## Summary",
    "",
    "_This closeout was auto-generated. Add narrative notes below before archiving._",
    "",
  ].join("\n");

  // Compute etag as sha256 of markdown.
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(markdown));
  const etag = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return jsonOk({
    slug,
    ready: true,
    etag,
    markdown,
    metadata: {
      project_name: project.name,
      client_name: project.client_name,
      github_link_count: githubLinks.length,
      huly_link_count: hulyLinks.length,
    },
  });
}
