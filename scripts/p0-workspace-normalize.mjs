#!/usr/bin/env node
/**
 * P0 — Issue #18: Huly Workspace Normalization
 *
 * Handles:
 *   - Rename HEYZA → Axtech, VIBRA → Vibrasonix
 *   - Create missing projects: Tuya clients, OASIS R&D, Internal Ops
 *   - Replace default Organization dept with Engineering, Marketing, Leadership
 *   - Resolve duplicate Akshay Balraj person record
 *   - Rename/archive 8 untitled documents
 *
 * Usage:
 *   HULY_TOKEN=<jwt> node scripts/p0-workspace-normalize.mjs [--dry-run]
 */

import { HulyClient, generateHulyId } from "./huly-client.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.HULY_TOKEN;

if (!TOKEN) {
  console.error("Error: HULY_TOKEN env var is required.");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────

function log(msg) { console.log(`[normalize] ${msg}`); }
function dry(msg) { console.log(`[DRY-RUN]   ${msg}`); }

async function safeFind(client, cls, query = {}) {
  try {
    return await client.findAll(cls, query);
  } catch (e) {
    log(`  ⚠ Could not query ${cls}: ${e.message}`);
    return [];
  }
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  log(`Connecting to Huly... (dry-run=${DRY_RUN})`);
  const client = await HulyClient.connect(TOKEN);

  const account = await client.getAccountInfo();
  const actorId = account.primarySocialId ?? account.uuid ?? "system";
  log(`Actor: ${actorId} (${account.email ?? "unknown"})`);

  // ── 1. Audit current state ──────────────────────────────────

  log("\n── Auditing workspace ──");

  const projects = await safeFind(client, "tracker:class:Project");
  log(`Found ${projects.length} tracker projects:`);
  for (const p of projects) {
    log(`  ${p._id}  identifier=${p.identifier ?? "?"}  name=${p.name ?? "?"}`);
  }

  const departments = await safeFind(client, "hr:class:Department");
  log(`Found ${departments.length} HR departments:`);
  for (const d of departments) {
    log(`  ${d._id}  name=${d.name ?? "?"}`);
  }

  const persons = await safeFind(client, "contact:class:Person");
  log(`Found ${persons.length} persons`);

  const documents = await safeFind(client, "document:class:Document");
  log(`Found ${documents.length} documents`);

  // ── 2. Rename projects ──────────────────────────────────────

  log("\n── Renaming projects ──");

  const renames = [
    { identifier: "HEYZA", newName: "Axtech", newIdentifier: "AXT" },
    { identifier: "VIBRA", newName: "Vibrasonix", newIdentifier: "VBX" },
  ];

  for (const rename of renames) {
    const proj = projects.find(
      (p) => p.identifier === rename.identifier || p.name === rename.identifier
    );
    if (!proj) {
      log(`  ⚠ Project ${rename.identifier} not found — skipping rename`);
      continue;
    }
    log(`  Renaming ${rename.identifier} (${proj._id}) → ${rename.newName}`);
    if (!DRY_RUN) {
      await client.updateDoc(actorId, "tracker:class:Project", proj.space ?? "tracker:space:Project", proj._id, {
        name: rename.newName,
        identifier: rename.newIdentifier,
      });
      log(`  ✓ Renamed`);
    } else {
      dry(`updateDoc tracker:class:Project ${proj._id} → name=${rename.newName} identifier=${rename.newIdentifier}`);
    }
  }

  // ── 3. Create missing projects ──────────────────────────────

  log("\n── Creating missing projects ──");

  const requiredProjects = [
    { name: "Tuya Clients", identifier: "TUY" },
    { name: "OASIS R&D", identifier: "OAS" },
    { name: "Internal Ops", identifier: "INT" },
  ];

  for (const req of requiredProjects) {
    const exists = projects.find(
      (p) => p.identifier === req.identifier || p.name === req.name
    );
    if (exists) {
      log(`  ✓ ${req.name} already exists (${exists._id})`);
      continue;
    }
    log(`  Creating project: ${req.name} (${req.identifier})`);
    if (!DRY_RUN) {
      const id = await client.createDoc(actorId, "tracker:class:Project", "tracker:space:Project", {
        name: req.name,
        identifier: req.identifier,
        description: "",
        private: false,
        archived: false,
        members: [],
        owners: [],
      });
      log(`  ✓ Created ${req.name} → ${id}`);
    } else {
      dry(`createDoc tracker:class:Project name=${req.name} identifier=${req.identifier}`);
    }
  }

  // ── 4. Fix departments ──────────────────────────────────────

  log("\n── Fixing departments ──");

  const defaultDept = departments.find(
    (d) => !d.name || d.name === "Organization" || d.name === "HR" || d.name === "Default"
  );

  const requiredDepts = ["Engineering", "Marketing", "Leadership"];
  const existingDeptNames = departments.map((d) => d.name ?? "");

  for (const deptName of requiredDepts) {
    if (existingDeptNames.includes(deptName)) {
      log(`  ✓ Department '${deptName}' already exists`);
      continue;
    }
    log(`  Creating department: ${deptName}`);
    if (!DRY_RUN) {
      const id = await client.createDoc(actorId, "hr:class:Department", "hr:space:HR", {
        name: deptName,
        description: "",
        members: [],
        managers: [],
      });
      log(`  ✓ Created ${deptName} → ${id}`);
    } else {
      dry(`createDoc hr:class:Department name=${deptName}`);
    }
  }

  if (defaultDept && (defaultDept.name === "Organization" || !defaultDept.name)) {
    log(`  Renaming default department '${defaultDept.name ?? "unnamed"}' → 'Engineering'`);
    if (!DRY_RUN) {
      await client.updateDoc(actorId, "hr:class:Department", "hr:space:HR", defaultDept._id, {
        name: "Engineering",
      });
      log(`  ✓ Renamed`);
    } else {
      dry(`updateDoc hr:class:Department ${defaultDept._id} → name=Engineering`);
    }
  }

  // ── 5. Resolve duplicate Akshay Balraj ─────────────────────

  log("\n── Resolving duplicate persons ──");

  const akshays = persons.filter(
    (p) => p.name && p.name.toLowerCase().includes("akshay")
  );
  log(`  Found ${akshays.length} Akshay record(s)`);

  if (akshays.length > 1) {
    // Keep the one with more data (has channels/city), remove the other
    const sorted = [...akshays].sort((a, b) => {
      const aScore = (a.channels ? 1 : 0) + (a.city ? 1 : 0);
      const bScore = (b.channels ? 1 : 0) + (b.city ? 1 : 0);
      return bScore - aScore;
    });
    const keep = sorted[0];
    const duplicates = sorted.slice(1);
    log(`  Keeping: ${keep._id} (${keep.name})`);
    for (const dup of duplicates) {
      log(`  Removing duplicate: ${dup._id} (${dup.name})`);
      if (!DRY_RUN) {
        await client.removeDoc(actorId, "contact:class:Person", dup.space ?? "contact:space:Contacts", dup._id);
        log(`  ✓ Removed duplicate`);
      } else {
        dry(`removeDoc contact:class:Person ${dup._id}`);
      }
    }
  } else {
    log(`  No duplicates found`);
  }

  // ── 6. Rename untitled documents ───────────────────────────

  log("\n── Cleaning untitled documents ──");

  const untitled = documents.filter(
    (d) => !d.title || d.title.trim() === "" || d.title === "Untitled" || d.title === "New Document"
  );
  log(`  Found ${untitled.length} untitled document(s)`);

  const docNames = [
    "Team Handbook",
    "Engineering Standards",
    "Client Onboarding Guide",
    "Project Templates",
    "Meeting Notes Archive",
    "Resource Registry",
    "Training Materials",
    "Process Documentation",
  ];

  for (let i = 0; i < untitled.length; i++) {
    const doc = untitled[i];
    const newTitle = docNames[i] ?? `Document ${i + 1}`;
    log(`  Renaming untitled doc ${doc._id} → '${newTitle}'`);
    if (!DRY_RUN) {
      await client.updateDoc(actorId, "document:class:Document", doc.space ?? "document:space:Documents", doc._id, {
        title: newTitle,
      });
      log(`  ✓ Renamed`);
    } else {
      dry(`updateDoc document:class:Document ${doc._id} → title=${newTitle}`);
    }
  }

  // ── 7. Create required Chunter channels ────────────────────

  log("\n── Creating required channels ──");

  const channels = await safeFind(client, "chunter:class:Channel");
  const existingChannelNames = channels.map((c) => (c.name ?? c.title ?? "").toLowerCase());

  const requiredChannels = [
    { name: "standups", description: "Daily standup posts" },
    { name: "axtech", description: "Axtech project channel" },
    { name: "tuya-clients", description: "Tuya client work" },
    { name: "research-rnd", description: "R&D and research" },
    { name: "tech-resources", description: "Technical resources and links" },
    { name: "blockers-urgent", description: "Urgent blockers and escalations" },
    { name: "training-questions", description: "Training and learning questions" },
  ];

  for (const ch of requiredChannels) {
    if (existingChannelNames.includes(ch.name.toLowerCase())) {
      log(`  ✓ Channel #${ch.name} already exists`);
      continue;
    }
    log(`  Creating channel: #${ch.name}`);
    if (!DRY_RUN) {
      const id = await client.createDoc(actorId, "chunter:class:Channel", "chunter:space:Chunter", {
        name: ch.name,
        description: ch.description,
        private: false,
        archived: false,
        members: [],
        owners: [],
      });
      log(`  ✓ Created #${ch.name} → ${id}`);
    } else {
      dry(`createDoc chunter:class:Channel name=${ch.name}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────

  log("\n── Normalization complete ──");
  if (DRY_RUN) {
    log("DRY-RUN mode — no changes were made. Re-run without --dry-run to apply.");
  } else {
    log("All changes applied. Close issue #18 after verifying in Huly.");
  }
}

main().catch((e) => {
  console.error("[normalize] Fatal:", e.message);
  process.exit(1);
});
