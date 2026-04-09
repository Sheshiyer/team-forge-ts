#!/usr/bin/env node
/**
 * P1 — Issue #19: Seed Operational Data
 *
 * Seeds:
 *   - Initial sprint/milestone structure for active projects
 *   - Holidays for the team calendar (India public holidays 2026)
 *   - Leave/time-off categories (as tag elements)
 *   - Starter board cards for current work streams
 *   - Onboarding template project
 *
 * Usage:
 *   HULY_TOKEN=<jwt> node scripts/p1-seed-operational-data.mjs [--dry-run]
 */

import { HulyClient, generateHulyId } from "./huly-client.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.HULY_TOKEN;

if (!TOKEN) {
  console.error("Error: HULY_TOKEN env var is required.");
  process.exit(1);
}

function log(msg) { console.log(`[seed] ${msg}`); }
function dry(msg) { console.log(`[DRY-RUN] ${msg}`); }

// ── India public holidays 2026 ───────────────────────────────────

const HOLIDAYS_2026 = [
  { title: "Republic Day", date: "2026-01-26" },
  { title: "Holi", date: "2026-03-03" },
  { title: "Good Friday", date: "2026-04-03" },
  { title: "Ambedkar Jayanti", date: "2026-04-14" },
  { title: "Ram Navami", date: "2026-03-30" },
  { title: "Eid ul-Fitr", date: "2026-03-31" },
  { title: "Eid ul-Adha", date: "2026-06-07" },
  { title: "Independence Day", date: "2026-08-15" },
  { title: "Janmashtami", date: "2026-08-23" },
  { title: "Gandhi Jayanti", date: "2026-10-02" },
  { title: "Dussehra", date: "2026-10-20" },
  { title: "Diwali", date: "2026-11-08" },
  { title: "Christmas", date: "2026-12-25" },
];

// ── Sprint definitions ───────────────────────────────────────────

const SPRINTS = [
  {
    name: "Sprint 1 — Cloudflare Backend",
    project_identifier: "INT",
    start: "2026-04-09",
    end: "2026-04-23",
    goal: "Deploy Cloudflare Worker with D1, R2, Queue. All Wave 1-3 routes live.",
  },
  {
    name: "Sprint 1 — Axtech Delivery",
    project_identifier: "AXT",
    start: "2026-04-09",
    end: "2026-04-23",
    goal: "Complete current Axtech deliverables and close open P0/P1 issues.",
  },
  {
    name: "Sprint 1 — Tuya Clients",
    project_identifier: "TUY",
    start: "2026-04-09",
    end: "2026-04-23",
    goal: "Tuya SDK integration baseline and client onboarding prep.",
  },
];

// ── Onboarding template issues ───────────────────────────────────

const ONBOARDING_TASKS = [
  "INT-SETUP-ONBOARD-001: Create GitHub org access and invite to repos",
  "INT-SETUP-ONBOARD-002: Set up Huly workspace membership and assign role",
  "INT-SETUP-ONBOARD-003: Configure Clockify workspace access",
  "INT-SETUP-ONBOARD-004: Add to Slack workspace and required channels",
  "INT-SETUP-ONBOARD-005: Share 1Password vault access",
  "INT-SETUP-ONBOARD-006: Schedule intro call with team lead",
  "INT-SETUP-ONBOARD-007: Complete Onboarding Track training modules",
  "INT-SETUP-ONBOARD-008: First standup posted in #standups",
];

// ── Starter board cards ──────────────────────────────────────────

const BOARD_CARDS = [
  { title: "AXT-TASK-INFRA: Review Axtech infrastructure setup", status: "In Progress" },
  { title: "TUY-TASK-SDK: Tuya SDK baseline integration", status: "Backlog" },
  { title: "INT-SETUP-CF: Cloudflare Worker deployment", status: "Done" },
  { title: "INT-TASK-HULY: Huly workspace normalization", status: "Done" },
  { title: "OAS-RESEARCH-AI: OASIS AI/ML research spike", status: "Backlog" },
];

async function safeFind(client, cls, query = {}) {
  try { return await client.findAll(cls, query); } catch { return []; }
}

