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
    onEvent?: (event: UpdaterDownloadEvent) => void
  ): Promise<void>;
}

interface TauriUpdaterApi {
  check(): Promise<TauriUpdateHandle | null>;
}

interface TauriProcessApi {
  relaunch(): Promise<void>;
}

function tauriWindow() {
  if (typeof window === "undefined") return null;
  return window.__TAURI__ ?? null;
}

function updaterApi(): TauriUpdaterApi | null {
  return tauriWindow()?.updater ?? null;
}

function processApi(): TauriProcessApi | null {
  return tauriWindow()?.process ?? null;
}

export function isUpdaterSupported(): boolean {
  return typeof updaterApi()?.check === "function";
}

export function isRelaunchSupported(): boolean {
  return typeof processApi()?.relaunch === "function";
}

export async function checkForUpdate(): Promise<TauriUpdateHandle | null> {
  const updater = updaterApi();
  if (!updater) {
    throw new Error(
      "Updater API unavailable. Run the packaged TeamForge app to use OTA updates."
    );
  }

  return updater.check();
}

export async function relaunchForInstall(): Promise<void> {
  const process = processApi();
  if (!process) {
    throw new Error(
      "Relaunch API unavailable. Restart TeamForge manually to finish installing the update."
    );
  }

  await process.relaunch();
}

export function reduceDownloadProgress(
  state: DownloadProgressState,
  event: UpdaterDownloadEvent
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

export function formatDownloadProgress(
  state: DownloadProgressState
): string {
  if (state.contentLength && state.contentLength > 0) {
    const percent = Math.min(
      100,
      Math.round((state.downloadedBytes / state.contentLength) * 100)
    );
    return `${formatBytes(state.downloadedBytes)} / ${formatBytes(
      state.contentLength
    )} (${percent}%)`;
  }

  return state.finished
    ? `${formatBytes(state.downloadedBytes)} downloaded`
    : `${formatBytes(state.downloadedBytes)} downloaded`;
}
