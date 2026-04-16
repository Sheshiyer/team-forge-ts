import type { Env } from "./env";

export interface ProjectLockHandle {
  key: string;
  owner: string;
  release(): Promise<void>;
}

export async function acquireProjectLock(
  env: Env,
  projectId: string,
  owner: string,
  ttlMs = 30_000,
): Promise<ProjectLockHandle> {
  if (!env.WORKSPACE_LOCKS) {
    return {
      key: `project:${projectId}`,
      owner,
      async release() {
        // noop when Durable Objects are unavailable
      },
    };
  }

  const key = `project:${projectId}`;
  const id = env.WORKSPACE_LOCKS.idFromName(key);
  const stub = env.WORKSPACE_LOCKS.get(id);
  const response = await stub.fetch("https://workspace-lock/acquire", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, owner, ttlMs }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as
      | { error?: { message?: string } }
      | null;
    throw new Error(payload?.error?.message ?? `Failed to acquire lock for ${projectId}.`);
  }

  return {
    key,
    owner,
    async release() {
      await stub.fetch("https://workspace-lock/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, owner }),
      });
    },
  };
}
