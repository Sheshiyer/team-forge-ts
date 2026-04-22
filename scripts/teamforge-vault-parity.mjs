#!/usr/bin/env node

/**
 * One-shot parity import from thoughtseed-labs project briefs into TeamForge.
 *
 * Default mode is dry-run. The script scans project-brief.md files under the
 * labs vault, normalizes a minimal TeamForge project graph, compares it against
 * the current TeamForge registry when reachable, and can optionally apply the
 * merged result through the existing Worker project-mappings endpoint.
 *
 * This is intentionally not part of TeamForge steady-state sync. It is a
 * bootstrap / parity tool for one-run reconciliation only.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const DEFAULT_VAULT_ROOT =
  "/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs";
const DEFAULT_WORKER_BASE_URL =
  process.env.TF_API_BASE_URL ??
  process.env.TEAMFORGE_API_BASE_URL ??
  "https://teamforge-api.sheshnarayan-iyer.workers.dev";
const DEFAULT_STATUSES = [
  "active",
  "completed",
  "paused",
  "draft",
  "planning",
  "white-labelable",
];
const PARITY_ARTIFACT_SOURCE = "thoughtseed-labs-parity";
const LEGACY_EXTERNAL_ID_SOURCE = "thoughtseed-labs";
const DEFAULT_TEAMFORGE_DB_PATH =
  process.env.TEAMFORGE_DB_PATH ??
  path.join(
    os.homedir(),
    "Library/Application Support/com.thoughtseed.teamforge/teamforge.db",
  );

function printHelp() {
  console.log(`Usage:
  node scripts/teamforge-vault-parity.mjs [options]

Options:
  --apply                    Write merged project graphs to TeamForge.
  --local-only               Skip TeamForge API reads and operate from vault only.
  --vault-root <path>        Override labs vault root.
  --worker-base-url <url>    Override TeamForge Worker base URL.
  --teamforge-db <path>      Override local TeamForge SQLite database path for KPI imports.
  --workspace-id <id>        Required for --apply when creating new TeamForge projects.
  --project <slug>           Limit to one or more project_id values.
  --report <path>            Write JSON report to disk.
  --help                     Show this help.

Examples:
  node scripts/teamforge-vault-parity.mjs --local-only
  node scripts/teamforge-vault-parity.mjs --workspace-id tf-prod --apply
  node scripts/teamforge-vault-parity.mjs --local-only --apply --teamforge-db ~/Library/Application\\ Support/com.thoughtseed.teamforge/teamforge.db
  node scripts/teamforge-vault-parity.mjs --project axtech --project heyzack --report /tmp/teamforge-parity.json
`);
}

function parseArgs(argv) {
  const args = {
    apply: false,
    localOnly: false,
    vaultRoot: DEFAULT_VAULT_ROOT,
    workerBaseUrl: DEFAULT_WORKER_BASE_URL,
    teamforgeDbPath: DEFAULT_TEAMFORGE_DB_PATH,
    workspaceId: process.env.TEAMFORGE_WORKSPACE_ID ?? null,
    projects: new Set(),
    reportPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    }
    if (value === "--apply") {
      args.apply = true;
      continue;
    }
    if (value === "--local-only") {
      args.localOnly = true;
      continue;
    }
    if (value === "--vault-root") {
      args.vaultRoot = argv[++index];
      continue;
    }
    if (value === "--worker-base-url") {
      args.workerBaseUrl = argv[++index];
      continue;
    }
    if (value === "--teamforge-db") {
      args.teamforgeDbPath = argv[++index];
      continue;
    }
    if (value === "--workspace-id") {
      args.workspaceId = argv[++index];
      continue;
    }
    if (value === "--project") {
      args.projects.add(argv[++index]);
      continue;
    }
    if (value === "--report") {
      args.reportPath = argv[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  return args;
}

async function walk(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(childPath)));
    } else {
      files.push(childPath);
    }
  }
  return files;
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (!value.length) return "";
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => parseScalar(part));
  }
  return value;
}

function parseExternalRef(line) {
  const match = line.match(
    /^\s*-\s*\{\s*system:\s*("?)([^,"}]+)\1\s*,\s*id:\s*("?)([^"}]+)\3\s*\}\s*$/,
  );
  if (!match) return null;
  return {
    system: match[2].trim(),
    id: match[4].trim(),
  };
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) {
    return { data: {}, body: text };
  }
  const endIndex = text.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { data: {}, body: text };
  }

  const frontmatter = text.slice(4, endIndex);
  const body = text.slice(endIndex + 5);
  const data = {};
  let openListKey = null;

  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const fieldMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, rawValue] = fieldMatch;
      if (rawValue.trim().length === 0) {
        if (key === "external_refs") {
          data.external_refs = [];
          openListKey = "external_refs";
        } else {
          data[key] = "";
          openListKey = null;
        }
      } else {
        data[key] = parseScalar(rawValue);
        openListKey = null;
      }
      continue;
    }

    if (openListKey === "external_refs") {
      const parsed = parseExternalRef(line);
      if (parsed) {
        data.external_refs.push(parsed);
      }
    }
  }

  return { data, body };
}

function titleizeSlug(value) {
  return String(value ?? "")
    .split(/[-_]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeOptionalString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeOptionalString(entry))
      .filter(Boolean);
  }
  const normalized = normalizeOptionalString(value);
  return normalized ? [normalized] : [];
}

function normalizeNullableBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeOptionalString(value)?.toLowerCase() ?? null;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

async function readMarkdownNote(filePath, vaultRoot) {
  const [contents, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
  const { data, body } = parseFrontmatter(contents);
  const relativePath = path.relative(vaultRoot, filePath);
  const relativeParts = relativePath.split(path.sep);
  return {
    contents,
    data,
    body,
    stats,
    filePath,
    relativePath,
    relativeParts,
    heading: normalizeHeading(body.match(/^#\s+(.+)$/m)?.[1] ?? ""),
  };
}

function normalizeHeading(heading) {
  return String(heading ?? "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

function normalizeStatus(input, tags = []) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "planning";
  if (raw === "in progress" || raw === "in-progress") return "active";
  if (raw === "cancelled" || raw === "canceled" || raw === "archived") return "completed";
  if (raw === "proposal-stage" || raw === "proposal stage") return "planning";
  if (DEFAULT_STATUSES.includes(raw)) return raw;
  if (Array.isArray(tags) && tags.includes("archived")) return "completed";
  return raw;
}

function normalizeOnboardingStatus(input) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "draft";
  if (raw === "in-progress") return "in_progress";
  return raw;
}

function countByField(records, fieldName) {
  return records.reduce((accumulator, record) => {
    const key = record[fieldName] ?? "unknown";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

function countByArtifactType(records) {
  return records.reduce((accumulator, record) => {
    const key = record.artifactType ?? "unknown";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

function summarizeMissingPaths(label, paths, sampleLimit = 5) {
  if (paths.length === 0) return [];
  const samples = paths.slice(0, sampleLimit).join(", ");
  const remainder = paths.length > sampleLimit ? `, +${paths.length - sampleLimit} more` : "";
  return [`Missing ${label} at ${paths.length} expected location(s): ${samples}${remainder}`];
}

function extractYamlCodeBlocks(body) {
  const blocks = [];
  const pattern = /```ya?ml\s*\n([\s\S]*?)\n```/gi;
  let match = pattern.exec(String(body ?? ""));
  while (match) {
    blocks.push(match[1]);
    match = pattern.exec(String(body ?? ""));
  }
  return blocks;
}

function parseYamlInlineValue(rawValue) {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed.length) return "";
  return parseScalar(trimmed);
}

function parseTaskList(body) {
  for (const block of extractYamlCodeBlocks(body)) {
    const lines = block.split(/\r?\n/);
    let inTasks = false;
    let currentTask = null;
    const tasks = [];

    const pushTask = () => {
      if (!currentTask) return;
      tasks.push(currentTask);
      currentTask = null;
    };

    for (const line of lines) {
      if (!inTasks) {
        if (/^\s*tasks:\s*$/.test(line)) {
          inTasks = true;
        }
        continue;
      }

      const taskStartMatch = line.match(/^\s*-\s*task_id:\s*(.*)$/);
      if (taskStartMatch) {
        pushTask();
        currentTask = {
          task_id: parseYamlInlineValue(taskStartMatch[1]),
        };
        continue;
      }

      const propertyMatch = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
      if (propertyMatch && currentTask) {
        const [, key, rawValue] = propertyMatch;
        currentTask[key] = parseYamlInlineValue(rawValue);
        continue;
      }
    }

    pushTask();
    if (tasks.length > 0) {
      return tasks.map((task, index) => ({
        taskId: normalizeOptionalString(task.task_id),
        title: normalizeOptionalString(task.title),
        completed: normalizeNullableBoolean(task.completed) ?? false,
        completedAt: normalizeOptionalString(task.completed_at),
        resourceCreated: normalizeOptionalString(task.resource_created),
        notes: normalizeOptionalString(task.notes),
        order: index,
      }));
    }
  }

  return [];
}

function resolveProjectBriefRecordForPath(filePath, clientRoot, projectBriefByDir) {
  let currentDir = path.dirname(filePath);
  const normalizedClientRoot = path.resolve(clientRoot);
  while (currentDir.startsWith(normalizedClientRoot)) {
    const record = projectBriefByDir.get(currentDir);
    if (record) {
      return record;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

function detectProjectArtifactType(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");
  if (normalizedPath.endsWith("/technical-spec.md")) return "vault-technical-spec";
  if (normalizedPath.includes("/design/")) return "vault-design-doc";
  if (normalizedPath.includes("/research/")) return "vault-research-doc";
  if (normalizedPath.includes("/closeouts/")) return "vault-closeout-doc";
  return null;
}

function buildProjectArtifactPayload(record) {
  if (!record.projectId) return null;
  return {
    artifactType: record.artifactType,
    title: record.title,
    url: pathToFileURL(record.filePath).href,
    source: PARITY_ARTIFACT_SOURCE,
    externalId: record.externalId,
    isPrimary: false,
  };
}

function buildParityArtifacts({ filePath, projectId, projectName, source, sourceUrl, externalRefs }) {
  const artifacts = [
    {
      artifactType: "vault-project-brief",
      title: `Vault project brief - ${projectName}`,
      url: pathToFileURL(filePath).href,
      source: PARITY_ARTIFACT_SOURCE,
      externalId: projectId,
      isPrimary: true,
    },
  ];

  if (sourceUrl) {
    artifacts.push({
      artifactType: "source-record",
      title: `Imported source (${source || "external"}) - ${projectName}`,
      url: sourceUrl,
      source: PARITY_ARTIFACT_SOURCE,
      externalId: externalRefs?.[0]?.id ?? projectId,
      isPrimary: false,
    });
  }

  return artifacts;
}

function normalizeProjectBrief(filePath, vaultRoot) {
  return Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]).then(([contents, stats]) => {
    const { data, body } = parseFrontmatter(contents);
    const relativePath = path.relative(vaultRoot, filePath);
    const relativeParts = relativePath.split(path.sep);
    const topClientFolder = relativeParts[1] ?? relativeParts[0];
    const projectId = String(data.project_id ?? "").trim();
    const heading = normalizeHeading(body.match(/^#\s+(.+)$/m)?.[1] ?? "");
    const warnings = [];

    if (!projectId) {
      warnings.push("Missing project_id in frontmatter.");
    }
    if (!heading) {
      warnings.push("Missing H1 title; using slug-derived project name.");
    }

    const projectName = heading || titleizeSlug(projectId || path.basename(path.dirname(filePath)));
    const parentProject = String(data.parent_project ?? "").trim() || null;
    const clientId = String(data.client_id ?? "").trim() || null;
    const source = String(data.source ?? "").trim() || null;
    const sourceUrl = String(data.source_url ?? "").trim() || null;
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    const projectType = parentProject ? "deliverable" : "client-engagement";
    const portfolioName = parentProject ? titleizeSlug(parentProject) : null;
    const clientName = clientId ? titleizeSlug(clientId) : titleizeSlug(topClientFolder);
    const status = normalizeStatus(data.status, tags);

    return {
      key: projectId,
      relativePath,
      filePath,
      projectId,
      parentProject,
      metadata: {
        name: projectName,
        slug: projectId || null,
        portfolioName,
        clientName: clientName || null,
        projectType,
        status,
        visibility: "workspace",
        syncMode: "manual",
      },
      artifacts: buildParityArtifacts({
        filePath,
        projectId,
        projectName,
        source,
        sourceUrl,
        externalRefs: Array.isArray(data.external_refs) ? data.external_refs : [],
      }),
      source: {
        filePath,
        relativePath,
        lastModifiedAt: stats.mtime.toISOString(),
        owner: String(data.owner ?? "").trim() || null,
        clientId,
        source,
        sourceUrl,
        tags,
      },
      warnings,
    };
  });
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSlug(value) {
  return normalizeKey(value).replace(/\s+/g, "-");
}

function parseMarkdownSections(body) {
  const sections = [];
  const lines = String(body ?? "").split(/\r?\n/);
  let currentTitle = null;
  let currentLines = [];

  const pushSection = () => {
    if (!currentTitle) return;
    sections.push({
      title: currentTitle,
      key: normalizeKey(currentTitle),
      content: currentLines.join("\n").trim(),
    });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      pushSection();
      currentTitle = headingMatch[1].trim();
      currentLines = [];
      continue;
    }
    if (currentTitle) {
      currentLines.push(line);
    }
  }

  pushSection();
  return sections;
}

function findSectionContent(sections, keyPrefix) {
  return sections.find((section) => section.key.startsWith(keyPrefix))?.content ?? null;
}

function parseChecklistOrBulletList(sectionContent) {
  return String(sectionContent ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- \[[ xX]\]\s*/, "").replace(/^- /, "").trim())
    .filter(Boolean);
}

