import type { Env } from "./env";

export const SYNC_CONSUMER_RECEIPT_MAX_AGE_MS = 15 * 60 * 1_000;
export const SYNC_CONSUMER_RECEIPT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

type ConsumerStatus = "unavailable" | "degraded" | "stale" | "healthy";

interface RuntimeReceiptRow {
  schema_version: string;
  runtime_id: string;
  last_message_id: string;
  last_job_id: string;
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
    | "consumer_receipt_invalid"
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

function isBoundedIdentity(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.trim() === value
    && new TextEncoder().encode(value).byteLength <= 256;
}

function parseCanonicalTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString() !== value
  ) {
    return null;
  }
  return timestamp;
}

function validateReceipt(
  receipt: RuntimeReceiptRow,
  at: Date,
): { valid: true; updatedAt: number } | { valid: false } {
  if (
    receipt.schema_version !== "teamforge.sync-runtime-receipt.v1"
    || !isBoundedIdentity(receipt.runtime_id)
    || !isBoundedIdentity(receipt.last_message_id)
    || !isBoundedIdentity(receipt.last_job_id)
    || !["completed", "failed", "rejected"].includes(receipt.last_status)
  ) {
    return { valid: false };
  }
  const consumedAt = parseCanonicalTimestamp(receipt.last_consumed_at);
  const terminalAt = parseCanonicalTimestamp(receipt.last_terminal_at);
  const updatedAt = parseCanonicalTimestamp(receipt.updated_at);
  if (
    consumedAt === null
    || terminalAt === null
    || updatedAt === null
    || consumedAt > terminalAt
    || terminalAt > updatedAt
    || updatedAt > at.getTime() + SYNC_CONSUMER_RECEIPT_MAX_FUTURE_SKEW_MS
  ) {
    return { valid: false };
  }
  return { valid: true, updatedAt };
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
      `SELECT schema_version, runtime_id, last_message_id, last_job_id, last_status,
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

  const validation = validateReceipt(receipt, at);
  if (!validation.valid) {
    return status("degraded", "consumer_receipt_invalid", receipt);
  }
  const { updatedAt } = validation;
  if (
    at.getTime() - updatedAt > SYNC_CONSUMER_RECEIPT_MAX_AGE_MS
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
