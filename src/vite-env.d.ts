/// <reference types="vite/client" />

interface TauriUpdaterDownloadStartedEvent {
  event: "Started";
  data: { contentLength?: number };
}

interface TauriUpdaterDownloadProgressEvent {
  event: "Progress";
  data: { chunkLength: number };
}

interface TauriUpdaterDownloadFinishedEvent {
  event: "Finished";
}

type TauriUpdaterDownloadEvent =
  | TauriUpdaterDownloadStartedEvent
  | TauriUpdaterDownloadProgressEvent
  | TauriUpdaterDownloadFinishedEvent;

interface TauriUpdaterHandle {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall(
    onEvent?: (event: TauriUpdaterDownloadEvent) => void
  ): Promise<void>;
}

interface TauriUpdaterApi {
  check(): Promise<TauriUpdaterHandle | null>;
}

interface TauriProcessApi {
  relaunch(): Promise<void>;
}

interface TauriGlobalApi {
  updater?: TauriUpdaterApi;
  process?: TauriProcessApi;
}

interface Window {
  __TAURI__?: TauriGlobalApi;
}
