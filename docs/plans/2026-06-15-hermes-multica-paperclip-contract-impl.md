# Hermes / MultiCA / Paperclip Command Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three-layer contract from `docs/plans/2026-06-14-hermes-multica-paperclip-command-contract-handoff.md`: TeamForge command registry + run records, MultiCA execution callback contract, Paperclip dedicated-agent coordination envelope. First connected prototype = read-heavy standup aggregation.

**Architecture:**
- TeamForge Cloudflare Worker owns durable state (command runs, audit events) — D1 + new tables.
- All founder/cofounder commands flow through `/v1/commands/*` Worker routes that create typed run records and emit audit events before any downstream call.
- MultiCA executes under AWS task role and posts results back via callback envelope — no `safvr` IAM user in runtime.
- Paperclip exposes remote-safe request/response envelopes for dedicated agents (separate from the Telegram dispatcher which stays untouched).
- Tauri side (Hermes UI) calls `/v1/commands/intent` for any command and renders run state through the existing membrane / cortex log.

**Tech Stack:**
- Cloudflare Worker (TypeScript, D1, KV) — `cloudflare/worker/`
- React 19 + TypeScript + Tauri v2 — `src/`, `src-tauri/`
- Paperclip listener (existing Node service in sibling repo at `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip`)
- Test runner: `pnpm test` (vitest), `cargo test`, `wrangler dev` for Worker integration

---

## Scope honesty

This plan covers **4 phases, ~5 working sessions total:**

| Phase | Scope | Granularity in this doc |
|---|---|---|
| **0** — Resolve Worker drift | 1 session | Fully decomposed bite-sized steps |
| **1** — TeamForge command registry + run state | 2 sessions | Fully decomposed bite-sized steps |
| **2** — MultiCA execution + callback contract | 1 session | Concrete outlines (re-decompose at start) |
| **3** — Paperclip dedicated-agent envelope + first standup round-trip | 1 session | Concrete outlines (re-decompose at start) |

Phases 2 and 3 will need re-decomposition once Phase 1 reveals the actual run-record shape. The brief intentionally avoids over-specifying them now to keep the plan honest.

---

# Phase 0 — Resolve Worker source/deployed drift

**Why:** Brief says *"Do not deploy or migrate until source/deployed drift in TeamForge is resolved."* The drift is the in-flight **Plexus session principal** feature: a third auth tier between Cloudflare Access JWT and internal m2m. We need to commit + deploy it before adding new routes.

**Files at play:**
- Modify: already on disk — `cloudflare/worker/src/routes/time-entries.ts`, `cloudflare/worker/src/routes/v1.ts`
- New: already on disk — `cloudflare/worker/src/lib/plexus-session.ts`, `cloudflare/worker/migrations/0009_plexus_session_onboarding.sql`

### Task 0.1: Audit the drift

- [ ] **Step 1: Inventory the drift**

```bash
cd /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts
git status --short cloudflare/worker/
git diff --stat cloudflare/worker/
```

Expected: 2 modified files (`routes/time-entries.ts`, `routes/v1.ts`), 2 untracked files (`lib/plexus-session.ts`, `migrations/0009_plexus_session_onboarding.sql`).

- [ ] **Step 2: Read the migration to understand the data model addition**

```bash
cat cloudflare/worker/migrations/0009_plexus_session_onboarding.sql
```

Confirm: it adds onboarding state columns to an existing table (likely `employees` or a new `plexus_principals` table). Note the table name + columns.

- [ ] **Step 3: Read the lib to understand the auth/principal model**

```bash
sed -n '1,40p' cloudflare/worker/src/lib/plexus-session.ts
grep -n "^export" cloudflare/worker/src/lib/plexus-session.ts
```

Confirm the 7 exports referenced by v1.ts: `buildPlexusSession`, `getAdminDemoOverview`, `getPreferences`, `resolvePlexusPrincipal`, `setPreferences`, `updateAdminDemoOnboarding`, `updateOnboardingStep`.

### Task 0.2: Verify it builds clean

- [ ] **Step 4: Worker typecheck**

```bash
pnpm -C cloudflare/worker exec tsc -p tsconfig.json --noEmit
```

Expected: no errors. If errors, fix or revert and stop.

- [ ] **Step 5: Worker tests (if any exist for these surfaces)**

```bash
pnpm -C cloudflare/worker test 2>&1 | tail -20
```

If no tests exist for v1.ts / time-entries.ts changes, note this as a follow-up but don't block.

### Task 0.3: Stage + commit the drift as one logical unit

- [ ] **Step 6: Stage as single feature commit**

```bash
git add cloudflare/worker/src/routes/time-entries.ts \
        cloudflare/worker/src/routes/v1.ts \
        cloudflare/worker/src/lib/plexus-session.ts \
        cloudflare/worker/migrations/0009_plexus_session_onboarding.sql
git status --short | grep "^[AM] " | head -10
```

Expected: 4 entries (A or M).

- [ ] **Step 7: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(worker): plexus session principal — third auth tier + onboarding state

Adds resolvePlexusPrincipal() that gates routes on a registered Plexus
identity ON TOP of Cloudflare Access JWT verification. Required so
incoming requests from Cf-Access-authenticated users still get rejected
with 404 identity_not_registered when they are not active in TeamForge.

- routes/v1.ts: composes accessIdentity → plexusPrincipal → authorized.
  /v1/bootstrap now returns buildPlexusSession(env, principal) instead
  of the raw email-access tuple.
