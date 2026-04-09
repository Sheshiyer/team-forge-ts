#!/usr/bin/env node
/**
 * P0 — Issues #1 & #2: Create 9 Huly Enums + 5 Custom Classes
 *
 * Enums (#1):
 *   project_type, client_tier, task_complexity, priority_level,
 *   work_status, team_role, smart_home_platform, time_off_type, meeting_type
 *
 * Classes (#2):
 *   Client, Smart_Home_Device, Client_Resource, Knowledge_Article, Sprint
 *
 * Usage:
 *   HULY_TOKEN=<jwt> node scripts/p0-enums-and-classes.mjs [--dry-run]
 */

import { HulyClient, generateHulyId } from "./huly-client.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.HULY_TOKEN;

if (!TOKEN) {
  console.error("Error: HULY_TOKEN env var is required.");
  process.exit(1);
}

function log(msg) { console.log(`[enums-classes] ${msg}`); }
function dry(msg) { console.log(`[DRY-RUN]       ${msg}`); }

// ── Enum definitions ─────────────────────────────────────────────

const ENUMS = [
  {
    id: "project_type",
    name: "Project Type",
    values: ["Smart Home", "Energy Management", "Web Dev", "Mobile App", "R&D", "Creative/VR", "AI/ML", "Internal Ops"],
  },
  {
    id: "client_tier",
    name: "Client Tier",
    values: ["Tier 1 - Recurring Revenue", "Tier 2 - Active Projects", "Tier 3 - Maintenance", "Tier 4 - One-Off", "Tier R&D"],
  },
  {
    id: "task_complexity",
    name: "Task Complexity",
    values: ["Quick (<2h)", "Standard (2-8h)", "Complex (1-3d)", "Epic (3-7d)", "Mega (1-4wk)"],
  },
  {
    id: "priority_level",
    name: "Priority Level",
    values: ["P0 Critical", "P1 High", "P2 Medium", "P3 Low", "P4 Wishlist"],
  },
  {
    id: "work_status",
    name: "Work Status",
    values: ["Backlog", "Scheduled", "In Progress", "Review", "Done", "Blocked", "On Hold"],
  },
  {
    id: "team_role",
    name: "Team Role",
    values: ["Founder/Director", "PM-Developer", "Senior Developer", "Developer", "Social Media Manager", "Consultant"],
  },
  {
    id: "smart_home_platform",
    name: "Smart Home Platform",
    values: ["Tuya IoT", "Axtech Energy", "Google Home", "Alexa", "Custom", "Other"],
  },
  {
    id: "time_off_type",
    name: "Time Off Type",
    values: ["Vacation", "Sick Leave", "Remote Work Day", "Training", "Public Holiday", "Off-site Meeting"],
  },
  {
    id: "meeting_type",
    name: "Meeting Type",
    values: ["Daily Standup", "Sprint Planning", "Retro", "Client Call", "Brainstorm", "Training", "1-on-1"],
  },
];

// ── Class definitions ────────────────────────────────────────────

// Huly uses chunter:space:Chunter or a custom space for custom classes.
// We create them as tracker:class:Project sub-types or use core:class:Doc
// with a custom mixin. The safest approach for Huly SaaS is to create
// them as custom "Member" types under the HR or Tracker space.
// We'll use document:class:Document with a custom mixin pattern.

