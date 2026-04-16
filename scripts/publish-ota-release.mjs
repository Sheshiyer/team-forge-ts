#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_ARTIFACT_BASE_URL = "https://artifacts.teamforge.app";
const DEFAULT_BUCKET = "teamforge-artifacts";
const DEFAULT_CHANNEL = "stable";
const DEFAULT_PUBLISH_URL = "https://teamforge-api.sheshnarayan-iyer.workers.dev/internal/releases/publish";
const DEFAULT_WRANGLER_CWD = "cloudflare/worker";

function log(message) {
  console.log(`[ota-release] ${message}`);
}

function fail(message) {
  console.error(`[ota-release] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      continue;
    }
    if (!token.startsWith("--")) {
      fail(`Unexpected argument '${token}'.`);
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function getRequired(args, name) {
  const value = args[name];
  if (!value || value === true) {
    fail(`--${name} is required.`);
  }
  return String(value);
}

function normalizeVersion(version) {
  return version.replace(/^v/, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function joinUrl(baseUrl, pathname) {
  return `${baseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
}

function inferContentType(filePath) {
  if (filePath.endsWith(".tar.gz")) return "application/gzip";
  if (filePath.endsWith(".sig")) return "text/plain";
  if (filePath.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
}

async function assertReadableFile(label, filePath) {
  const absolutePath = path.resolve(filePath);
  try {
    await access(absolutePath, fsConstants.R_OK);
  } catch (error) {
    fail(`${label} file is not readable: ${absolutePath} (${error.message})`);
  }
  return absolutePath;
}

async function readReleaseNotes(version, explicitPath) {
  if (explicitPath) {
    const releaseNotesPath = await assertReadableFile("release notes", explicitPath);
    return {
      content: (await readFile(releaseNotesPath, "utf8")).trim(),
      sourcePath: releaseNotesPath,
    };
  }

  const changelogPath = await assertReadableFile("changelog", "CHANGELOG.md");
  const changelog = await readFile(changelogPath, "utf8");
  const sectionPattern = new RegExp(
    `(^##\\s+v?${escapeRegExp(version)}(?:\\s+-.*)?\\s*$[\\s\\S]*?)(?=^##\\s+v?\\d|\\Z)`,
    "m",
  );
  const match = changelog.match(sectionPattern);

  if (match?.[1]?.trim()) {
    return {
      content: match[1].trim(),
      sourcePath: changelogPath,
    };
  }

  return {
    content: `## v${version}\n\nSee the GitHub release notes for full details.`,
    sourcePath: changelogPath,
  };
}

function runCommand(command, args, { cwd, dryRun = false } = {}) {
  if (dryRun) {
    log(`dry-run: ${[command, ...args].join(" ")}`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function uploadObject({ bucket, key, filePath, wranglerCwd, dryRun }) {
  const args = [
    "dlx",
    "wrangler",
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--file",
    filePath,
    "--content-type",
    inferContentType(filePath),
    "--remote",
  ];

  await runCommand("pnpm", args, { cwd: wranglerCwd, dryRun });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args["dry-run"]);
  const version = normalizeVersion(getRequired(args, "version"));
  const platform = getRequired(args, "platform");
  const arch = getRequired(args, "arch");
  const artifactPath = await assertReadableFile("artifact", getRequired(args, "artifact"));
  const signaturePath = await assertReadableFile("signature", getRequired(args, "signature"));
  const bucket = pickString(args.bucket, process.env.TEAMFORGE_R2_BUCKET, DEFAULT_BUCKET);
  const channel = pickString(args.channel, process.env.TF_DEFAULT_OTA_CHANNEL, DEFAULT_CHANNEL);
  const artifactBaseUrl = pickString(
    args["artifact-base-url"],
    process.env.TEAMFORGE_ARTIFACT_BASE_URL,
    DEFAULT_ARTIFACT_BASE_URL,
  );
  const publishUrl = pickString(args["publish-url"], process.env.TF_RELEASE_PUBLISH_URL, DEFAULT_PUBLISH_URL);
  const wranglerCwd = path.resolve(pickString(args["wrangler-cwd"], DEFAULT_WRANGLER_CWD));
  const pubDate = pickString(args["pub-date"], new Date().toISOString());
  const rolloutPercentage = Number(args["rollout-percentage"] ?? 100);

  if (!Number.isFinite(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) {
    fail("--rollout-percentage must be a number between 0 and 100.");
  }

  const publishToken = pickString(
    args["auth-token"],
    process.env.TF_WEBHOOK_HMAC_SECRET,
    process.env.TF_RELEASE_PUBLISH_TOKEN,
  );
  if (!dryRun && !publishToken) {
    fail("TF_WEBHOOK_HMAC_SECRET or --auth-token is required for the publish callback.");
  }

  const signature = (await readFile(signaturePath, "utf8")).trim();
  if (!signature) {
    fail(`Signature file is empty: ${signaturePath}`);
  }

  const releaseNotes = await readReleaseNotes(version, args["release-notes"]);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "teamforge-ota-release-"));
  const releaseNotesPath = path.join(tempDir, "release-notes.md");

  try {
    await writeFile(releaseNotesPath, `${releaseNotes.content.trim()}\n`, "utf8");

    const objectPrefix = path.posix.join("ota", "releases", version, `${platform}-${arch}`);
    const artifactKey = path.posix.join(objectPrefix, path.basename(artifactPath));
    const signatureKey = path.posix.join(objectPrefix, path.basename(signaturePath));
    const releaseNotesKey = path.posix.join(objectPrefix, "release-notes.md");
    const artifactUrl = joinUrl(artifactBaseUrl, artifactKey);

    log(`Preparing OTA release v${version} for ${platform}-${arch} on channel '${channel}'.`);
    log(`Artifact source: ${artifactPath}`);
    log(`Signature source: ${signaturePath}`);
    log(`Release notes source: ${releaseNotes.sourcePath}`);

    await uploadObject({ bucket, key: artifactKey, filePath: artifactPath, wranglerCwd, dryRun });
    await uploadObject({ bucket, key: signatureKey, filePath: signaturePath, wranglerCwd, dryRun });
    await uploadObject({ bucket, key: releaseNotesKey, filePath: releaseNotesPath, wranglerCwd, dryRun });

    const payload = {
      version,
      channel,
      platform,
      arch,
      artifact_url: artifactUrl,
      signature,
      release_notes: releaseNotes.content.trim(),
      pub_date: pubDate,
      rollout_percentage: rolloutPercentage,
    };

    if (dryRun) {
      log(`dry-run publish payload: ${JSON.stringify(payload, null, 2)}`);
      return;
    }

    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publishToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      fail(`Publish callback failed (${response.status}): ${body}`);
    }

    const result = await response.json();
    log(`Published OTA release successfully: ${JSON.stringify(result)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
