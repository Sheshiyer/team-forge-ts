#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(process.env.REPO_ROOT || path.join(__dirname, "..", ".."));
const PORT = Number(process.env.PORT || 3101);
const HOST = process.env.HOST || "127.0.0.1";
const PAPERCLIP_API_TOKEN = (process.env.PAPERCLIP_API_TOKEN || "").trim();
const STALE_THRESHOLD_SEC = Number(
  process.env.PAPERCLIP_STALE_THRESHOLD_SEC ||
    process.env.TEAMFORGE_STALE_THRESHOLD_SEC ||
    900,
);
const DRY_RUN = process.env.FORGE_AURA_ADAPTER_DRY_RUN === "1";

const AGENTS_DIR = path.join(REPO_ROOT, "agents");
const PROJECTS_DIR = path.join(REPO_ROOT, "config", "projects");
const MEMORY_DIR = path.join(REPO_ROOT, "MEMORY");
const VAULT_DIR = path.join(REPO_ROOT, "vault");
const ESCALATIONS_DIR = path.join(VAULT_DIR, "leadership", "escalations");
const REQUIRED_AGENT_FILES = [
  "TASKS.md",
  "CONTEXT.md",
  "HEARTBEAT.md",
  "AGENTS.md",
  "INBOX.md",
];

function log(message) {
  console.log(`[paperclip-runtime-adapter] ${message}`);
}

function titleCase(value) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function stableId(parts) {
  return crypto
    .createHash("sha1")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 12);
}

function normalizeIso(value) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return timestamp.toISOString();
}

function secondsSince(isoValue) {
  const normalized = normalizeIso(isoValue);
  if (!normalized) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(normalized)) / 1000));
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function unauthorized(res) {
  json(res, 401, { error: "invalid_authorization" });
}

function routeNotFound(res) {
  json(res, 404, { error: "route_not_found" });
}

function badRequest(res, message) {
  json(res, 400, { error: message });
}

function serverError(res, error) {
  json(res, 500, { error: error instanceof Error ? error.message : String(error) });
}

function requireAuthorization(req, res) {
  if (!PAPERCLIP_API_TOKEN) {
    return true;
  }

  const header = req.headers.authorization || "";
  const expected = `Bearer ${PAPERCLIP_API_TOKEN}`;
  if (header !== expected) {
    unauthorized(res);
    return false;
  }

  return true;
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

async function readTextMaybe(filePath) {
  try {
    return await readText(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readJsonMaybe(filePath) {
  const text = await readTextMaybe(filePath);
  if (!text) return null;
  return JSON.parse(text);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractYamlSection(text, sectionName) {
  const lines = text.split(/\r?\n/);
  const header = `${sectionName}:`;
  let startIndex = -1;
  let sectionIndent = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (rawLine.trim() === header) {
      startIndex = index;
      sectionIndent = rawLine.length - rawLine.trimStart().length;
      break;
    }
  }

  if (startIndex === -1) return "";

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    const indent = rawLine.length - rawLine.trimStart().length;

    if (trimmed && !trimmed.startsWith("#") && indent <= sectionIndent) {
      break;
    }

    sectionLines.push(rawLine.slice(Math.min(rawLine.length, sectionIndent + 2)));
  }

  return sectionLines.join("\n");
}

function extractYamlScalar(sectionText, key) {
  const match = sectionText.match(new RegExp(`^\\s*${escapeRegex(key)}:\\s*(.+?)\\s*$`, "m"));
  if (!match) return null;

  let value = match[1].replace(/\s+#.*$/, "").trim();
  if (!value || value === "[]" || value === "{}") return null;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.trim() || null;
}

function markdownSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const marker = `## ${heading}`;
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === marker) {
      start = index + 1;
      break;
    }
  }

  if (start === -1) return "";

  const sectionLines = [];
  for (let index = start; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (rawLine.startsWith("## ")) {
      break;
    }
    sectionLines.push(rawLine);
  }

  return sectionLines.join("\n");
}

function parseBulletTasks(sectionText, status, source, projectCatalog, updatedAt) {
  const tasks = [];
  const lines = sectionText.split(/\r?\n/);
  let currentTask = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^_.*_$/.test(trimmed)) {
      continue;
    }

    const bulletMatch = rawLine.match(/^\s*-\s+(?:\[(.| )\]\s+)?(.+?)\s*$/);
    if (bulletMatch) {
      const title = bulletMatch[2].trim();
      const project = inferProjectContext(title, projectCatalog);
      currentTask = {
        id: stableId([source, status, title]),
        title,
        status,
        priority: inferPriority(title, status),
        department: null,
        tags: inferTags(title),
        source,
        sourceRef: null,
        updatedAt,
        projectCode: project?.projectCode || null,
        projectId: project?.projectId || null,
        clientId: project?.clientId || null,
      };
      tasks.push(currentTask);
      continue;
    }

    if (currentTask && /^\s{2,}\S/.test(rawLine)) {
      currentTask.title = `${currentTask.title} ${trimmed}`;
    }
  }

  return tasks;
}