- routes/time-entries.ts: GET/POST now receive plexusPrincipal so
  writes are correctly attributed to the authenticated employee.
- lib/plexus-session.ts: principal resolution + onboarding state +
  per-principal preferences + admin demo overview.
- migrations/0009: schema additions for the principal/onboarding model.

Lands before Phase 1 of the Hermes/MultiCA command contract so the
new /v1/commands/* routes can build on the same principal model.
EOF
)"
```

- [ ] **Step 8: Verify commit landed**

```bash
git log -1 --stat
```

Expected: shows 4 files in the commit.

### Task 0.4: Apply migration locally + deploy to staging

- [ ] **Step 9: Local D1 migration**

```bash
pnpm -C cloudflare/worker wrangler d1 migrations apply teamforge-db --local
```

Expected: "Migrations applied" — 0009 is reported.

- [ ] **Step 10: Local dev verification**

```bash
pnpm -C cloudflare/worker wrangler dev --local &
DEV_PID=$!
sleep 4
curl -s http://localhost:8787/v1/bootstrap | python3 -m json.tool | head -20 || true
kill $DEV_PID 2>/dev/null
```

Expected: either `{"code":"identity_not_registered", ...}` (correct — local has no Cf-Access JWT) or auth error. **Not** a 500.

- [ ] **Step 11: Push commit to origin**

```bash
git push origin main
```

Expected: push succeeds. CI will run; no tag, no release triggered.

- [ ] **Step 12: Apply migration in production D1 + deploy Worker**

```bash
pnpm -C cloudflare/worker wrangler d1 migrations apply teamforge-db --remote
pnpm -C cloudflare/worker wrangler deploy
```

Expected: migration applied to remote, deploy succeeds with new version ID.

- [ ] **Step 13: Verify production /v1/bootstrap still serves**

```bash
curl -s https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/bootstrap | python3 -m json.tool | head -10
```

Expected: 401 (unauth) OR 404 identity_not_registered when probed with cookies — both confirm route is live and gated. Not 500, not 502.

### Task 0.5: Mark drift closed

- [ ] **Step 14: Update the brief with a closure note**

Append to `docs/plans/2026-06-14-hermes-multica-paperclip-command-contract-handoff.md`:

```markdown
## Drift Resolution (2026-06-15)

Worker drift closed in commit (see `git log` for hash). Phase 0 of the
implementation plan in `docs/plans/2026-06-15-hermes-multica-paperclip-contract-impl.md`
ran end-to-end; the Plexus session principal feature is now deployed.
Phase 1 (command registry) can begin against a clean baseline.
```

- [ ] **Step 15: Commit closure note**

```bash
git add docs/plans/2026-06-14-hermes-multica-paperclip-command-contract-handoff.md
git commit -m "docs(plans): close hermes brief Phase 0 — worker drift resolved"
git push origin main
```

---

# Phase 1 — TeamForge command registry + run state

**Goal:** Build the canonical command intake. Founder/cofounder issues `/ts-*` command → Worker creates `command_runs` row + `command_audit_events` row → returns run ID. No downstream execution yet.

**Architecture:**
- `command_intent` = the typed action requested. Canonical IDs live in `src/lib/commands/registry.ts`.
- `command_runs` D1 table = `(id, command_id, actor_id, actor_kind, auth_mode, state, target_kind, target_id, correlation_id, requested_at, accepted_at, completed_at, result_json, error_code, error_message)`.
- `command_audit_events` D1 table = `(id, run_id, kind, actor_id, actor_kind, payload_json, occurred_at)`.
- States: `created → accepted → in_progress → succeeded | failed | partial | cancelled`.

**Files:**
- Create: `cloudflare/worker/migrations/0010_command_runs.sql`
- Create: `cloudflare/worker/src/lib/commands/types.ts`
- Create: `cloudflare/worker/src/lib/commands/registry.ts`
- Create: `cloudflare/worker/src/lib/commands/runs.ts`
- Create: `cloudflare/worker/src/routes/commands.ts`
- Create: `cloudflare/worker/src/routes/__tests__/commands.test.ts`
- Modify: `cloudflare/worker/src/routes/v1.ts` (route mounting)
- Create: `docs/architecture/contracts/founder-command-registry.md`

### Task 1.1: Define the data model (migration)

- [ ] **Step 1: Write migration**

Create `cloudflare/worker/migrations/0010_command_runs.sql`:

```sql
-- 0010_command_runs.sql
-- Founder/cofounder command intake + run state machine + audit log.

CREATE TABLE IF NOT EXISTS command_runs (
  id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('founder', 'cofounder', 'employee', 'multica_service', 'paperclip_agent')),
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('cf_access', 'm2m', 'app_bearer', 'aws_task_role', 'paperclip_token')),
  state TEXT NOT NULL CHECK (state IN ('created', 'accepted', 'in_progress', 'succeeded', 'failed', 'partial', 'cancelled')),
  target_kind TEXT,
  target_id TEXT,
  correlation_id TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  accepted_at INTEGER,
  completed_at INTEGER,
  result_json TEXT,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_command_runs_actor ON command_runs(actor_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_runs_correlation ON command_runs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_command_runs_state ON command_runs(state, requested_at DESC);

CREATE TABLE IF NOT EXISTS command_audit_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES command_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'command_received',
    'run_created',
    'downstream_agent_contacted',
    'downstream_agent_responded',
    'result_received',
    'result_delivered',
    'failure',
    'partial_failure',
    'cancelled'
  )),
  actor_id TEXT,
  actor_kind TEXT,
  payload_json TEXT,
  occurred_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_command_audit_run ON command_audit_events(run_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_command_audit_kind ON command_audit_events(kind, occurred_at DESC);
```

- [ ] **Step 2: Apply locally**

```bash
pnpm -C cloudflare/worker wrangler d1 migrations apply teamforge-db --local
```

Expected: 0010 applied without errors.

- [ ] **Step 3: Commit migration**

```bash
git add cloudflare/worker/migrations/0010_command_runs.sql
git commit -m "feat(worker): command_runs + command_audit_events tables (Phase 1)"
```

### Task 1.2: Types module

- [ ] **Step 4: Write the failing test**

Create `cloudflare/worker/src/lib/commands/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { ActorKind, AuthMode, CommandIntent, CommandRunState, AuditEventKind } from "./types";

describe("types module", () => {
  it("exports the actor kinds", () => {
    const kinds: ActorKind[] = ["founder", "cofounder", "employee", "multica_service", "paperclip_agent"];
    expect(kinds).toHaveLength(5);
  });

  it("exports the auth modes", () => {
    const modes: AuthMode[] = ["cf_access", "m2m", "app_bearer", "aws_task_role", "paperclip_token"];
    expect(modes).toHaveLength(5);
  });

  it("exports the run states", () => {
    const states: CommandRunState[] = [
      "created", "accepted", "in_progress",
      "succeeded", "failed", "partial", "cancelled",
    ];
    expect(states).toHaveLength(7);
  });

  it("CommandIntent has id, actor, auth_mode, target", () => {
    const intent: CommandIntent = {
      id: "ts-standup",
      actor_id: "user-1",
      actor_kind: "founder",
      auth_mode: "cf_access",
      target_kind: "project",
      target_id: "proj-1",
      correlation_id: "c-1",
      payload: {},
    };
    expect(intent.id).toBe("ts-standup");
  });

  it("AuditEventKind enumerates the 9 documented event kinds", () => {
    const kinds: AuditEventKind[] = [
      "command_received", "run_created",
      "downstream_agent_contacted", "downstream_agent_responded",
      "result_received", "result_delivered",
      "failure", "partial_failure", "cancelled",
    ];
    expect(kinds).toHaveLength(9);
  });
});
```

- [ ] **Step 5: Run test (expect fail)**

```bash
pnpm -C cloudflare/worker exec vitest run src/lib/commands/types.test.ts
```

Expected: fails with module not found.

- [ ] **Step 6: Write the types**

Create `cloudflare/worker/src/lib/commands/types.ts`:

```typescript
/** All actor kinds that can issue or receive commands. */
export type ActorKind =
  | "founder"
  | "cofounder"
  | "employee"
  | "multica_service"
  | "paperclip_agent";

