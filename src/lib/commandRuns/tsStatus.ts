export interface TsStatusSnapshot {
  summary?: {
    overall?: string;
    message?: string;
  };
  service?: {
    name?: string;
    phase?: string;
    environment?: string;
    default_ota_channel?: string;
  };
  bindings?: {
    d1_available?: boolean;
    schema_ready?: boolean;
    artifacts_bound?: boolean;
    sync_queue_bound?: boolean;
    workspace_locks_bound?: boolean;
  };
  routes?: {
    bootstrap?: string;
    projects?: string;
    handoffs?: string;
    time_entries?: string;
    whoami?: string;
  };
  auth_gates?: {
    whoami?: string;
    commands_intent?: string;
  };
  telegram_summary?: string;
}

export function parseTsStatusSnapshot(raw: string | null): TsStatusSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as TsStatusSnapshot;
  } catch {
    return null;
  }
}

export function extractTsStatusFounderSummary(raw: string | null): string | null {
  const snapshot = parseTsStatusSnapshot(raw);
  const summary = snapshot?.telegram_summary?.trim();
  return summary ? summary : null;
}