async function main() {
  log(`Connecting... (dry-run=${DRY_RUN})`);
  const client = await HulyClient.connect(TOKEN);
  const account = await client.getAccountInfo();
  const actorId = account.primarySocialId ?? account.uuid ?? "system";
  log(`Actor: ${actorId}`);

  const projects = await safeFind(client, "tracker:class:Project");
  const projectByIdentifier = Object.fromEntries(
    projects.map((p) => [p.identifier, p])
  );
  log(`Found ${projects.length} projects: ${projects.map((p) => p.identifier).join(", ")}`);

  // ── 1. Create milestones (sprints) ──────────────────────────

  log("\n── Creating sprint milestones (#19) ──");

  const existingMilestones = await safeFind(client, "tracker:class:Milestone");
  const existingMilestoneNames = existingMilestones.map((m) => m.label ?? "");

  for (const sprint of SPRINTS) {
    if (existingMilestoneNames.includes(sprint.name)) {
      log(`  ✓ Milestone '${sprint.name}' already exists`);
      continue;
    }

    const project = projectByIdentifier[sprint.project_identifier];
    if (!project) {
      log(`  ⚠ Project ${sprint.project_identifier} not found — skipping ${sprint.name}`);
      continue;
    }

    log(`  Creating milestone: ${sprint.name} (${sprint.project_identifier})`);
    if (!DRY_RUN) {
      try {
        const id = await client.createDoc(actorId, "tracker:class:Milestone", project._id, {
          label: sprint.name,
          description: sprint.goal,
          status: "InProgress",
          targetDate: new Date(sprint.end).getTime(),
        });
        log(`  ✓ Created → ${id}`);
      } catch (e) {
        log(`  ⚠ Failed: ${e.message}`);
      }
    } else {
      dry(`createDoc tracker:class:Milestone label="${sprint.name}" project=${sprint.project_identifier}`);
    }
  }

  // ── 2. Seed holidays ────────────────────────────────────────

  log("\n── Seeding holidays (#19) ──");

  const existingHolidays = await safeFind(client, "hr:class:Holiday");
  const existingHolidayTitles = existingHolidays.map((h) => h.title ?? "");

  for (const holiday of HOLIDAYS_2026) {
    if (existingHolidayTitles.includes(holiday.title)) {
      log(`  ✓ Holiday '${holiday.title}' already exists`);
      continue;
    }
    log(`  Creating holiday: ${holiday.title} (${holiday.date})`);
    if (!DRY_RUN) {
      try {
        const id = await client.createDoc(actorId, "hr:class:Holiday", "hr:space:HR", {
          title: holiday.title,
          date: new Date(holiday.date).getTime(),
          department: "hr:ids:Head",
        });
        log(`  ✓ Created → ${id}`);
      } catch (e) {
        log(`  ⚠ Failed (hr:class:Holiday may not be available): ${e.message}`);
      }
    } else {
      dry(`createDoc hr:class:Holiday title="${holiday.title}" date=${holiday.date}`);
    }
  }

  // ── 3. Create onboarding template issues ───────────────────

  log("\n── Creating onboarding template issues (#19) ──");

  const intProject = projectByIdentifier["INT"];
  if (!intProject) {
    log("  ⚠ INT project not found — skipping onboarding template");
  } else {
    const existingIssues = await safeFind(client, "tracker:class:Issue", { space: intProject._id });
    const existingTitles = existingIssues.map((i) => i.title ?? "");

    for (const task of ONBOARDING_TASKS) {
      if (existingTitles.includes(task)) {
        log(`  ✓ Issue '${task.slice(0, 50)}...' already exists`);
        continue;
      }
      log(`  Creating: ${task.slice(0, 60)}`);
      if (!DRY_RUN) {
        try {
          const id = await client.createDoc(actorId, "tracker:class:Issue", intProject._id, {
            title: task,
            description: "",
            priority: 2, // Medium
            assignee: null,
          });
          log(`  ✓ Created → ${id}`);
        } catch (e) {
          log(`  ⚠ Failed: ${e.message}`);
        }
      } else {
        dry(`createDoc tracker:class:Issue title="${task.slice(0, 50)}"`);
      }
    }
  }

  // ── 4. Seed board cards ─────────────────────────────────────

  log("\n── Seeding starter board cards (#19) ──");

  const boards = await safeFind(client, "board:class:Board");
  const mainBoard = boards.find((b) => !b.archived);

  if (!mainBoard) {
    log("  ⚠ No active board found — skipping board cards");
  } else {
    log(`  Using board: ${mainBoard.name ?? mainBoard._id}`);
    const existingCards = await safeFind(client, "board:class:Card", { space: mainBoard._id });
    const existingCardTitles = existingCards.map((c) => c.title ?? "");

    for (const card of BOARD_CARDS) {
      if (existingCardTitles.includes(card.title)) {
        log(`  ✓ Card '${card.title.slice(0, 50)}' already exists`);
        continue;
      }
      log(`  Creating card: ${card.title.slice(0, 60)}`);
      if (!DRY_RUN) {
        try {
          const id = await client.createDoc(actorId, "board:class:Card", mainBoard._id, {
            title: card.title,
            description: "",
            assignee: null,
          });
          log(`  ✓ Created → ${id}`);
        } catch (e) {
          log(`  ⚠ Failed: ${e.message}`);
        }
      } else {
        dry(`createDoc board:class:Card title="${card.title.slice(0, 50)}"`);
      }
    }
  }

  log("\n── Seed complete ──");
  if (DRY_RUN) log("DRY-RUN — no changes applied.");
  else log("Operational data seeded. Close issue #19 after verifying in Huly.");
}

main().catch((e) => {
  console.error("[seed] Fatal:", e.message);
  process.exit(1);
});
