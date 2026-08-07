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
      const statementFor = (args: unknown[]) => ({
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
                if (!r) {
                  return { success: true };
                }
                // Existing transitionRun shape: SET state = ?, accepted_at = COALESCE(accepted_at, ?), completed_at = COALESCE(completed_at, ?) WHERE id = ?
                if (sql.includes("SET state = ?, accepted_at") && !sql.includes("result_json")) {
                  r.state = args[0];
                  if (args[1] !== null && args[1] !== undefined) r.accepted_at = args[1];
                  if (args[2] !== null && args[2] !== undefined) r.completed_at = args[2];
                  return { success: true };
                }
                // Phase 2 result-recording shape: SET result_json = ?, error_code = ?, error_message = ?, state = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?
                if (sql.includes("result_json")) {
                  r.result_json = args[0];
                  r.error_code = args[1];
                  r.error_message = args[2];
                  r.state = args[3];
                  if (args[4] !== null && args[4] !== undefined) r.completed_at = args[4];
                  return { success: true };
                }
                throw new Error(`mock-d1: unhandled UPDATE shape: ${sql.substring(0, 100)}`);
              }
              throw new Error(`mock-d1: unhandled SQL: ${sql.substring(0, 80)}`);
            },
            async first<T = Record<string, unknown>>(): Promise<T | null> {
              if (sql.includes("sqlite_master") && sql.includes("schema_ready")) {
                return { schema_ready: 0 } as T;
              }
              if (sql.includes("SELECT") && sql.includes("command_runs") && sql.includes("WHERE id")) {
                return (runs.get(args[0] as string) as T) ?? null;
              }
              if (sql.includes("SELECT") && sql.includes("command_runs") && sql.includes("WHERE correlation_id")) {
                const cid = args[0] as string;
                const matches = Array.from(runs.values())
                  .filter((r) => r.correlation_id === cid)
                  .sort((a, b) => (b.requested_at as number) - (a.requested_at as number));
                return (matches[0] as T) ?? null;
              }
              return null;
            },
            async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
              // Phase B: listRunsByState — SELECT * FROM command_runs WHERE state = ? [AND command_id IN (...)] ORDER BY requested_at ASC LIMIT ?
              if (sql.includes("SELECT") && sql.includes("command_runs") && sql.includes("WHERE state")) {
                const state = args[0] as string;
                const limit = (args.filter((a) => typeof a === "number").pop() as number | undefined) ?? 50;
                let commandIdFilter: Set<string> | null = null;
                if (sql.includes("command_id IN")) {
                  // args layout: state, ...commandIds, limit
                  const middleArgs = args.slice(1, -1).filter((a) => typeof a === "string") as string[];
                  commandIdFilter = new Set(middleArgs);
                }
                const matches = Array.from(runs.values())
                  .filter((r) => r.state === state)
                  .filter((r) => (commandIdFilter ? commandIdFilter.has(r.command_id as string) : true))
                  .sort((a, b) => (a.requested_at as number) - (b.requested_at as number))
                  .slice(0, limit);
                return { results: matches as T[] };
              }
              if (sql.includes("SELECT") && sql.includes("command_audit_events") && sql.includes("WHERE run_id")) {
                const runId = args[0] as string;
                const limit = (args.filter((a) => typeof a === "number").pop() as number | undefined) ?? 50;
                const matches = events
                  .filter((event) => event.run_id === runId)
                  .sort((a, b) => (a.occurred_at as number) - (b.occurred_at as number))
                  .slice(0, limit);
                return { results: matches as T[] };
              }
              return { results: [] };
            },
          });
      return {
        bind(...args: unknown[]) {
          return statementFor(args);
        },
        run() {
          return statementFor([]).run();
        },
        first<T = Record<string, unknown>>() {
          return statementFor([]).first<T>();
        },
        all<T = Record<string, unknown>>() {
          return statementFor([]).all<T>();
        },
      };
    },
  };
  return { db: db as unknown as D1DatabaseLike, runs, events };
}