const CUSTOM_CLASSES = [
  {
    id: "thoughtseed:class:Client",
    name: "Client",
    space: "tracker:space:Project",
    fields: [
      "name", "tier", "industry", "contract_start", "contract_end",
      "primary_contact", "tech_stack", "revenue_model", "monthly_value",
      "timezone", "google_drive_folder", "chrome_profile_name", "status", "notes",
    ],
  },
  {
    id: "thoughtseed:class:SmartHomeDevice",
    name: "Smart Home Device",
    space: "tracker:space:Project",
    fields: [
      "device_name", "model", "platform", "client", "device_id",
      "firmware", "api_endpoint", "api_docs_url", "integration_status",
      "deployment_date", "responsible_dev", "technical_notes",
    ],
  },
  {
    id: "thoughtseed:class:ClientResource",
    name: "Client Resource",
    space: "tracker:space:Project",
    fields: [
      "client", "resource_type", "resource_name", "url",
      "credentials_location", "owner", "status", "renewal_date", "cost", "notes",
    ],
  },
  {
    id: "thoughtseed:class:KnowledgeArticle",
    name: "Knowledge Article",
    space: "document:space:Documents",
    fields: [
      "title", "category", "tags", "content", "author",
      "last_updated", "related_projects", "external_links",
    ],
  },
  {
    id: "thoughtseed:class:Sprint",
    name: "Sprint",
    space: "tracker:space:Project",
    fields: [
      "sprint_name", "project", "start_date", "end_date", "sprint_goal",
      "planned_capacity", "actual_capacity", "completion_stats",
      "retro_notes", "demo_date", "status",
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────

async function safeFind(client, cls, query = {}) {
  try {
    return await client.findAll(cls, query);
  } catch {
    return [];
  }
}

async function enumExists(client, enumId) {
  // Check if a tag category or enum with this name exists
  const tags = await safeFind(client, "tags:class:TagCategory");
  return tags.some((t) => t._id === enumId || t.label === enumId);
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  log(`Connecting... (dry-run=${DRY_RUN})`);
  const client = await HulyClient.connect(TOKEN);
  const account = await client.getAccountInfo();
  const actorId = account.primarySocialId ?? account.uuid ?? "system";
  log(`Actor: ${actorId}`);

  // ── Probe what's available ──────────────────────────────────

  log("\n── Probing Huly class availability ──");

  const probeClasses = [
    "tags:class:TagCategory",
    "tags:class:TagElement",
    "core:class:EnumOf",
    "chunter:class:Channel",
    "tracker:class:Project",
    "document:class:Document",
  ];

  const available = {};
  for (const cls of probeClasses) {
    try {
      const items = await client.findAll(cls, {}, 1);
      available[cls] = true;
      log(`  ✓ ${cls} (${items.length} items)`);
    } catch (e) {
      available[cls] = false;
      log(`  ✗ ${cls} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── Create enums as TagCategories ──────────────────────────

  log("\n── Creating enums as tag categories (#1) ──");

  const existingTags = available["tags:class:TagCategory"]
    ? await safeFind(client, "tags:class:TagCategory")
    : [];
  const existingTagNames = existingTags.map((t) => (t.label ?? t.title ?? "").toLowerCase());

  for (const enumDef of ENUMS) {
    const label = enumDef.name.toLowerCase();
    if (existingTagNames.includes(label)) {
      log(`  ✓ Enum '${enumDef.name}' already exists`);
      continue;
    }

    log(`  Creating enum: ${enumDef.name} (${enumDef.values.length} values)`);

    if (!DRY_RUN && available["tags:class:TagCategory"]) {
      try {
        const catId = await client.createDoc(
          actorId,
          "tags:class:TagCategory",
          "tags:space:Tags",
          {
            label: enumDef.name,
            description: `Thoughtseed ${enumDef.name} enum`,
            targetClass: "tracker:class:Issue",
            default: false,
          }
        );
        log(`  ✓ Created category ${enumDef.name} → ${catId}`);

        // Create tag elements (enum values)
        for (const value of enumDef.values) {
          await client.createDoc(
            actorId,
            "tags:class:TagElement",
            "tags:space:Tags",
            {
              label: value,
              description: "",
              category: catId,
              color: 0,
            }
          );
        }
        log(`  ✓ Created ${enumDef.values.length} values for ${enumDef.name}`);
      } catch (e) {
        log(`  ⚠ Failed to create enum ${enumDef.name}: ${e.message}`);
      }
    } else if (DRY_RUN) {
      dry(`createDoc tags:class:TagCategory label="${enumDef.name}" values=[${enumDef.values.join(", ")}]`);
    } else {
      log(`  ⚠ tags:class:TagCategory not available — enum ${enumDef.name} must be created manually in Huly`);
    }
  }

  // ── Create custom classes as tracker projects (workaround) ──

  log("\n── Creating custom class records (#2) ──");
  log("  Note: Huly SaaS does not expose a public API for creating custom class schemas.");
  log("  Creating representative tracker projects as proxies for each custom class.");
  log("  Full custom class support requires Huly self-hosted or SDK-level access.");

  const existingProjects = await safeFind(client, "tracker:class:Project");
  const existingProjectNames = existingProjects.map((p) => (p.name ?? "").toLowerCase());

  for (const cls of CUSTOM_CLASSES) {
    const proxyName = `[Schema] ${cls.name}`;
    if (existingProjectNames.includes(proxyName.toLowerCase())) {
      log(`  ✓ Schema proxy '${proxyName}' already exists`);
      continue;
    }

    log(`  Creating schema proxy project: ${proxyName}`);
    log(`    Fields: ${cls.fields.join(", ")}`);

    if (!DRY_RUN) {
      try {
        const id = await client.createDoc(
          actorId,
          "tracker:class:Project",
          "tracker:space:Project",
          {
            name: proxyName,
            identifier: cls.id.split(":").pop()?.slice(0, 6).toUpperCase() ?? "SCH",
            description: `Custom class schema: ${cls.name}\nFields: ${cls.fields.join(", ")}`,
            private: true,
            archived: false,
            members: [],
            owners: [],
          }
        );
        log(`  ✓ Created schema proxy → ${id}`);
      } catch (e) {
        log(`  ⚠ Failed: ${e.message}`);
      }
    } else {
      dry(`createDoc tracker:class:Project name="${proxyName}" (schema proxy for ${cls.id})`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────

  log("\n── Done ──");
  log("Enums created as tag categories in Huly (queryable via tags:class:TagCategory).");
  log("Custom classes created as schema proxy projects (full class API requires self-hosted Huly).");
  log("Add Rust query methods for each class once data is seeded manually in Huly.");
  if (DRY_RUN) log("DRY-RUN — no changes applied.");
}

main().catch((e) => {
  console.error("[enums-classes] Fatal:", e.message);
  process.exit(1);
});
