#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TEAMFORGE_DB_PATH =
  process.env.TEAMFORGE_DB_PATH ??
  path.join(
    os.homedir(),
    "Library/Application Support/com.thoughtseed.teamforge/teamforge.db",
  );
const DEFAULT_VAULT_ROOT =
  process.env.VAULT_THOUGHTSEED_LABS ?? path.resolve(REPO_ROOT, "../thoughtseed-labs");

const SOURCE_STATUS_PRIORITY = {
  healthy: 0,
  warn: 1,
  stale: 2,
  unavailable: 3,
};

const KPI_STATUS_PRIORITY = {
  unknown: 0,
  drift: 1,
  missingInputs: 2,
  watch: 3,
  onTrack: 4,
};

const ROLE_PROFILES = {
  default: {
    profileId: "default",
    requiredSources: ["clockify", "identity"],
    standupsMin7d: 2,
    updatesMin7d: 3,
    hoursSoftRatio: 0.75,
    hoursHardRatio: 0.55,
    graceDays: 0,
    outcomeSignalsRequired: false,
    defaultContractSignals: ["project_hours"],
    managerSlaDays: 2,
  },
  "associate-ai-developer": {
    profileId: "associate-ai-developer",
    requiredSources: ["clockify", "slack", "identity", "issueTracking"],
    standupsMin7d: 2,
    updatesMin7d: 3,
    hoursSoftRatio: 0.55,
    hoursHardRatio: 0.4,
    graceDays: 60,
    outcomeSignalsRequired: true,
    defaultContractSignals: ["project_hours", "issue_tracking"],
    managerSlaDays: 2,
  },
  "dotnet-frontend-axtech-erp": {
    profileId: "dotnet-frontend-axtech-erp",
    requiredSources: ["clockify", "slack", "identity", "issueTracking"],
    standupsMin7d: 3,
    updatesMin7d: 3,
    hoursSoftRatio: 0.75,
    hoursHardRatio: 0.6,
    graceDays: 0,
    outcomeSignalsRequired: true,
    defaultContractSignals: ["project_hours", "issue_tracking"],
    managerSlaDays: 2,
  },
  "growth-hacker": {
    profileId: "growth-hacker",
    requiredSources: ["clockify", "slack", "identity"],
    standupsMin7d: 3,
    updatesMin7d: 4,
    hoursSoftRatio: 0.6,
    hoursHardRatio: 0.45,
    graceDays: 0,
    outcomeSignalsRequired: false,
    defaultContractSignals: ["project_hours", "daily_update_coverage"],
    managerSlaDays: 2,
  },
  "lead-backend-tuya-iot": {
    profileId: "lead-backend-tuya-iot",
    requiredSources: ["clockify", "slack", "identity", "issueTracking"],
    standupsMin7d: 3,
    updatesMin7d: 4,
    hoursSoftRatio: 0.8,
    hoursHardRatio: 0.6,
    graceDays: 0,
    outcomeSignalsRequired: true,
    defaultContractSignals: ["project_hours", "issue_tracking"],
    managerSlaDays: 2,
  },
  "product-innovation-catalyst": {
    profileId: "product-innovation-catalyst",
    requiredSources: ["clockify", "slack", "identity", "issueTracking"],
    standupsMin7d: 4,
    updatesMin7d: 5,
    hoursSoftRatio: 0.75,
    hoursHardRatio: 0.6,
    graceDays: 0,
    outcomeSignalsRequired: true,
    defaultContractSignals: ["project_hours", "issue_tracking", "daily_update_coverage"],
    managerSlaDays: 2,
  },
  "junior-innovation-developer": {
    profileId: "junior-innovation-developer",
    requiredSources: ["clockify", "slack", "identity", "issueTracking"],
    standupsMin7d: 3,
    updatesMin7d: 4,
    hoursSoftRatio: 0.7,
    hoursHardRatio: 0.5,
    graceDays: 30,
    outcomeSignalsRequired: true,
    defaultContractSignals: ["project_hours", "issue_tracking"],
    managerSlaDays: 2,
  },
};

const KPI_SIGNAL_RULES = [
  { pattern: /\b(standup|async|cadence|daily update|daily async|working-day)\b/i, signals: ["standup_coverage", "daily_update_coverage"] },
  { pattern: /\b(client acceptance|stakeholder sign-off|uat|sign-off)\b/i, signals: ["client_acceptance", "issue_tracking"] },
  { pattern: /\b(documentation|docs|code review|reviews)\b/i, signals: ["documentation_activity"] },
  { pattern: /\b(bug|maintenance|quality|turnaround)\b/i, signals: ["issue_tracking", "quality_outcomes"] },
  { pattern: /\b(performance|monitoring|logging|observability)\b/i, signals: ["ops_monitoring", "issue_tracking"] },
  { pattern: /\b(sql|database)\b/i, signals: ["sql_change_ticket", "project_hours"] },
  { pattern: /\b(release|ship|delivery|feature|module|api|frontend|backend|connector|automation|erp)\b/i, signals: ["project_hours", "issue_tracking"] },
];

const MANUAL_SIGNAL_DEFINITIONS = {
  ai_assistant_delivery: {
    label: "AI assistant delivery",
    source: "manual",
    note: "Requires shipped AI assistant or major enhancement evidence.",
  },
  analytics_growth: {
    label: "Analytics growth",
    source: "manual",
    note: "Requires Google Analytics or equivalent month-over-month growth evidence.",
  },
  architecture_decision_records: {
    label: "Architecture decision records",
    source: "manual",
    note: "Requires ADR or architecture-note publication evidence.",
  },
  attribution_reporting: {
    label: "Attribution reporting",
    source: "manual",
    note: "Requires a current attribution dashboard or monthly attribution report.",
  },
  automation_deployment: {
    label: "Automation deployment",
    source: "manual",
    note: "Requires proof that an automation workflow was activated or materially updated.",
  },
  backend_api_health: {
    label: "Backend API health",
    source: "manual",
    note: "Requires API SLA, auth, or regression-safe release evidence.",
  },
  campaign_performance: {
    label: "Campaign performance",
    source: "manual",
    note: "Requires Meta/Google Ads ROAS or CPA evidence.",
  },
  ci_cd_health: {
    label: "CI/CD health",
    source: "manual",
    note: "Requires green deployment, rollback, or pipeline success evidence.",
  },
  code_review_turnaround: {
    label: "Code review turnaround",
    source: "manual",
    note: "Requires PR review-latency evidence.",
  },
  content_cadence: {
    label: "Content cadence",
    source: "manual",
    note: "Requires posts-per-channel or publishing-cadence evidence.",
  },
  crm_nurture: {
    label: "CRM and nurture hygiene",
    source: "manual",
    note: "Requires lead-scoring, drip, or nurture-flow maintenance evidence.",
  },
  data_pipeline_reliability: {
    label: "Data pipeline reliability",
    source: "manual",
    note: "Requires ETL success-rate or monitoring evidence.",
  },
  demo_cadence: {
    label: "Internal demo cadence",
    source: "manual",
    note: "Requires internal demo, walkthrough, or knowledge-share evidence.",
  },
  device_lifecycle: {
    label: "Device lifecycle reliability",
    source: "manual",
    note: "Requires provisioning, firmware, or remote-configuration reliability evidence.",
  },
  experiment_cadence: {
    label: "Experiment cadence",
    source: "manual",
    note: "Requires A/B or multivariate test records.",
  },
  frontend_workflow_delivery: {
    label: "Frontend workflow delivery",
    source: "manual",
    note: "Requires shipped React or workflow UI evidence.",
  },
  lead_pipeline: {
    label: "Lead pipeline quality",
    source: "manual",
    note: "Requires lead-capture, qualification, or quote-pipeline evidence.",
  },
  mentoring_cadence: {
    label: "Mentoring cadence",
    source: "manual",
    note: "Requires 1:1, review, or growth-plan evidence.",
  },
  release_success: {
    label: "Release success",
    source: "manual",
    note: "Requires shipped release, app-store publication, or deployment success evidence.",
  },
  security_review: {
    label: "Security and compliance review",
    source: "manual",
    note: "Requires RBAC, audit, or security-review evidence.",
  },
  stakeholder_sync: {
    label: "Stakeholder sync",
    source: "manual",
    note: "Requires PM or stakeholder sync evidence.",
  },
  team_coordination: {
    label: "Team coordination cadence",
    source: "manual",
    note: "Requires standup, sprint-planning, or coordination evidence.",
  },
  technical_debt_reduction: {
    label: "Technical debt reduction",
    source: "manual",
    note: "Requires logged system improvement or debt-reduction evidence.",
  },
};