function parseInboxEntries(sectionText, projectCatalog, updatedAt) {
  const text = sectionText.trim();
  if (!text || /^_.*_$/.test(text)) {
    return [];
  }

  const matches = [...text.matchAll(/^###\s+\[(.+?)\](.*)$/gm)];
  if (matches.length === 0) {
    return parseBulletTasks(sectionText, "pending", "inbox", projectCatalog, updatedAt);
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
    const block = text.slice(start, end);
    const headingTimestamp = normalizeIso(match[1].trim()) || updatedAt;
    const headingMeta = match[2] || "";
    const lines = block.split(/\r?\n/).slice(1);
    const titleLine = lines.find(
      (line) =>
        line.trim() &&
        !/^(Task-ID:|Tags:|Source-Ref:|Priority:|Processed:|Details:)/i.test(line.trim()),
    );
    const title = (titleLine || headingMeta || "Inbox item").replace(/^\[[^\]]+\]\s*/, "").trim();
    const tagsLine = lines.find((line) => /^Tags:/i.test(line.trim()));
    const sourceRefLine = lines.find((line) => /^Source-Ref:/i.test(line.trim()));
    const priorityMatch = headingMeta.match(/Priority:\s*([^|]+)/i);
    const project = inferProjectContext(block, projectCatalog);

    return {
      id: stableId(["inbox", title, headingTimestamp]),
      title,
      status: "pending",
      priority: priorityMatch ? priorityMatch[1].trim().toLowerCase() : inferPriority(title, "pending"),
      department: null,
      tags: tagsLine
        ? tagsLine
            .replace(/^Tags:\s*/i, "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : inferTags(block),
      source: "inbox",
      sourceRef: sourceRefLine ? sourceRefLine.replace(/^Source-Ref:\s*/i, "").trim() : null,
      updatedAt: headingTimestamp,
      projectCode: project?.projectCode || null,
      projectId: project?.projectId || null,
      clientId: project?.clientId || null,
    };
  });
}

function inferTags(text) {
  const normalized = text.toLowerCase();
  const tags = [];
  if (normalized.includes("escalat")) tags.push("escalation");
  if (normalized.includes("block")) tags.push("blocker");
  if (normalized.includes("review")) tags.push("review");
  return tags;
}

function inferPriority(text, status) {
  const normalized = text.toLowerCase();
  if (normalized.includes("critical") || normalized.includes("urgent") || normalized.includes("block")) {
    return "high";
  }
  if (status === "in_progress") {
    return "medium";
  }
  if (status === "standing") {
    return "low";
  }
  return "medium";
}

function parseHeartbeat(text) {
  const tableRows = [...text.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)];
  if (tableRows.length > 0) {
    const lastRow = tableRows[tableRows.length - 1];
    return {
      lastCycle: normalizeIso(lastRow[1].trim()),
      outcome: lastRow[3].trim().toLowerCase(),
    };
  }

  const cycleBlocks = [...text.matchAll(/^###\s+(.+?)\s+Cycle Result$/gm)];
  if (cycleBlocks.length > 0) {
    const lastBlock = cycleBlocks[cycleBlocks.length - 1];
    const lastCycle = normalizeIso(lastBlock[1].trim());
    const after = text.slice((lastBlock.index ?? 0) + lastBlock[0].length);
    const outcomeMatch = after.match(/^- Outcome:\s*(.+)$/m);
    return {
      lastCycle,
      outcome: outcomeMatch ? outcomeMatch[1].trim().toLowerCase() : "completed",
    };
  }

  return {
    lastCycle: null,
    outcome: null,
  };
}

async function loadAgents() {
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
  const agents = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(AGENTS_DIR, entry.name, "MANIFEST.yaml");
    const manifestText = await readTextMaybe(manifestPath);
    if (!manifestText) continue;

    const agentSection = extractYamlSection(manifestText, "agent");
    agents.push({
      userId: extractYamlScalar(agentSection, "id") || entry.name,
      userName: extractYamlScalar(agentSection, "name") || titleCase(entry.name),
      title: extractYamlScalar(agentSection, "title"),
      department: extractYamlScalar(agentSection, "department"),
      role: extractYamlScalar(agentSection, "role"),
      reportsTo: extractYamlScalar(agentSection, "reports_to"),
      icon: extractYamlScalar(agentSection, "icon"),
      dirName: entry.name,
    });
  }

  agents.sort((left, right) => left.userName.localeCompare(right.userName));
  return agents;
}

async function loadProjectCatalog() {
  const catalog = new Map();

  function upsert(project) {
    const key = (
      project.projectId ||
      project.projectCode ||
      project.projectName ||
      project.clientId ||
      crypto.randomUUID()
    )
      .toString()
      .toLowerCase();
    const existing = catalog.get(key) || {};
    catalog.set(key, {
      projectCode: project.projectCode || existing.projectCode || null,
      projectName: project.projectName || existing.projectName || null,
      projectId: project.projectId || existing.projectId || null,
      clientId: project.clientId || existing.clientId || null,
      status: project.status || existing.status || null,
    });
  }

  if (existsSync(PROJECTS_DIR)) {
    const files = await readdir(PROJECTS_DIR, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".yaml")) continue;
      const filePath = path.join(PROJECTS_DIR, file.name);
      const text = await readTextMaybe(filePath);
      if (!text) continue;
      upsert({
        projectCode: extractYamlScalar(text, "code") || path.basename(file.name, ".yaml").toUpperCase(),
        projectName: extractYamlScalar(text, "name") || titleCase(path.basename(file.name, ".yaml")),
        projectId: path.basename(file.name, ".yaml"),
        clientId: null,
        status: extractYamlScalar(text, "status"),
      });
    }
  }

  const teamforgeFeed = await readJsonMaybe(path.join(MEMORY_DIR, "teamforge-feed.json"));
  for (const project of teamforgeFeed?.data?.open_projects || []) {
    upsert({
      projectCode: (project.slug || project.id || project.name || "").toUpperCase(),
      projectName: project.name || project.slug || project.id,
      projectId: project.id || project.slug || null,
      clientId: project.client_id || project.clientId || slugify(project.client_name || ""),
      status: project.status || "active",
    });
  }

  if (existsSync(MEMORY_DIR)) {
    const files = await readdir(MEMORY_DIR, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.startsWith("vault-index.") || !file.name.endsWith(".json")) continue;
      const indexJson = await readJsonMaybe(path.join(MEMORY_DIR, file.name));
      for (const entry of indexJson?.entries || []) {
        if (!entry.project_id && !entry.client_id) continue;
        upsert({
          projectCode: entry.project_id ? entry.project_id.toUpperCase() : null,
          projectName: entry.project_id ? titleCase(entry.project_id) : entry.client_id,
          projectId: entry.project_id || null,
          clientId: entry.client_id || null,
          status: entry.status || null,
        });
      }
    }
  }

  return [...catalog.values()].sort((left, right) =>
    (left.projectName || left.projectCode || "").localeCompare(right.projectName || right.projectCode || ""),
  );
}

