#!/usr/bin/env node
/**
 * meshy-image-to-3d.mjs
 *
 * Generates a glTF/GLB 3D mesh from a single reference image using
 * Meshy AI's image-to-3D pipeline. Used to produce elegant cortex
 * node assets from V3 mockup crops; see docs/cortex-3d-meshy-workflow.md.
 *
 * Usage:
 *   node scripts/meshy-image-to-3d.mjs <label> <image-source> <out-filename>
 *
 *   <image-source> may be either an https:// URL Meshy can fetch, OR a
 *   local path to a PNG/JPG which we'll upload as base64.
 *
 * Examples:
 *   node scripts/meshy-image-to-3d.mjs nucleus \
 *     design/assets/v3-command-cortex/02-mission-cortex-field.png \
 *     mission-nucleus.glb
 *
 *   node scripts/meshy-image-to-3d.mjs agent \
 *     https://example.com/agent-glyph.png \
 *     node-agent.glb
 *
 * Auth: reads MESHY_API_KEY from ~/.claude/.env. Override with
 *       MESHY_API_KEY env var if needed.
 *
 * Output: writes the GLB to src/assets/3d/<out-filename>.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ASSETS_OUT = path.join(REPO_ROOT, "src", "assets", "3d");
const ENDPOINT = "https://api.meshy.ai/openapi/v1/image-to-3d";

async function loadApiKey() {
  if (process.env.MESHY_API_KEY) return process.env.MESHY_API_KEY.trim();
  const envPath = path.join(os.homedir(), ".claude", ".env");
  let envText;
  try {
    envText = await fs.readFile(envPath, "utf8");
  } catch {
    throw new Error(
      "MESHY_API_KEY not set in env and ~/.claude/.env not readable. " +
        "Set MESHY_API_KEY=... or populate the .env file.",
    );
  }
  const m = envText.match(/^MESHY_API_KEY=([^\n#]+)/m);
  if (!m) throw new Error("MESHY_API_KEY not found in ~/.claude/.env");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

async function toImageRef(source) {
  if (/^https?:\/\//.test(source)) {
    return { kind: "url", value: source };
  }
  const abs = path.resolve(source);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
      ? "image/webp"
      : "application/octet-stream";
  const b64 = buf.toString("base64");
  return { kind: "dataUri", value: `data:${mime};base64,${b64}` };
}

async function submit(apiKey, imageRef, label) {
  const body = {
    image_url: imageRef.value,
    ai_model: "meshy-4",
    topology: "quad",
    target_polycount: 30000,
    should_remesh: true,
    should_texture: true,
    enable_pbr: true,
    symmetry_mode: "auto",
  };
  process.stdout.write(`[${label}] POST ${ENDPOINT} … `);
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    process.stdout.write("✗\n");
    throw new Error(`submit ${r.status}: ${text}`);
  }
  process.stdout.write("✓\n");
  const data = JSON.parse(text);
  const taskId = data.result || data.task_id || data.id;
  if (!taskId) throw new Error(`submit succeeded but no task id: ${text}`);
  return taskId;
}

function fmtPct(p) {
  if (p === undefined || p === null) return "  ?%";
  return `${String(Math.round(p)).padStart(3)}%`;
}

async function pollUntilDone(apiKey, taskId, label) {
  let last = "";
  for (;;) {
    const r = await fetch(`${ENDPOINT}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`poll ${r.status}: ${t}`);
    }
    const data = await r.json();
    const line = `[${label}] ${data.status.padEnd(12)} ${fmtPct(data.progress)}`;
    if (line !== last) {
      console.log(line);
      last = line;
    }
    if (data.status === "SUCCEEDED") return data;
    if (data.status === "FAILED" || data.status === "EXPIRED") {
      throw new Error(`task ${data.status}: ${JSON.stringify(data.task_error || data)}`);
    }
    await new Promise((res) => setTimeout(res, 6000));
  }
}

async function download(url, dest, label) {
  process.stdout.write(`[${label}] GET ${url.slice(0, 60)}… `);
  const r = await fetch(url);
  if (!r.ok) {
    process.stdout.write("✗\n");
    throw new Error(`download ${r.status}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  process.stdout.write(`✓ ${(buf.length / 1024).toFixed(0)} KB\n`);
}

async function main() {
  const [, , label, source, outFile] = process.argv;
  if (!label || !source || !outFile) {
    console.error("Usage: meshy-image-to-3d.mjs <label> <image-source> <out-filename>");
    console.error("");
    console.error("  <label>          short tag for log lines, e.g. 'agent'");
    console.error("  <image-source>   https:// URL OR local path to PNG/JPG/WEBP");
    console.error("  <out-filename>   target filename under src/assets/3d/");
    process.exit(1);
  }
  const apiKey = await loadApiKey();
  const imageRef = await toImageRef(source);
  const taskId = await submit(apiKey, imageRef, label);
  console.log(`[${label}] task_id=${taskId}`);
  const result = await pollUntilDone(apiKey, taskId, label);
  const glbUrl = result.model_urls?.glb;
  if (!glbUrl) {
    throw new Error(`succeeded but no GLB url: ${JSON.stringify(result.model_urls || result)}`);
  }
  const dest = path.join(ASSETS_OUT, outFile);
  await download(glbUrl, dest, label);
  console.log(`[${label}] done → ${path.relative(REPO_ROOT, dest)}`);
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
