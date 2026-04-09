import type { D1DatabaseLike } from "./env";

export function nanoid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 21; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function now(): string {
  return new Date().toISOString();
}

export async function queryAll<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  const result = await (bound as unknown as { all(): Promise<{ results: T[] }> }).all();
  return result.results ?? [];
}

export async function queryFirst<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  return bound.first<T>();
}

export async function execute(
  db: D1DatabaseLike,
  sql: string,
  ...params: unknown[]
): Promise<void> {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  await (bound as unknown as { run(): Promise<void> }).run();
}