function inferProjectContext(text, projectCatalog) {
  const normalized = (text || "").toLowerCase();
  for (const project of projectCatalog) {
    if (project.projectCode && new RegExp(`\\b${escapeRegex(project.projectCode)}\\b`, "i").test(text)) {
      return project;
    }
    if (project.projectId && normalized.includes(project.projectId.toLowerCase())) {
      return project;
    }
    if (project.projectName && normalized.includes(project.projectName.toLowerCase())) {
      return project;
    }
    if (project.clientId && normalized.includes(project.clientId.toLowerCase())) {
      return project;
    }
  }
  return null;
}

async function agentFilesHealth(userId) {
  const agentDir = path.join(AGENTS_DIR, userId);
  let missingFiles = 0;

  for (const relativePath of REQUIRED_AGENT_FILES) {
    if (!existsSync(path.join(agentDir, relativePath))) {
      missingFiles += 1;
    }
  }

  return missingFiles;
}

async function loadPersonalContext(userId, projectCatalog, agentsById) {
  const agent = agentsById.get(userId);
  if (!agent) {
    return null;
  }

  const agentDir = path.join(AGENTS_DIR, userId);
  const tasksPath = path.join(agentDir, "TASKS.md");
  const inboxPath = path.join(agentDir, "INBOX.md");
  const heartbeatPath = path.join(agentDir, "HEARTBEAT.md");

  const [tasksText, inboxText, heartbeatText, tasksStat, inboxStat] = await Promise.all([
    readTextMaybe(tasksPath),
    readTextMaybe(inboxPath),
    readTextMaybe(heartbeatPath),
    stat(tasksPath).catch(() => null),
    stat(inboxPath).catch(() => null),
  ]);

  const taskUpdatedAt = tasksStat?.mtime ? tasksStat.mtime.toISOString() : null;
  const inboxUpdatedAt = inboxStat?.mtime ? inboxStat.mtime.toISOString() : null;

  const parsedTasks = [];
  let pendingCount = 0;
  let inProgressCount = 0;
  let blockedCount = 0;
  let completedCount = 0;

  if (tasksText) {
    const pendingTasks = parseBulletTasks(markdownSection(tasksText, "Pending"), "pending", "tasks", projectCatalog, taskUpdatedAt);
    const inProgressTasks = parseBulletTasks(markdownSection(tasksText, "In progress"), "in_progress", "tasks", projectCatalog, taskUpdatedAt);
    const completedTasks = parseBulletTasks(markdownSection(tasksText, "Completed (last 7 days)"), "completed", "tasks", projectCatalog, taskUpdatedAt);
    const standingTasks = parseBulletTasks(markdownSection(tasksText, "Standing responsibilities (never complete)"), "standing", "tasks", projectCatalog, taskUpdatedAt);

    pendingCount += pendingTasks.length;
    inProgressCount += inProgressTasks.length;
    completedCount += completedTasks.length;
    blockedCount += [...pendingTasks, ...inProgressTasks].filter((task) =>
      /block|blocked|blocker/i.test(task.title),
    ).length;

    parsedTasks.push(...pendingTasks, ...inProgressTasks, ...standingTasks, ...completedTasks);
  }

  if (inboxText) {
    const inboxTasks = parseInboxEntries(markdownSection(inboxText, "Unread"), projectCatalog, inboxUpdatedAt);
    pendingCount += inboxTasks.length;
    blockedCount += inboxTasks.filter((task) => /block|blocked|blocker/i.test(task.title)).length;
    parsedTasks.unshift(...inboxTasks);
  }

  const heartbeat = parseHeartbeat(heartbeatText || "");
  return {
    userId: agent.userId,
    userName: agent.userName,
    currentKrebs: agent.department || null,
    latestHeartbeatAt: heartbeat.lastCycle,
    summary: {
      pending: pendingCount,
      inProgress: inProgressCount,
      blocked: blockedCount,
      completed: completedCount,
    },
    tasks: parsedTasks,
  };
}