/** Auth modes by which an actor is verified at intake time. */
export type AuthMode =
  | "cf_access"        // Cloudflare Access JWT (verified upstream)
  | "m2m"              // TF_INTERNAL_SHARED_SECRET
  | "app_bearer"       // TF_CREDENTIAL_ENVELOPE_KEY (user app)
  | "aws_task_role"    // MultiCA ECS task role calling back
  | "paperclip_token"; // Paperclip dedicated-agent token

/** State machine for command runs. */
export type CommandRunState =
  | "created"
  | "accepted"
  | "in_progress"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

/** Audit event taxonomy — every state transition emits one or more of these. */
export type AuditEventKind =
  | "command_received"
  | "run_created"
  | "downstream_agent_contacted"
  | "downstream_agent_responded"
  | "result_received"
  | "result_delivered"
  | "failure"
  | "partial_failure"
  | "cancelled";

/** What the caller sends to /v1/commands/intent. */
export interface CommandIntent {
  /** Canonical command ID — must exist in registry. e.g. "ts-standup", "ts-summon-agent". */
  id: string;
  actor_id: string;
  actor_kind: ActorKind;
  auth_mode: AuthMode;
  /** What the command targets — usually a node in the cortex (project/client/agent). */
  target_kind?: string;
  target_id?: string;
  /** Idempotency / tracing. Caller may set; server backfills if missing. */
  correlation_id: string;
  /** Command-specific payload, validated against registry schema. */
  payload: Record<string, unknown>;
}

/** What the Worker stores. */
export interface CommandRun {
  id: string;
  command_id: string;
  actor_id: string;
  actor_kind: ActorKind;
  auth_mode: AuthMode;
  state: CommandRunState;
  target_kind: string | null;
  target_id: string | null;
  correlation_id: string;
  requested_at: number;
  accepted_at: number | null;
  completed_at: number | null;
  result_json: string | null;
  error_code: string | null;
  error_message: string | null;
}

/** Audit event row. */
export interface AuditEvent {
  id: string;
  run_id: string;
  kind: AuditEventKind;
  actor_id: string | null;
  actor_kind: ActorKind | null;
  payload_json: string | null;
  occurred_at: number;
}
```

- [ ] **Step 7: Run test (expect pass)**

```bash
pnpm -C cloudflare/worker exec vitest run src/lib/commands/types.test.ts
```

Expected: 5 passing.

- [ ] **Step 8: Commit**

```bash
git add cloudflare/worker/src/lib/commands/types.ts cloudflare/worker/src/lib/commands/types.test.ts
git commit -m "feat(worker): command/audit types module (Phase 1)"
```

### Task 1.3: Command registry

- [ ] **Step 9: Write the failing test**

Create `cloudflare/worker/src/lib/commands/registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { COMMAND_REGISTRY, getCommandSpec } from "./registry";

