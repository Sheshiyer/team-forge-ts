/**
 * Mirror GitHub issue plans into Huly Tracker.
 *
 * This implementation uses Huly REST endpoints directly:
 * - GET  /config.json
 * - POST selectWorkspace JSON-RPC
 * - GET  /api/v1/find-all/{workspace}
 * - POST /api/v1/tx/{workspace}
 *
 * It intentionally avoids `@hcengineering/tracker` and `@hcengineering/core`
 * so it is resilient to upstream package publishing drift.
 *
 * Run:
 *   cd team-forge-ts/sidecar
 *   pnpm install
 *   HULY_TOKEN="$HULY_API_KEY" \
 *   HULY_WORKSPACE=46352c1b-9c0a-4562-b204-d39e47ff0b1b \
 *   GITHUB_REPO=Sheshiyer/parkarea-aleph \
 *   GITHUB_TOKEN="$(gh auth token)" \
 *   pnpm mirror:github
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type WorkspaceLoginInfo = {
  endpoint: string;
  token: string;
  workspace: string;
};

type HulyConfig = {
  ACCOUNTS_URL: string;
};

type HulyAccountInfo = {
  uuid?: string;
  primarySocialId?: string;
  socialIds?: string[];
  email?: string;
};

type HulyProject = {
  _id: string;
  name?: string;
  identifier?: string;
  archived?: boolean;
  type?: string;
  owners?: string[];
  private?: boolean;
  autoJoin?: boolean;
  defaultIssueStatus?: string;
  defaultTimeReportDay?: unknown;
  defaultAssignee?: string;
  icon?: string;
  color?: unknown;
};

type HulyDoc = { _id: string };

type GithubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  html_url: string;
  pull_request?: unknown;
};

type CachedGithubIssueRow = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels_json: string | null;
  html_url: string;
};

const CORE_CLASS_TX_CREATE_DOC = "core:class:TxCreateDoc";
const CORE_CLASS_TX_UPDATE_DOC = "core:class:TxUpdateDoc";
const CORE_SPACE_TX = "core:space:Tx";
const CORE_SPACE_SPACE = "core:space:Space";

const TRACKER_PROJECT_CLASS = "tracker:class:Project";
const TRACKER_COMPONENT_CLASS = "tracker:class:Component";
const TRACKER_ISSUE_CLASS = "tracker:class:Issue";
const TRACKER_STATUS_TODO = "tracker:status:todo";
const TRACKER_STATUS_DONE = "tracker:status:done";

const GITHUB_REPO = process.env.GITHUB_REPO ?? "Sheshiyer/parkarea-aleph";
const HULY_TOKEN = process.env.HULY_TOKEN?.trim() ?? "";
const HULY_WORKSPACE = process.env.HULY_WORKSPACE?.trim() ?? "";
const HULY_BASE_URL = inferPlatformBaseUrl();

const PROJECT = {
  identifier: process.env.PROJECT_IDENTIFIER ?? "PARKAREA",
  name: process.env.PROJECT_NAME ?? "ParkArea Phase 2 — Germany Launch",
  description:
    process.env.PROJECT_DESCRIPTION ??
    "Production-ready German parking marketplace. Fixed-price (€4,000), 3-week sprint " +
    "(2026-04-16 → 2026-05-07). Per signed Development Agreement + Technical Scope. " +
    "See https://github.com/Sheshiyer/parkarea-aleph and docs/engagement-playbook.md.",
};

const COMPONENTS: Array<{ label: string; description: string }> = [
  {
    label: "contracts",
    description: "Maintain shared/contracts; integration-task gatekeeper",
  },
  {
    label: "backend-core",
    description:
      "Express skeleton + middleware + auth + RBAC + tenant + OpenAPI (Spec 001)",
  },
  {
    label: "backend-domain",
    description: "Listings, search, availability, bookings (Specs 002-005)",
  },
  {
    label: "backend-payments",
    description: "Stripe Connect + append-only ledger + webhooks (Specs 006-007)",
  },
  {
    label: "frontend-public",
    description: "Public pages + auth + search + booking UI (16 demo pages)",
  },
  {
    label: "frontend-provider",
    description: "Provider/Enterprise dashboard + 9-step listing wizard",
  },
  {
    label: "frontend-admin",
    description: "Admin panel (NEW pages; uses ui-ux-pro-max + brand override)",
  },
  { label: "infra", description: "Dockerfile, CI workflows, deploy scripts" },
  {
    label: "i18n",
    description: "react-i18next + locale extraction + EN translations (CR-001)",
  },
  {
    label: "qa",
    description: "Playwright acceptance specs (1 per acceptance criterion)",
  },
];

class HulyRestClient {
  constructor(
    private readonly endpoint: string,
    private readonly workspaceId: string,
    private readonly token: string
  ) {}

  private authHeaders(extra?: HeadersInit): Headers {
    const headers = new Headers(extra ?? {});
    headers.set("Authorization", `Bearer ${this.token}`);
    return headers;
  }

  async findAll<T extends Record<string, unknown>>(
    classRef: string,
    query: unknown,
    limit = 200
  ): Promise<T[]> {
    const params = new URLSearchParams({
      class: classRef,
      query: JSON.stringify(query),
      options: JSON.stringify({ limit }),
    });

    const url = `${this.endpoint}/api/v1/find-all/${this.workspaceId}?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.authHeaders({ "Content-Type": "application/json" }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `find-all ${classRef} failed (${response.status}): ${raw.slice(0, 500)}`
      );
    }

    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "value" in parsed &&
      Array.isArray((parsed as { value: unknown }).value)
    ) {
      return (parsed as { value: T[] }).value;
    }
    throw new Error(
      `find-all ${classRef} returned unknown payload shape: ${raw.slice(0, 300)}`
    );
  }

  async findOne<T extends Record<string, unknown>>(
    classRef: string,
    query: unknown
  ): Promise<T | null> {
    const docs = await this.findAll<T>(classRef, query, 1);
    return docs[0] ?? null;
  }

  async postTx(tx: Record<string, unknown>): Promise<unknown> {
    const url = `${this.endpoint}/api/v1/tx/${this.workspaceId}`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(tx),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`tx failed (${response.status}): ${raw.slice(0, 500)}`);
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async createDoc(
    actorSocialId: string,
    classRef: string,
    objectSpace: string,
    attributes: Record<string, unknown>,
    objectId?: string
  ): Promise<string> {
    const id = objectId ?? generateHulyId();
    const tx = {
      _id: generateHulyId(),
      _class: CORE_CLASS_TX_CREATE_DOC,
      space: CORE_SPACE_TX,
      objectId: id,
      objectClass: classRef,
      objectSpace,
      modifiedOn: Date.now(),
      modifiedBy: actorSocialId,
      createdBy: actorSocialId,
      attributes,
    };
    await this.postTx(tx);
    return id;
  }

  async updateDoc(
    actorSocialId: string,
    classRef: string,
    objectSpace: string,
    objectId: string,
    operations: Record<string, unknown>,
    retrieve = false
  ): Promise<void> {
    const tx = {
      _id: generateHulyId(),
      _class: CORE_CLASS_TX_UPDATE_DOC,
      space: CORE_SPACE_TX,
      objectId,
      objectClass: classRef,
      objectSpace,
      modifiedOn: Date.now(),
      modifiedBy: actorSocialId,
      operations,
      retrieve,
    };
    await this.postTx(tx);
  }

  async getAccountInfo(): Promise<HulyAccountInfo> {
    const url = `${this.endpoint}/api/v1/account/${this.workspaceId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.authHeaders(),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `account lookup failed (${response.status}): ${raw.slice(0, 500)}`
      );
    }
    return JSON.parse(raw) as HulyAccountInfo;
  }
}

function inferPlatformBaseUrl(): string {
  const explicit =
    process.env.HULY_BASE_URL?.trim() || process.env.HULY_PLATFORM_URL?.trim();
  if (explicit) return trimTrailingSlash(explicit);

  const legacy = process.env.HULY_URL?.trim();
  if (legacy) {
    if (legacy.startsWith("http://") || legacy.startsWith("https://")) {
      const parsed = new URL(legacy);
      return trimTrailingSlash(`${parsed.protocol}//${parsed.host}`);
    }
    if (legacy.startsWith("ws://") || legacy.startsWith("wss://")) {
      const parsed = new URL(legacy);
      const host = parsed.host.replace(/^transactor\./, "");
      const protocol = legacy.startsWith("wss://") ? "https" : "http";
      return `${protocol}://${host}`;
    }
  }

  return "https://huly.app";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeEndpoint(endpoint: string): string {
  return trimTrailingSlash(
    endpoint.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://")
  );
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractWorkspaceFromJwt(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as {
      workspace?: string;
    };
    return payload.workspace ?? null;
  } catch {
    return null;
  }
}

function currentEpochSecondsHex(): string {
  return Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
}

const randomSegment = (() => {
  const nanoLike = BigInt(Date.now()) * 1_000_000n;
  const mixed = nanoLike ^ BigInt(process.pid);
  const partA = Number((mixed >> 16n) & 0x00ff_ffffn)
    .toString(16)
    .padStart(6, "0");
  const partB = Number(mixed & 0x0000_ffffn)
    .toString(16)
    .padStart(4, "0");
  return `${partA}${partB}`;
})();

let idCounter = 0;
function generateHulyId(): string {
  const counter = (idCounter++ & 0x00ff_ffff).toString(16).padStart(6, "0");
  return `${currentEpochSecondsHex()}${randomSegment}${counter}`;
}

async function selectWorkspace(
  baseUrl: string,
  userToken: string,
  workspaceUrl: string
): Promise<WorkspaceLoginInfo> {
  const configUrl = `${trimTrailingSlash(baseUrl)}/config.json`;
  const configResponse = await fetch(configUrl);
  const configRaw = await configResponse.text();
  if (!configResponse.ok) {
    throw new Error(
      `config.json lookup failed (${configResponse.status}): ${configRaw.slice(0, 500)}`
    );
  }
  const config = JSON.parse(configRaw) as HulyConfig;
  if (!config.ACCOUNTS_URL) {
    throw new Error("config.json missing ACCOUNTS_URL");
  }

  const response = await fetch(config.ACCOUNTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      method: "selectWorkspace",
      params: { workspaceUrl, kind: "external" },
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `selectWorkspace failed (${response.status}): ${raw.slice(0, 500)}`
    );
  }

  const parsed = JSON.parse(raw) as {
    result?: WorkspaceLoginInfo;
    error?: unknown;
  };
  if (parsed.error) {
    throw new Error(`selectWorkspace RPC error: ${JSON.stringify(parsed.error)}`);
  }
  if (!parsed.result?.endpoint || !parsed.result?.token || !parsed.result?.workspace) {
    throw new Error(
      `selectWorkspace missing result fields: ${raw.slice(0, 500)}`
    );
  }
  return {
    endpoint: normalizeEndpoint(parsed.result.endpoint),
    token: parsed.result.token,
    workspace: parsed.result.workspace,
  };
}

function chooseProjectTemplate(projects: HulyProject[]): HulyProject | null {
  const preferred = ["HEYZA", "AXTECH", "TIRAK", "VIBRA", "VIBRASONIX"];
  for (const name of preferred) {
    const hit = projects.find((project) => {
      const normalized = (project.name ?? project.identifier ?? "").toUpperCase();
      return normalized.includes(name) && Boolean(project.type);
    });
    if (hit) return hit;
  }

  return (
    projects.find((project) => Boolean(project.type) && !project.archived) ?? null
  );
}

async function upsertProject(
  client: HulyRestClient,
  actorSocialId: string,
  actorAccountId: string | null
): Promise<string> {
  const existing = await client.findOne<HulyDoc & { identifier?: string }>(
    TRACKER_PROJECT_CLASS,
    { identifier: PROJECT.identifier }
  );
  if (existing?._id) {
    console.log(`✓ Project '${PROJECT.identifier}' exists (id: ${existing._id})`);
    return existing._id;
  }

  const projects = await client.findAll<HulyProject>(TRACKER_PROJECT_CLASS, {}, 200);
  const template = chooseProjectTemplate(projects);

  const attributes: Record<string, unknown> = {
    name: PROJECT.name,
    description: PROJECT.description,
    private: template?.private ?? false,
    members: [],
    owners:
      template?.owners && template.owners.length > 0
        ? template.owners
        : actorAccountId
          ? [actorAccountId]
          : [],
    archived: false,
    autoJoin: template?.autoJoin ?? false,
    identifier: PROJECT.identifier,
    sequence: 0,
    type: template?.type ?? "tracker:project-type:default",
    defaultIssueStatus: template?.defaultIssueStatus ?? TRACKER_STATUS_TODO,
    defaultTimeReportDay: template?.defaultTimeReportDay ?? "PreviousWorkDay",
  };

  if (template?.defaultAssignee) attributes.defaultAssignee = template.defaultAssignee;
  if (template?.icon) attributes.icon = template.icon;
  if (template?.color !== undefined) attributes.color = template.color;

  const projectId = await client.createDoc(
    actorSocialId,
    TRACKER_PROJECT_CLASS,
    CORE_SPACE_SPACE,
    attributes
  );
  console.log(`+ Created Project '${PROJECT.identifier}' (id: ${projectId})`);
  return projectId;
}

async function upsertComponents(
  client: HulyRestClient,
  actorSocialId: string,
  projectId: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  for (const component of COMPONENTS) {
    const existing = await client.findOne<HulyDoc>(TRACKER_COMPONENT_CLASS, {
      space: projectId,
      label: component.label,
    });
    if (existing?._id) {
      console.log(`✓ Component '${component.label}' exists`);
      result.set(component.label, existing._id);
      continue;
    }

    const componentId = await client.createDoc(
      actorSocialId,
      TRACKER_COMPONENT_CLASS,
      projectId,
      {
        label: component.label,
        description: component.description,
        lead: null,
        comments: 0,
        attachments: 0,
      }
    );
    console.log(`+ Created Component '${component.label}' (id: ${componentId})`);
    result.set(component.label, componentId);
  }

  return result;
}

function inferComponent(issueTitle: string, components: Map<string, string>): string | null {
  const trackMatch = issueTitle.match(/track-([a-z-]+)/i);
  if (trackMatch) {
    const key = trackMatch[1].toLowerCase();
    if (components.has(key)) return components.get(key)!;
  }

  const specMatch = issueTitle.match(/\[Spec (\d{3})\]/i);
  if (specMatch) {
    const spec = specMatch[1];
    if (spec === "001") return components.get("backend-core") ?? null;
    if (["002", "003", "004", "005"].includes(spec)) {
      return components.get("backend-domain") ?? null;
    }
    if (["006", "007"].includes(spec)) {
      return components.get("backend-payments") ?? null;
    }
    if (spec === "008") return components.get("frontend-provider") ?? null;
    if (spec === "009") return components.get("backend-domain") ?? null;
    if (spec === "010") return components.get("backend-core") ?? null;
  }

  if (issueTitle.includes("Wave 0")) return components.get("contracts") ?? null;
  return null;
}

function priorityFromIssue(labels: string[]): number | null {
  if (labels.includes("priority:p0")) return 0;
  if (labels.includes("priority:p1")) return 1;
  if (labels.includes("priority:p2")) return 2;
  if (labels.includes("priority:p3")) return 3;
  return null;
}

function statusFromIssue(state: "open" | "closed"): string {
  return state === "closed" ? TRACKER_STATUS_DONE : TRACKER_STATUS_TODO;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function cachedRowsToIssues(rows: CachedGithubIssueRow[]): GithubIssue[] {
  return rows.map((row) => {
    let labelNames: string[] = [];
    if (row.labels_json) {
      try {
        const parsed = JSON.parse(row.labels_json) as unknown;
        if (Array.isArray(parsed)) {
          labelNames = parsed.filter((item): item is string => typeof item === "string");
        }
      } catch {
        labelNames = [];
      }
    }

    return {
      number: row.number,
      title: row.title,
      body: row.body,
      state: row.state,
      html_url: row.html_url,
      labels: labelNames.map((name) => ({ name })),
    };
  });
}

async function fetchCachedGithubIssues(repo: string): Promise<GithubIssue[] | null> {
  const dbPath = process.env.TEAMFORGE_DB_PATH?.trim();
  if (!dbPath) return null;

  const sql = [
    "SELECT",
    "number,",
    "title,",
    "body_excerpt AS body,",
    "LOWER(state) AS state,",
    "labels_json,",
    "url AS html_url",
    "FROM github_issues",
    `WHERE repo = ${sqlString(repo)}`,
    "ORDER BY number ASC",
  ].join(" ");

  try {
    const { stdout } = await execFileAsync("sqlite3", ["-json", dbPath, sql], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const rows = JSON.parse(trimmed) as CachedGithubIssueRow[];
    return cachedRowsToIssues(rows);
  } catch (error) {
    console.warn(
      `⚠ Could not read TeamForge GitHub cache; falling back to GitHub API: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

async function fetchGithubIssues(repo: string, token: string): Promise<GithubIssue[]> {
  const cached = await fetchCachedGithubIssues(repo);
  if (cached) {
    console.log(`Using TeamForge GitHub cache from TEAMFORGE_DB_PATH (${cached.length} issues)`);
    return cached;
  }
  if (!token.trim()) {
    throw new Error("GITHUB_TOKEN is required when TEAMFORGE_DB_PATH is not set.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues?state=all&per_page=100`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${raw.slice(0, 500)}`);
  }

  const issues = JSON.parse(raw) as GithubIssue[];
  return issues.filter((issue) => !issue.pull_request);
}

async function upsertIssues(
  client: HulyRestClient,
  actorSocialId: string,
  projectId: string,
  components: Map<string, string>,
  githubIssues: GithubIssue[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const issue of githubIssues) {
    const labels = issue.labels.map((label) => label.name);
    const componentId = inferComponent(issue.title, components);
    const description = [
      issue.body ?? "",
      "",
      "---",
      `Source: ${issue.html_url}`,
      `Labels: ${labels.join(", ")}`,
    ].join("\n");
    const attributes = {
      title: issue.title,
      description,
      assignee: null,
      component: componentId,
      milestone: null,
      number: issue.number,
      priority: priorityFromIssue(labels),
      status: statusFromIssue(issue.state),
      dueDate: null,
      rank: "",
      labels,
      estimation: 0,
      reportedTime: 0,
      reports: 0,
      childInfo: [],
    };

    const existing = await client.findOne<HulyDoc>(TRACKER_ISSUE_CLASS, {
      space: projectId,
      number: issue.number,
    });
    if (existing?._id) {
      await client.updateDoc(
        actorSocialId,
        TRACKER_ISSUE_CLASS,
        projectId,
        existing._id,
        attributes,
        false
      );
      updated += 1;
      console.log(
        `~ Issue #${issue.number} updated in Huly (component: ${
          componentId ? "mapped" : "none"
        })`
      );
      continue;
    }

    await client.createDoc(actorSocialId, TRACKER_ISSUE_CLASS, projectId, attributes);

    created += 1;
    console.log(
      `+ Issue #${issue.number} → Huly (component: ${componentId ? "mapped" : "none"})`
    );
  }

  return { created, updated };
}

async function main(): Promise<void> {
  if (!HULY_TOKEN) {
    throw new Error("HULY_TOKEN is required.");
  }

  const workspaceSlug = HULY_WORKSPACE || extractWorkspaceFromJwt(HULY_TOKEN);
  if (!workspaceSlug) {
    throw new Error(
      "HULY_WORKSPACE is required (or token must include workspace in JWT payload)."
    );
  }

  console.log("Connecting to Huly...");
  console.log(`  Base URL:  ${HULY_BASE_URL}`);
  console.log(`  Workspace: ${workspaceSlug}`);

  const login = await selectWorkspace(HULY_BASE_URL, HULY_TOKEN, workspaceSlug);
  const client = new HulyRestClient(login.endpoint, login.workspace, login.token);
  const account = await client.getAccountInfo();

  const actorSocialId =
    account.primarySocialId ||
    account.socialIds?.find((id) => id && id.trim().length > 0) ||
    null;
  if (!actorSocialId) {
    throw new Error("Huly account missing primarySocialId/socialIds; cannot create tx docs.");
  }
  const actorAccountId = account.uuid ?? null;

  console.log(
    `✓ Connected as ${account.email ?? "unknown"} (workspace: ${login.workspace})`
  );

  const projectId = await upsertProject(client, actorSocialId, actorAccountId);
  const components = await upsertComponents(client, actorSocialId, projectId);

  const githubToken = process.env.GITHUB_TOKEN?.trim() ?? "";
  try {
    console.log(`Fetching GitHub issues from ${GITHUB_REPO}...`);
    const githubIssues = await fetchGithubIssues(GITHUB_REPO, githubToken);
    console.log(`  Found ${githubIssues.length} issues`);
    const { created, updated } = await upsertIssues(
      client,
      actorSocialId,
      projectId,
      components,
      githubIssues
    );
    console.log(`✓ Issues: ${created} created, ${updated} updated in Huly`);
  } catch (error) {
    console.warn(
      `⚠ GitHub issue mirror skipped: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    console.warn(
      "  Provide GITHUB_TOKEN or TEAMFORGE_DB_PATH to mirror GitHub issue plans."
    );
  }

  console.log("");
  console.log("=== Summary ===");
  console.log(`Project:    ${PROJECT.identifier} (${projectId})`);
  console.log(`Components: ${components.size}`);
  console.log(`Workspace:  ${login.workspace}`);
  console.log("");
  console.log("Open in Huly to review.");
}

main().catch((error) => {
  console.error("FATAL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