function normalizeKpiNote(filePath, vaultRoot) {
  return Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]).then(([contents, stats]) => {
    const { data, body } = parseFrontmatter(contents);
    const relativePath = path.relative(vaultRoot, filePath);
    const heading = normalizeHeading(body.match(/^#\s+(.+)$/m)?.[1] ?? "");
    const baseName = path.basename(filePath, ".md").replace(/-kpi$/i, "");
    const memberId = String(data.member_id ?? "").trim() || baseName;
    const sections = parseMarkdownSections(body);
    const warnings = [];

    if (!memberId) {
      warnings.push("Missing member_id in frontmatter.");
    }
    if (!heading) {
      warnings.push("Missing H1 title; using filename-derived KPI title.");
    }

    return {
      key: memberId,
      memberId,
      title: heading || titleizeSlug(baseName),
      relativePath,
      filePath,
      roleTemplate: normalizeOptionalString(data.role_template),
      roleTemplateFile: normalizeOptionalString(data.role_template_file),
      kpiVersion: normalizeOptionalString(data.kpi_version) ?? "unspecified",
      lastReviewed: normalizeOptionalString(data.last_reviewed),
      reportsTo: normalizeOptionalString(data.reports_to),
      tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      roleScopeMarkdown: findSectionContent(sections, "role scope"),
      monthlyKpis: parseChecklistOrBulletList(findSectionContent(sections, "monthly kpis")),
      quarterlyMilestones: parseChecklistOrBulletList(
        findSectionContent(sections, "quarterly milestones"),
      ),
      yearlyMilestones: parseChecklistOrBulletList(findSectionContent(sections, "yearly milestones")),
      crossRoleDependencies: parseChecklistOrBulletList(
        findSectionContent(sections, "cross role dependencies"),
      ),
      evidenceSources: parseChecklistOrBulletList(findSectionContent(sections, "evidence sources")),
      compensationMilestones: parseChecklistOrBulletList(
        findSectionContent(sections, "compensation linked milestones"),
      ),
      gapFlags: parseChecklistOrBulletList(findSectionContent(sections, "gap flags")),
      synthesisReviewMarkdown: findSectionContent(sections, "synthesis agent review"),
      bodyMarkdown: body.trim(),
      source: {
        filePath,
        relativePath,
        lastModifiedAt: stats.mtime.toISOString(),
      },
      warnings,
    };
  });
}

async function normalizeClientProfile(filePath, vaultRoot) {
  const note = await readMarkdownNote(filePath, vaultRoot);
  const { data, body, filePath: absolutePath, heading, relativePath, relativeParts, stats } = note;
  const clientFolder = relativeParts[1] ?? null;
  const clientId = normalizeOptionalString(data.client_id);
  const clientName = normalizeOptionalString(data.client_name) ?? heading;
  const engagementModel = normalizeOptionalString(data.engagement_model);
  const active = normalizeNullableBoolean(data.active);
  const warnings = [];

  if (!clientId) {
    warnings.push("Missing client_id in frontmatter.");
  }
  if (!clientName) {
    warnings.push("Missing client_name in frontmatter or H1 heading.");
  }
  if (!engagementModel) {
    warnings.push("Missing engagement_model in frontmatter.");
  }
  if (active === null) {
    warnings.push("Missing active boolean in frontmatter.");
  }

  return {
    key: clientId ?? relativePath,
    clientId,
    clientFolder,
    clientName,
    engagementModel,
    active,
    industry: normalizeOptionalString(data.industry),
    primaryContact: normalizeOptionalString(data.primary_contact),
    onboarded: normalizeOptionalString(data.onboarded),
    projectIds: normalizeStringArray(data.project_ids),
    stakeholders: normalizeStringArray(data.stakeholders),
    strategicFit: normalizeStringArray(data.strategic_fit),
    risks: normalizeStringArray(data.risks),
    resourceLinks: normalizeStringArray(data.resource_links),
    tags: normalizeStringArray(data.tags),
    bodyMarkdown: body.trim(),
    filePath: absolutePath,
    relativePath,
    source: {
      filePath: absolutePath,
      relativePath,
      lastModifiedAt: stats.mtime.toISOString(),
    },
    readyForApply: Boolean(clientId && clientName && engagementModel && active !== null),
    warnings,
  };
}

async function normalizeProjectArtifact(filePath, vaultRoot, clientRoot, projectBriefByDir) {
  const note = await readMarkdownNote(filePath, vaultRoot);
  const { data, body, filePath: absolutePath, heading, relativePath, relativeParts, stats } = note;
  const artifactType = detectProjectArtifactType(relativePath);
  const projectBriefRecord = resolveProjectBriefRecordForPath(absolutePath, clientRoot, projectBriefByDir);
  const clientFolder = relativeParts[1] ?? null;
  const warnings = [];
  const projectId =
    normalizeOptionalString(data.project_id) ??
    normalizeOptionalString(projectBriefRecord?.projectId);
  const title =
    heading ??
    normalizeOptionalString(data.title) ??
    titleizeSlug(path.basename(filePath, ".md"));
  const externalId =
    normalizeOptionalString(data.external_id) ??
    normalizeOptionalString(data.doc_id) ??
    normalizeOptionalString(data.artifact_id);

  if (!artifactType) {
    warnings.push("Could not determine artifact type from path.");
  }
  if (!projectId) {
    warnings.push("Missing project_id and no ancestor project-brief.md was found.");
  }
  if (!title) {
    warnings.push("Missing title and H1 heading.");
  }

  return {
    key: `${relativePath}::${artifactType ?? "unknown"}`,
    projectId,
    clientId:
      normalizeOptionalString(data.client_id) ??
      normalizeOptionalString(projectBriefRecord?.source?.clientId),
    clientFolder,
    artifactType,
    title,
    externalId,
    bodyMarkdown: body.trim(),
    filePath: absolutePath,
    relativePath,
    source: {
      filePath: absolutePath,
      relativePath,
      lastModifiedAt: stats.mtime.toISOString(),
      source: normalizeOptionalString(data.source),
      sourceUrl: normalizeOptionalString(data.source_url),
    },
    artifact: artifactType
      ? buildProjectArtifactPayload({
          artifactType,
          title,
          filePath: absolutePath,
          projectId,
          externalId,
        })
      : null,
    readyForApply: Boolean(projectId && artifactType && title),
    warnings,
  };
}

async function normalizeOnboardingFlow(filePath, vaultRoot, family, fallbackWorkspaceId) {
  const note = await readMarkdownNote(filePath, vaultRoot);
  const { data, body, filePath: absolutePath, relativePath, relativeParts, stats } = note;
  const expectedAudience = family === "client" ? "client" : "employee";
  const workspaceId =
    normalizeOptionalString(data.workspace_id) ?? normalizeOptionalString(fallbackWorkspaceId);
  const flowId = normalizeOptionalString(data.flow_id);
  const audience = normalizeOptionalString(data.audience)?.toLowerCase() ?? null;
  const warnings = [];
  const tasks = parseTaskList(body);

  if (!flowId) {
    warnings.push("Missing flow_id in frontmatter.");
  }
  if (audience !== expectedAudience) {
    warnings.push(`Expected audience '${expectedAudience}' but found '${audience ?? "missing"}'.`);
  }
  if (!workspaceId) {
    warnings.push("Missing workspace_id in frontmatter and no fallback workspace was provided.");
  }
  if (tasks.length === 0) {
    warnings.push("No onboarding tasks were found in the note body.");
  }

  const baseRecord = {
    key: flowId ?? relativePath,
    family,
    audience: expectedAudience,
    flowId,
    workspaceId,
    owner: normalizeOptionalString(data.owner),
    status: normalizeOnboardingStatus(data.status),
    startsOn: normalizeOptionalString(data.starts_on),
    bodyMarkdown: body.trim(),
    tasks,
    filePath: absolutePath,
    relativePath,
    source: {
      filePath: absolutePath,
      relativePath,
      lastModifiedAt: stats.mtime.toISOString(),
    },
    warnings,
  };

  if (family === "client") {
    const clientId = normalizeOptionalString(data.client_id);
    if (!clientId) {
      warnings.push("Missing client_id in frontmatter.");
    }
    return {
      ...baseRecord,
      clientFolder: relativeParts[1] ?? null,
      clientId,
      projectIds: normalizeStringArray(data.project_ids),
      primaryContact: normalizeOptionalString(data.primary_contact),
      workspaceReady: normalizeNullableBoolean(data.workspace_ready),
      readyForApply: Boolean(flowId && workspaceId && clientId && audience === expectedAudience),
    };
  }

  const memberId = normalizeOptionalString(data.member_id);
  if (!memberId) {
    warnings.push("Missing member_id in frontmatter.");
  }
  return {
    ...baseRecord,
    memberId,
    manager: normalizeOptionalString(data.manager),
    department: normalizeOptionalString(data.department),
    joinedOn: normalizeOptionalString(data.joined_on),
    readyForApply: Boolean(flowId && workspaceId && memberId && audience === expectedAudience),
  };
}

function buildEmployeeAliasCandidates(employee) {
  const aliases = new Set();
  const add = (value) => {
    const normalized = normalizeKey(value);
    if (normalized) {
      aliases.add(normalized);
      aliases.add(normalized.replace(/\s+/g, ""));
      aliases.add(normalizeSlug(normalized));
    }
  };

  add(employee.name);
  const emailLocalPart = String(employee.email ?? "").split("@")[0] ?? "";
  add(emailLocalPart);

  const nameTokens = normalizeKey(employee.name).split(/\s+/).filter(Boolean);
  if (nameTokens.length > 0) {
    add(nameTokens[0]);
    add(nameTokens.slice(0, 2).join(" "));
  }

  return [...aliases];
}

function resolveEmployeeForKpi(record, employees) {
  const targetKeys = new Set([
    normalizeKey(record.memberId),
    normalizeSlug(record.memberId),
    normalizeKey(path.basename(record.filePath, ".md").replace(/-kpi$/i, "")),
  ]);

  const exactMatches = employees.filter((employee) => {
    const aliases = buildEmployeeAliasCandidates(employee);
    return aliases.some((alias) => targetKeys.has(alias));
  });
  if (exactMatches.length === 1) {
    return { employee: exactMatches[0], matchMethod: "alias.exact" };
  }
  if (exactMatches.length > 1) {
    return { employee: null, matchMethod: "alias.ambiguous" };
  }

  const prefixCandidates = employees.filter((employee) =>
    buildEmployeeAliasCandidates(employee).some((alias) =>
      [...targetKeys].some(
        (targetKey) =>
          targetKey.length >= 4 &&
          (alias.startsWith(targetKey) || targetKey.startsWith(alias)),
      ),
    ),
  );
  if (prefixCandidates.length === 1) {
    return { employee: prefixCandidates[0], matchMethod: "alias.prefix" };
  }
  if (prefixCandidates.length > 1) {
    return { employee: null, matchMethod: "alias.ambiguous-prefix" };
  }

  return { employee: null, matchMethod: "alias.unresolved" };
}

function employeeKpiTableSql() {
  return `
    CREATE TABLE IF NOT EXISTS employee_kpi_snapshots (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL,
      title TEXT NOT NULL,
      role_template TEXT,
      role_template_file TEXT,
      kpi_version TEXT NOT NULL,
      last_reviewed TEXT,
      reports_to TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      source_file_path TEXT NOT NULL,
      source_relative_path TEXT NOT NULL,
      source_last_modified_at TEXT NOT NULL,
      role_scope_markdown TEXT,
      monthly_kpis_json TEXT NOT NULL DEFAULT '[]',
      quarterly_milestones_json TEXT NOT NULL DEFAULT '[]',
      yearly_milestones_json TEXT NOT NULL DEFAULT '[]',
      cross_role_dependencies_json TEXT NOT NULL DEFAULT '[]',
      evidence_sources_json TEXT NOT NULL DEFAULT '[]',
      compensation_milestones_json TEXT NOT NULL DEFAULT '[]',
      gap_flags_json TEXT NOT NULL DEFAULT '[]',
      synthesis_review_markdown TEXT,
      body_markdown TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, kpi_version)
    )
  `;
}

function employeeKpiIndexSql() {
  return `
    CREATE INDEX IF NOT EXISTS idx_employee_kpi_snapshots_employee_recency
      ON employee_kpi_snapshots(employee_id, source_last_modified_at DESC, updated_at DESC)
  `;
}

function dbTableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row?.name);
}

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSqliteWrite(dbPath, sql) {
  execFileSync("/usr/bin/sqlite3", [dbPath], {
    input: `${sql}\n`,
    encoding: "utf8",
  });
}