async function loadTelemetry(projectCatalog, agents, agentsById) {
  const items = [];
  for (const agent of agents) {
    const heartbeatText = await readTextMaybe(path.join(AGENTS_DIR, agent.userId, "HEARTBEAT.md"));
    const heartbeat = parseHeartbeat(heartbeatText || "");
    const personalContext = await loadPersonalContext(agent.userId, projectCatalog, agentsById);
    const missingFiles = await agentFilesHealth(agent.userId);
    const ageSeconds = secondsSince(heartbeat.lastCycle);
    const uninitialized = missingFiles > 0 || !heartbeat.lastCycle;
    const stale = !uninitialized && ageSeconds != null && ageSeconds > STALE_THRESHOLD_SEC;
    items.push({
      userId: agent.userId,
      userName: agent.userName,
      department: agent.department || null,
      role: agent.role || agent.title || null,
      status: uninitialized ? "uninitialized" : stale ? "stale" : "healthy",
      lastCycle: heartbeat.lastCycle,
      outcome: heartbeat.outcome,
      steps:
        (personalContext?.summary.pending || 0) +
        (personalContext?.summary.inProgress || 0) +
        (personalContext?.summary.blocked || 0),
      blocked: personalContext?.summary.blocked || 0,
      stale,
      uninitialized,
      missingFiles,
    });
  }

  return items.sort((left, right) => {
    const rank = { stale: 0, uninitialized: 1, healthy: 2 };
    return (rank[left.status] ?? 3) - (rank[right.status] ?? 3) || left.userName.localeCompare(right.userName);
  });
}

