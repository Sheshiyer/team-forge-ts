import { createHash } from "node:crypto";

export const CONTEXT_PROJECTION_SCHEMA_VERSION =
  "thoughtseed.context-projection.v1";
export const CONTEXT_PROJECTION_KEY =
  "context/v1/daily-standup-digest/standups/latest.json";
export const CONTEXT_PROJECTION_TENANT = "cambium";
export const CONTEXT_PROJECTION_ROUTINE = "daily-standup-digest";

const MAX_MARKDOWN_BYTES = 32 * 1024;
const MAX_SOURCE_REVISION_BYTES = 128;

function utf8Bytes(value) {
  return Buffer.byteLength(value, "utf8");
}

function requireCanonicalTimestamp(value, fieldName) {
  if (
    typeof value !== "string"
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw new TypeError(`${fieldName} must be a canonical ISO-8601 timestamp.`);
  }
  return value;
}

export function buildContextProjection({
  markdown,
  generation,
  generatedAt,
  validUntil,
  sourceRevision,
}) {
  if (typeof markdown !== "string" || utf8Bytes(markdown) > MAX_MARKDOWN_BYTES) {
    throw new TypeError("markdown must be a string no larger than 32 KiB UTF-8.");
  }
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw new TypeError("generation must be a positive safe integer.");
  }
  const normalizedGeneratedAt = requireCanonicalTimestamp(generatedAt, "generatedAt");
  const normalizedValidUntil = requireCanonicalTimestamp(validUntil, "validUntil");
  if (Date.parse(normalizedValidUntil) <= Date.parse(normalizedGeneratedAt)) {
    throw new TypeError("validUntil must be later than generatedAt.");
  }
  if (
    typeof sourceRevision !== "string"
    || sourceRevision.length === 0
    || utf8Bytes(sourceRevision) > MAX_SOURCE_REVISION_BYTES
  ) {
    throw new TypeError("sourceRevision must contain 1-128 UTF-8 bytes.");
  }

  // Do not normalize line endings, trim, or otherwise mutate markdown. The
  // digest is defined over its exact UTF-8 bytes.
  const contentDigest = `sha256:${createHash("sha256").update(
    Buffer.from(markdown, "utf8"),
  ).digest("hex")}`;
  return {
    schema: CONTEXT_PROJECTION_SCHEMA_VERSION,
    key: CONTEXT_PROJECTION_KEY,
    tenantId: CONTEXT_PROJECTION_TENANT,
    routine: CONTEXT_PROJECTION_ROUTINE,
    generation,
    generatedAt: normalizedGeneratedAt,
    validUntil: normalizedValidUntil,
    sourceRevision,
    contentDigest,
    markdown,
  };
}

export function summarizeContextProjection(projection) {
  return {
    key: projection.key,
    contentDigest: projection.contentDigest,
    generation: projection.generation,
    generatedAt: projection.generatedAt,
    validUntil: projection.validUntil,
  };
}

export async function applyContextProjection(
  projection,
  {
    apply = false,
    urlEnvName,
    tokenEnvName,
    env = process.env,
    fetchImpl = fetch,
  } = {},
) {
  const summary = summarizeContextProjection(projection);
  if (!apply) return summary;
  if (!urlEnvName || !tokenEnvName) {
    throw new TypeError(
      "Explicit URL and token environment variable names are required for --apply.",
    );
  }
  const urlValue = env[urlEnvName];
  const tokenValue = env[tokenEnvName];
  if (!urlValue || !tokenValue) {
    throw new TypeError("The named projection URL and token environment variables must be set.");
  }
  const url = new URL(urlValue);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new TypeError("The projection URL must use HTTP or HTTPS.");
  }
  const response = await fetchImpl(url.href, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenValue}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(projection),
  });
  if (!response.ok) {
    throw new Error(`Projection POST failed with HTTP ${response.status}.`);
  }
  return {
    ...summary,
    applied: true,
    status: response.status,
  };
}
