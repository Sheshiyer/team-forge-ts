#!/usr/bin/env node
/**
 * generate-cortex-glyphs.mjs
 *
 * Generate the 9 Mission Cortex node-glyph reference images via the
 * codex-gpt-image skill at ~/.agents/skills/codex-gpt-image. Uses Codex
 * OAuth (gpt-image-2), NOT OPENAI_API_KEY. These clean isolated square
 * images replace the rough crops from mockup 03 and become the Meshy AI
 * image-to-3D inputs in the next stage.
 *
 * Each prompt is written as a game-engineer thinks about a glyph: form
 * (silhouette), material (line / glow / particle treatment), lighting
 * (rim, internal core, halo), motion intent (static / pulsing /
 * rotating), palette (V3 tokens), framing (1:1, centered, isolated, void).
 *
 * Usage:
 *   node scripts/generate-cortex-glyphs.mjs            # generate all 9
 *   node scripts/generate-cortex-glyphs.mjs agent      # generate just one
 *   node scripts/generate-cortex-glyphs.mjs --dry      # print prompts only
 *   node scripts/generate-cortex-glyphs.mjs --quality medium   # cheaper
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "design/assets/v3-command-cortex/glyphs");
const CLI = "/Users/sheshnarayaniyer/.agents/skills/codex-gpt-image/scripts/codex_gpt_image.py";

/* ---- Shared style prefix --------------------------------------------------
 * Everything below describes the SHARED aesthetic across all 9 specimens.
 * Each per-glyph prompt then names the form-specific intent. */
const STYLE_PREFIX = `
Tactical biological neural-tissue specimen illustration. Single subject,
centered on a pure deep-black void background (#02060a). Holographic data
visualization aesthetic — thin engineered glowing line work, dense
particle stipple accenting the form, sharp high contrast, no labels, no
text, no captions, no UI chrome, no rulers, no measurement marks. The
subject reads as a luminous specimen plate seen under a tactical
microscope. 1:1 aspect ratio. Square composition. Subject fills 70% of
the frame, centered. Bloomberg Terminal × scientific archive aesthetic.
`.replace(/\s+/g, " ").trim();

/* ---- 9 per-glyph specifications ------------------------------------------ */
const GLYPHS = [
  {
    kind: "mission",
    intent: "the focal singularity from which all paths emerge",
    prompt: `Mission nucleus glyph. A radiant compact spherical core
      surrounded by dozens of fine radiating spike-rays of varied length
      emanating outward in all directions — like a microscopic sea-urchin
      cross-section or a tactical sunburst. Inner geometric crystalline
      structure faintly visible through the surface. Cool cyan emissive
      core (#18d7ff #9ff0ff). One ring of brighter intersection points
      at mid-radius where the spikes cross a concentric guide circle.`,
  },
  {
    kind: "client",
    intent: "orbital cluster of clients in gravitational relation",
    prompt: `Client cluster glyph. One slightly larger glowing primary
      node ringed by 5-6 smaller satellite nodes orbiting at varied
      distances. Thin curving filament lines connect the satellites to
      the primary like gravitational tethers. The arrangement is loose,
      asymmetric, organic. Cool emerald emissive nodes (#39ff88).
      Faint outer-orbit hint ring guides at the periphery.`,
  },
  {
    kind: "project",
    intent: "a branching fork for initiatives and execution scopes",
    prompt: `Project branch glyph. A vertical trunk filament rising and
      forking into three diverging branches at the top, each branch
      ending in a small luminous node. Suggestive of a Y-fork or stylised
      tree of execution paths. Mid-section has subtle accent stipple
      dots along the trunk. Cool cyan emissive (#18d7ff) with faint
      emerald accents at the branch tips.`,
  },
  {
    kind: "agent",
    intent: "radiating intelligence pulse and signal node",
    prompt: `AI agent pulse glyph. A circular core ringed by an EKG-style
      heartbeat trace flowing along the perimeter, with several sharp
      waveform peaks regularly spaced around the ring. From the core,
      6 short signal-spikes radiate outward beyond the EKG ring. Bright
      central spot. Cool cyan emissive (#18d7ff) with subtle emerald
      highlights on the wave peaks.`,
  },
  {
    kind: "human",
    intent: "organic grounding — human judgment and context anchor",
    prompt: `Human anchor glyph. Eight curved organic tendrils flowing
      outward and downward from a central node like a stylised octopus
      or sea-anemone. Each tendril tapers and ends in a small luminous
      bulb. The curves are smooth, biological, not radial-symmetric —
      they sway. Cool cyan emissive (#18d7ff) with subtle emerald
      tendril tips.`,
  },
  {
    kind: "issue",
    intent: "an irritated node — attention required, risk and friction",
    prompt: `Issue inflammation node glyph. A jagged angular star-burst
      form with sharp uneven pointed rays radiating outward like an
      inflamed cell or shattered crystal. Inner core is bright; outer
      rays carry a few accent stipple dots. Asymmetric, agitated
      silhouette. Hot rose-magenta emissive core (#ff2f7a) with a few
      amber-orange accent points (#ffb02e).`,
  },
  {
    kind: "memory",
    intent: "a layered memory capsule — sedimented context for future recall",
    prompt: `Knowledge memory deposit glyph. Three concentric elliptical
      bands stacked at slight angular offsets, like layered geological
      sediment rings viewed from a tilted three-quarter angle. The
      innermost band glows brightest, the outer bands fade. A small
      central deposit sphere. Cool graphite-grey (#83918c) with the
      innermost band tinted emerald (#39ff88).`,
  },
  {
    kind: "approval",
    intent: "a gated synaptic junction — passage requires alignment and consent",
    prompt: `Approval synapse gate glyph. Two bulb-like nodes connected
      by a narrow synaptic cleft in the middle, forming an hourglass
      silhouette. Directional flow indicators (subtle small arrows or
      pulse dots) move from one bulb across the gap to the other.
      Faint guide ring around the gate. Warm amber emissive (#ffb02e)
      with cooler cyan accents at the gate centre.`,
  },
  {
    kind: "routine",
    intent: "a cyclical loop with heartbeat pulses — sustained rhythm",
    prompt: `Routine pulse loop glyph. A perfect circle with an EKG
      heartbeat trace flowing continuously along its inner edge,
      forming a closed loop. A few accent peak points along the trace.
      Central marker dot. Suggestive of a closed cycle that beats on a
      sustained rhythm. Cool cyan emissive (#18d7ff) with a single
      emerald accent at the cycle origin.`,
  },
];