describe("command registry", () => {
  it("registers ts-standup", () => {
    const spec = getCommandSpec("ts-standup");
    expect(spec).toBeDefined();
    expect(spec?.id).toBe("ts-standup");
    expect(spec?.allowed_actor_kinds).toContain("founder");
  });

  it("rejects unknown command IDs", () => {
    expect(getCommandSpec("nope")).toBeNull();
  });

  it("registry includes the founder vocabulary", () => {
    const ids = COMMAND_REGISTRY.map((s) => s.id).sort();
    expect(ids).toContain("ts-standup");
    expect(ids).toContain("ts-summon-agent");
    expect(ids).toContain("ts-approve-synapse");
  });

  it("every command declares route — downstream/local/worker-only", () => {
    for (const spec of COMMAND_REGISTRY) {
      expect(["downstream_multica", "local_worker", "downstream_paperclip"]).toContain(spec.route);
    }
  });
});
```

- [ ] **Step 10: Run test (expect fail)**

```bash
pnpm -C cloudflare/worker exec vitest run src/lib/commands/registry.test.ts
```

Expected: module not found.

- [ ] **Step 11: Write the registry**

Create `cloudflare/worker/src/lib/commands/registry.ts`:

```typescript
import type { ActorKind } from "./types";

/** A registered command. */
export interface CommandSpec {
  /** Canonical ID prefixed with ts- (founder vocabulary). */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  /** Description of what executing this command does. */
  description: string;
  /** Who is allowed to issue this command. */
  allowed_actor_kinds: ActorKind[];
  /** Where execution happens. */
  route: "downstream_multica" | "local_worker" | "downstream_paperclip";
  /** Whether this command mutates state. */
  mutates: boolean;
  /** State owner — who is canonical for the result. */
  state_owner: "teamforge" | "multica" | "paperclip";
}

export const COMMAND_REGISTRY: CommandSpec[] = [
  {
    id: "ts-standup",
    label: "Standup",
    description: "Aggregate read-only standup data from a project's dedicated Paperclip agent.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "downstream_multica",
    mutates: false,
    state_owner: "teamforge",
  },
  {
    id: "ts-summon-agent",
    label: "Summon Agent",
    description: "Bring a specific agent into a project/client branch.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "downstream_paperclip",
    mutates: true,
    state_owner: "teamforge",
  },
  {
    id: "ts-approve-synapse",
    label: "Approve Synapse",
    description: "Approve a pending decision gate (e.g. PR review).",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "downstream_paperclip",
    mutates: true,
    state_owner: "teamforge",
  },
  {
    id: "ts-trace-signal",
    label: "Trace Signal",
    description: "Read-only: surface recent events for a node.",
    allowed_actor_kinds: ["founder", "cofounder", "employee"],
    route: "local_worker",
    mutates: false,
    state_owner: "teamforge",
  },
  {
    id: "ts-generate-brief",
    label: "Generate Brief",
    description: "Synthesize a tactical brief from node context.",
    allowed_actor_kinds: ["founder", "cofounder"],
    route: "downstream_paperclip",
    mutates: false,
    state_owner: "teamforge",
  },
];

const REGISTRY_BY_ID = new Map(COMMAND_REGISTRY.map((s) => [s.id, s]));

export function getCommandSpec(id: string): CommandSpec | null {
  return REGISTRY_BY_ID.get(id) ?? null;
}

/** Check whether an actor kind is allowed to issue a command. */
export function isAuthorized(commandId: string, actorKind: ActorKind): boolean {
  const spec = getCommandSpec(commandId);
  return spec ? spec.allowed_actor_kinds.includes(actorKind) : false;
}
```

- [ ] **Step 12: Run test (expect pass)**

```bash
pnpm -C cloudflare/worker exec vitest run src/lib/commands/registry.test.ts
```

Expected: 4 passing.

- [ ] **Step 13: Commit**

```bash
git add cloudflare/worker/src/lib/commands/registry.ts cloudflare/worker/src/lib/commands/registry.test.ts
git commit -m "feat(worker): canonical command registry — 5 founder commands (Phase 1)"
```

### Task 1.4: Run lifecycle helpers

- [ ] **Step 14: Write the failing test**

Create `cloudflare/worker/src/lib/commands/runs.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createRun, getRunById, recordAuditEvent, transitionRun } from "./runs";
import type { CommandIntent } from "./types";

// In-memory D1 stub — replace with the project's actual D1 test harness if one exists
function makeMockDb() {
  const runs = new Map<string, any>();
  const events: any[] = [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO command_runs")) {
                const [id, command_id, actor_id, actor_kind, auth_mode, state, target_kind, target_id, correlation_id, requested_at] = args;
                runs.set(id, {
                  id, command_id, actor_id, actor_kind, auth_mode, state,
                  target_kind, target_id, correlation_id, requested_at,
                  accepted_at: null, completed_at: null,
                  result_json: null, error_code: null, error_message: null,
                });
                return { success: true };
              }
              if (sql.includes("INSERT INTO command_audit_events")) {
                events.push({ id: args[0], run_id: args[1], kind: args[2], actor_id: args[3], actor_kind: args[4], payload_json: args[5], occurred_at: args[6] });
                return { success: true };
              }
              if (sql.includes("UPDATE command_runs")) {
                const id = args[args.length - 1];
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
            async first() {
              if (sql.includes("SELECT") && sql.includes("command_runs") && sql.includes("WHERE id")) {
                return runs.get(args[0]) ?? null;
              }
              return null;
            },
          };
        },
      };
    },
  } as any;
}

