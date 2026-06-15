import type { D1DatabaseLike } from "../env";

export interface MockDbHandle {
  db: D1DatabaseLike;
  runs: Map<string, Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

/**
 * In-memory D1 stub for command-pipeline tests.
 *
 * Dispatches on SQL substring — supports the three statements emitted by
 * lib/commands/runs.ts and a single SELECT for getRunById. Keep it lean;
 * production routes should never see this.
 */
export function makeMockDb(): MockDbHandle {
  const runs = new Map<string, Record<string, unknown>>();
  const events: Array<Record<string, unknown>> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO command_runs")) {
                const [
                  id,
                  command_id,
                  actor_id,
                  actor_kind,
                  auth_mode,
                  target_kind,
                  target_id,
                  correlation_id,
                  requested_at,
                ] = args as [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string | null,
                  string | null,
                  string,
                  number,
                ];
                runs.set(id, {
                  id,
                  command_id,
                  actor_id,
                  actor_kind,
                  auth_mode,
                  state: "created",
                  target_kind,
                  target_id,
                  correlation_id,
                  requested_at,
                  accepted_at: null,
                  completed_at: null,
                  result_json: null,
                  error_code: null,
                  error_message: null,
                });
                return { success: true };
              }
              if (sql.includes("INSERT INTO command_audit_events")) {
                events.push({
                  id: args[0],
                  run_id: args[1],
                  kind: args[2],
                  actor_id: args[3],
                  actor_kind: args[4],
                  payload_json: args[5],
                  occurred_at: args[6],
                });
                return { success: true };
              }
              if (sql.includes("UPDATE command_runs")) {
                const id = args[args.length - 1] as string;
                const r = runs.get(id);
                if (r) {
                  r.state = args[0];
                  if (args[1] !== null && args[1] !== undefined) r.accepted_at = args[1];
                  if (args[2] !== null && args[2] !== undefined) r.completed_at = args[2];
                }
                return { success: true };
              }
              return { success: true };
            },
            async first<T = Record<string, unknown>>(): Promise<T | null> {
              if (sql.includes("SELECT") && sql.includes("command_runs") && sql.includes("WHERE id")) {
                return (runs.get(args[0] as string) as T) ?? null;
              }
              return null;
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as D1DatabaseLike, runs, events };
}