const SEMANTIC_PATTERNS = {
  done: [/\b(done|completed|shipped|merged|closed|finished)\b/i],
  blocked: [/\b(blocked|stuck|cannot proceed|can't proceed|unable to)\b/i],
  waiting: [/\b(waiting|awaiting|pending)\b/i],
  risk: [/\b(risk|at risk|concern|slip|delay)\b/i],
  dependency: [/\b(waiting for|depends on|dependency|need from)\b/i],
  missedDeadline: [/\b(missed|delayed to|pushed to|did not finish)\b/i],
};

function printHelp() {
  console.log(`Usage:
  node scripts/export-team-kpi-feed.mjs [options]

Options:
  --teamforge-db <path>   Override the local TeamForge SQLite database path.
  --vault-root <path>     Override the thoughtseed-labs vault root.
  --out <path>            Write JSON to disk. Defaults to stdout.
  --window-days <days>    Primary signal lookback window. Default: 7.
  --trend-weeks <weeks>   Number of rolling weeks to emit. Default: 4.
  --help                  Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    teamforgeDbPath: DEFAULT_TEAMFORGE_DB_PATH,
    vaultRoot: DEFAULT_VAULT_ROOT,
    outPath: null,
    windowDays: Number(process.env.TEAMFORGE_KPI_WINDOW_DAYS ?? 7),
    trendWeeks: Number(process.env.TEAMFORGE_KPI_TREND_WEEKS ?? 4),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    }
    if (value === "--teamforge-db") {
      args.teamforgeDbPath = argv[++index];
      continue;
    }
    if (value === "--vault-root") {
      args.vaultRoot = argv[++index];
      continue;
    }
    if (value === "--out") {
      args.outPath = argv[++index];
      continue;
    }
    if (value === "--window-days") {
      args.windowDays = Number(argv[++index]);
      continue;
    }
    if (value === "--trend-weeks") {
      args.trendWeeks = Number(argv[++index]);
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  if (!Number.isFinite(args.windowDays) || args.windowDays <= 0) {
    throw new Error(`window-days must be a positive number; received ${args.windowDays}`);
  }
  if (!Number.isFinite(args.trendWeeks) || args.trendWeeks <= 0) {
    throw new Error(`trend-weeks must be a positive number; received ${args.trendWeeks}`);
  }

  return args;
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row?.name);
}

function queryAll(db, sql, ...params) {
  return db.prepare(sql).all(...params);
}

function queryFirst(db, sql, ...params) {
  return db.prepare(sql).get(...params);
}

function parseJsonList(rawValue) {
  try {
    const parsed = JSON.parse(String(rawValue ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function parseJsonValue(rawValue, fallback) {
  try {
    return JSON.parse(String(rawValue ?? ""));
  } catch {
    return fallback;
  }
}

function parseKpiContractSource(rawValue) {
  const parsed = parseJsonValue(rawValue, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return {
    type: normalizeOptionalString(parsed.type),
    file: normalizeOptionalString(parsed.file),
    section: normalizeOptionalString(parsed.section),
    notes: normalizeOptionalString(parsed.notes),
  };
}

function parseKpiContracts(rawValue) {
  const parsed = parseJsonValue(rawValue, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((contract) => {
      if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
        return null;
      }
      return {
        contractId: normalizeOptionalString(contract.contractId) ?? slugify(contract.monthlyKpi ?? ""),
        monthlyKpi: normalizeOptionalString(contract.monthlyKpi),
        offerLetterResponsibility: normalizeOptionalString(contract.offerLetterResponsibility),
        projectIds: normalizeStringArray(contract.projectIds),
        clientIds: normalizeStringArray(contract.clientIds),
        proofSignals: normalizeStringArray(contract.proofSignals),
        passCondition: normalizeOptionalString(contract.passCondition),
        fallbackManualEvidence: normalizeStringArray(contract.fallbackManualEvidence),
        notes: normalizeOptionalString(contract.notes),
      };
    })
    .filter((contract) => contract && contract.monthlyKpi);
}

function parseScalar(rawValue) {
  const value = String(rawValue ?? "").trim();
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

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) {
    return {};
  }
  const endIndex = text.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return {};
  }

  const frontmatter = text.slice(4, endIndex);
  const data = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    data[key] = parseScalar(rawValue);
  }
  return data;
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
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

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function loadTeamProfiles(vaultRoot) {
  const teamDir = path.join(vaultRoot, "50-team");
  const profiles = new Map();
  const candidateFiles = [];

  for (const relativeDir of [".", "directors"]) {
    const absoluteDir = path.join(teamDir, relativeDir);
    let entries = [];
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name.endsWith("-kpi.md")) {
        continue;
      }
      candidateFiles.push(path.join(absoluteDir, entry.name));
    }
  }

  for (const filePath of candidateFiles) {
    const contents = await fs.readFile(filePath, "utf8");
    const data = parseFrontmatter(contents);
    const memberId = normalizeOptionalString(data.member_id);
    if (!memberId) {
      continue;
    }
    profiles.set(memberId, {
      memberId,
      displayName: normalizeOptionalString(data.display_name),
      role: normalizeOptionalString(data.role),
      roleTemplate: normalizeOptionalString(data.role_template),
      department: normalizeOptionalString(data.department),
      primaryProjects: normalizeStringArray(data.primary_projects),
      scope: normalizeStringArray(data.scope),
      teamTags: normalizeStringArray(data.team_tags),
      reportsTo: normalizeOptionalString(data.reports_to),
      joined: normalizeOptionalString(data.joined),
      active: data.active !== false,
      filePath,
    });
  }

  return profiles;
}

function buildManagerDescriptor(managerMemberId, teamProfiles) {
  const normalizedMemberId = normalizeOptionalString(managerMemberId);
  if (!normalizedMemberId) {
    return null;
  }
  const profile = teamProfiles.get(normalizedMemberId) ?? null;
  return {
    memberId: normalizedMemberId,
    displayName: profile?.displayName ?? normalizedMemberId,
    role: profile?.role ?? null,
    department: profile?.department ?? null,
    primaryProjects: profile?.primaryProjects ?? [],
    sourceFile: profile?.filePath ?? null,
  };
}

function parseIsoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const candidate = raw.slice(0, 10);
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseIsoDateTime(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw.endsWith("Z") ? raw : raw.replace(" ", "T") + (raw.includes("T") ? "" : "Z"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoString(value) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

function dateOnlyUtc(value) {
  return value.toISOString().slice(0, 10);
}

function nextMonthStartUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function monthStartUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function daysInMonthUtc(now) {
  return Math.max(1, Math.round((nextMonthStartUtc(now) - monthStartUtc(now)) / 86_400_000));
}

function hoursBetween(later, earlier) {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 3_600_000);
}

function ageHours(now, isoValue) {
  const parsed = parseIsoDateTime(isoValue) ?? parseIsoDate(isoValue);
  return parsed ? hoursBetween(now, parsed) : null;
}

function buildSourceFreshnessStatus(now, lastSeenAt, rowCount, options = {}) {
  const healthyHours = options.healthyHours ?? 24;
  const warnHours = options.warnHours ?? 72;
  const age = ageHours(now, lastSeenAt);
  if (!lastSeenAt || rowCount === 0) {
    return "unavailable";
  }
  if (age === null) {
    return "unavailable";
  }
  if (age <= healthyHours) return "healthy";
  if (age <= warnHours) return "warn";
  return "stale";
}

function pickWorseStatus(left, right) {
  if (SOURCE_STATUS_PRIORITY[left] >= SOURCE_STATUS_PRIORITY[right]) {
    return left;
  }
  return right;
}

function summarizeSourceIssue(status, sourceLabel, reason) {
  if (status === "healthy") return null;
  return `${sourceLabel}: ${reason}`;
}

function buildStatusLabel(status) {
  switch (status) {
    case "unknown":
      return "UNKNOWN";
    case "onTrack":
      return "ON TRACK";
    case "watch":
      return "WATCH";
    case "drift":
      return "DRIFT";
    case "missingInputs":
      return "MISSING INPUTS";
    default:
      return "UNKNOWN";
  }
}

function getTenureBand(joinedAt, now, tags) {
  if (Array.isArray(tags) && tags.includes("new-hire")) {
    return "new-hire";
  }
  if (!joinedAt) return "unknown";
  const days = Math.floor((now - joinedAt) / 86_400_000);
  if (days <= 60) return "new-hire";
  if (days <= 365) return "year-1";
  return "established";
}

function getRoleProfile(roleTemplate, joinedAt, now, tags) {
  const baseProfile = ROLE_PROFILES[roleTemplate] ?? ROLE_PROFILES.default;
  const tenureBand = getTenureBand(joinedAt, now, tags);
  const profile = {
    ...ROLE_PROFILES.default,
    ...baseProfile,
  };

  if (tenureBand === "new-hire") {
    profile.standupsMin7d = Math.max(1, profile.standupsMin7d - 1);
    profile.updatesMin7d = Math.max(2, profile.updatesMin7d - 1);
    profile.hoursSoftRatio = Math.max(0.45, profile.hoursSoftRatio - 0.1);
    profile.hoursHardRatio = Math.max(0.3, profile.hoursHardRatio - 0.1);
  }

  return {
    ...profile,
    tenureBand,
  };
}

function buildWeekWindows(now, trendWeeks) {
  const windows = [];
  const currentDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let index = trendWeeks - 1; index >= 0; index -= 1) {
    const end = new Date(currentDayStart.getTime() - index * 7 * 86_400_000);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    windows.push({
      start,
      end,
      label: `${dateOnlyUtc(start)}..${dateOnlyUtc(new Date(end.getTime() - 86_400_000))}`,
    });
  }
  return windows;
}

function classifySemanticSignals(rows) {
  const summary = {
    totalMessages: rows.length,
    doneCount: 0,
    blockedCount: 0,
    waitingCount: 0,
    riskCount: 0,
    dependencyCount: 0,
    missedDeadlineCount: 0,
  };

  for (const row of rows) {
    const text = String(row.content_preview ?? "").trim();
    if (!text) continue;
    for (const [key, patterns] of Object.entries(SEMANTIC_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(text))) {
        summary[`${key}Count`] += 1;
      }
    }
  }

  return summary;
}

function computeMonthProgress(now, joinedAt, graceDays) {
  const totalDays = daysInMonthUtc(now);
  const joinedThisMonth =
    joinedAt &&
    joinedAt.getUTCFullYear() === now.getUTCFullYear() &&
    joinedAt.getUTCMonth() === now.getUTCMonth();
  const startDay = joinedThisMonth ? joinedAt.getUTCDate() : 1;
  const activeDays = Math.max(1, now.getUTCDate() - startDay + 1);
  const graceMultiplier =
    joinedAt && Math.floor((now - joinedAt) / 86_400_000) <= graceDays ? 0.85 : 1;
  return Math.min(1, activeDays / totalDays) * graceMultiplier;
}

function buildProjectAttribution(employeeId, monthProjectRows, vaultProfile) {
  const rows = monthProjectRows
    .filter((row) => row.employee_id === employeeId)
    .map((row) => ({
      projectId: row.project_id ?? null,
      projectName: row.project_name ?? row.project_id ?? "Unmapped",
      clientName: row.client_name ?? null,
      hours: Number(row.hours ?? 0),
    }))
    .filter((row) => row.hours > 0)
    .sort((left, right) => right.hours - left.hours);

  const fallbackProjects = (vaultProfile?.primaryProjects ?? []).map((projectName) => ({
    projectId: slugify(projectName) || null,
    projectName,
    clientName: null,
    hours: 0,
  }));

  const deduped = [];
  const seen = new Set();
  for (const row of [...rows, ...fallbackProjects]) {
    const key = `${row.projectId ?? ""}::${row.projectName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  const primaryProject = deduped[0] ?? null;
  const clientNames = [...new Set(deduped.map((row) => row.clientName).filter(Boolean))];
  return {
    projectIds: deduped.map((row) => row.projectId).filter(Boolean),
    projectNames: deduped.map((row) => row.projectName),
    clientIds: clientNames.map((name) => slugify(name)).filter(Boolean),
    clientNames,
    primaryProjectId: primaryProject?.projectId ?? null,
    primaryProjectName: primaryProject?.projectName ?? null,
    projectHours: deduped,
    totalTrackedHours: deduped.reduce((sum, row) => sum + row.hours, 0),
  };
}

function computeActivityWindowStatus(metrics, roleProfile, monthlyQuotaHours) {
  const expectedHours = (monthlyQuotaHours / 4) * roleProfile.hoursSoftRatio;
  let score = 100;

  if (metrics.standups < roleProfile.standupsMin7d) score -= 15;
  if (metrics.updates < roleProfile.updatesMin7d) score -= 12;
  if (metrics.hours < expectedHours * roleProfile.hoursHardRatio) score -= 25;
  else if (metrics.hours < expectedHours) score -= 10;
  if (metrics.blockedCount >= 2 || metrics.missedDeadlineCount >= 1) score -= 15;
  if (metrics.riskCount >= 2) score -= 8;

  if (score < 60) return "drift";
  if (score < 90) return "watch";
  return "onTrack";
}

function evaluateSignal(signalId, context) {
  const degraded = (...sources) =>
    sources.some((source) =>
      ["stale", "unavailable"].includes(context.sourceHealth.sources[source]?.status ?? "unavailable"),
    );

  if (MANUAL_SIGNAL_DEFINITIONS[signalId]) {
    const definition = MANUAL_SIGNAL_DEFINITIONS[signalId];
    return {
      signalId,
      label: definition.label,
      source: definition.source,
      automated: false,
      status: "manualRequired",
      note: definition.note,
    };
  }

  switch (signalId) {
    case "project_hours":
      if (degraded("clockify")) {
        return { signalId, label: "Project hours", source: "clockify", automated: true, status: "sourceDegraded", note: "Clockify is stale or unavailable." };
      }
      return context.projectAttribution.totalTrackedHours > 0
        ? { signalId, label: "Project hours", source: "clockify", automated: true, status: "satisfied", note: `${context.projectAttribution.totalTrackedHours.toFixed(1)}h tracked across attributed projects.` }
        : { signalId, label: "Project hours", source: "clockify", automated: true, status: "missing", note: "No attributed project hours found this month." };
    case "standup_coverage":
      if (degraded("slack")) {
        return { signalId, label: "Standup coverage", source: "slack", automated: true, status: "sourceDegraded", note: "Slack standup evidence is stale or unavailable." };
      }
      return context.metrics.standupsLast7Days >= context.roleProfile.standupsMin7d
        ? { signalId, label: "Standup coverage", source: "slack", automated: true, status: "satisfied", note: `${context.metrics.standupsLast7Days} standups in the last ${context.windowDays} days.` }
        : { signalId, label: "Standup coverage", source: "slack", automated: true, status: "missing", note: `${context.metrics.standupsLast7Days} standups in the last ${context.windowDays} days.` };
    case "daily_update_coverage":
      if (degraded("slack")) {
        return { signalId, label: "Daily updates", source: "slack", automated: true, status: "sourceDegraded", note: "Slack daily-update evidence is stale or unavailable." };
      }
      return context.metrics.messagesLast7Days >= context.roleProfile.updatesMin7d
        ? { signalId, label: "Daily updates", source: "slack", automated: true, status: "satisfied", note: `${context.metrics.messagesLast7Days} updates in the last ${context.windowDays} days.` }
        : { signalId, label: "Daily updates", source: "slack", automated: true, status: "missing", note: `${context.metrics.messagesLast7Days} updates in the last ${context.windowDays} days.` };
    case "issue_tracking":
      if (degraded("issueTracking")) {
        return { signalId, label: "Issue tracking", source: "issueTracking", automated: true, status: "sourceDegraded", note: "Issue-tracking evidence is stale or unavailable." };
      }
      return context.outcomeSignals.totalTrackedOutcomeEvents > 0
        ? { signalId, label: "Issue tracking", source: "issueTracking", automated: true, status: "satisfied", note: `${context.outcomeSignals.totalTrackedOutcomeEvents} issue/document events in the last 30 days.` }
        : { signalId, label: "Issue tracking", source: "issueTracking", automated: true, status: "missing", note: "No issue/document events found in the last 30 days." };
    case "documentation_activity":
      if (degraded("huly")) {
        return { signalId, label: "Documentation activity", source: "huly", automated: true, status: "sourceDegraded", note: "Huly documentation activity is stale or unavailable." };
      }
      return context.outcomeSignals.hulyDocumentActions30d > 0
        ? { signalId, label: "Documentation activity", source: "huly", automated: true, status: "satisfied", note: `${context.outcomeSignals.hulyDocumentActions30d} documentation events in the last 30 days.` }
        : { signalId, label: "Documentation activity", source: "huly", automated: true, status: "missing", note: "No documentation events found in the last 30 days." };
    case "client_acceptance":
      return { signalId, label: "Client acceptance", source: "manual", automated: false, status: "manualRequired", note: "Requires explicit UAT or stakeholder sign-off evidence." };
    case "quality_outcomes":
      if (degraded("issueTracking")) {
        return { signalId, label: "Quality outcomes", source: "issueTracking", automated: true, status: "sourceDegraded", note: "Issue-tracking quality evidence is stale or unavailable." };
      }
      return context.outcomeSignals.totalTrackedOutcomeEvents > 0
        ? { signalId, label: "Quality outcomes", source: "issueTracking", automated: true, status: "satisfied", note: "Outcome events exist for the attributed delivery surface." }
        : { signalId, label: "Quality outcomes", source: "issueTracking", automated: true, status: "missing", note: "No automated quality/outcome evidence found." };
    case "ops_monitoring":
      return context.outcomeSignals.opsEvents30d > 0
        ? { signalId, label: "Ops monitoring", source: "ops", automated: true, status: "satisfied", note: `${context.outcomeSignals.opsEvents30d} ops events in the last 30 days.` }
        : { signalId, label: "Ops monitoring", source: "ops", automated: true, status: "missing", note: "No ops events attributed in the last 30 days." };
    case "sql_change_ticket":
      return { signalId, label: "SQL change tickets", source: "manual", automated: false, status: "manualRequired", note: "Requires SQL change or review evidence." };
    default:
      return { signalId, label: signalId, source: "manual", automated: false, status: "manualRequired", note: "No automated contract evaluator defined." };
  }
}

function finalizeEvidenceContract(contractMeta, signalIds, context) {
  const evaluatedSignals = [...new Set(signalIds)].map((signalId) => evaluateSignal(signalId, context));
  const automatedSignals = evaluatedSignals.filter((signal) => signal.automated);
  const satisfied = automatedSignals.filter((signal) => signal.status === "satisfied");
  const degraded = automatedSignals.filter((signal) => signal.status === "sourceDegraded");
  const missing = automatedSignals.filter((signal) => signal.status === "missing");
  const manual = evaluatedSignals.filter((signal) => !signal.automated);

  const coverageStatus = degraded.length > 0
    ? "sourceDegraded"
    : satisfied.length > 0
      ? missing.length > 0
        ? "partial"
        : "covered"
      : missing.length > 0
        ? "uncovered"
        : "manualOnly";

  return {
    ...contractMeta,
    coverageStatus,
    signals: evaluatedSignals,
    satisfiedSignals: satisfied.map((signal) => signal.signalId),
    missingSignals: missing.map((signal) => signal.signalId),
    degradedSignals: degraded.map((signal) => signal.signalId),
    manualSignals: manual.map((signal) => signal.signalId),
    automatedSignalCount: automatedSignals.length,
  };
}

function buildEvidenceContracts(context) {
  const explicitContracts = Array.isArray(context.explicitKpiContracts)
    ? context.explicitKpiContracts.filter((contract) => contract?.monthlyKpi)
    : [];

  if (explicitContracts.length > 0) {
    const contracts = explicitContracts.map((contract) =>
      finalizeEvidenceContract(
        {
          contractId: contract.contractId,
          kpi: contract.monthlyKpi,
          offerLetterResponsibility: contract.offerLetterResponsibility,
          projectIds: contract.projectIds,
          clientIds: contract.clientIds,
          passCondition: contract.passCondition,
          fallbackManualEvidence: contract.fallbackManualEvidence,
          notes: contract.notes,
          sourceProvenance: context.contractSource ?? {},
        },
        contract.proofSignals,
        context,
      ),
    );

    const automatedContracts = contracts.filter((contract) => contract.automatedSignalCount > 0);
    const coveredContracts = automatedContracts.filter((contract) =>
      ["covered", "partial"].includes(contract.coverageStatus),
    );
    const degradedContracts = automatedContracts.filter((contract) =>
      contract.coverageStatus === "sourceDegraded",
    );
    const uncoveredContracts = automatedContracts.filter((contract) =>
      contract.coverageStatus === "uncovered",
    );

    return {
      contracts,
      contractMode: "explicit",
      coverageRatio: automatedContracts.length > 0
        ? coveredContracts.length / automatedContracts.length
        : 0,
      degradedContractCount: degradedContracts.length,
      uncoveredContractCount: uncoveredContracts.length,
      automatedContractCount: automatedContracts.length,
    };
  }

  const contracts = context.monthlyKpis.map((kpiText) => {
    const signalIds = new Set(context.roleProfile.defaultContractSignals);
    for (const rule of KPI_SIGNAL_RULES) {
      if (rule.pattern.test(kpiText)) {
        for (const signalId of rule.signals) {
          signalIds.add(signalId);
        }
      }
    }

    return finalizeEvidenceContract(
      {
        contractId: slugify(kpiText),
        kpi: kpiText,
        offerLetterResponsibility: null,
        projectIds: context.projectAttribution.projectIds,
        clientIds: context.projectAttribution.clientIds,
        passCondition: null,
        fallbackManualEvidence: [],
        notes: null,
        sourceProvenance: context.contractSource ?? {},
      },
      [...signalIds],
      context,
    );
  });

  const automatedContracts = contracts.filter((contract) => contract.automatedSignalCount > 0);
  const coveredContracts = automatedContracts.filter((contract) =>
    ["covered", "partial"].includes(contract.coverageStatus),
  );
  const degradedContracts = automatedContracts.filter((contract) =>
    contract.coverageStatus === "sourceDegraded",
  );
  const uncoveredContracts = automatedContracts.filter((contract) =>
    contract.coverageStatus === "uncovered",
  );

  return {
    contracts,
    contractMode: "inferred",
    coverageRatio: automatedContracts.length > 0
      ? coveredContracts.length / automatedContracts.length
      : 0,
    degradedContractCount: degradedContracts.length,
    uncoveredContractCount: uncoveredContracts.length,
    automatedContractCount: automatedContracts.length,
  };
}

function buildSourceHealth(globalSourceHealth, employee, roleProfile, identityRows, now) {
  const requiredSources = [...new Set(roleProfile.requiredSources)];
  const bySource = {};
  const blockingSources = [];
  const warnings = [];

  const linkedIdentityRows = identityRows.filter(
    (row) => row.employee_id === employee.id && row.resolution_status === "linked",
  );
  const linkedBySource = new Map();
  for (const row of linkedIdentityRows) {
    if (!linkedBySource.has(row.source)) {
      linkedBySource.set(row.source, row);
    }
  }

  for (const source of requiredSources) {
    if (source === "issueTracking") {
      const hulyStatus = globalSourceHealth.sources.huly.status;
      const githubStatus = globalSourceHealth.sources.github.status;
      const notes = [];
      const combinedStatus = pickWorseStatus(hulyStatus, githubStatus) === "healthy"
        ? "healthy"
        : hulyStatus === "healthy" || githubStatus === "healthy"
          ? "warn"
          : hulyStatus === "warn" || githubStatus === "warn"
            ? "warn"
            : hulyStatus === "unavailable" && githubStatus === "unavailable"
              ? "unavailable"
              : "stale";
      if (globalSourceHealth.sources.huly.status !== "healthy") {
        notes.push(`Huly is ${globalSourceHealth.sources.huly.status}.`);
      }
      if (globalSourceHealth.sources.github.status !== "healthy") {
        notes.push(`GitHub is ${globalSourceHealth.sources.github.status}.`);
      }
      bySource[source] = {
        status: combinedStatus,
        detail: "Derived from Huly issue activity and GitHub issue freshness.",
        notes,
      };
      if (["stale", "unavailable"].includes(combinedStatus)) {
        blockingSources.push(source);
      } else if (combinedStatus === "warn") {
        warnings.push("issueTracking evidence is partially degraded.");
      }
      continue;
    }

    const global = globalSourceHealth.sources[source];
    const linkedRow = linkedBySource.get(source);
    let status = global?.status ?? "unavailable";
    const notes = [];

    if (source === "identity") {
      const employeeLinkedRows = linkedIdentityRows.filter((row) =>
        ["clockify", "slack", "huly"].includes(row.source),
      );
      if (employeeLinkedRows.length === 0) {
        status = "unavailable";
        notes.push("Employee has no linked operational identities.");
      } else if (
        employeeLinkedRows.some((row) => Number(row.confidence ?? 1) < 0.75)
      ) {
        status = "warn";
        notes.push("At least one linked identity is low-confidence.");
      } else {
        status = "healthy";
      }
    }
    if (source === "clockify" && !employee.clockify_user_id) {
      status = "unavailable";
      notes.push("Employee has no Clockify user mapping.");
    }
    if (source === "huly" && !employee.huly_person_id) {
      status = "unavailable";
      notes.push("Employee has no Huly person mapping.");
    }
    if (source === "slack" && !linkedRow) {
      status = "unavailable";
      notes.push("Employee has no linked Slack identity.");
    }
    if (source !== "identity" && linkedRow && Number(linkedRow.confidence ?? 1) < 0.75) {
      status = pickWorseStatus(status, "warn");
      notes.push(`Identity confidence is low (${Number(linkedRow.confidence).toFixed(2)}).`);
    }

    bySource[source] = {
      status,
      lastSyncAt: global?.lastSyncAt ?? null,
      notes,
        linkedIdentity: source === "identity"
          ? linkedIdentityRows
            .map((row) => ({
              source: row.source,
              externalId: row.external_id,
              confidence: Number(row.confidence ?? 1),
              lastSeenAt: row.last_seen_at ?? null,
            }))
          : linkedRow
            ? {
                externalId: linkedRow.external_id,
                confidence: Number(linkedRow.confidence ?? 1),
                lastSeenAt: linkedRow.last_seen_at ?? null,
              }
            : null,
    };

    if (["stale", "unavailable"].includes(status)) {
      blockingSources.push(source);
    } else if (status === "warn") {
      warnings.push(`${source} evidence is degraded or low-confidence.`);
    }
  }

  let overallStatus = "healthy";
  for (const source of requiredSources) {
    overallStatus = pickWorseStatus(overallStatus, bySource[source]?.status ?? "unavailable");
  }

  const summaryIssues = [];
  for (const source of requiredSources) {
    const details = bySource[source];
    if (!details) continue;
    const issue = summarizeSourceIssue(
      details.status,
      source,
      details.notes?.[0] ?? details.detail ?? "Connector freshness is degraded.",
    );
    if (issue) summaryIssues.push(issue);
  }

  return {
    status: overallStatus,
    requiredSources,
    blockingSources,
    warnings,
    sources: bySource,
    summaryIssues,
    suppressedFounderEscalation: ["stale", "unavailable"].includes(overallStatus),
  };
}

function buildSeverity(status, scorePercent, reasons, semanticSignals) {
  if (status === "unknown") return "info";
  if (status === "missingInputs") return "medium";
  if (
    scorePercent <= 25 ||
    reasons.some((reason) => reason.includes("capacity-drift")) ||
    semanticSignals.missedDeadlineCount >= 1 ||
    semanticSignals.blockedCount >= 2
  ) {
    return "high";
  }
  if (status === "drift") return "medium";
  return "low";
}

function buildKpiStatus(context) {
  const {
    snapshotRow,
    roleProfile,
    sourceHealth,
    metrics,
    monthlyKpis,
    evidenceSources,
    gapFlags,
    outcomeSignals,
    evidenceContracts,
    semanticSignals,
    now,
    lastReviewed,
  } = context;

  const reasons = [];
  const managerUpdateReasons = [];
  const founderUpdateReasons = [];

  if (!snapshotRow) {
    reasons.push("No KPI snapshot is mapped to this employee yet.");
    managerUpdateReasons.push("missing-kpi-snapshot");
    return {
      status: "missingInputs",
      label: buildStatusLabel("missingInputs"),
      scorePercent: 0,
      summary: "No KPI snapshot is mapped in TeamForge yet.",
      reasons,
      severity: "medium",
      managerUpdateRequired: true,
      founderUpdateRequired: false,
      founderUpdateSuggested: false,
      managerUpdateReasons,
      founderUpdateReasons,
      suppressedFounderEscalation: false,
      sourceHealthStatus: sourceHealth.status,
    };
  }

  if (sourceHealth.suppressedFounderEscalation) {
    reasons.push("Source health is degraded, so KPI attainment cannot be scored with confidence.");
    for (const issue of sourceHealth.summaryIssues) {
      reasons.push(issue);
    }
    return {
      status: "unknown",
      label: buildStatusLabel("unknown"),
      scorePercent: 0,
      summary: `Suppressed KPI scoring due to degraded source health (${sourceHealth.blockingSources.join(", ")}).`,
      reasons,
      severity: "info",
      managerUpdateRequired: false,
      founderUpdateRequired: false,
      founderUpdateSuggested: false,
      managerUpdateReasons: [],
      founderUpdateReasons: [],
      suppressedFounderEscalation: true,
      suppressionReasons: sourceHealth.blockingSources,
      sourceHealthStatus: sourceHealth.status,
    };
  }

  let score = 100;

  if (monthlyKpis.length === 0) {
    score -= 20;
    reasons.push("KPI note has no monthly checkpoints.");
    managerUpdateReasons.push("missing-kpi-items");
  }
  if (evidenceSources.length === 0) {
    score -= 18;
    reasons.push("KPI note has no evidence sources mapped.");
    managerUpdateReasons.push("missing-evidence-sources");
  }
  if (gapFlags.length > 0) {
    score -= Math.min(24, gapFlags.length * 6);
    reasons.push(`${gapFlags.length} KPI gap flag(s) still open.`);
    if (gapFlags.length >= 3) {
      managerUpdateReasons.push("open-gap-flags");
    }
  }
  if (lastReviewed) {
    const reviewAgeDays = Math.floor((now - lastReviewed) / 86_400_000);
    if (reviewAgeDays > 45) {
      score -= reviewAgeDays > 90 ? 15 : 8;
      reasons.push(`KPI note was last reviewed ${reviewAgeDays} day(s) ago.`);
      if (reviewAgeDays > 90) {
        managerUpdateReasons.push("stale-kpi-review");
      }
    }
  } else {
    score -= 8;
    reasons.push("KPI note has no last-reviewed date.");
    managerUpdateReasons.push("missing-review-date");
  }

  if (metrics.standupsLast7Days < roleProfile.standupsMin7d) {
    score -= metrics.standupsLast7Days === 0 ? 18 : 8;
    reasons.push(`Standup coverage is below role expectation (${metrics.standupsLast7Days}/${roleProfile.standupsMin7d}).`);
    if (metrics.standupsLast7Days === 0) {
      managerUpdateReasons.push("missed-standup");
    }
  }

  if (metrics.messagesLast7Days < roleProfile.updatesMin7d) {
    score -= metrics.messagesLast7Days === 0 ? 12 : 6;
    reasons.push(`Daily-update coverage is below role expectation (${metrics.messagesLast7Days}/${roleProfile.updatesMin7d}).`);
    if (metrics.messagesLast7Days === 0) {
      managerUpdateReasons.push("missing-daily-updates");
    }
  }

  if (metrics.expectedHoursThisMonth >= 24) {
    if (metrics.workHoursThisMonth < metrics.expectedHoursThisMonth * roleProfile.hoursHardRatio) {
      score -= 25;
      reasons.push(
        `Logged hours are far below the role-calibrated expectation (${metrics.workHoursThisMonth.toFixed(1)}h / ${metrics.expectedHoursThisMonth.toFixed(1)}h).`,
      );
      managerUpdateReasons.push("capacity-drift");
    } else if (metrics.workHoursThisMonth < metrics.expectedHoursThisMonth * roleProfile.hoursSoftRatio) {
      score -= 10;
      reasons.push(
        `Logged hours are below the role-calibrated expectation (${metrics.workHoursThisMonth.toFixed(1)}h / ${metrics.expectedHoursThisMonth.toFixed(1)}h).`,
      );
    }
  }

  if (evidenceContracts.degradedContractCount > 0) {
    reasons.push(`${evidenceContracts.degradedContractCount} KPI evidence contract(s) are blocked by degraded sources.`);
    score -= 10;
  }
  if (evidenceContracts.uncoveredContractCount > 0) {
    score -= Math.min(20, evidenceContracts.uncoveredContractCount * 6);
    reasons.push(`${evidenceContracts.uncoveredContractCount} KPI evidence contract(s) have no automated coverage.`);
    managerUpdateReasons.push("contract-coverage-gap");
  }

  if (
    roleProfile.outcomeSignalsRequired &&
    outcomeSignals.sourceHealthy &&
    metrics.workHoursThisMonth >= metrics.expectedHoursThisMonth * roleProfile.hoursSoftRatio &&
    outcomeSignals.totalTrackedOutcomeEvents === 0
  ) {
    score -= 18;
    reasons.push("Activity is present, but outcome-weighted delivery evidence is still missing.");
    managerUpdateReasons.push("activity-without-outcomes");
  }

  if (semanticSignals.missedDeadlineCount >= 1) {
    score -= 12;
    reasons.push("Daily updates mention at least one missed or delayed deadline.");
    managerUpdateReasons.push("missed-deadline");
  }
  if (semanticSignals.blockedCount >= 2) {
    score -= 10;
    reasons.push("Daily updates show recurring blocked work.");
    managerUpdateReasons.push("delivery-blockers");
  }
  if (semanticSignals.riskCount >= 2) {
    score -= 8;
    reasons.push("Daily updates contain repeated risk language.");
    managerUpdateReasons.push("delivery-risk");
  }

  score = Math.max(0, Math.min(100, score));

  const lowConfidenceEvidence =
    evidenceContracts.automatedContractCount > 0 &&
    evidenceContracts.coverageRatio < 0.35 &&
    outcomeSignals.totalTrackedOutcomeEvents === 0;

  let status = "watch";
  if (monthlyKpis.length === 0 || evidenceSources.length === 0) {
    status = "missingInputs";
  } else if (lowConfidenceEvidence) {
    status = "unknown";
  } else if (
    score < 60 ||
    managerUpdateReasons.some((reason) =>
      ["capacity-drift", "missed-standup", "missed-deadline", "activity-without-outcomes"].includes(reason),
    )
  ) {
    status = "drift";
  } else if (reasons.length === 0) {
    status = "onTrack";
  }

  if (status === "unknown") {
    reasons.push("Automated evidence coverage is too weak to score confidently.");
  }

  managerUpdateReasons.sort();
  founderUpdateReasons.push(
    ...managerUpdateReasons.filter((reason) =>
      ["capacity-drift", "missed-standup", "missed-deadline", "activity-without-outcomes"].includes(reason),
    ),
  );
  founderUpdateReasons.sort();

  const severity = buildSeverity(status, score, managerUpdateReasons, semanticSignals);
  const managerUpdateRequired = ["drift", "missingInputs"].includes(status);
  const founderUpdateSuggested = managerUpdateRequired && severity === "high";
  const summary = reasons.length > 0
    ? `${metrics.standupsLast7Days} standups / ${metrics.messagesLast7Days} updates / ${metrics.workHoursThisMonth.toFixed(1)}h this month. ${reasons[0]}`
    : `${metrics.standupsLast7Days} standups / ${metrics.messagesLast7Days} updates / ${metrics.workHoursThisMonth.toFixed(1)}h this month.`;

  return {
    status,
    label: buildStatusLabel(status),
    scorePercent: score,
    summary,
    reasons,
    severity,
    managerUpdateRequired,
    founderUpdateRequired: founderUpdateSuggested,
    founderUpdateSuggested,
    managerUpdateReasons,
    founderUpdateReasons,
    suppressedFounderEscalation: false,
    sourceHealthStatus: sourceHealth.status,
  };
}

function buildTopLevelSourceHealth(now, syncRows, globalCounts) {
  const syncMap = new Map(syncRows.map((row) => [`${row.source}:${row.entity}`, row.last_sync_at]));
  const identityStatus = globalCounts.identityLinked === 0
    ? "unavailable"
    : globalCounts.identityOrphaned > globalCounts.identityLinked * 0.5
      ? "stale"
      : globalCounts.identityOrphaned > 0
        ? "warn"
        : "healthy";

  const sources = {
    slack: {
      status: buildSourceFreshnessStatus(now, globalCounts.lastSlackAt, globalCounts.slackRows, { healthyHours: 24, warnHours: 72 }),
      lastSyncAt: globalCounts.lastSlackAt,
      rowCount: globalCounts.slackRows,
      notes: globalCounts.slackRows === 0 ? ["No Slack daily-update rows are present in TeamForge."] : [],
    },
    huly: {
      status: pickWorseStatus(
        buildSourceFreshnessStatus(now, syncMap.get("huly:team_snapshot"), globalCounts.hulySnapshotRows, { healthyHours: 24, warnHours: 72 }),
        buildSourceFreshnessStatus(now, syncMap.get("huly:issues"), globalCounts.hulyIssueRows >= 0 ? 1 : 0, { healthyHours: 24, warnHours: 72 }),
      ),
      lastSyncAt: syncMap.get("huly:issues") ?? syncMap.get("huly:team_snapshot") ?? null,
      rowCount: globalCounts.hulyIssueRows + globalCounts.hulySnapshotRows,
      notes: [],
    },
    clockify: {
      status: buildSourceFreshnessStatus(now, syncMap.get("clockify:time_entries"), globalCounts.timeEntryRows, { healthyHours: 24, warnHours: 72 }),
      lastSyncAt: syncMap.get("clockify:time_entries") ?? null,
      rowCount: globalCounts.timeEntryRows,
      notes: [],
    },
    github: {
      status: buildSourceFreshnessStatus(now, globalCounts.lastGithubAt, globalCounts.githubRows, { healthyHours: 24 * 3, warnHours: 24 * 7 }),
      lastSyncAt: globalCounts.lastGithubAt,
      rowCount: globalCounts.githubRows,
      notes: globalCounts.githubRows === 0 ? ["No GitHub PR/check data is present."] : [],
    },
    identity: {
      status: identityStatus,
      lastSyncAt: globalCounts.lastIdentityAt,
      rowCount: globalCounts.identityLinked + globalCounts.identityOrphaned,
      notes: globalCounts.identityOrphaned > 0
        ? [`${globalCounts.identityOrphaned} orphan identity rows remain unresolved.`]
        : [],
    },
  };

  let overallStatus = "healthy";
  for (const source of Object.values(sources)) {
    overallStatus = pickWorseStatus(overallStatus, source.status);
  }

  return {
    status: overallStatus,
    sources,
  };
}

function mapSourceQueueSeverity(status) {
  switch (status) {
    case "unavailable":
    case "stale":
      return "high";
    case "warn":
      return "medium";
    default:
      return "low";
  }
}

function buildSourceClearCondition(source, scope = "global") {
  switch (source) {
    case "slack":
      return scope === "global"
        ? "Fresh Slack daily-update rows land in TeamForge and required employee Slack identities resolve with confidence >= 0.75."
        : "A linked Slack identity exists with confidence >= 0.75 and fresh Slack daily-update evidence is present.";
    case "github":
      return "Fresh GitHub PR/check evidence lands in TeamForge within the expected sync window.";
    case "clockify":
      return scope === "global"
        ? "Fresh Clockify time-entry sync succeeds and affected employees have Clockify mappings."
        : "The employee has a valid Clockify mapping and fresh time-entry evidence is present.";
    case "huly":
      return scope === "global"
        ? "Fresh Huly snapshot/task evidence lands in TeamForge and affected employees have Huly mappings."
        : "The employee has a valid Huly mapping and fresh issue/document evidence is present.";
    case "identity":
      return scope === "global"
        ? "Orphaned or low-confidence identity rows are resolved and confidence is >= 0.75 for required mappings."
        : "Employee identity mappings are linked for required sources with confidence >= 0.75.";
    case "issueTracking":
      return "Huly and GitHub evidence both recover enough to prove delivery signals confidently.";
    default:
      return "Fresh evidence arrives and the degraded source returns to healthy status.";
  }
}

function buildSourceRepairQueue(globalSourceHealth, employeesPayload) {
  const queue = [];

  for (const [source, details] of Object.entries(globalSourceHealth.sources ?? {})) {
    if (!details || details.status === "healthy") continue;
    queue.push({
      queueId: `source-${source}-${details.status}`,
      queueType: "source-health",
      source,
      scope: "global",
      severity: mapSourceQueueSeverity(details.status),
      status: "open",
      summary: `${source} source health is ${details.status}.`,
      ownerHint: "teamforge-operator",
      clearCondition: buildSourceClearCondition(source, "global"),
      lastSyncAt: details.lastSyncAt ?? null,
      rowCount: Number(details.rowCount ?? 0),
      notes: details.notes ?? [],
    });
  }

  for (const employee of employeesPayload) {
    for (const [source, details] of Object.entries(employee.sourceHealth?.sources ?? {})) {
      if (!details || details.status === "healthy") continue;
      if (!Array.isArray(details.notes) || details.notes.length === 0) continue;
      if (!["identity", "slack", "clockify", "huly", "issueTracking"].includes(source)) continue;
      queue.push({
        queueId: `source-${source}-${employee.employeeId}-${details.status}`,
        queueType: source === "identity" ? "identity-repair" : "employee-source-health",
        source,
        scope: "employee",
        severity: mapSourceQueueSeverity(details.status),
        status: "open",
        employeeId: employee.employeeId,
        memberId: employee.memberId,
        employeeName: employee.name,
        managerMemberId: employee.manager?.memberId ?? null,
        managerDisplayName: employee.manager?.displayName ?? null,
        summary: `${employee.name}: ${source} evidence is ${details.status}.`,
        ownerHint: "teamforge-operator",
        clearCondition: buildSourceClearCondition(source, "employee"),
        lastSyncAt: details.lastSyncAt ?? null,
        notes: details.notes,
      });
    }
  }

  return queue;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await Promise.all([fs.access(args.teamforgeDbPath), fs.access(args.vaultRoot)]);

  const db = new DatabaseSync(args.teamforgeDbPath, { readonly: true });
  try {
    for (const tableName of [
      "employees",
      "employee_kpi_snapshots",
      "slack_message_activity",
      "time_entries",
      "sync_state",
      "identity_map",
    ]) {
      if (!tableExists(db, tableName)) {
        throw new Error(`Required TeamForge table missing: ${tableName}`);
      }
    }

    const employees = queryAll(
      db,
      `SELECT id, name, email, clockify_user_id, huly_person_id, monthly_quota_hours
       FROM employees
       WHERE is_active = 1
       ORDER BY name`,
    );
    const snapshotRows = queryAll(
      db,
      `SELECT *
       FROM employee_kpi_snapshots
       ORDER BY employee_id, source_last_modified_at DESC, updated_at DESC`,
    );
    const syncRows = queryAll(db, `SELECT source, entity, last_sync_at FROM sync_state`);
    const identityRows = queryAll(
      db,
      `SELECT source, external_id, employee_id, confidence, resolution_status, last_seen_at
       FROM identity_map`,
    );

    const now = new Date();
    const windowMs = args.windowDays * 86_400_000;
    const trendWindowDays = args.trendWeeks * 7;
    const sinceWindowMs = now.getTime() - windowMs;
    const sinceTrendDate = new Date(now.getTime() - trendWindowDays * 86_400_000);
    const sinceTrendMs = sinceTrendDate.getTime();
    const sinceTrendDateOnly = dateOnlyUtc(sinceTrendDate);
    const monthStart = dateOnlyUtc(monthStartUtc(now));
    const monthEnd = dateOnlyUtc(nextMonthStartUtc(now));

    const slackRows = queryAll(
      db,
      `SELECT employee_id, message_ts_ms, slack_channel_name, content_preview, detected_at
       FROM slack_message_activity
       WHERE message_ts_ms >= ? OR detected_at >= ?
       ORDER BY message_ts_ms DESC`,
      sinceTrendMs,
      sinceTrendDateOnly,
    );
    const timeRows = queryAll(
      db,
      `SELECT employee_id, project_id, duration_seconds, start_time, synced_at
       FROM time_entries
       WHERE start_time >= ?
       ORDER BY start_time DESC`,
      sinceTrendDateOnly,
    );
    const monthProjectRows = queryAll(
      db,
      `SELECT te.employee_id, te.project_id, p.name AS project_name, p.client_name, COALESCE(SUM(te.duration_seconds), 0) / 3600.0 AS hours
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       WHERE te.start_time >= ? AND te.start_time < ?
       GROUP BY te.employee_id, te.project_id, p.name, p.client_name`,
      monthStart,
      monthEnd,
    );
    const hulyIssueRows = tableExists(db, "huly_issue_activity")
      ? queryAll(
        db,
        `SELECT employee_id, action, occurred_at
         FROM huly_issue_activity
         WHERE occurred_at >= ?
         ORDER BY occurred_at DESC`,
        sinceTrendDateOnly,
      )
      : [];
    const hulyDocRows = tableExists(db, "huly_document_activity")
      ? queryAll(
        db,
        `SELECT employee_id, action, occurred_at
         FROM huly_document_activity
         WHERE occurred_at >= ?
         ORDER BY occurred_at DESC`,
        sinceTrendDateOnly,
      )
      : [];
    const opsEventRows = tableExists(db, "ops_events")
      ? queryAll(
        db,
        `SELECT actor_employee_id, event_type, occurred_at
         FROM ops_events
         WHERE occurred_at >= ?
         ORDER BY occurred_at DESC`,
        sinceTrendDateOnly,
      )
      : [];

    const githubCounts = {
      issues: tableExists(db, "github_issues")
        ? Number(queryFirst(db, `SELECT COUNT(*) AS count FROM github_issues`)?.count ?? 0)
        : 0,
      prs: tableExists(db, "github_pull_requests")
        ? Number(queryFirst(db, `SELECT COUNT(*) AS count FROM github_pull_requests`)?.count ?? 0)
        : 0,
      checks: tableExists(db, "github_check_runs")
        ? Number(queryFirst(db, `SELECT COUNT(*) AS count FROM github_check_runs`)?.count ?? 0)
        : 0,
    };
    const lastGithubAt = queryFirst(
      db,
      `SELECT MAX(value) AS last_at
       FROM (
         SELECT MAX(COALESCE(updated_at, synced_at, created_at)) AS value FROM github_issues
         UNION ALL
         SELECT MAX(COALESCE(merged_at, updated_at, synced_at, created_at)) AS value FROM github_pull_requests
         UNION ALL
         SELECT MAX(COALESCE(completed_at, started_at, synced_at)) AS value FROM github_check_runs
       )`,
    )?.last_at ?? null;

    const globalCounts = {
      slackRows: slackRows.length,
      lastSlackAt: slackRows[0]
        ? toIsoString(new Date(Number(slackRows[0].message_ts_ms ?? 0))) ??
          slackRows[0].detected_at ??
          null
        : null,
      hulyIssueRows: hulyIssueRows.length,
      hulySnapshotRows: 1,
      timeEntryRows: timeRows.length,
      githubRows: githubCounts.issues + githubCounts.prs + githubCounts.checks,
      lastGithubAt,
      identityLinked: identityRows.filter((row) => row.resolution_status === "linked").length,
      identityOrphaned: identityRows.filter((row) => row.resolution_status !== "linked").length,
      lastIdentityAt: identityRows
        .map((row) => row.last_seen_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    };

    const globalSourceHealth = buildTopLevelSourceHealth(now, syncRows, globalCounts);
    const teamProfiles = await loadTeamProfiles(args.vaultRoot);
    const snapshotByEmployeeId = new Map();
    for (const row of snapshotRows) {
      if (!snapshotByEmployeeId.has(row.employee_id)) {
        snapshotByEmployeeId.set(row.employee_id, row);
      }
    }

    const trendWindows = buildWeekWindows(now, args.trendWeeks);

    const employeesPayload = employees.map((employee) => {
      const snapshotRow = snapshotByEmployeeId.get(employee.id) ?? null;
      const memberId = snapshotRow?.member_id ?? null;
      const vaultProfile = memberId ? teamProfiles.get(memberId) ?? null : null;
      const reportsTo = snapshotRow?.reports_to ?? vaultProfile?.reportsTo ?? null;
      const manager = buildManagerDescriptor(reportsTo, teamProfiles);
      const roleTemplate =
        snapshotRow?.role_template ?? vaultProfile?.roleTemplate ?? null;
      const tags = parseJsonList(snapshotRow?.tags_json);
      const joinedAt = parseIsoDate(vaultProfile?.joined);
      const roleProfile = getRoleProfile(roleTemplate, joinedAt, now, tags);

      const employeeSlackRows = slackRows.filter((row) => row.employee_id === employee.id);
      const employeeWindowSlackRows = employeeSlackRows.filter(
        (row) => Number(row.message_ts_ms ?? 0) >= sinceWindowMs,
      );
      const employeeTimeRows = timeRows.filter((row) => row.employee_id === employee.id);
      const workHoursThisMonth = employeeTimeRows
        .filter((row) => row.start_time >= monthStart && row.start_time < monthEnd)
        .reduce((sum, row) => sum + Number(row.duration_seconds ?? 0) / 3600, 0);
      const standupsLast7Days = employeeWindowSlackRows.filter((row) =>
        String(row.slack_channel_name ?? "").toLowerCase().includes("standup"),
      ).length;
      const metrics = {
        monthlyQuotaHours: Number(employee.monthly_quota_hours ?? 0),
        workHoursThisMonth,
        messagesLast7Days: employeeWindowSlackRows.length,
        standupsLast7Days,
        lastMessageAt: employeeWindowSlackRows[0]
          ? toIsoString(new Date(Number(employeeWindowSlackRows[0].message_ts_ms ?? 0)))
          : null,
        lastStandupAt: employeeWindowSlackRows.find((row) =>
          String(row.slack_channel_name ?? "").toLowerCase().includes("standup"),
        )
          ? toIsoString(
            new Date(
              Number(
                employeeWindowSlackRows.find((row) =>
                  String(row.slack_channel_name ?? "").toLowerCase().includes("standup"),
                )?.message_ts_ms ?? 0,
              ),
            ),
          )
          : null,
      };
      metrics.monthProgress = computeMonthProgress(now, joinedAt, roleProfile.graceDays);
      metrics.expectedHoursThisMonth =
        metrics.monthlyQuotaHours * metrics.monthProgress;

      const projectAttribution = buildProjectAttribution(
        employee.id,
        monthProjectRows,
        vaultProfile,
      );

      const outcomeSignals = {
        hulyIssueActions30d: hulyIssueRows.filter((row) => row.employee_id === employee.id).length,
        hulyDocumentActions30d: hulyDocRows.filter((row) => row.employee_id === employee.id).length,
        opsEvents30d: opsEventRows.filter((row) => row.actor_employee_id === employee.id).length,
      };
      outcomeSignals.totalTrackedOutcomeEvents =
        outcomeSignals.hulyIssueActions30d +
        outcomeSignals.hulyDocumentActions30d +
        outcomeSignals.opsEvents30d;

      const sourceHealth = buildSourceHealth(
        globalSourceHealth,
        employee,
        roleProfile,
        identityRows,
        now,
      );
      outcomeSignals.sourceHealthy = !["stale", "unavailable"].includes(
        sourceHealth.sources.issueTracking?.status ?? "unavailable",
      );

      const semanticSignals = classifySemanticSignals(employeeWindowSlackRows);
      const monthlyKpis = parseJsonList(snapshotRow?.monthly_kpis_json);
      const evidenceSources = parseJsonList(snapshotRow?.evidence_sources_json);
      const contractSource = parseKpiContractSource(snapshotRow?.contract_source_json);
      const explicitKpiContracts = parseKpiContracts(snapshotRow?.kpi_contracts_json);
      const gapFlags = parseJsonList(snapshotRow?.gap_flags_json);
      const evidenceContracts = buildEvidenceContracts({
        monthlyKpis,
        roleProfile,
        sourceHealth,
        metrics,
        projectAttribution,
        outcomeSignals,
        semanticSignals,
        contractSource,
        explicitKpiContracts,
        windowDays: args.windowDays,
      });

      const trend4Weeks = {
        weeks: trendWindows.map((window) => {
          const windowTimeRows = employeeTimeRows.filter((row) => {
            const startedAt = parseIsoDateTime(row.start_time);
            return startedAt && startedAt >= window.start && startedAt < window.end;
          });
          const windowSlackRows = employeeSlackRows.filter((row) => {
            const messageDate = Number(row.message_ts_ms ?? 0);
            return messageDate >= window.start.getTime() && messageDate < window.end.getTime();
          });
          const windowSemantic = classifySemanticSignals(windowSlackRows);
          const windowMetrics = {
            hours: windowTimeRows.reduce(
              (sum, row) => sum + Number(row.duration_seconds ?? 0) / 3600,
              0,
            ),
            standups: windowSlackRows.filter((row) =>
              String(row.slack_channel_name ?? "").toLowerCase().includes("standup"),
            ).length,
            updates: windowSlackRows.length,
            blockedCount: windowSemantic.blockedCount,
            riskCount: windowSemantic.riskCount,
            missedDeadlineCount: windowSemantic.missedDeadlineCount,
          };
          return {
            weekStart: dateOnlyUtc(window.start),
            weekEnd: dateOnlyUtc(new Date(window.end.getTime() - 86_400_000)),
            hours: Number(windowMetrics.hours.toFixed(1)),
            standups: windowMetrics.standups,
            updates: windowMetrics.updates,
            blockedCount: windowMetrics.blockedCount,
            riskCount: windowMetrics.riskCount,
            status: computeActivityWindowStatus(
              windowMetrics,
              roleProfile,
              metrics.monthlyQuotaHours,
            ),
          };
        }),
      };
      trend4Weeks.exceptionWeeks = trend4Weeks.weeks.filter((week) =>
        ["drift", "watch"].includes(week.status),
      ).length;

      const lastReviewed = parseIsoDate(snapshotRow?.last_reviewed);
      const kpiStatus = buildKpiStatus({
        snapshotRow,
        roleProfile,
        sourceHealth,
        metrics,
        monthlyKpis,
        evidenceSources,
        gapFlags,
        outcomeSignals,
        evidenceContracts,
        semanticSignals,
        now,
        lastReviewed,
      });

      return {
        employeeId: employee.id,
        name: employee.name,
        email: employee.email,
        memberId,
        title: snapshotRow?.title ?? null,
        roleTemplate,
        reportsTo,
        manager,
        joinedOn: vaultProfile?.joined ?? null,
        kpiVersion: snapshotRow?.kpi_version ?? null,
        lastReviewed: snapshotRow?.last_reviewed ?? null,
        sourceRelativePath: snapshotRow?.source_relative_path ?? null,
        monthlyQuotaHours: metrics.monthlyQuotaHours,
        workHoursThisMonth: Number(metrics.workHoursThisMonth.toFixed(1)),
        expectedHoursThisMonth: Number(metrics.expectedHoursThisMonth.toFixed(1)),
        messagesLast7Days: metrics.messagesLast7Days,
        standupsLast7Days: metrics.standupsLast7Days,
        lastMessageAt: metrics.lastMessageAt,
        lastStandupAt: metrics.lastStandupAt,
        status: kpiStatus.status,
        label: kpiStatus.label,
        scorePercent: kpiStatus.scorePercent,
        summary: kpiStatus.summary,
        reasons: kpiStatus.reasons,
        severity: kpiStatus.severity,
        managerUpdateRequired: kpiStatus.managerUpdateRequired,
        founderUpdateRequired: kpiStatus.founderUpdateRequired,
        founderUpdateSuggested: kpiStatus.founderUpdateSuggested,
        managerUpdateReasons: kpiStatus.managerUpdateReasons,
        founderUpdateReasons: kpiStatus.founderUpdateReasons,
        suppressedFounderEscalation: kpiStatus.suppressedFounderEscalation,
        suppressionReasons: kpiStatus.suppressionReasons ?? [],
        gapFlags,
        evidenceSources,
        contractSource,
        sourceHealth,
        roleCalibration: {
          profileId: roleProfile.profileId,
          tenureBand: roleProfile.tenureBand,
          thresholds: {
            standupsMin7d: roleProfile.standupsMin7d,
            updatesMin7d: roleProfile.updatesMin7d,
            hoursSoftRatio: roleProfile.hoursSoftRatio,
            hoursHardRatio: roleProfile.hoursHardRatio,
            graceDays: roleProfile.graceDays,
            managerSlaDays: roleProfile.managerSlaDays,
          },
        },
        projectAttribution,
        projectIds: projectAttribution.projectIds,
        projectNames: projectAttribution.projectNames,
        clientIds: projectAttribution.clientIds,
        clientNames: projectAttribution.clientNames,
        primaryProjectId: projectAttribution.primaryProjectId,
        primaryProjectName: projectAttribution.primaryProjectName,
        outcomeSignals,
        evidenceContracts: evidenceContracts.contracts,
        evidenceCoverage: {
          contractMode: evidenceContracts.contractMode,
          coverageRatio: Number(evidenceContracts.coverageRatio.toFixed(2)),
          degradedContractCount: evidenceContracts.degradedContractCount,
          uncoveredContractCount: evidenceContracts.uncoveredContractCount,
          automatedContractCount: evidenceContracts.automatedContractCount,
        },
        semanticSignals,
        trend4Weeks,
      };
    });

    employeesPayload.sort((left, right) => {
      const statusDiff = KPI_STATUS_PRIORITY[left.status] - KPI_STATUS_PRIORITY[right.status];
      if (statusDiff !== 0) return statusDiff;
      return left.name.localeCompare(right.name);
    });

    const counts = employeesPayload.reduce(
      (accumulator, employee) => {
        accumulator[employee.status] += 1;
        if (employee.managerUpdateRequired) accumulator.managerUpdates += 1;
        if (employee.founderUpdateRequired) accumulator.founderUpdates += 1;
        if (employee.suppressedFounderEscalation) accumulator.suppressedForSourceHealth += 1;
        return accumulator;
      },
      {
        employees: employeesPayload.length,
        managerUpdates: 0,
        founderUpdates: 0,
        suppressedForSourceHealth: 0,
        onTrack: 0,
        watch: 0,
        drift: 0,
        missingInputs: 0,
        unknown: 0,
      },
    );

    const sourceRepairQueue = buildSourceRepairQueue(globalSourceHealth, employeesPayload);
    counts.sourceRepairQueueItems = sourceRepairQueue.length;
    counts.sourceRepairBlockingItems = sourceRepairQueue.filter((item) =>
      ["high", "medium"].includes(item.severity),
    ).length;

    const payload = {
      generatedAt: now.toISOString(),
      source: "teamforge-local",
      windowDays: args.windowDays,
      trendWeeks: args.trendWeeks,
      teamforgeDbPath: args.teamforgeDbPath,
      vaultRoot: args.vaultRoot,
      sourceHealth: globalSourceHealth,
      sourceRepairQueue,
      counts,
      employees: employeesPayload,
    };

    const json = `${JSON.stringify(payload, null, 2)}\n`;
    if (args.outPath) {
      await fs.mkdir(path.dirname(args.outPath), { recursive: true });
      await fs.writeFile(args.outPath, json, "utf8");
    } else {
      process.stdout.write(json);
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