function ensureEmployeeKpiTable(dbPath) {
  runSqliteWrite(
    dbPath,
    `BEGIN IMMEDIATE;
${employeeKpiTableSql()};
${employeeKpiIndexSql()};
COMMIT;`,
  );
}

async function loadTeamforgeEmployeeContext(dbPath, writable) {
  const warnings = [];
  let exists = true;
  try {
    await fs.access(dbPath);
  } catch {
    exists = false;
  }

  if (!exists) {
    warnings.push(`TeamForge DB not found at ${dbPath}. KPI matching will be skipped.`);
    return {
      db: null,
      employees: [],
      existingSnapshots: new Map(),
      warnings,
    };
  }

  const db = new DatabaseSync(dbPath, { readonly: !writable });
  if (!dbTableExists(db, "employees")) {
    warnings.push(`TeamForge DB at ${dbPath} has no employees table yet. KPI matching will be skipped.`);
    return {
      db,
      employees: [],
      existingSnapshots: new Map(),
      warnings,
    };
  }

  const employees = db
    .prepare("SELECT id, name, email, is_active FROM employees WHERE is_active = 1 ORDER BY name")
    .all();

  const existingSnapshots = new Map();
  if (dbTableExists(db, "employee_kpi_snapshots")) {
    const rows = db
      .prepare(
        `SELECT id, employee_id, kpi_version, title, source_last_modified_at, updated_at
         FROM employee_kpi_snapshots`,
      )
      .all();
    for (const row of rows) {
      existingSnapshots.set(`${row.employee_id}::${row.kpi_version}`, row);
    }
  }

  return {
    db,
    employees,
    existingSnapshots,
    warnings,
  };
}

function buildEmployeeKpiRow(record, employee) {
  const importedAt = new Date().toISOString();
  return {
    id: `${employee.id}::${record.kpiVersion}`,
    employee_id: employee.id,
    member_id: record.memberId,
    title: record.title,
    role_template: record.roleTemplate,
    role_template_file: record.roleTemplateFile,
    kpi_version: record.kpiVersion,
    last_reviewed: record.lastReviewed,
    reports_to: record.reportsTo,
    tags_json: JSON.stringify(record.tags),
    source_file_path: record.filePath,
    source_relative_path: record.relativePath,
    source_last_modified_at: record.source.lastModifiedAt,
    role_scope_markdown: record.roleScopeMarkdown,
    monthly_kpis_json: JSON.stringify(record.monthlyKpis),
    quarterly_milestones_json: JSON.stringify(record.quarterlyMilestones),
    yearly_milestones_json: JSON.stringify(record.yearlyMilestones),
    cross_role_dependencies_json: JSON.stringify(record.crossRoleDependencies),
    evidence_sources_json: JSON.stringify(record.evidenceSources),
    compensation_milestones_json: JSON.stringify(record.compensationMilestones),
    gap_flags_json: JSON.stringify(record.gapFlags),
    synthesis_review_markdown: record.synthesisReviewMarkdown,
    body_markdown: record.bodyMarkdown,
    imported_at: importedAt,
    updated_at: importedAt,
  };
}

function buildKpiDiff(record, resolvedEmployee, existingRow) {
  const diffs = [];
  if (!resolvedEmployee) {
    diffs.push("warning: unresolved employee mapping");
    return diffs;
  }

  if (!existingRow) {
    diffs.push("new employee KPI snapshot");
  } else {
    if ((existingRow.title ?? null) !== (record.title ?? null)) {
      diffs.push(`title: ${String(existingRow.title ?? "null")} -> ${record.title}`);
    }
    if (
      (existingRow.source_last_modified_at ?? null) !==
      (record.source.lastModifiedAt ?? null)
    ) {
      diffs.push(
        `sourceLastModifiedAt: ${String(existingRow.source_last_modified_at ?? "null")} -> ${record.source.lastModifiedAt}`,
      );
    }
  }

  diffs.push(`employee: ${resolvedEmployee.name}`);
  diffs.push(`monthlyKpis: ${record.monthlyKpis.length}`);
  diffs.push(`quarterlyMilestones: ${record.quarterlyMilestones.length}`);
  diffs.push(`gapFlags: ${record.gapFlags.length}`);
  if (record.warnings.length > 0) {
    diffs.push(...record.warnings.map((warning) => `warning: ${warning}`));
  }
  return diffs;
}

