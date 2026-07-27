import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONTEXT_PROJECTION_KEY,
  applyContextProjection,
  buildContextProjection,
  summarizeContextProjection,
} from "./lib/context-projection.mjs";

const base = {
  markdown: "# Daily Standup\nBounded evidence",
  generation: 7,
  generatedAt: "2026-07-28T10:00:00.000Z",
  validUntil: "2026-07-29T10:00:00.000Z",
  sourceRevision: "vault:abc123",
};

test("builds the frozen projection and hashes exact markdown bytes", () => {
  const projection = buildContextProjection(base);
  assert.equal(Buffer.byteLength(base.markdown, "utf8"), 32);
  assert.deepEqual(projection, {
    schemaVersion: "thoughtseed.context-projection.v1",
    key: CONTEXT_PROJECTION_KEY,
    tenant: "cambium",
    routine: "daily-standup-digest",
    generation: 7,
    generatedAt: "2026-07-28T10:00:00.000Z",
    validUntil: "2026-07-29T10:00:00.000Z",
    sourceRevision: "vault:abc123",
    digest: "sha256:7d696bb44566df0ffec55bce3a17117aa397f923f92e26b91c0695f9fc9fd8e4",
    markdown: base.markdown,
  });
});

test("digest changes when the exact markdown bytes change", () => {
  const lf = buildContextProjection(base);
  const crlf = buildContextProjection({ ...base, markdown: base.markdown.replace("\n", "\r\n") });
  assert.notEqual(lf.digest, crlf.digest);
});

test("rejects non-positive generations, invalid times, and expired projections", () => {
  assert.throws(() => buildContextProjection({ ...base, generation: 0 }), /generation/);
  assert.throws(() => buildContextProjection({ ...base, generatedAt: "today" }), /generatedAt/);
  assert.throws(() => buildContextProjection({ ...base, validUntil: base.generatedAt }), /validUntil/);
});

test("enforces source revision and 32 KiB UTF-8 markdown bounds", () => {
  assert.throws(() => buildContextProjection({ ...base, sourceRevision: "x".repeat(129) }), /sourceRevision/);
  assert.throws(() => buildContextProjection({ ...base, markdown: "💡".repeat(8_193) }), /markdown/);
});

test("dry-run summary excludes markdown and source revision", () => {
  const projection = buildContextProjection(base);
  assert.deepEqual(summarizeContextProjection(projection), {
    key: CONTEXT_PROJECTION_KEY,
    digest: projection.digest,
    generation: 7,
    generatedAt: base.generatedAt,
    validUntil: base.validUntil,
  });
});

test("apply requires named URL/token environment variables and never returns the token", async () => {
  const projection = buildContextProjection(base);
  const calls = [];
  const result = await applyContextProjection(projection, {
    apply: true,
    urlEnvName: "PROJECTION_URL",
    tokenEnvName: "PROJECTION_TOKEN",
    env: {
      PROJECTION_URL: "https://example.test/context",
      PROJECTION_TOKEN: "top-secret",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 202 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.test/context");
  assert.equal(calls[0].init.headers.authorization, "Bearer top-secret");
  assert.equal(result.applied, true);
  assert.equal(JSON.stringify(result).includes("top-secret"), false);

  await assert.rejects(
    applyContextProjection(projection, {
      apply: true,
      env: {},
      fetchImpl: async () => new Response(null, { status: 202 }),
    }),
    /environment variable names/,
  );
});

test("vault parity projection dry-run prints metadata only", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "teamforge-projection-"));
  try {
    const markdownPath = path.join(tempDir, "standup.md");
    await writeFile(markdownPath, base.markdown, "utf8");
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/teamforge-vault-parity.mjs"),
        "--context-projection",
        markdownPath,
        "--projection-generation",
        "7",
        "--projection-source-revision",
        "vault:abc123",
        "--projection-generated-at",
        base.generatedAt,
        "--projection-valid-until",
        base.validUntil,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      key: CONTEXT_PROJECTION_KEY,
      digest: "sha256:7d696bb44566df0ffec55bce3a17117aa397f923f92e26b91c0695f9fc9fd8e4",
      generation: 7,
      generatedAt: base.generatedAt,
      validUntil: base.validUntil,
    });
    assert.equal(result.stdout.includes(base.markdown), false);
    assert.equal(result.stdout.includes("vault:abc123"), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