async function loadRooms(userId, projectCatalog, agentsById) {
  const rooms = [];
  const agent = agentsById.get(userId);
  if (agent) {
    rooms.push({
      id: `personal:${userId}`,
      name: `${agent.userName} Personal`,
      roomType: "personal",
      description: `${agent.userName} work context and inbox`,
      projectCode: null,
      projectName: null,
      projectId: null,
      clientId: null,
    });
  }

  rooms.push({
    id: "orchestrator:ceo",
    name: "CEO Orchestrator",
    roomType: "orchestrator",
    description: "Founder routing, approvals, and escalations",
    projectCode: "OPS",
    projectName: "Internal Ops",
    projectId: "ops",
    clientId: null,
  });

  const indexJson = await readJsonMaybe(path.join(MEMORY_DIR, `vault-index.${userId}.json`));
  const seenProjectIds = new Set();
  for (const entry of indexJson?.entries || []) {
    const projectId = entry.project_id || null;
    const clientId = entry.client_id || null;
    if (!projectId && !clientId) continue;
    const matchingProject =
      projectCatalog.find((project) => project.projectId === projectId) ||
      projectCatalog.find((project) => project.clientId === clientId);
    const resolvedProjectId = matchingProject?.projectId || projectId;
    if (!resolvedProjectId || seenProjectIds.has(resolvedProjectId)) continue;
    seenProjectIds.add(resolvedProjectId);
    rooms.push({
      id: `project:${resolvedProjectId}`,
      name: matchingProject?.projectName || titleCase(resolvedProjectId),
      roomType: "project",
      description: `Project room for ${matchingProject?.projectName || resolvedProjectId}`,
      projectCode: matchingProject?.projectCode || resolvedProjectId.toUpperCase(),
      projectName: matchingProject?.projectName || titleCase(resolvedProjectId),
      projectId: resolvedProjectId,
      clientId: matchingProject?.clientId || clientId || null,
    });
  }

  if (rooms.length <= 2) {
    for (const project of projectCatalog.filter((entry) => entry.status === "active").slice(0, 6)) {
      if (!project.projectId || seenProjectIds.has(project.projectId)) continue;
      seenProjectIds.add(project.projectId);
      rooms.push({
        id: `project:${project.projectId}`,
        name: project.projectName || titleCase(project.projectId),
        roomType: "project",
        description: `Project room for ${project.projectName || project.projectId}`,
        projectCode: project.projectCode || project.projectId.toUpperCase(),
        projectName: project.projectName || titleCase(project.projectId),
        projectId: project.projectId,
        clientId: project.clientId || null,
      });
    }
  }

  return rooms;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function createEscalation(body) {
  const timestamp = new Date();
  const id = `esc-${timestamp.getTime()}`;
  const issueKey = `ESC-${timestamp.getUTCFullYear()}${String(timestamp.getUTCMonth() + 1).padStart(2, "0")}${String(timestamp.getUTCDate()).padStart(2, "0")}-${stableId([body.title, body.userId || "founder"])}`;

  if (!DRY_RUN) {
    await mkdir(ESCALATIONS_DIR, { recursive: true });
    const filePath = path.join(
      ESCALATIONS_DIR,
      `${timestamp.toISOString().replace(/[:]/g, "-")}-${slugify(body.title || "escalation")}.md`,
    );
    await writeFile(
      filePath,
      [
        `# ${body.title || "Escalation"}`,
        "",
        `- id: ${id}`,
        `- issue_key: ${issueKey}`,
        `- severity: ${body.severity || "high"}`,
        `- user_id: ${body.userId || ""}`,
        `- project_id: ${body.projectId || ""}`,
        `- project_code: ${body.projectCode || ""}`,
        `- created_at: ${timestamp.toISOString()}`,
        "",
        body.body || "",
        "",
      ].join("\n"),
      "utf8",
    );

    const escalateScript = path.join(REPO_ROOT, "scripts", "escalate.sh");
    if (existsSync(escalateScript)) {
      await new Promise((resolve) => {
        const child = spawn("bash", [escalateScript, "--title", body.title || "Escalation", "--body", body.body || ""], {
          cwd: REPO_ROOT,
          env: process.env,
          stdio: "ignore",
        });
        child.on("exit", () => resolve());
        child.on("error", () => resolve());
      });
    }
  }

  return { id, issueKey };
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      routeNotFound(res);
      return;
    }
    if (!requireAuthorization(req, res)) {
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = url.pathname;
    const method = req.method || "GET";
    const agents = await loadAgents();
    const agentsById = new Map(agents.map((agent) => [agent.userId, agent]));
    const projectCatalog = await loadProjectCatalog();

    if (method === "GET" && pathname === "/api/users") {
      json(res, 200, agents.map(({ dirName: _dirName, ...agent }) => agent));
      return;
    }
    if (method === "GET" && pathname === "/api/telemetry") {
      json(res, 200, await loadTelemetry(projectCatalog, agents, agentsById));
      return;
    }
    if (method === "GET" && pathname.startsWith("/api/personal/")) {
      const userId = decodeURIComponent(pathname.slice("/api/personal/".length)).trim();
      const personal = await loadPersonalContext(userId, projectCatalog, agentsById);
      if (!personal) {
        routeNotFound(res);
        return;
      }
      json(res, 200, personal);
      return;
    }
    if (method === "GET" && pathname.startsWith("/api/rooms/")) {
      const userId = decodeURIComponent(pathname.slice("/api/rooms/".length)).trim();
      if (!agentsById.has(userId)) {
        routeNotFound(res);
        return;
      }
      json(res, 200, await loadRooms(userId, projectCatalog, agentsById));
      return;
    }
    if (method === "GET" && pathname.startsWith("/api/user/")) {
      const email = decodeURIComponent(pathname.slice("/api/user/".length)).trim().toLowerCase();
      const localPart = email.split("@")[0];
      const match = agents.find((agent) => {
        const userId = agent.userId.toLowerCase();
        const userName = agent.userName.toLowerCase().replace(/\s+/g, "");
        return localPart === userId || localPart === userName;
      });
      if (!match) {
        routeNotFound(res);
        return;
      }
      json(res, 200, { userId: match.userId, userName: match.userName });
      return;
    }
    if (method === "POST" && pathname === "/api/escalations") {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      if (!body.title || !body.body) {
        badRequest(res, "missing_fields");
        return;
      }
      json(res, 200, await createEscalation(body));
      return;
    }
    routeNotFound(res);
  } catch (error) {
    serverError(res, error);
  }
});

server.listen(PORT, HOST, () => {
  log(`listening on http://${HOST}:${PORT}/api (dry-run=${DRY_RUN})`);
});