function upsertEmployeeKpiSnapshot(dbPath, row) {
  runSqliteWrite(
    dbPath,
    `BEGIN IMMEDIATE;
INSERT INTO employee_kpi_snapshots (
  id,
  employee_id,
  member_id,
  title,
  role_template,
  role_template_file,
  kpi_version,
  last_reviewed,
  reports_to,
  tags_json,
  source_file_path,
  source_relative_path,
  source_last_modified_at,
  role_scope_markdown,
  monthly_kpis_json,
  quarterly_milestones_json,
  yearly_milestones_json,
  cross_role_dependencies_json,
  evidence_sources_json,
  compensation_milestones_json,
  gap_flags_json,
  synthesis_review_markdown,
  body_markdown,
  imported_at,
  updated_at
)
VALUES (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.employee_id)},
  ${sqlLiteral(row.member_id)},
  ${sqlLiteral(row.title)},
  ${sqlLiteral(row.role_template)},
  ${sqlLiteral(row.role_template_file)},
  ${sqlLiteral(row.kpi_version)},
  ${sqlLiteral(row.last_reviewed)},
  ${sqlLiteral(row.reports_to)},
  ${sqlLiteral(row.tags_json)},
  ${sqlLiteral(row.source_file_path)},
  ${sqlLiteral(row.source_relative_path)},
  ${sqlLiteral(row.source_last_modified_at)},
  ${sqlLiteral(row.role_scope_markdown)},
  ${sqlLiteral(row.monthly_kpis_json)},
  ${sqlLiteral(row.quarterly_milestones_json)},
  ${sqlLiteral(row.yearly_milestones_json)},
  ${sqlLiteral(row.cross_role_dependencies_json)},
  ${sqlLiteral(row.evidence_sources_json)},
  ${sqlLiteral(row.compensation_milestones_json)},
  ${sqlLiteral(row.gap_flags_json)},
  ${sqlLiteral(row.synthesis_review_markdown)},
  ${sqlLiteral(row.body_markdown)},
  ${sqlLiteral(row.imported_at)},
  ${sqlLiteral(row.updated_at)}
)
ON CONFLICT(employee_id, kpi_version) DO UPDATE SET
  id = excluded.id,
  member_id = excluded.member_id,
  title = excluded.title,
  role_template = excluded.role_template,
  role_template_file = excluded.role_template_file,
  last_reviewed = excluded.last_reviewed,
  reports_to = excluded.reports_to,
  tags_json = excluded.tags_json,
  source_file_path = excluded.source_file_path,
  source_relative_path = excluded.source_relative_path,
  source_last_modified_at = excluded.source_last_modified_at,
  role_scope_markdown = excluded.role_scope_markdown,
  monthly_kpis_json = excluded.monthly_kpis_json,
  quarterly_milestones_json = excluded.quarterly_milestones_json,
  yearly_milestones_json = excluded.yearly_milestones_json,
  cross_role_dependencies_json = excluded.cross_role_dependencies_json,
  evidence_sources_json = excluded.evidence_sources_json,
  compensation_milestones_json = excluded.compensation_milestones_json,
  gap_flags_json = excluded.gap_flags_json,
  synthesis_review_markdown = excluded.synthesis_review_markdown,
  body_markdown = excluded.body_markdown,
  imported_at = excluded.imported_at,
  updated_at = datetime('now');
COMMIT;`,
  );
}

function mergeArtifacts(existingArtifacts = [], parityArtifacts = []) {
  const merged = [...existingArtifacts];

  for (const artifact of parityArtifacts) {
    const index = merged.findIndex((existing) => {
      if (existing.source !== artifact.source) return false;
      if (existing.artifactType !== artifact.artifactType) return false;
      if (artifact.externalId && existing.externalId === artifact.externalId) return true;
      return existing.url === artifact.url;
    });

    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...artifact,
        id: merged[index].id,
      };
    } else {
      merged.push(artifact);
    }
  }

  return merged;
}

function buildMergedPayload(record, existingGraph, workspaceId, extraArtifacts = []) {
  const existingProject = existingGraph?.project ?? null;
  const resolvedWorkspaceId =
    existingProject?.workspaceId ?? workspaceId ?? "__dry_run_workspace__";

  const clientName =
    existingProject?.clientName && existingProject.clientName.trim().length > 0
      ? existingProject.clientName
      : record.metadata.clientName;

  return {
    workspaceId: resolvedWorkspaceId,
    project: {
      name: record.metadata.name,
      slug: record.metadata.slug,
      portfolioName: record.metadata.portfolioName ?? existingProject?.portfolioName ?? null,
      clientName,
      projectType: record.metadata.projectType ?? existingProject?.projectType ?? null,
      status: record.metadata.status ?? existingProject?.status ?? "planning",
      visibility: existingProject?.visibility ?? "workspace",
      syncMode: existingProject?.syncMode ?? "manual",
    },
    githubLinks: existingGraph?.githubLinks ?? [],
    hulyLinks: existingGraph?.hulyLinks ?? [],
    artifacts: mergeArtifacts(existingGraph?.artifacts ?? [], [...record.artifacts, ...extraArtifacts]),
    policy: existingGraph?.policy ?? null,
  };
}