function buildPrompt(spec) {
  return `${STYLE_PREFIX}\n\n[Subject: ${spec.intent}]\n\n${spec.prompt.replace(/\s+/g, " ").trim()}`;
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b) => (stdout += b.toString()));
    proc.stderr.on("data", (b) => {
      const s = b.toString();
      stderr += s;
      process.stderr.write(s);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`codex_gpt_image.py exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function generateOne(spec, opts) {
  const prompt = buildPrompt(spec);
  const dest = path.join(OUT_DIR, `${spec.kind}.png`);
  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`\n[${spec.kind}] generating via codex-gpt-image (size=${opts.size} q=${opts.quality})…`);
  const t0 = Date.now();
  await runCli([
    "generate",
    "--prompt", prompt,
    "--size", opts.size,
    "--quality", opts.quality,
    "--output-format", "png",
    "--out", dest,
  ]);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const stat = await fs.stat(dest);
  console.log(`[${spec.kind}] saved ${path.relative(REPO_ROOT, dest)} (${(stat.size / 1024).toFixed(0)} KB · ${dt}s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const qualityArgIdx = args.indexOf("--quality");
  const quality = qualityArgIdx >= 0 ? args[qualityArgIdx + 1] : "high";
  const sizeArgIdx = args.indexOf("--size");
  const size = sizeArgIdx >= 0 ? args[sizeArgIdx + 1] : "1024x1024";
  const only = args.filter((a) => !a.startsWith("--") && a !== quality && a !== size);

  const targets = only.length > 0 ? GLYPHS.filter((g) => only.includes(g.kind)) : GLYPHS;
  if (targets.length === 0) {
    console.error(`No matching glyphs. Available: ${GLYPHS.map((g) => g.kind).join(", ")}`);
    process.exit(1);
  }

  if (dryRun) {
    for (const spec of targets) {
      console.log("\n========================================");
      console.log(`KIND: ${spec.kind}`);
      console.log(`INTENT: ${spec.intent}`);
      console.log(`--- PROMPT ---`);
      console.log(buildPrompt(spec));
    }
    return;
  }

  console.log(`Generating ${targets.length} glyph(s) via codex-gpt-image (Codex OAuth, no OPENAI_API_KEY)…`);
  for (const spec of targets) {
    try {
      await generateOne(spec, { quality, size });
    } catch (e) {
      console.error(`[${spec.kind}] ERROR: ${e.message}`);
    }
  }
  console.log(`\nDone. ${targets.length} glyph(s) written → ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