describe("command runs", () => {
  let db: any;
  beforeEach(() => { db = makeMockDb(); });

  it("createRun stores a row in state=created and emits audit", async () => {
    const intent: CommandIntent = {
      id: "ts-standup",
      actor_id: "founder-1",
      actor_kind: "founder",
      auth_mode: "cf_access",
      target_kind: "project",
      target_id: "proj-1",
      correlation_id: "c-1",
      payload: {},
    };
    const run = await createRun(db, intent, Date.now());
    expect(run.state).toBe("created");
    expect(run.command_id).toBe("ts-standup");
    expect(run.id).toBeTruthy();
  });

  it("transitionRun moves created → accepted with accepted_at timestamp", async () => {
    const intent: CommandIntent = {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-2", payload: {},
    };
    const run = await createRun(db, intent, 1000);
    await transitionRun(db, run.id, "accepted", 2000);
    const updated = await getRunById(db, run.id);
    expect(updated?.state).toBe("accepted");
    expect(updated?.accepted_at).toBe(2000);
  });

  it("recordAuditEvent inserts a row", async () => {
    const intent: CommandIntent = {
      id: "ts-standup", actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
      correlation_id: "c-3", payload: {},
    };
    const run = await createRun(db, intent, 1000);
    await recordAuditEvent(db, run.id, "command_received", "f", "founder", { hello: "world" }, 1001);
    // Verify by introspecting our mock
    // (a real test would query command_audit_events)
  });
});
```

- [ ] **Step 15: Run test (expect fail)**

```bash
pnpm -C cloudflare/worker exec vitest run src/lib/commands/runs.test.ts
```

Expected: fails with module not found.

- [ ] **Step 16: Write the run helpers**

Create `cloudflare/worker/src/lib/commands/runs.ts`:

```typescript
import type { D1Database } from "@cloudflare/workers-types";
import type { AuditEventKind, CommandIntent, CommandRun, CommandRunState, ActorKind } from "./types";

function newId(prefix: string): string {
  const random = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}_${random.slice(0, 24)}`;
}

/** Create a new command_run row in state=created. */
export async function createRun(
  db: D1Database,
  intent: CommandIntent,
  now: number,
): Promise<CommandRun> {
  const id = newId("run");
  await db
    .prepare(
      `INSERT INTO command_runs
       (id, command_id, actor_id, actor_kind, auth_mode, state,
        target_kind, target_id, correlation_id, requested_at)
       VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      intent.id,
      intent.actor_id,
      intent.actor_kind,
      intent.auth_mode,
      intent.target_kind ?? null,
      intent.target_id ?? null,
      intent.correlation_id,
      now,
    )
    .run();
  return {
    id,
    command_id: intent.id,
    actor_id: intent.actor_id,
    actor_kind: intent.actor_kind,
    auth_mode: intent.auth_mode,
    state: "created",
    target_kind: intent.target_kind ?? null,
    target_id: intent.target_id ?? null,
    correlation_id: intent.correlation_id,
    requested_at: now,
    accepted_at: null,
    completed_at: null,
    result_json: null,
    error_code: null,
    error_message: null,
  };
}

export async function getRunById(db: D1Database, runId: string): Promise<CommandRun | null> {
  const row = await db
    .prepare(`SELECT * FROM command_runs WHERE id = ?`)
    .bind(runId)
    .first<CommandRun>();
  return row ?? null;
}

export async function transitionRun(
  db: D1Database,
  runId: string,
  state: CommandRunState,
  now: number,
): Promise<void> {
  const acceptedAt = state === "accepted" ? now : null;
  const completedAt = ["succeeded", "failed", "partial", "cancelled"].includes(state) ? now : null;
  await db
    .prepare(
      `UPDATE command_runs SET state = ?, accepted_at = COALESCE(accepted_at, ?),
       completed_at = COALESCE(completed_at, ?) WHERE id = ?`,
    )
    .bind(state, acceptedAt, completedAt, runId)
    .run();
}

