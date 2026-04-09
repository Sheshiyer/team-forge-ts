#!/usr/bin/env node
/**
 * P0 — Issue #3: Create 4 Tag Hierarchies
 *
 *   1. [PROJECT_TYPE] — Smart Home, Energy Management, Web Dev, Mobile App, R&D, VR/AR, Internal
 *   2. [CLIENT]       — Axtech, Tuya-ClientA, Tuya-ClientB, Ad-Hoc-Web, Internal
 *   3. [TECH_STACK]   — Frontend, Backend, Smart Home, AI/ML sub-tags
 *   4. [PHASE]        — Discovery, Design, Development, Testing, Deployment, Maintenance
 *
 * Usage:
 *   HULY_TOKEN=<jwt> node scripts/p0-tag-hierarchies.mjs [--dry-run]
 */

import { HulyClient } from "./huly-client.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.HULY_TOKEN;

if (!TOKEN) {
  console.error("Error: HULY_TOKEN env var is required.");
  process.exit(1);
}

function log(msg) { console.log(`[tags] ${msg}`); }
function dry(msg) { console.log(`[DRY-RUN] ${msg}`); }

const TAG_HIERARCHIES = [
  {
    category: "[PROJECT_TYPE]",
    description: "Project type classification — every task gets exactly ONE",
    targetClass: "tracker:class:Issue",
    tags: [
      "Smart Home",
      "Energy Management",
      "Web Dev",
      "Mobile App",
      "R&D",
      "VR/AR",
      "AI/ML",
      "Internal",
    ],
  },
  {
    category: "[CLIENT]",
    description: "Client assignment — every task gets exactly ONE (or Internal)",
    targetClass: "tracker:class:Issue",
    tags: [
      "Axtech",
      "Tuya-ClientA",
      "Tuya-ClientB",
      "Ad-Hoc-Web",
      "Internal",
    ],
  },
  {
    category: "[TECH_STACK]",
    description: "Technology stack — tasks can have MULTIPLE",
    targetClass: "tracker:class:Issue",
    tags: [
      // Frontend
      "React", "Vue", "Flutter",
      // Backend
      "Node.js", "Python", "Firebase",
      // Smart Home
      "Tuya SDK", "MQTT", "Zigbee",
      // AI/ML
      "OpenAI", "TensorFlow",
    ],
  },
  {
    category: "[PHASE]",
    description: "Work phase — tasks get exactly ONE",
    targetClass: "tracker:class:Issue",
    tags: [
      "Discovery",
      "Design",
      "Development",
      "Testing",
      "Deployment",
      "Maintenance",
    ],
  },
];

async function safeFind(client, cls, query = {}) {
  try {
    return await client.findAll(cls, query);
  } catch {
    return [];
  }
}

async function main() {
  log(`Connecting... (dry-run=${DRY_RUN})`);
  const client = await HulyClient.connect(TOKEN);
  const account = await client.getAccountInfo();
  const actorId = account.primarySocialId ?? account.uuid ?? "system";
  log(`Actor: ${actorId}`);

  // Check tag API availability
  const existingCategories = await safeFind(client, "tags:class:TagCategory");
  const tagApiAvailable = existingCategories !== null;
  log(`Tag API available: ${tagApiAvailable} (${existingCategories.length} existing categories)`);

  const existingCatLabels = existingCategories.map((c) => (c.label ?? "").toLowerCase());

  for (const hierarchy of TAG_HIERARCHIES) {
    log(`\n── ${hierarchy.category} ──`);

    if (existingCatLabels.includes(hierarchy.category.toLowerCase())) {
      log(`  ✓ Category already exists`);
      continue;
    }

    log(`  Creating category: ${hierarchy.category} (${hierarchy.tags.length} tags)`);

    if (!DRY_RUN && tagApiAvailable) {
      try {
        const catId = await client.createDoc(
          actorId,
          "tags:class:TagCategory",
          "tags:space:Tags",
          {
            label: hierarchy.category,
            description: hierarchy.description,
            targetClass: hierarchy.targetClass,
            default: false,
          }
        );
        log(`  ✓ Created category → ${catId}`);

        for (const tag of hierarchy.tags) {
          await client.createDoc(
            actorId,
            "tags:class:TagElement",
            "tags:space:Tags",
            {
              label: tag,
              description: "",
              category: catId,
              color: 0,
            }
          );
        }
        log(`  ✓ Created ${hierarchy.tags.length} tags: ${hierarchy.tags.join(", ")}`);
      } catch (e) {
        log(`  ⚠ Failed: ${e.message}`);
        log(`  → Create manually in Huly: Settings > Tags > New Category`);
      }
    } else if (DRY_RUN) {
      dry(`createDoc tags:class:TagCategory label="${hierarchy.category}"`);
      for (const tag of hierarchy.tags) {
        dry(`  createDoc tags:class:TagElement label="${tag}"`);
      }
    } else {
      log(`  ⚠ Tag API not available — create manually in Huly`);
      log(`  Tags: ${hierarchy.tags.join(", ")}`);
    }
  }

  log("\n── Tag hierarchy creation complete ──");
  if (DRY_RUN) log("DRY-RUN — no changes applied.");
}

main().catch((e) => {
  console.error("[tags] Fatal:", e.message);
  process.exit(1);
});
