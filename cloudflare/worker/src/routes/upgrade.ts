/**
 * Static file server for OTA update manifests and artifacts.
 *
 * Serves files from the plexus-updates R2 bucket via the PLEXUS_UPDATES binding.
 * Route: plexus-upgrade.thoughtseed.space/*
 *
 * No authentication required — these are public update files.
 */

import type { Env } from "../lib/env";
import { jsonError } from "../lib/response";

const CONTENT_TYPES: Record<string, string> = {
  ".yml": "application/yaml",
  ".yaml": "application/yaml",
  ".json": "application/json",
  ".zip": "application/zip",
  ".dmg": "application/x-apple-diskimage",
  ".blockmap": "application/json",
};

const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";
const CACHE_CONTROL_MANIFEST = "public, max-age=60, must-revalidate";

export async function handleUpgradeFile(env: Env, url: URL): Promise<Response> {
  if (!env.PLEXUS_UPDATES) {
    return jsonError(
      {
        code: "service_unavailable",
        message: "R2 bucket PLEXUS_UPDATES is not bound.",
        retryable: true,
      },
      503,
    );
  }

  // The URL path maps directly to the R2 key.
  // e.g., /plexus/latest-mac.yml → plexus/latest-mac.yml
  const key = decodeURIComponent(url.pathname).replace(/^\//, "");

  // Prevent directory traversal
  if (key.includes("..") || key.includes("\0")) {
    return jsonError(
      {
        code: "invalid_path",
        message: "Invalid file path.",
        retryable: false,
      },
      400,
    );
  }

  const object = await env.PLEXUS_UPDATES.get(key);

  if (!object) {
    return jsonError(
      {
        code: "not_found",
        message: `File not found: ${key}`,
        retryable: false,
      },
      404,
    );
  }

  // Determine content type from file extension
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  // Apply appropriate cache control
  const isManifest = key.endsWith("latest-mac.yml");
  const cacheControl = isManifest ? CACHE_CONTROL_MANIFEST : CACHE_CONTROL_IMMUTABLE;

  const headers: Record<string, string> = {
    "content-type": contentType,
    "cache-control": cacheControl,
    "x-rtc": "0",
  };

  // Forward ETags / content length
  const etag = object.httpEtag;
  if (etag) {
    headers["etag"] = etag;
  }

  const contentLength = object.contentLength;
  if (contentLength) {
    headers["content-length"] = String(contentLength);
  }

  return new Response(object.body, { status: 200, headers });
}