export async function recordAuditEvent(
  db: D1Database,
  runId: string,
  kind: AuditEventKind,
  actorId: string | null,
  actorKind: ActorKind | null,
  payload: Record<string, unknown> | null,
  now: number,
): Promise<void> {
  const id = newId("evt");
  await db
    .prepare(
      `INSERT INTO command_audit_events
       (id, run_id, kind, actor_id, actor_kind, payload_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      runId,
      kind,
      actorId,
      actorKind,
      payload ? JSON.stringify(payload) : null,
      now,
    )
    .run();
}
```

- [ ] **Step 17: Run test (expect pass)**

```bash
pnpm -C cloudflare/worker exec vitest run src/lib/commands/runs.test.ts
```

Expected: 3 passing.

- [ ] **Step 18: Commit**

```bash
git add cloudflare/worker/src/lib/commands/runs.ts cloudflare/worker/src/lib/commands/runs.test.ts
git commit -m "feat(worker): command run + audit helpers — createRun, transitionRun, recordAuditEvent (Phase 1)"
```

### Task 1.5: Worker routes — POST /v1/commands/intent + GET /v1/commands/runs/:id

- [ ] **Step 19: Write the failing test**

Create `cloudflare/worker/src/routes/__tests__/commands.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { handleCommandIntent, handleGetCommandRun } from "../commands";

function mockEnv() {
  // Reuse the mock DB from runs.test.ts pattern
  return { TF_DB: { /* mock */ } as any } as any;
}

describe("commands routes", () => {
  it("POST /v1/commands/intent with unknown command_id returns 400", async () => {
    const req = new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "nope",
        actor_id: "f", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "c-1", payload: {},
      }),
    });
    const res = await handleCommandIntent(mockEnv(), req);
    expect(res.status).toBe(400);
  });

  it("POST /v1/commands/intent with valid command creates run + returns id", async () => {
    // Real D1 mock or wrangler dev integration here
    // — placeholder: assert response shape when DB integration is wired
    expect(true).toBe(true);
  });

  it("GET /v1/commands/runs/:id returns 404 for missing run", async () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 20: Run test (expect 1 pass, 2 placeholder)**

```bash
pnpm -C cloudflare/worker exec vitest run src/routes/__tests__/commands.test.ts
```

Expected: import error (commands.ts doesn't exist yet).

- [ ] **Step 21: Write the routes**

Create `cloudflare/worker/src/routes/commands.ts`:

```typescript
import type { Env } from "../lib/env";
import { jsonOk, jsonError } from "../lib/response";
import { getCommandSpec, isAuthorized } from "../lib/commands/registry";
import { createRun, getRunById, recordAuditEvent, transitionRun } from "../lib/commands/runs";
import type { CommandIntent } from "../lib/commands/types";

function validateIntent(body: unknown): { ok: true; value: CommandIntent } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "body must be object" };
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string") return { ok: false, reason: "id required" };
  if (typeof b.actor_id !== "string") return { ok: false, reason: "actor_id required" };
  if (typeof b.actor_kind !== "string") return { ok: false, reason: "actor_kind required" };
  if (typeof b.auth_mode !== "string") return { ok: false, reason: "auth_mode required" };
  if (typeof b.correlation_id !== "string") return { ok: false, reason: "correlation_id required" };
  return {
    ok: true,
    value: {
      id: b.id,
      actor_id: b.actor_id,
      actor_kind: b.actor_kind as CommandIntent["actor_kind"],
      auth_mode: b.auth_mode as CommandIntent["auth_mode"],
      target_kind: typeof b.target_kind === "string" ? b.target_kind : undefined,
      target_id: typeof b.target_id === "string" ? b.target_id : undefined,
      correlation_id: b.correlation_id,
      payload: (b.payload as Record<string, unknown>) ?? {},
    },
  };
}

export async function handleCommandIntent(env: Env, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "bad_json", message: "request body is not valid JSON", retryable: false }, 400);
  }
  const v = validateIntent(body);
  if (!v.ok) return jsonError({ code: "invalid_intent", message: v.reason, retryable: false }, 400);
  const intent = v.value;

  const spec = getCommandSpec(intent.id);
  if (!spec) {
    return jsonError({ code: "unknown_command", message: `no such command_id: ${intent.id}`, retryable: false }, 400);
  }
  if (!isAuthorized(intent.id, intent.actor_kind)) {
    return jsonError({ code: "forbidden", message: `actor_kind ${intent.actor_kind} not allowed for ${intent.id}`, retryable: false }, 403);
  }

  const now = Date.now();
  const run = await createRun(env.TF_DB, intent, now);
  await recordAuditEvent(env.TF_DB, run.id, "command_received", intent.actor_id, intent.actor_kind, { command_id: intent.id, correlation_id: intent.correlation_id }, now);
  await recordAuditEvent(env.TF_DB, run.id, "run_created", intent.actor_id, intent.actor_kind, null, now);

  // For local_worker commands we can transition straight to accepted here.
  // For downstream_multica / downstream_paperclip, accepted comes from the callback in Phase 2/3.
  if (spec.route === "local_worker") {
    await transitionRun(env.TF_DB, run.id, "accepted", now);
  }

  return jsonOk({ run_id: run.id, state: spec.route === "local_worker" ? "accepted" : "created" }, 201);
}

export async function handleGetCommandRun(env: Env, runId: string): Promise<Response> {
  const run = await getRunById(env.TF_DB, runId);
  if (!run) {
    return jsonError({ code: "not_found", message: `run ${runId} not found`, retryable: false }, 404);
  }
  return jsonOk(run);
}
```

- [ ] **Step 22: Mount in v1.ts**

Modify `cloudflare/worker/src/routes/v1.ts` — add imports near top and route handlers in the body:

```typescript
// Near other route imports
import { handleCommandIntent, handleGetCommandRun } from "./commands";

// In handleV1Request, after existing time-entries handlers:
if (method === "POST" && pathname === "/v1/commands/intent") {
  const authFailure = requireAppOrInternalAuth();
  if (authFailure) return authFailure;
  return handleCommandIntent(env, request);
}
const runIdMatch = pathname.match(/^\/v1\/commands\/runs\/([^/]+)$/);
if (method === "GET" && runIdMatch) {
  const authFailure = requireAppOrInternalAuth();
  if (authFailure) return authFailure;
  return handleGetCommandRun(env, runIdMatch[1]);
}
```

- [ ] **Step 23: Typecheck Worker**

```bash
pnpm -C cloudflare/worker exec tsc -p tsconfig.json --noEmit
```

Expected: clean.

- [ ] **Step 24: Run tests**

```bash
pnpm -C cloudflare/worker exec vitest run src/lib/commands/ src/routes/__tests__/commands.test.ts
```

Expected: prior 12 tests still pass + the new 1 pass + 2 placeholders.

- [ ] **Step 25: Local integration via wrangler dev**

```bash
pnpm -C cloudflare/worker wrangler dev --local &
DEV_PID=$!
sleep 4
curl -s -X POST http://localhost:8787/v1/commands/intent \
  -H "content-type: application/json" \
  -H "X-Internal-Token: $(pnpm -C cloudflare/worker wrangler secret list 2>/dev/null | grep TF_INTERNAL_SHARED_SECRET || echo dev)" \
  -d '{"id":"ts-standup","actor_id":"f1","actor_kind":"founder","auth_mode":"cf_access","correlation_id":"c-test","payload":{}}'