function buildLegacyExternalIds(record, existingGraph) {
  const merged = [];
  const seen = new Set();

  const add = (source, externalId) => {
    const normalizedSource = normalizeOptionalString(source);
    const normalizedExternalId = normalizeOptionalString(externalId);
    if (!normalizedSource || !normalizedExternalId) return;
    const key = `${normalizedSource}::${normalizedExternalId}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({
      source: normalizedSource,
      external_id: normalizedExternalId,
    });
  };

  for (const externalId of existingGraph?.externalIds ?? []) {
    add(externalId.source, externalId.external_id ?? externalId.externalId);
  }

  add(LEGACY_EXTERNAL_ID_SOURCE, record.projectId);
  return merged;
}

function buildRequestBody(record, payload, existingGraph) {
  return {
    ...payload,
    workspace_id: payload.workspaceId,
    name: payload.project.name,
    code: record.projectId,
    slug: payload.project.slug,
    portfolio_name: payload.project.portfolioName,
    client_name: payload.project.clientName,
    project_type: payload.project.projectType,
    status: payload.project.status,
    visibility: payload.project.visibility,
    sync_mode: payload.project.syncMode,
    external_ids: buildLegacyExternalIds(record, existingGraph),
  };
}

function buildClientProfileApplyOperation(record, workspaceId) {
  const resolvedWorkspaceId = normalizeOptionalString(workspaceId);
  return {
    clientId: record.clientId,
    relativePath: record.relativePath,
    readyForApply: Boolean(record.readyForApply && resolvedWorkspaceId),
    payload: {
      workspaceId: resolvedWorkspaceId,
      clientId: record.clientId,
      clientName: record.clientName,
      engagementModel: record.engagementModel,
      active: record.active,
      industry: record.industry,
      primaryContact: record.primaryContact,
      onboarded: record.onboarded,
      projectIds: record.projectIds,
      stakeholders: record.stakeholders,
      strategicFit: record.strategicFit,
      risks: record.risks,
      resourceLinks: record.resourceLinks,
      tags: record.tags,
      sourcePath: record.source.relativePath,
    },
  };
}

function buildOnboardingFlowApplyOperation(record, workspaceId) {
  const resolvedWorkspaceId =
    normalizeOptionalString(record.workspaceId) ?? normalizeOptionalString(workspaceId);
  const payload = {
    workspaceId: resolvedWorkspaceId,
    flowId: record.flowId,
    audience: record.audience,
    owner: record.owner,
    status: record.status,
    startsOn: record.startsOn,
    tasks: record.tasks.map((task) => ({
      taskId: task.taskId,
      title: task.title,
      completed: task.completed,
      completedAt: task.completedAt,
      resourceCreated: task.resourceCreated,
      notes: task.notes,
      position: task.order,
    })),
    sourcePath: record.source.relativePath,
  };

  if (record.family === "client") {
    payload.clientId = record.clientId;
    payload.projectIds = record.projectIds;
    payload.primaryContact = record.primaryContact;
    payload.workspaceReady = record.workspaceReady;
  } else {
    payload.memberId = record.memberId;
    payload.manager = record.manager;
    payload.department = record.department;
    payload.joinedOn = record.joinedOn;
  }

  return {
    flowId: record.flowId,
    audience: record.audience,
    workspaceId: resolvedWorkspaceId,
    relativePath: record.relativePath,
    readyForApply: Boolean(record.readyForApply && resolvedWorkspaceId),
    payload,
  };
}

function buildOnboardingFlowApplyGroups(operations) {
  const groups = new Map();

  for (const operation of operations) {
    if (!operation?.readyForApply || !operation.workspaceId) continue;
    if (!groups.has(operation.workspaceId)) {
      groups.set(operation.workspaceId, {
        workspaceId: operation.workspaceId,
        flows: [],
        flowIds: [],
        relativePaths: [],
      });
    }
    const group = groups.get(operation.workspaceId);
    group.flows.push(operation.payload);
    group.flowIds.push(operation.flowId);
    group.relativePaths.push(operation.relativePath);
  }

  return [...groups.values()];
}

function buildProjectArtifactApplyGroups(records, workspaceId) {
  const groups = new Map();

  for (const record of records) {
    if (!record.readyForApply || !record.projectId || !record.artifact) continue;
    if (!groups.has(record.projectId)) {
      groups.set(record.projectId, {
        projectId: record.projectId,
        workspaceId: workspaceId ?? null,
        artifacts: [],
        relativePaths: [],
      });
    }
    const group = groups.get(record.projectId);
    group.artifacts.push(record.artifact);
    group.relativePaths.push(record.relativePath);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    artifactCount: group.artifacts.length,
  }));
}

function buildMissingSchemaWarnings({
  rootClientProjectBriefRecords,
  clientProfileRecords,
  projectArtifactRecords,
  onboardingFlowRecords,
}) {
  const clientFolders = [
    ...new Set(
      rootClientProjectBriefRecords
        .map((record) => record.relativePath.split(path.sep)[1] ?? null)
        .filter(Boolean),
    ),
  ].sort();

  const profileFolders = new Set(clientProfileRecords.map((record) => record.clientFolder).filter(Boolean));
  const technicalSpecFolders = new Set(
    projectArtifactRecords
      .filter((record) => record.artifactType === "vault-technical-spec")
      .map((record) => record.clientFolder)
      .filter(Boolean),
  );
  const designFolders = new Set(
    projectArtifactRecords
      .filter((record) => record.artifactType === "vault-design-doc")
      .map((record) => record.clientFolder)
      .filter(Boolean),
  );
  const researchFolders = new Set(
    projectArtifactRecords
      .filter((record) => record.artifactType === "vault-research-doc")
      .map((record) => record.clientFolder)
      .filter(Boolean),
  );
  const closeoutFolders = new Set(
    projectArtifactRecords
      .filter((record) => record.artifactType === "vault-closeout-doc")
      .map((record) => record.clientFolder)
      .filter(Boolean),
  );
  const clientOnboardingFolders = new Set(
    onboardingFlowRecords
      .filter((record) => record.family === "client")
      .map((record) => record.clientFolder)
      .filter(Boolean),
  );

  const missingClientProfiles = clientFolders
    .filter((folder) => !profileFolders.has(folder))
    .map((folder) => path.join("60-client-ecosystem", folder, "client-profile.md"));
  const missingTechnicalSpecs = clientFolders
    .filter((folder) => !technicalSpecFolders.has(folder))
    .map((folder) => path.join("60-client-ecosystem", folder, "technical-spec.md"));
  const missingDesignDocs = clientFolders
    .filter((folder) => !designFolders.has(folder))
    .map((folder) => path.join("60-client-ecosystem", folder, "design", "**", "*.md"));
  const missingResearchDocs = clientFolders
    .filter((folder) => !researchFolders.has(folder))
    .map((folder) => path.join("60-client-ecosystem", folder, "research", "**", "*.md"));
  const missingCloseouts = clientFolders
    .filter((folder) => !closeoutFolders.has(folder))
    .map((folder) => path.join("60-client-ecosystem", folder, "closeouts", "**", "*.md"));
  const missingClientOnboarding = clientFolders
    .filter((folder) => !clientOnboardingFolders.has(folder))
    .map((folder) => path.join("60-client-ecosystem", folder, "onboarding", "client-onboarding.md"));

  const clientProfileWarnings = summarizeMissingPaths("client profile notes", missingClientProfiles);
  const projectArtifactWarnings = [
    ...summarizeMissingPaths("technical specs", missingTechnicalSpecs),
    ...summarizeMissingPaths("design docs", missingDesignDocs),
    ...summarizeMissingPaths("research docs", missingResearchDocs),
    ...summarizeMissingPaths("closeout docs", missingCloseouts),
  ];
  const onboardingWarnings = [
    ...summarizeMissingPaths("client onboarding notes", missingClientOnboarding),
  ];

  if (!onboardingFlowRecords.some((record) => record.family === "employee")) {
    onboardingWarnings.push(
      "Missing employee onboarding notes at 50-team/onboarding/*.md; no employee onboarding flow records were discovered.",
    );
  }

  return {
    clientProfiles: clientProfileWarnings,
    projectArtifacts: projectArtifactWarnings,
    onboardingFlows: onboardingWarnings,
    all: [...clientProfileWarnings, ...projectArtifactWarnings, ...onboardingWarnings],
  };
}

function diffProject(record, existingGraph, payload) {
  if (!existingGraph) {
    return ["new project"];
  }

  const diffs = [];
  const project = existingGraph.project;
  const compareKeys = [
    ["name", payload.project.name, project.name],
    ["slug", payload.project.slug, project.slug],
    ["portfolioName", payload.project.portfolioName, project.portfolioName],
    ["clientName", payload.project.clientName, project.clientName],
    ["projectType", payload.project.projectType, project.projectType],
    ["status", payload.project.status, project.status],
    ["syncMode", payload.project.syncMode, project.syncMode],
  ];

  for (const [key, nextValue, previousValue] of compareKeys) {
    if ((nextValue ?? null) !== (previousValue ?? null)) {
      diffs.push(`${key}: ${String(previousValue ?? "null")} -> ${String(nextValue ?? "null")}`);
    }
  }

  const artifactDelta = payload.artifacts.length - (existingGraph.artifacts?.length ?? 0);
  if (artifactDelta !== 0) {
    diffs.push(`artifacts: ${existingGraph.artifacts.length} -> ${payload.artifacts.length}`);
  }

  if (diffs.length === 0) {
    diffs.push("no metadata change; parity artifacts preserved");
  }

  if (record.warnings.length > 0) {
    diffs.push(...record.warnings.map((warning) => `warning: ${warning}`));
  }

  return diffs;
}

function extractRemoteItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.projects)) {
    return payload.projects;
  }
  if (Array.isArray(payload?.mappings)) {
    return payload.mappings;
  }
  return [];
}

function normalizeGraphProject(project) {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    slug: project.slug ?? null,
    name: project.name,
    portfolioName: project.portfolioName ?? null,
    clientName: project.clientName ?? null,
    projectType: project.projectType ?? null,
    status: project.status ?? "active",
    visibility: project.visibility ?? "workspace",
    syncMode: project.syncMode ?? "manual",
    createdAt: project.createdAt ?? null,
    updatedAt: project.updatedAt ?? null,
  };
}

function normalizeLegacyProject(item) {
  return {
    shape: "legacy-project",
    project: {
      id: item.id,
      workspaceId: item.workspace_id,
      slug: item.slug ?? item.code ?? null,
      name: item.name,
      portfolioName: item.portfolio_name ?? null,
      clientName: item.client_name ?? null,
      projectType: item.project_type ?? null,
      status: item.status ?? "active",
      visibility: item.visibility ?? "workspace",
      syncMode: item.sync_mode ?? "manual",
      createdAt: item.created_at ?? null,
      updatedAt: item.updated_at ?? null,
    },
    githubLinks: [],
    hulyLinks: [],
    artifacts: [],
    policy: null,
    externalIds: Array.isArray(item.external_ids) ? item.external_ids : [],
  };
}

function normalizeLegacyMapping(item) {
  return {
    shape: "legacy-mapping",
    project: {
      id: item.projectId,
      workspaceId: item.workspaceId,
      slug: null,
      name: item.projectId,
      portfolioName: null,
      clientName: null,
      projectType: null,
      status: item.status ?? "active",
      visibility: "workspace",
      syncMode: "manual",
      createdAt: item.updatedAt ?? null,
      updatedAt: item.updatedAt ?? null,
    },
    githubLinks: [],
    hulyLinks: item.hulyProjectId
      ? [
          {
            hulyProjectId: item.hulyProjectId,
            syncIssues: true,
            syncMilestones: true,
            syncComponents: false,
            syncTemplates: false,
          },
        ]
      : [],
    artifacts: [],
    policy: null,
    externalIds: [],
  };
}

function normalizeRemoteGraph(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.project && typeof item.project === "object") {
    return {
      shape: "graph",
      project: normalizeGraphProject(item.project),
      githubLinks: Array.isArray(item.githubLinks) ? item.githubLinks : [],
      hulyLinks: Array.isArray(item.hulyLinks) ? item.hulyLinks : [],
      artifacts: Array.isArray(item.artifacts) ? item.artifacts : [],
      policy: item.policy ?? null,
      externalIds: Array.isArray(item.externalIds) ? item.externalIds : [],
    };
  }

  if (typeof item.id === "string" && typeof item.workspace_id === "string") {
    return normalizeLegacyProject(item);
  }

  if (typeof item.projectId === "string" && typeof item.workspaceId === "string") {
    return normalizeLegacyMapping(item);
  }

  return null;
}

async function fetchJson(baseUrl, pathname, token) {
  const url = new URL(pathname, baseUrl);
  const headers = { Accept: "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  return payload.data ?? payload;
}

async function putJson(baseUrl, pathname, body, token) {
  const url = new URL(pathname, baseUrl);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  const payload = await response.json();
  return payload.data ?? payload;
}

async function loadExistingGraphs(baseUrl, token) {
  const byId = new Map();
  const bySlug = new Map();
  const observedShapes = new Set();

  for (const status of DEFAULT_STATUSES) {
    const payload = await fetchJson(baseUrl, `/v1/project-mappings?status=${encodeURIComponent(status)}`, token);
    for (const item of extractRemoteItems(payload)) {
      const graph = normalizeRemoteGraph(item);
      if (!graph) {
        continue;
      }
      observedShapes.add(graph.shape);
      byId.set(graph.project.id, graph);
      if (graph.project.slug) {
        bySlug.set(graph.project.slug, graph);
      }
    }
  }

  return { byId, bySlug, observedShapes: [...observedShapes] };
}

function countByStatus(records) {
  return records.reduce((accumulator, record) => {
    const key = record.metadata.status ?? "unknown";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

function countByMode(records) {
  return records.reduce((accumulator, record) => {
    const key = record.mode ?? "unknown";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

async function maybeWriteReport(reportPath, report) {
  if (!reportPath) return;
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clientRoot = path.join(args.vaultRoot, "60-client-ecosystem");
  const teamRoot = path.join(args.vaultRoot, "50-team");
  const token = process.env.TF_WEBHOOK_HMAC_SECRET ?? null;
  const [clientFiles, teamFiles, teamforgeContext] = await Promise.all([
    walk(clientRoot).then((files) => files.sort()),
    walk(teamRoot).then((files) => files.sort()),
    loadTeamforgeEmployeeContext(args.teamforgeDbPath, args.apply),
  ]);

  try {
    const projectBriefFiles = clientFiles.filter(
      (filePath) => path.basename(filePath) === "project-brief.md",
    );
    const clientProfileFiles = clientFiles.filter(
      (filePath) => path.basename(filePath) === "client-profile.md",
    );
    const technicalSpecFiles = clientFiles.filter(
      (filePath) => path.basename(filePath) === "technical-spec.md",
    );
    const designFiles = clientFiles.filter(
      (filePath) =>
        filePath.endsWith(".md") && filePath.includes(`${path.sep}design${path.sep}`),
    );
    const researchFiles = clientFiles.filter(
      (filePath) =>
        filePath.endsWith(".md") && filePath.includes(`${path.sep}research${path.sep}`),
    );
    const closeoutFiles = clientFiles.filter(
      (filePath) =>
        filePath.endsWith(".md") && filePath.includes(`${path.sep}closeouts${path.sep}`),
    );
    const clientOnboardingFiles = clientFiles.filter((filePath) => {
      if (!filePath.endsWith(".md")) return false;
      const relativePath = path.relative(clientRoot, filePath);
      return relativePath.includes(`${path.sep}onboarding${path.sep}`);
    });
    const employeeOnboardingFiles = teamFiles.filter((filePath) => {
      if (!filePath.endsWith(".md")) return false;
      const relativePath = path.relative(teamRoot, filePath);
      return relativePath.startsWith(`onboarding${path.sep}`);
    });
    const kpiFiles = teamFiles.filter((filePath) => /-kpi\.md$/i.test(path.basename(filePath)));

    const allProjectBriefRecords = (
      await Promise.all(
        projectBriefFiles.map((filePath) => normalizeProjectBrief(filePath, args.vaultRoot)),
      )
    ).filter((record) => record.projectId.length > 0);

    const projectBriefRecords =
      args.projects.size > 0
        ? allProjectBriefRecords.filter((record) => args.projects.has(record.projectId))
        : allProjectBriefRecords;

    const relevantProjectIds = new Set(projectBriefRecords.map((record) => record.projectId));
    const relevantClientFolders = new Set(
      projectBriefRecords
        .map((record) => record.relativePath.split(path.sep)[1] ?? null)
        .filter(Boolean),
    );
    const relevantClientIds = new Set(
      projectBriefRecords
        .map((record) => record.source.clientId)
        .filter(Boolean),
    );
    const projectBriefByDir = new Map(
      allProjectBriefRecords.map((record) => [path.dirname(record.filePath), record]),
    );
    const rootClientProjectBriefRecords = projectBriefRecords.filter(
      (record) => record.relativePath.split(path.sep).length === 3,
    );

    const allClientProfileRecords = await Promise.all(
      clientProfileFiles.map((filePath) => normalizeClientProfile(filePath, args.vaultRoot)),
    );
    const clientProfileRecords =
      args.projects.size > 0
        ? allClientProfileRecords.filter(
            (record) =>
              relevantClientFolders.has(record.clientFolder) ||
              relevantClientIds.has(record.clientId),
          )
        : allClientProfileRecords;

    const artifactFiles = [...new Set([
      ...technicalSpecFiles,
      ...designFiles,
      ...researchFiles,
      ...closeoutFiles,
    ])].sort();
    const allProjectArtifactRecords = await Promise.all(
      artifactFiles.map((filePath) =>
        normalizeProjectArtifact(filePath, args.vaultRoot, clientRoot, projectBriefByDir),
      ),
    );
    const projectArtifactRecords =
      args.projects.size > 0
        ? allProjectArtifactRecords.filter(
            (record) =>
              relevantProjectIds.has(record.projectId) ||
              relevantClientFolders.has(record.clientFolder),
          )
        : allProjectArtifactRecords;

    const allOnboardingFlowRecords = await Promise.all([
      ...clientOnboardingFiles.map((filePath) =>
        normalizeOnboardingFlow(filePath, args.vaultRoot, "client", args.workspaceId),
      ),
      ...employeeOnboardingFiles.map((filePath) =>
        normalizeOnboardingFlow(filePath, args.vaultRoot, "employee", args.workspaceId),
      ),
    ]);
    const onboardingFlowRecords =
      args.projects.size > 0
        ? allOnboardingFlowRecords.filter(
            (record) =>
              record.family === "client" &&
              (relevantClientFolders.has(record.clientFolder) ||
                record.projectIds?.some((projectId) => relevantProjectIds.has(projectId))),
          )
        : allOnboardingFlowRecords;

    const kpiRecords = (
      await Promise.all(kpiFiles.map((filePath) => normalizeKpiNote(filePath, args.vaultRoot)))
    ).filter((record) => record.memberId.length > 0);

    const duplicateIds = projectBriefRecords.reduce((accumulator, record) => {
      accumulator[record.projectId] = (accumulator[record.projectId] ?? 0) + 1;
      return accumulator;
    }, {});

    const duplicateWarnings = Object.entries(duplicateIds)
      .filter(([, count]) => count > 1)
      .map(([projectId, count]) => `Duplicate project_id '${projectId}' found ${count} times.`);
    const missingSchemaWarnings = buildMissingSchemaWarnings({
      rootClientProjectBriefRecords,
      clientProfileRecords,
      projectArtifactRecords,
      onboardingFlowRecords,
    });
    const clientProfileApplyOperations = clientProfileRecords.map((record) =>
      buildClientProfileApplyOperation(record, args.workspaceId),
    );
    const onboardingFlowApplyOperations = onboardingFlowRecords.map((record) =>
      buildOnboardingFlowApplyOperation(record, args.workspaceId),
    );
    const projectArtifactApplyGroups = buildProjectArtifactApplyGroups(
      projectArtifactRecords,
      args.workspaceId,
    );
    const projectArtifactsByProjectId = new Map(
      projectArtifactApplyGroups.map((group) => [group.projectId, group.artifacts]),
    );

    let existingGraphs = { byId: new Map(), bySlug: new Map() };
    let remoteShapes = [];
    let remoteWarning = null;
    if (!args.localOnly) {
      try {
        existingGraphs = await loadExistingGraphs(args.workerBaseUrl, token);
        remoteShapes = existingGraphs.observedShapes ?? [];
      } catch (error) {
        remoteWarning = error instanceof Error ? error.message : String(error);
        if (args.apply) {
          throw new Error(
            `Could not load current TeamForge registry from ${args.workerBaseUrl}: ${remoteWarning}`,
          );
        }
      }
    }

    const operations = projectBriefRecords.map((record) => {
      const existingGraph =
        existingGraphs.byId.get(record.projectId) ??
        existingGraphs.bySlug.get(record.projectId) ??
        null;
      const targetProjectId = existingGraph?.project.id ?? record.projectId;
      const extraArtifacts = projectArtifactsByProjectId.get(record.projectId) ?? [];
      const payload = buildMergedPayload(record, existingGraph, args.workspaceId, extraArtifacts);
      const requestBody = buildRequestBody(record, payload, existingGraph);
      const mode = existingGraph ? "update" : "create";
      return {
        projectId: record.projectId,
        targetProjectId,
        mode,
        relativePath: record.relativePath,
        payload,
        requestBody,
        remoteShape: existingGraph?.shape ?? "new",
        diffs: diffProject(record, existingGraph, payload),
        latestSource: {
          filePath: record.source.filePath,
          relativePath: record.source.relativePath,
          lastModifiedAt: record.source.lastModifiedAt,
          owner: record.source.owner,
          source: record.source.source,
          sourceUrl: record.source.sourceUrl,
          tags: record.source.tags,
        },
      };
    });

    const employeeKpiOperations = kpiRecords.map((record) => {
      const resolved = resolveEmployeeForKpi(record, teamforgeContext.employees);
      const employee = resolved.employee;
      const key = employee ? `${employee.id}::${record.kpiVersion}` : null;
      const existingRow = key ? teamforgeContext.existingSnapshots.get(key) ?? null : null;
      const mode = employee ? (existingRow ? "update" : "create") : "unresolved";
      const row = employee ? buildEmployeeKpiRow(record, employee) : null;
      return {
        memberId: record.memberId,
        employeeId: employee?.id ?? null,
        employeeName: employee?.name ?? null,
        mode,
        matchMethod: resolved.matchMethod,
        kpiVersion: record.kpiVersion,
        relativePath: record.relativePath,
        row,
        diffs: buildKpiDiff(record, employee, existingRow),
        latestSource: {
          filePath: record.source.filePath,
          relativePath: record.source.relativePath,
          lastModifiedAt: record.source.lastModifiedAt,
          roleTemplate: record.roleTemplate,
          lastReviewed: record.lastReviewed,
          tags: record.tags,
        },
      };
    });

    const createCount = operations.filter((operation) => operation.mode === "create").length;
    const updateCount = operations.filter((operation) => operation.mode === "update").length;
    const employeeKpiCounts = countByMode(employeeKpiOperations);
    const clientProfileReadyCount = clientProfileRecords.filter((record) => record.readyForApply).length;
    const clientProfileReadyWithWorkspaceCount = clientProfileApplyOperations.filter(
      (operation) => operation.readyForApply,
    ).length;
    const projectArtifactReadyCount = projectArtifactRecords.filter(
      (record) => record.readyForApply,
    ).length;
    const onboardingReadyCount = onboardingFlowRecords.filter((record) => record.readyForApply).length;
    const onboardingReadyWithWorkspaceCount = onboardingFlowApplyOperations.filter(
      (operation) => operation.readyForApply,
    ).length;

    if (args.apply && createCount > 0 && !args.workspaceId) {
      throw new Error(
        "workspaceId is required for --apply when the parity pass needs to create new TeamForge projects.",
      );
    }

    const projectWarnings = [
      ...duplicateWarnings,
      ...projectBriefRecords.flatMap((record) =>
        record.warnings.map((warning) => `${record.projectId}: ${warning}`),
      ),
    ];
    const clientProfileWarnings = [
      ...missingSchemaWarnings.clientProfiles,
      ...clientProfileRecords.flatMap((record) =>
        record.warnings.map(
          (warning) => `${record.clientId ?? record.relativePath}: ${warning}`,
        ),
      ),
    ];
    const projectArtifactWarnings = [
      ...missingSchemaWarnings.projectArtifacts,
      ...projectArtifactRecords.flatMap((record) =>
        record.warnings.map(
          (warning) =>
            `${record.projectId ?? record.relativePath} (${record.relativePath}): ${warning}`,
        ),
      ),
    ];
    const onboardingFlowWarnings = [
      ...missingSchemaWarnings.onboardingFlows,
      ...onboardingFlowRecords.flatMap((record) =>
        record.warnings.map(
          (warning) => `${record.flowId ?? record.relativePath}: ${warning}`,
        ),
      ),
    ];
    const employeeKpiWarnings = [
      ...kpiRecords.flatMap((record) =>
        record.warnings.map((warning) => `${record.memberId}: ${warning}`),
      ),
      ...employeeKpiOperations
        .filter((operation) => operation.mode === "unresolved")
        .map(
          (operation) =>
            `Unresolved KPI note '${operation.memberId}' (${operation.relativePath}) could not be matched to a TeamForge employee.`,
        ),
    ];

    const report = {
      mode: args.apply ? "apply" : "dry-run",
      localOnly: args.localOnly,
      vaultRoot: args.vaultRoot,
      workerBaseUrl: args.workerBaseUrl,
      teamforgeDbPath: args.teamforgeDbPath,
      workspaceId: args.workspaceId,
      remoteWarning,
      remoteShapes,
      teamforgeDbWarnings: teamforgeContext.warnings,
      counts: {
        projectBriefsFound: projectBriefRecords.length,
        creates: createCount,
        updates: updateCount,
        statuses: countByStatus(projectBriefRecords),
        duplicateProjectIds: duplicateWarnings.length,
        clientProfilesFound: clientProfileRecords.length,
        clientProfilesReady: clientProfileReadyCount,
        clientProfilesReadyWithWorkspace: clientProfileReadyWithWorkspaceCount,
        projectArtifactsFound: projectArtifactRecords.length,
        projectArtifactsReady: projectArtifactReadyCount,
        onboardingFlowsFound: onboardingFlowRecords.length,
        onboardingFlowsReady: onboardingReadyCount,
        onboardingFlowsReadyWithWorkspace: onboardingReadyWithWorkspaceCount,
        onboardingClientFlowsFound: onboardingFlowRecords.filter(
          (record) => record.family === "client",
        ).length,
        onboardingEmployeeFlowsFound: onboardingFlowRecords.filter(
          (record) => record.family === "employee",
        ).length,
        employeeKpiNotesFound: kpiRecords.length,
        employeeKpiCreates: employeeKpiCounts.create ?? 0,
        employeeKpiUpdates: employeeKpiCounts.update ?? 0,
        employeeKpiUnresolved: employeeKpiCounts.unresolved ?? 0,
      },
      warnings: [
        ...teamforgeContext.warnings,
        ...projectWarnings,
        ...clientProfileWarnings,
        ...projectArtifactWarnings,
        ...onboardingFlowWarnings,
        ...employeeKpiWarnings,
      ],
      projects: {
        counts: {
          projectBriefsFound: projectBriefRecords.length,
          creates: createCount,
          updates: updateCount,
          statuses: countByStatus(projectBriefRecords),
          duplicateProjectIds: duplicateWarnings.length,
          artifactRecordsMerged: projectArtifactApplyGroups.reduce(
            (total, group) => total + group.artifactCount,
            0,
          ),
        },
        warnings: projectWarnings,
        operations: operations.map((operation) => ({
          projectId: operation.projectId,
          targetProjectId: operation.targetProjectId,
          mode: operation.mode,
          relativePath: operation.relativePath,
          diffs: operation.diffs,
          remoteShape: operation.remoteShape,
          latestSource: operation.latestSource,
        })),
      },
      clientProfiles: {
        applyPath: "PUT /v1/client-profiles/:clientId",
        counts: {
          found: clientProfileRecords.length,
          ready: clientProfileReadyCount,
          readyWithWorkspace: clientProfileReadyWithWorkspaceCount,
        },
        warnings: clientProfileWarnings,
        records: clientProfileRecords.map((record, index) => ({
          clientId: record.clientId,
          clientName: record.clientName,
          clientFolder: record.clientFolder,
          engagementModel: record.engagementModel,
          active: record.active,
          projectIds: record.projectIds,
          relativePath: record.relativePath,
          readyForApply: record.readyForApply,
          readyForWorkerPayload: clientProfileApplyOperations[index]?.readyForApply ?? false,
          latestSource: record.source,
          payload: clientProfileApplyOperations[index]?.payload ?? null,
          warnings: record.warnings,
        })),
      },
      projectArtifacts: {
        applyPath: "project-mappings.artifacts",
        counts: {
          found: projectArtifactRecords.length,
          ready: projectArtifactReadyCount,
          groupedProjects: projectArtifactApplyGroups.length,
          byType: countByArtifactType(projectArtifactRecords),
        },
        warnings: projectArtifactWarnings,
        records: projectArtifactRecords.map((record) => ({
          projectId: record.projectId,
          clientId: record.clientId,
          clientFolder: record.clientFolder,
          artifactType: record.artifactType,
          title: record.title,
          relativePath: record.relativePath,
          readyForApply: record.readyForApply,
          latestSource: record.source,
          payload: record.artifact,
          warnings: record.warnings,
        })),
        groups: projectArtifactApplyGroups.map((group) => ({
          projectId: group.projectId,
          workspaceId: group.workspaceId,
          artifactCount: group.artifactCount,
          relativePaths: group.relativePaths,
        })),
      },
      onboardingFlows: {
        applyPath: "PUT /v1/onboarding-flows",
        counts: {
          found: onboardingFlowRecords.length,
          client: onboardingFlowRecords.filter((record) => record.family === "client").length,
          employee: onboardingFlowRecords.filter((record) => record.family === "employee").length,
          ready: onboardingReadyCount,
          readyWithWorkspace: onboardingReadyWithWorkspaceCount,
        },
        warnings: onboardingFlowWarnings,
        records: onboardingFlowRecords.map((record, index) => ({
          flowId: record.flowId,
          family: record.family,
          audience: record.audience,
          workspaceId: record.workspaceId,
          clientId: record.clientId ?? null,
          memberId: record.memberId ?? null,
          projectIds: record.projectIds ?? [],
          taskCount: record.tasks.length,
          relativePath: record.relativePath,
          readyForApply: record.readyForApply,
          readyForWorkerPayload: onboardingFlowApplyOperations[index]?.readyForApply ?? false,
          latestSource: record.source,
          payload: onboardingFlowApplyOperations[index]?.payload ?? null,
          warnings: record.warnings,
        })),
      },
      employeeKpis: {
        counts: {
          found: kpiRecords.length,
          creates: employeeKpiCounts.create ?? 0,
          updates: employeeKpiCounts.update ?? 0,
          unresolved: employeeKpiCounts.unresolved ?? 0,
        },
        warnings: employeeKpiWarnings,
        operations: employeeKpiOperations.map((operation) => ({
          memberId: operation.memberId,
          employeeId: operation.employeeId,
          employeeName: operation.employeeName,
          mode: operation.mode,
          matchMethod: operation.matchMethod,
          kpiVersion: operation.kpiVersion,
          relativePath: operation.relativePath,
          diffs: operation.diffs,
          latestSource: operation.latestSource,
        })),
      },
      operations: operations.map((operation) => ({
        projectId: operation.projectId,
        targetProjectId: operation.targetProjectId,
        mode: operation.mode,
        relativePath: operation.relativePath,
        diffs: operation.diffs,
        remoteShape: operation.remoteShape,
        latestSource: operation.latestSource,
      })),
      employeeKpiOperations: employeeKpiOperations.map((operation) => ({
        memberId: operation.memberId,
        employeeId: operation.employeeId,
        employeeName: operation.employeeName,
        mode: operation.mode,
        matchMethod: operation.matchMethod,
        kpiVersion: operation.kpiVersion,
        relativePath: operation.relativePath,
        diffs: operation.diffs,
        latestSource: operation.latestSource,
      })),
    };

    if (args.apply) {
      const applied = [];
      const failures = [];
      const clientProfileApplied = [];
      const clientProfileFailures = [];
      const clientProfileVerification = [];
      const onboardingFlowApplied = [];
      const onboardingFlowFailures = [];
      const onboardingFlowVerification = [];
      for (const operation of operations) {
        try {
          await putJson(
            args.workerBaseUrl,
            `/v1/project-mappings/${encodeURIComponent(operation.targetProjectId)}`,
            operation.requestBody,
            token,
          );
          applied.push({
            projectId: operation.projectId,
            targetProjectId: operation.targetProjectId,
            mode: operation.mode,
            latestSource: operation.latestSource,
          });
        } catch (error) {
          failures.push({
            projectId: operation.projectId,
            targetProjectId: operation.targetProjectId,
            mode: operation.mode,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      report.applied = applied;
      report.failures = failures;

      for (let index = 0; index < clientProfileRecords.length; index += 1) {
        const record = clientProfileRecords[index];
        const operation = clientProfileApplyOperations[index];
        if (!operation?.readyForApply) {
          clientProfileFailures.push({
            clientId: record.clientId,
            relativePath: record.relativePath,
            error: record.warnings.join("; ") || "Client profile is not ready for Worker apply.",
          });
          continue;
        }

        try {
          await putJson(
            args.workerBaseUrl,
            `/v1/client-profiles/${encodeURIComponent(operation.clientId)}`,
            operation.payload,
            token,
          );
          const detail = await fetchJson(
            args.workerBaseUrl,
            `/v1/client-profiles/${encodeURIComponent(operation.clientId)}?workspace_id=${encodeURIComponent(operation.payload.workspaceId)}`,
            token,
          );
          clientProfileApplied.push({
            clientId: operation.clientId,
            relativePath: operation.relativePath,
          });
          clientProfileVerification.push({
            clientId: operation.clientId,
            workspaceId: operation.payload.workspaceId,
            found: Boolean(detail?.clientProfile),
            linkedProjectCount: Array.isArray(detail?.linkedProjects) ? detail.linkedProjects.length : 0,
          });
        } catch (error) {
          clientProfileFailures.push({
            clientId: record.clientId,
            relativePath: record.relativePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const onboardingFlowApplyGroups = buildOnboardingFlowApplyGroups(onboardingFlowApplyOperations);
      if (args.projects.size > 0 && onboardingFlowApplyGroups.length > 0) {
        for (const record of onboardingFlowRecords) {
          onboardingFlowFailures.push({
            flowId: record.flowId,
            audience: record.audience,
            relativePath: record.relativePath,
            error:
              "Onboarding flow apply is disabled for project-filtered runs because /v1/onboarding-flows replaces the full workspace set. Re-run without --project to apply onboarding safely.",
          });
        }
      } else {
        for (const record of onboardingFlowRecords) {
          const operation = onboardingFlowApplyOperations.find(
            (item) => item.flowId === record.flowId && item.relativePath === record.relativePath,
          );
          if (!operation?.readyForApply) {
            onboardingFlowFailures.push({
              flowId: record.flowId,
              audience: record.audience,
              relativePath: record.relativePath,
              error: record.warnings.join("; ") || "Onboarding flow is not ready for Worker apply.",
            });
          }
        }

        for (const group of onboardingFlowApplyGroups) {
          try {
            await putJson(
              args.workerBaseUrl,
              "/v1/onboarding-flows",
              {
                workspaceId: group.workspaceId,
                flows: group.flows,
              },
              token,
            );
            const payload = await fetchJson(
              args.workerBaseUrl,
              `/v1/onboarding-flows?workspace_id=${encodeURIComponent(group.workspaceId)}`,
              token,
            );
            const returnedFlows = Array.isArray(payload?.flows) ? payload.flows : [];
            for (const flowId of group.flowIds) {
              onboardingFlowVerification.push({
                flowId,
                workspaceId: group.workspaceId,
                found: returnedFlows.some((entry) => entry?.flow?.flowId === flowId),
              });
            }
            onboardingFlowApplied.push({
              workspaceId: group.workspaceId,
              flowIds: group.flowIds,
              relativePaths: group.relativePaths,
            });
          } catch (error) {
            for (const flowId of group.flowIds) {
              onboardingFlowFailures.push({
                flowId,
                relativePath: group.relativePaths.join(", "),
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }

      report.clientProfileApplied = clientProfileApplied;
      report.clientProfileFailures = clientProfileFailures;
      report.postApplyClientProfileVerification = { verified: clientProfileVerification };
      report.onboardingFlowApplied = onboardingFlowApplied;
      report.onboardingFlowFailures = onboardingFlowFailures;
      report.postApplyOnboardingFlowVerification = { verified: onboardingFlowVerification };

      const employeeKpiApplied = [];
      const employeeKpiFailures = [];
      if (teamforgeContext.db) {
        ensureEmployeeKpiTable(args.teamforgeDbPath);
        for (const operation of employeeKpiOperations) {
          if (!operation.row) {
            employeeKpiFailures.push({
              memberId: operation.memberId,
              employeeId: operation.employeeId,
              employeeName: operation.employeeName,
              mode: operation.mode,
              error: "Unresolved employee mapping",
            });
            continue;
          }

          try {
            upsertEmployeeKpiSnapshot(args.teamforgeDbPath, operation.row);
            employeeKpiApplied.push({
              memberId: operation.memberId,
              employeeId: operation.employeeId,
              employeeName: operation.employeeName,
              mode: operation.mode,
              kpiVersion: operation.kpiVersion,
              latestSource: operation.latestSource,
            });
          } catch (error) {
            employeeKpiFailures.push({
              memberId: operation.memberId,
              employeeId: operation.employeeId,
              employeeName: operation.employeeName,
              mode: operation.mode,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } else if (employeeKpiOperations.length > 0) {
        for (const operation of employeeKpiOperations) {
          employeeKpiFailures.push({
            memberId: operation.memberId,
            employeeId: operation.employeeId,
            employeeName: operation.employeeName,
            mode: operation.mode,
            error: `TeamForge DB unavailable at ${args.teamforgeDbPath}`,
          });
        }
      }

      report.employeeKpiApplied = employeeKpiApplied;
      report.employeeKpiFailures = employeeKpiFailures;

      try {
        const verifiedGraphs = await loadExistingGraphs(args.workerBaseUrl, token);
        report.postApplyVerification = {
          remoteShapes: verifiedGraphs.observedShapes ?? [],
          verified: applied.map((item) => {
            const graph =
              verifiedGraphs.byId.get(item.targetProjectId) ??
              verifiedGraphs.bySlug.get(item.projectId) ??
              null;
            return {
              projectId: item.projectId,
              targetProjectId: item.targetProjectId,
              found: Boolean(graph),
              remoteShape: graph?.shape ?? null,
              remoteProject: graph
                ? {
                    id: graph.project.id,
                    workspaceId: graph.project.workspaceId,
                    slug: graph.project.slug,
                    name: graph.project.name,
                    clientName: graph.project.clientName,
                    projectType: graph.project.projectType,
                    status: graph.project.status,
                    syncMode: graph.project.syncMode,
                  }
                : null,
              externalIds: graph?.externalIds ?? [],
            };
          }),
        };
      } catch (error) {
        report.postApplyVerification = {
          warning: error instanceof Error ? error.message : String(error),
        };
      }

      if (teamforgeContext.db) {
        report.postApplyKpiVerification = {
          verified: employeeKpiApplied.map((item) => {
            const row = teamforgeContext.db
              .prepare(
                `SELECT employee_id, member_id, kpi_version, title, source_relative_path, source_last_modified_at
                 FROM employee_kpi_snapshots
                 WHERE employee_id = ? AND kpi_version = ?`,
              )
              .get(item.employeeId, item.kpiVersion);
            return {
              memberId: item.memberId,
              employeeId: item.employeeId,
              employeeName: item.employeeName,
              kpiVersion: item.kpiVersion,
              found: Boolean(row),
              snapshot: row ?? null,
            };
          }),
        };
      }
    }

    await maybeWriteReport(args.reportPath, report);

    console.log(`Vault parity mode: ${report.mode}`);
    console.log(`Project briefs found: ${report.counts.projectBriefsFound}`);
    console.log(`Project creates: ${report.counts.creates}`);
    console.log(`Project updates: ${report.counts.updates}`);
    console.log(`Status counts: ${JSON.stringify(report.counts.statuses)}`);
    console.log(`Client profiles found: ${report.counts.clientProfilesFound}`);
    console.log(`Project artifacts found: ${report.counts.projectArtifactsFound}`);
    console.log(`Onboarding flows found: ${report.counts.onboardingFlowsFound}`);
    console.log(`Employee KPI notes found: ${report.counts.employeeKpiNotesFound}`);
    console.log(`Employee KPI creates: ${report.counts.employeeKpiCreates}`);
    console.log(`Employee KPI updates: ${report.counts.employeeKpiUpdates}`);
    console.log(`Employee KPI unresolved: ${report.counts.employeeKpiUnresolved}`);
    if (remoteWarning) {
      console.log(`Remote compare warning: ${remoteWarning}`);
    }
    if (remoteShapes.length > 0) {
      console.log(`Remote registry shapes: ${remoteShapes.join(", ")}`);
    }
    if (teamforgeContext.warnings.length > 0) {
      console.log("TeamForge DB warnings:");
      for (const warning of teamforgeContext.warnings) {
        console.log(`- ${warning}`);
      }
    }
    if (report.warnings.length > 0) {
      console.log("Warnings:");
      for (const warning of report.warnings) {
        console.log(`- ${warning}`);
      }
    }
    console.log("Project operations:");
    for (const operation of report.projects.operations) {
      console.log(
        `- ${operation.mode.toUpperCase()} ${operation.projectId} (${operation.relativePath})`,
      );
      for (const diff of operation.diffs) {
        console.log(`  ${diff}`);
      }
    }
    if (report.clientProfiles.records.length > 0) {
      console.log("Client profile records:");
      for (const record of report.clientProfiles.records) {
        console.log(
          `- ${record.readyForApply ? "READY" : "WARN"} ${record.clientId ?? "unknown"} (${record.relativePath})`,
        );
      }
    }
    if (report.projectArtifacts.records.length > 0) {
      console.log("Project artifact records:");
      for (const record of report.projectArtifacts.records) {
        console.log(
          `- ${record.readyForApply ? "READY" : "WARN"} ${record.projectId ?? "unknown"} ${record.artifactType ?? "unknown"} (${record.relativePath})`,
        );
      }
    }
    if (report.onboardingFlows.records.length > 0) {
      console.log("Onboarding flow records:");
      for (const record of report.onboardingFlows.records) {
        console.log(
          `- ${record.readyForApply ? "READY" : "WARN"} ${record.flowId ?? "unknown"} [${record.audience}] (${record.relativePath})`,
        );
      }
    }
    console.log("Employee KPI operations:");
    for (const operation of report.employeeKpis.operations) {
      const label = operation.employeeName
        ? `${operation.memberId} -> ${operation.employeeName}`
        : operation.memberId;
      console.log(
        `- ${operation.mode.toUpperCase()} ${label} (${operation.relativePath})`,
      );
      for (const diff of operation.diffs) {
        console.log(`  ${diff}`);
      }
    }
    if (report.postApplyVerification?.verified?.length) {
      console.log("Post-apply project verification:");
      for (const verification of report.postApplyVerification.verified) {
        console.log(
          `- ${verification.projectId}: ${
            verification.found ? `found (${verification.remoteShape})` : "missing"
          }`,
        );
      }
    }
    if (report.postApplyKpiVerification?.verified?.length) {
      console.log("Post-apply employee KPI verification:");
      for (const verification of report.postApplyKpiVerification.verified) {
        console.log(
          `- ${verification.memberId}: ${
            verification.found ? `found (${verification.kpiVersion})` : "missing"
          }`,
        );
      }
    }
    if (report.postApplyClientProfileVerification?.verified?.length) {
      console.log("Post-apply client profile verification:");
      for (const verification of report.postApplyClientProfileVerification.verified) {
        console.log(
          `- ${verification.clientId}: ${
            verification.found ? `found (${verification.linkedProjectCount} linked projects)` : "missing"
          }`,
        );
      }
    }
    if (report.postApplyOnboardingFlowVerification?.verified?.length) {
      console.log("Post-apply onboarding verification:");
      for (const verification of report.postApplyOnboardingFlowVerification.verified) {
        console.log(
          `- ${verification.flowId}: ${verification.found ? "found" : "missing"}`,
        );
      }
    }
    if (
      report.failures?.length ||
      report.clientProfileFailures?.length ||
      report.onboardingFlowFailures?.length ||
      report.employeeKpiFailures?.length
    ) {
      console.log("Failures:");
      for (const failure of report.failures ?? []) {
        console.log(`- project ${failure.projectId}: ${failure.error}`);
      }
      for (const failure of report.clientProfileFailures ?? []) {
        console.log(`- client profile ${failure.clientId ?? failure.relativePath}: ${failure.error}`);
      }
      for (const failure of report.onboardingFlowFailures ?? []) {
        console.log(`- onboarding ${failure.flowId ?? failure.relativePath}: ${failure.error}`);
      }
      for (const failure of report.employeeKpiFailures ?? []) {
        console.log(`- employee KPI ${failure.memberId}: ${failure.error}`);
      }
      process.exitCode = 1;
    }
    if (args.reportPath) {
      console.log(`Report written: ${args.reportPath}`);
    }
  } finally {
    teamforgeContext.db?.close?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
