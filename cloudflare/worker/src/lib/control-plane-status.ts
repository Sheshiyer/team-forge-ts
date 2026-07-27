import type { Env } from "./env";

export const SYNC_CONSUMER_RECEIPT_MAX_AGE_MS = 15 * 60 * 1_000;

type ConsumerStatus = "unavailable" | "degraded" | "stale" | "healthy";

interface RuntimeReceiptRow {
  runtime_id: string;
  last_message_id: string | null;
  last_job_id: string | null;
  last_status: "completed" | "failed" | "rejected";
  last_consumed_at: string;
  last_terminal_at: string;
  updated_at: string;
}

export interface SyncConsumerStatus {
  status: ConsumerStatus;
  reason:
    | "consumer_binding_missing"
    | "consumer_receipt_missing"
    | "consumer_receipt_stale"
    | "last_consumer_failed"
    | "last_consumer_rejected"
    | null;
  runtimeId: string | null;
  lastStatus: RuntimeReceiptRow["last_status"] | null;
  lastConsumedAt: string | null;
  lastTerminalAt: string | null;
  updatedAt: string | null;
}

function status(
  value: ConsumerStatus,
  reason: SyncConsumerStatus["reason"],
  receipt: RuntimeReceiptRow | null = null,
): SyncConsumerStatus {
  return {
    status: value,
    reason,
    runtimeId: receipt?.runtime_id ?? null,
    lastStatus: receipt?.last_status ?? null,
    lastConsumedAt: receipt?.last_consumed_at ?? null,
    lastTerminalAt: receipt?.last_terminal_at ?? null,
    updatedAt: receipt?.updated_at ?? null,
  };
}

export async function getSyncConsumerStatus(
  env: Env,
  at: Date = new Date(),
): Promise<SyncConsumerStatus> {
  if (!env.SYNC_QUEUE) {
    return status("unavailable", "consumer_binding_missing");
  }
  if (!env.TEAMFORGE_DB) {
    return status("degraded", "consumer_receipt_missing");
  }

  let receipt: RuntimeReceiptRow | null;
  try {
    receipt = await env.TEAMFORGE_DB.prepare(
      `SELECT runtime_id, last_message_id, last_job_id, last_status,
              last_consumed_at, last_terminal_at, updated_at
       FROM sync_runtime_receipts
       ORDER BY updated_at DESC
       LIMIT 1`,
    ).bind().first<RuntimeReceiptRow>();
  } catch {
    return status("degraded", "consumer_receipt_missing");
  }
  if (!receipt) {
    return status("degraded", "consumer_receipt_missing");
  }

  const updatedAt = Date.parse(receipt.updated_at);
  if (
    !Number.isFinite(updatedAt)
    || at.getTime() - updatedAt > SYNC_CONSUMER_RECEIPT_MAX_AGE_MS
  ) {
    return status("stale", "consumer_receipt_stale", receipt);
  }
  if (receipt.last_status === "failed") {
    return status("degraded", "last_consumer_failed", receipt);
  }
  if (receipt.last_status === "rejected") {
    return status("degraded", "last_consumer_rejected", receipt);
  }
  return status("healthy", null, receipt);
}