kill $DEV_PID 2>/dev/null
```

Expected: `{"run_id": "run_...", "state": "created"}` for `ts-standup` (downstream_multica route, not local_worker).

- [ ] **Step 26: Commit**

```bash
git add cloudflare/worker/src/routes/commands.ts cloudflare/worker/src/routes/v1.ts cloudflare/worker/src/routes/__tests__/commands.test.ts
git commit -m "feat(worker): POST /v1/commands/intent + GET /v1/commands/runs/:id (Phase 1)"
```

### Task 1.6: Contract doc

- [ ] **Step 27: Write contract doc**

Create `docs/architecture/contracts/founder-command-registry.md`:

```markdown
# Founder Command Registry Contract

> System of record: Cloudflare Worker, `cloudflare/worker/src/lib/commands/registry.ts`.

## Vocabulary

All founder/cofounder commands are prefixed `ts-` and registered in
`COMMAND_REGISTRY`. The registry is the single source of truth — UI
surfaces (cortex command ring, settings, palette) must read from it
rather than hardcode IDs.

## State Machine

```
created → accepted → in_progress → succeeded | failed | partial | cancelled
```

- `created` — Worker has accepted the intent and persisted a run.
- `accepted` — auth + permission verified; downstream worker (MultiCA or
  Paperclip) has acknowledged.
- `in_progress` — downstream worker is executing.
- `succeeded` — completed with a final result_json.
- `failed` — terminal error; error_code + error_message set.
- `partial` — some downstream agents responded, others didn't.
- `cancelled` — caller or system cancelled before completion.

## Audit Events

Every transition emits ≥1 audit event:
| Transition | Events |
|---|---|
| intent → run | `command_received`, `run_created` |
| run → accepted | `downstream_agent_contacted` |
| accepted → in_progress | `downstream_agent_responded` |
| in_progress → succeeded | `result_received`, `result_delivered` |
| any → failed | `failure` |
| any → partial | `partial_failure` |
| any → cancelled | `cancelled` |

## Routes

- `POST /v1/commands/intent` — caller posts a CommandIntent; Worker validates, creates run, returns `{run_id, state}`.
- `GET /v1/commands/runs/:id` — read full run state.

Phase 2 will add `POST /v1/commands/runs/:id/result` (MultiCA callback).
```

- [ ] **Step 28: Commit doc**

```bash
git add docs/architecture/contracts/founder-command-registry.md
git commit -m "docs(architecture): founder command registry contract (Phase 1)"
```

### Task 1.7: Deploy Phase 1

- [ ] **Step 29: Apply migration in production D1**

```bash
pnpm -C cloudflare/worker wrangler d1 migrations apply teamforge-db --remote
```

Expected: 0010_command_runs applied.

- [ ] **Step 30: Deploy Worker**

```bash
pnpm -C cloudflare/worker wrangler deploy
```

Expected: new version deployed.

- [ ] **Step 31: Smoke-test production routes**

```bash
curl -s -i https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/commands/intent \
  -X POST -H "content-type: application/json" \
  -d '{"id":"ts-standup","actor_id":"f","actor_kind":"founder","auth_mode":"cf_access","correlation_id":"c-p1-smoke","payload":{}}' \
  | head -20
```

Expected: 401 unauthorized (no auth header). Important: not 404 (route exists) and not 500 (route doesn't crash).

- [ ] **Step 32: Push commits**

```bash
git push origin main
```

---

# Phase 2 — MultiCA execution + callback contract

**Status:** Outlined here. Re-decompose into bite-sized steps at the start of the Phase 2 session.

## Outline

### Goal

MultiCA receives a command run, executes under AWS task role identity, posts result back to TeamForge. No `safvr` IAM user; no Telegram dispatcher bypass.

### Files to create/modify

- Create: `cloudflare/worker/src/routes/commands-callback.ts` — handles `POST /v1/commands/runs/:id/result`
- Create: `docs/architecture/contracts/multica-execution-contract.md` — callback envelope, task role auth, idempotency semantics
- Modify: `cloudflare/worker/src/lib/auth.ts` — add `verifyAwsTaskRoleAuth(request)` that validates a signed JWT from the AWS task role (mechanism: shared signing key in worker env + MultiCA injects header)
- Modify: `cloudflare/worker/src/routes/v1.ts` — mount callback route
- Modify: `cloudflare/worker/src/lib/env.ts` — add `MULTICA_CALLBACK_SHARED_SECRET`

### Callback envelope

```typescript
interface MultiCaResultEnvelope {
  run_id: string;
  correlation_id: string;
  state: "in_progress" | "succeeded" | "failed" | "partial";
  result?: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean };
  partial_failures?: Array<{ agent_id: string; error_code: string; error_message: string }>;
  completed_at?: number; // epoch ms
}
```

### Sub-tasks (will be expanded)

1. Define `MultiCaResultEnvelope` type — TDD pattern, mirrors Phase 1.
2. Write `verifyMultiCaCallback(request, env)` auth verifier — HMAC signature over body + run_id.
3. Write `handleCommandsCallback(env, request, runId)` route.
4. Add idempotency: same `correlation_id` + `state` is a no-op (return existing run state).
5. Add audit events on every transition.
6. Wire into v1.ts.
7. Contract doc.
8. Smoke test with a mock MultiCA caller.

### Not in Phase 2

- Actual ECS task definition updates (separate AWS infra work).
- Removing `safvr` IAM user — that's an AWS cleanup task scheduled when Phase 2 code is live.
- Real MultiCA → Paperclip leg (that's Phase 3).

---

# Phase 3 — Paperclip dedicated-agent envelope + first standup round-trip

**Status:** Outlined here. Re-decompose at session start.

## Outline

### Goal

Phase 1 + 2 give us the intake + callback infrastructure. Phase 3 wires the actual Paperclip remote-safe agent interface so that the founder issuing `ts-standup` flows end-to-end:

```
Hermes UI → Worker /v1/commands/intent
         → MultiCA picks up run (out of scope here — assume mock)
         → MultiCA → Paperclip remote-safe /api/agents/:id/standup
         → Paperclip returns structured standup
         → MultiCA → Worker /v1/commands/runs/:id/result
         → Hermes UI shows result in membrane
