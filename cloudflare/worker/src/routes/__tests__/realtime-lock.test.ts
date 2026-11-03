import { describe, it, expect } from "vitest";
import { WorkspaceLock } from "../../index";
import type { DurableObjectStorageLike, Env } from "../../lib/env";

describe("realtime durable lock", () => {
  it("retains ownership across object recreation and ignores foreign releases", async () => {
    const values = new Map<string, unknown>();
    const storage: DurableObjectStorageLike = {
      async get<T>(key: string) { return values.get(key) as T | undefined; },
      async put(key, value) { values.set(key, value); },
      async delete(key) { return values.delete(key); },
      async transaction(callback) { return callback(storage); },
    };
    const request = (path: string, owner: string) => new Request(`https://lock/${path}`, {method: "POST", body: JSON.stringify({key: "project:realtime:workspace", owner})});
    const first = new WorkspaceLock({storage}, {TF_ENV: "test"} as Env);
    expect((await first.fetch(request("acquire", "one"))).status).toBe(200);
    const recreated = new WorkspaceLock({storage}, {TF_ENV: "test"} as Env);
    expect((await recreated.fetch(request("acquire", "two"))).status).toBe(409);
    await recreated.fetch(request("release", "two"));
    expect((await recreated.fetch(request("acquire", "two"))).status).toBe(409);
    await recreated.fetch(request("release", "one"));
    expect((await recreated.fetch(request("acquire", "two"))).status).toBe(200);
  });
});
