/**
 * Updater bridge — wraps the Tauri v2 updater + process plugins so the
 * rest of the app can talk to a small, stable interface. Before v0.3.4
 * this file was using the Tauri v1-style `window.__TAURI__.updater`
 * access which doesn't exist in v2 — meaning the Settings page UI was
 * built but unreachable. Switching to the proper plugin imports is what
 * actually wires OTA checks into the app.
 */
import { check as tauriCheck, type Update } from "@tauri-apps/plugin-updater";
import { relaunch as tauriRelaunch } from "@tauri-apps/plugin-process";

export type UpdaterDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export interface DownloadProgressState {
  downloadedBytes: number;
  contentLength: number | null;
  finished: boolean;
}

export interface TauriUpdateHandle {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall(
    onEvent?: (event: UpdaterDownloadEvent) => void,
  ): Promise<void>;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isUpdaterSupported(): boolean {
  // Plugin imports are tree-shakable, but at runtime the IPC bridge only
  // exists inside the Tauri webview. Browser preview returns false so the
  // UI knows to disable update controls.
  return isTauriRuntime();
}

export function isRelaunchSupported(): boolean {
  return isTauriRuntime();
}

function wrap(update: Update): TauriUpdateHandle {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    body: update.body,
    async downloadAndInstall(onEvent) {
      // The plugin's event shape matches what we re-export — pass through.
      await update.downloadAndInstall((evt) => {
        onEvent?.(evt as UpdaterDownloadEvent);
      });
    },
  };
}

export async function checkForUpdate(): Promise<TauriUpdateHandle | null> {
  if (!isTauriRuntime()) {
    throw new Error(
      "Updater API unavailable. Open the packaged TeamForge app to use OTA updates.",
    );
  }
  const update = await tauriCheck();
  return update ? wrap(update) : null;
}

export async function relaunchForInstall(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error(
      "Relaunch API unavailable. Restart TeamForge manually to finish installing the update.",
    );
  }
  await tauriRelaunch();
}

export function reduceDownloadProgress(
  state: DownloadProgressState,
  event: UpdaterDownloadEvent,
): DownloadProgressState {
  switch (event.event) {
    case "Started":
      return {
        ...state,
        contentLength: event.data.contentLength ?? null,
        finished: false,
      };
    case "Progress":
      return {
        ...state,
        downloadedBytes: state.downloadedBytes + event.data.chunkLength,
      };
    case "Finished":
      return {
        ...state,
        finished: true,
      };
    default:
      return state;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDownloadProgress(state: DownloadProgressState): string {
  if (state.contentLength && state.contentLength > 0) {
    const percent = Math.min(
      100,
      Math.round((state.downloadedBytes / state.contentLength) * 100),
    );
    return `${formatBytes(state.downloadedBytes)} / ${formatBytes(
      state.contentLength,
    )} (${percent}%)`;
  }

  return state.finished
    ? `${formatBytes(state.downloadedBytes)} downloaded`
    : `${formatBytes(state.downloadedBytes)} downloaded`;
}