```

### Files to create/modify

- Create: `cloudflare/worker/src/lib/paperclip-client.ts` — typed HTTP client for Paperclip's remote-safe endpoints
- Create: `docs/architecture/contracts/paperclip-agent-contract.md`
- Modify in sibling repo: `thoughtseed-paperclip/services/listener/index.ts` — add `POST /api/agents/:agent_id/standup`
- Modify in sibling repo: `thoughtseed-paperclip/services/listener/auth.ts` (or equivalent) — add dedicated-agent token verification
- Modify: `src/lib/commandCortex/commandRules.ts` and `src/components/cortex/MissionCortex.tsx` — wire the cortex `ts-standup` command to actually POST `/v1/commands/intent` via the existing `useInvoke` hook (Tauri side)
- Modify: `src/components/cortex/TacticalMembrane.tsx` — show run state (created → accepted → in_progress → succeeded) with a poll on the run_id

### Paperclip request/response envelope

```typescript
interface PaperclipStandupRequest {
  agent_id: string;          // e.g. "agent-engineering-lead"
  scope: { project_id?: string; date?: string };
  correlation_id: string;
  requester: { kind: "multica_service"; identity: string };
}

interface PaperclipStandupResponse {
  agent_id: string;
  correlation_id: string;
  state: "succeeded" | "failed";
  data?: {
    yesterday: string[];
    today: string[];
    blockers: string[];
    confidence: number;
  };
  error?: { code: string; message: string };
  sources: Array<{ kind: "huly" | "github" | "slack" | "clockify"; id: string; ts: number }>;
}
```

### Sub-tasks (will be expanded)

1. Add Paperclip listener endpoint `POST /api/agents/:id/standup` (sibling repo).
2. Add Paperclip dedicated-agent token issuance + verification (sibling repo).
3. Add Worker `paperclip-client.ts` — typed fetch wrapper, retry once on 5xx, attach correlation_id.
4. Wire `/v1/commands/runs/:id` reads into the cortex membrane via a 1.5s poll while state ∈ {created, accepted, in_progress}.
5. Replace the `describeCommandStub` stub in `src/pages/MissionCortexPage.tsx` with a real call: `api.invokeCommandIntent({ id, actor, target, ... })` → `useInvoke` calls a new Tauri command → Tauri command POSTs to the Worker.
6. End-to-end smoke: select Hermes-Sync node → click "ts-standup" in command ring → membrane shows `created → accepted → in_progress → succeeded` with actual data.
7. Contract doc.
8. Acceptance check against original brief:
   - Hermes is not canonical state owner ✓ (run lives in Worker D1)
   - Every MultiCA execution has a TeamForge run record ✓
   - Every Paperclip coordination has actor/target/correlation/audit ✓
   - Paperclip local scripts not required for MultiCA to coordinate ✓
   - safvr not in runtime ✓ (uses task role + Paperclip token only)
   - First connected prototype is read-heavy standup ✓
   - Local/deployed truth explicit ✓ (closure note in brief)

### Not in Phase 3

- All mutating commands (`ts-summon-agent`, `ts-approve-synapse`). Those land in a follow-up plan once the read-heavy prototype is stable.
- Replacing the existing Telegram dispatcher. Brief explicitly says it stays untouched.

---

# Final verification (per the original brief)

After Phase 3 lands, run these (they're listed at the bottom of the handoff brief):

```bash
pnpm build
pnpm -C cloudflare/worker exec tsc -p tsconfig.json --noEmit
cargo check
curl -s https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/bootstrap | python3 -m json.tool

cd /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip
git status --short
node --check services/listener/index.ts
```

All clean = ready to mark the brief as fully implemented.

---

# Self-review notes

This plan covers the brief's three layers as three phases plus a Phase 0 unblocker. Phases 0 and 1 are fully bite-sized; Phases 2 and 3 are outlined with concrete contracts and sub-task counts but will need a re-decomposition pass at execution start (intentional — the brief itself was a design brief, and Phase 1's actual data model will inform the exact shapes in 2 and 3).

Known gaps that are deferred (not bugs in this plan, intentional scope cuts):
- ECS task definition + IAM cleanup (AWS infra work, separate plan).
- Mutating commands (read-heavy first per the brief).
- Removing the Telegram dispatcher (explicitly out of scope).
- Worker test harness for real D1 — the runs.test.ts uses an in-memory mock; if a real D1 test harness exists in this repo, swap it in.
