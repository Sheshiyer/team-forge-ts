import assert from "node:assert/strict";
import test from "node:test";

import {
  formatBytes,
  formatDownloadProgress,
  reduceDownloadProgress,
} from "../src/lib/updater.ts";

test("reduceDownloadProgress captures total size and downloaded bytes", () => {
  let state = reduceDownloadProgress(
    { downloadedBytes: 0, contentLength: null, finished: false },
    { event: "Started", data: { contentLength: 4096 } }
  );

  state = reduceDownloadProgress(state, {
    event: "Progress",
    data: { chunkLength: 1024 },
  });
  state = reduceDownloadProgress(state, {
    event: "Progress",
    data: { chunkLength: 2048 },
  });

  assert.deepEqual(state, {
    downloadedBytes: 3072,
    contentLength: 4096,
    finished: false,
  });
});

test("reduceDownloadProgress marks the transfer finished", () => {
  const state = reduceDownloadProgress(
    { downloadedBytes: 3072, contentLength: 4096, finished: false },
    { event: "Finished" }
  );

  assert.equal(state.finished, true);
});

test("formatDownloadProgress renders percentage when content length is known", () => {
  const label = formatDownloadProgress({
    downloadedBytes: 1536,
    contentLength: 3072,
    finished: false,
  });

  assert.equal(label, "1.5 KB / 3.0 KB (50%)");
});

test("formatBytes keeps large byte counts readable", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1572864), "1.5 MB");
});
