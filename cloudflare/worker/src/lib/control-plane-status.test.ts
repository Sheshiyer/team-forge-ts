import { describe, expect, it } from "vitest";
import type { D1DatabaseLike, Env } from "./env";
import { getSyncConsumerStatus } from "./control-plane-status";
import worker from "../index";

function dbWithReceipt(receipt: Record<string, unknown> | null): D1DatabaseLike {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first<T>() {
          return receipt as T | null;
        },
        async run() {
          return { success: true };
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };
    },
  };
}

function boundEnv(receipt: Record<string, unknown> | null): Env {
  return {
    TF_ENV: "test",
    TEAMFORGE_DB: dbWithReceipt(receipt),
    SYNC_QUEUE: { async send() {} },
  };
}

const now = new Date("2026-07-28T10:00:00.000Z");

describe("sync consumer control-plane status", () => {
  it("reports a missing Queue binding as unavailable", async () => {
    expect(await getSyncConsumerStatus({ TF_ENV: "test" }, now)).toMatchObject({
      status: "unavailable",
      reason: "consumer_binding_missing",
    });
  });

  it("reports a bound consumer without a receipt as degraded", async () => {
    expect(await getSyncConsumerStatus(boundEnv(null), now)).toMatchObject({
      status: "degraded",
      reason: "consumer_receipt_missing",
    });
  });

  it("reports an expired receipt as stale", async () => {
    expect(await getSyncConsumerStatus(boundEnv({
      runtime_id: "runtime_1",
      last_status: "completed",
      updated_at: "2026-07-28T09:00:00.000Z",
    }), now)).toMatchObject({
      status: "stale",
      reason: "consumer_receipt_stale",
    });
  });

  it("reports a fresh completed receipt as healthy", async () => {
    expect(await getSyncConsumerStatus(boundEnv({
      runtime_id: "runtime_1",
      last_status: "completed",
      updated_at: "2026-07-28T09:59:00.000Z",
    }), now)).toMatchObject({
      status: "healthy",
      reason: null,
    });
  });

  it("reports a fresh failed receipt as degraded", async () => {
    expect(await getSyncConsumerStatus(boundEnv({
      runtime_id: "runtime_1",
      last_status: "failed",
      updated_at: "2026-07-28T09:59:00.000Z",
    }), now)).toMatchObject({
      status: "degraded",
      reason: "last_consumer_failed",
    });
  });

  it("does not let live route presence override missing consumer evidence", async () => {
    const response = await worker.fetch(
      new Request("https://forge.example/v1/bootstrap"),
      { TF_ENV: "test" },
    );
    const payload = await response.json() as {
      data: {
        routeStatus: { sync: string };
        controlPlaneStatus: { syncConsumer: { status: string } };
      };
    };

    expect(payload.data.routeStatus.sync).toBe("live");
    expect(payload.data.controlPlaneStatus.syncConsumer.status).toBe("unavailable");
  });
});
