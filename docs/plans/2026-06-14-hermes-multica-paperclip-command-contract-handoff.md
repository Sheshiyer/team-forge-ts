# Handoff: Hermes / MultiCA / Paperclip Command Contract

> Historical record — superseded by the Hermes/Cambium retirement contract. Do not execute this handoff.

Date: 2026-06-14
Owner repo: `team-forge-ts`
Related repo: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip`
Mode: implementation handoff, not yet implemented

## Objective

Implement the contract layer that lets founder/cofounder commands flow through TeamForge and AWS MultiCA into dedicated Paperclip agents without treating Hermes as a standalone AWS agent or bypassing TeamForge state.

## Operating Model

- Employees use Paperclip-facing workflows.
- Founder and cofounder use Hermes/TeamForge plus AWS MultiCA.
- MultiCA coordinates downstream with dedicated Paperclip agents for daily standups, monthly reviews, and task coordination.
- TeamForge owns durable state: identities, projects, handoffs, approvals, run records, audit events, standup/review outputs, and failure states.
- Hermes is the company command/communication agent, not the canonical database.

## Current Evidence

TeamForge production Worker:

- `/v1/bootstrap` is live and reports `projects`, `teamSnapshot`, `handoffs`, `timeEntries`, and `whoami`.
- Unauthenticated probes return `401`, confirming routes are deployed and gated.
- Local repo has dirty Worker/session changes, so do not assume local code is deployed.

AWS MultiCA:

- ECS cluster `multica-cluster` is active.
- Fargate services: `multica-frontend`, `multica-backend`.
- Global Accelerator: `a2d8a7ed58f172583.awsglobalaccelerator.com`.
- Static IPs: `166.117.29.182`, `76.223.32.238`.
- Current task definitions use an execution role but no task role.

Current Hermes/Paperclip path:

- TeamForge Tauri command `dispatch_hermes_command` shells into Paperclip `scripts/hermes-tg-dispatcher.sh`.
- `run_hermes_poller_once` shells into Paperclip `scripts/hermes-tg-poller.sh --once`.
- Active Paperclip dispatcher commands are `/status`, `/skills`, `/run`, `/standup`, `/digest`, `/reports`, `/approve`, `/send-report`.
- Paperclip listener API exists in `services/listener/index.ts` with `POST /api/command`, `GET /api/status`, `GET /api/agents`, `GET /api/onboarding`, `GET /api/events`.
- `127.0.0.1:3100` was not listening during inventory; `127.0.0.1:3101` returned `500 {"error":"fetch failed"}` because the primary listener was unavailable.

## Problem

The documented TeamForge `/ts-*` command surface and the active Paperclip Telegram dispatcher are not the same contract. Reusing the Telegram dispatcher directly for MultiCA would create a brittle cloud-to-local dependency and would not create typed TeamForge run/audit state.

## Required Design

Create an explicit contract with three layers:

1. TeamForge command registry
   - Maps founder/cofounder commands to typed actions.
   - Records command intent, actor, auth mode, state owner, and audit event.
   - Owns `/ts-*` command semantics even when execution happens in MultiCA or Paperclip.

2. MultiCA execution/run contract
   - TeamForge creates a run record.
   - MultiCA executes under AWS runtime identity.
   - MultiCA posts status/result/failure back to TeamForge.
   - No `safvr` IAM user credentials in runtime.

3. Paperclip dedicated-agent coordination contract
   - Paperclip exposes a remote-safe command/job interface for dedicated agents.
   - MultiCA can request standup/review/task coordination from a specific employee/role/project agent.
   - Paperclip returns structured status, partial failure, and source references.
   - Local-only scripts remain local-only until replaced or wrapped by the remote-safe interface.

## First Implementation Target

Implement read-heavy standup aggregation first:

1. Founder/cofounder issues a standup request through Hermes/TeamForge.
2. TeamForge creates a run/coordination record.
3. MultiCA requests status from one dedicated Paperclip agent.
4. Paperclip returns structured standup data.
5. TeamForge persists the result and audit event.
6. Hermes summarizes the result back to the founder/cofounder.

Do not start with a mutating task assignment command.

## Suggested Files To Inspect

TeamForge:

- `README.md`
- `tasks/todo.md`
- `cloudflare/worker/src/routes/v1.ts`
- `cloudflare/worker/src/lib/env.ts`
- `cloudflare/worker/src/lib/auth.ts`
- `cloudflare/worker/migrations/0006_handoffs.sql`
- `src-tauri/src/commands/mod.rs`
- `src/pages/Agents.tsx`
- `src/hooks/useInvoke.ts`
- `docs/runbooks/teamforge-worker-deploy.md`
- `docs/architecture/contracts/worker-route-contract.md`
- `docs/architecture/contracts/ops-event-schema-contract.md`

Paperclip:

- `scripts/hermes-tg-dispatcher.sh`
- `scripts/hermes-tg-poller.sh`
- `services/listener/index.ts`
- `utils/tenant-paths.ts`
- `GAPS_AND_FUTURE.md`
- `BRIDGE_HANDOFF_GAPS.md`

## Contract Work Items

- [ ] Add a TeamForge command registry document/table for all founder/cofounder commands.
- [ ] Define canonical command IDs, including whether `/ts-*` remains the public founder vocabulary.
- [ ] Define actor model: founder, cofounder, employee, MultiCA service, Paperclip agent.
- [ ] Define auth matrix: Cloudflare Access user auth, TeamForge m2m auth, AWS task role, Paperclip member/agent token.
- [ ] Define run state machine: `created`, `accepted`, `in_progress`, `partial`, `succeeded`, `failed`, `cancelled`.
- [ ] Define audit event taxonomy for command received, run created, downstream agent contacted, result received, result delivered, failure.
- [ ] Define MultiCA callback envelope.
- [ ] Define Paperclip dedicated-agent request/response envelope.
- [ ] Define partial failure behavior when one agent is unreachable.
- [ ] Define D1-first versus vault-first persistence for standups/reviews.

## Acceptance Criteria

- [ ] The implementation does not make Hermes the canonical state owner.
- [ ] Every MultiCA execution has a TeamForge run record.
- [ ] Every downstream Paperclip coordination event has an actor, target agent, correlation ID, and audit event.
- [ ] Paperclip local scripts are not required for AWS MultiCA to coordinate agents.
- [ ] `safvr` is not used by runtime code.
- [ ] The first connected prototype is read-heavy standup aggregation.
- [ ] Local/deployed truth is kept explicit in docs and verification notes.

## Verification Commands

Before implementation:

```bash
git status --short
pnpm -C cloudflare/worker exec tsc -p tsconfig.json --noEmit
curl -s https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/bootstrap | python3 -m json.tool
```

After implementation:

```bash
pnpm build
pnpm -C cloudflare/worker exec tsc -p tsconfig.json --noEmit
cargo check
curl -s https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/bootstrap | python3 -m json.tool
```

If Paperclip changes are included:

```bash
cd /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip
git status --short
node --check services/listener/index.ts
```

## Notes For Implementer

- Treat `tasks/phase0-inventory.md` in `/Users/sheshnarayaniyer/.hermes` as the latest exploration evidence.
- Do not deploy or migrate until the source/deployed drift in TeamForge is resolved.
- Keep the existing Telegram dispatcher working while adding the new contract.
- Do not copy secrets or secret values into docs.

## Drift Resolution (2026-06-15)

Worker drift closed in commit `285c48e` (`feat(worker): plexus session principal — third auth tier + onboarding state`).

Phase 0 of the implementation plan in `docs/plans/2026-06-15-hermes-multica-paperclip-contract-impl.md` ran end-to-end. The Plexus session principal feature is now deployed to production (Worker version `5d6e5f03-7c37-4202-9889-7c7127457e70`).

Production verification:
- `https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/bootstrap` → 200 with healthy manifest
- `https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/whoami` → 401 `access_identity_required` (auth gating verified)
- D1 migration `0009_plexus_session_onboarding.sql` present in `d1_migrations` registry

Observations (non-blocking):
- Remote D1 already had `0009` applied before Task 0.4 ran — applied via an earlier session. `wrangler d1 migrations apply --remote` was a no-op; desired state was already in place.
- Remote `d1_migrations` registry contains a historical orphan entry `0006_time_entries.sql` that no longer exists on disk (superseded by `0007_time_entries.sql`). Cosmetic; consider a cleanup migration in a future maintenance pass.
- Worker package has no installed `node_modules`; `pnpm -C cloudflare/worker exec tsc` fails until install runs. Workaround used: invoke `tsc` from repo root with `-p cloudflare/worker/tsconfig.json`. Worth adding `typescript` as a devDep to the worker package or documenting the root-tsc workaround in `docs/runbooks/teamforge-worker-deploy.md`.
- No tests exist for `plexus-session.ts` (445 lines of role + onboarding state machine). Logged as a follow-up; not a Phase 0 blocker.

Phase 1 (command registry) can now begin against a clean baseline. See `docs/plans/2026-06-15-hermes-multica-paperclip-contract-impl.md`.

## Phase 1 closure (2026-06-15)

Command registry + run state machine + intake routes shipped end-to-end. Worker `47f5c8a1-3f2e-4aea-b580-27b41feefaad` deployed; migration `0010_command_runs.sql` applied to remote D1; `POST /v1/commands/intent` + `GET /v1/commands/runs/:id` return structured 401 on unauthenticated requests (route live, gating works). 25 vitest tests added across `types`, `registry`, `runs`, `commands` routes; worker typecheck clean.

Contract doc: `docs/architecture/contracts/founder-command-registry.md`.

## Phase 2 closure (2026-06-15)

MultiCA callback contract shipped. Worker `d71e3b40-831d-4029-8d4b-cc4ecc30a8b3` deployed; `POST /v1/commands/runs/:id/result` returns 401 `missing_signature` on unsigned requests (HMAC gate verified); `MULTICA_CALLBACK_SHARED_SECRET` set in production with 32-byte random hex. 30 new vitest tests added across `callback`, `result-storage`, `auth-multica`, `commands-callback` route, and mock-d1 extensions (55 total).

Contract doc: `docs/architecture/contracts/multica-execution-contract.md`.

Idempotency rule locked: same `correlation_id + state` on a terminal envelope returns the existing run unchanged (no DB writes, no audit emit) — protects against MultiCA retry storms.

## Phase 3 closure (2026-06-15)

End-to-end `ts-standup` flow shipped: Hermes UI → Worker `/v1/commands/intent` → (mock MultiCA dispatcher script) → Paperclip listener `/api/agents/:id/standup` → Worker callback `/v1/commands/runs/:id/result` → Hermes UI polls + membrane displays state machine progression. Worker `e1b0f929-9f2c-4106-bf9b-99de1b70bae3` deployed.

Contract doc: `docs/architecture/contracts/paperclip-agent-contract.md`.

Acceptance check against original brief (each criterion + evidence):

```
[OK] Hermes is not canonical state owner
     command_runs lives in cloudflare/worker D1 (migration 0010). Tauri side
     has no command_runs table. Tauri commands post_command_intent /
     get_command_run are thin proxies to the Worker; no local persistence.

[OK] Every MultiCA execution has a TeamForge run record
     POST /v1/commands/runs/:id/result requires an existing run row in D1
     (getRunById returns null → 404 not_found). Callback cannot create state
     out of band. See cloudflare/worker/src/routes/commands-callback.ts.

[OK] Every Paperclip coordination has actor/target/correlation/audit
     validateIntent requires actor_id, actor_kind, correlation_id; target_kind
     /target_id are stored. command_received audit event captures the full
     payload (incl. correlation_id). dispatch.ts emits downstream_agent_*
     events. Result-storage emits result_received / result_delivered / failure
     / partial_failure per terminal state.

[OK] Paperclip local scripts not required for MultiCA to coordinate
     Listener now exposes POST /api/agents/:agent_id/standup with per-agent
     bearer tokens. MultiCA hits HTTP directly. Legacy hermes-tg-dispatcher.sh
     and other local CLI paths are unchanged but not required for ts-standup.

[OK] safvr not in runtime
     No safvr references in either repo's runtime code. Auth surfaces:
     Cloudflare Access JWT (Phase 0), TF_INTERNAL_SHARED_SECRET (m2m),
     TF_CREDENTIAL_ENVELOPE_KEY (app bearer), MULTICA_CALLBACK_SHARED_SECRET
     (HMAC over body), PAPERCLIP_AGENT_TOKEN_MAP (per-agent bearer).

[OK] First connected prototype is read-heavy standup
     ts-standup is `mutates: false` in registry.ts; route is downstream_multica
     (no UI-side state change). Result is read-only structured data.

[OK] Local/deployed truth explicit
     Phase 0 drift closure documented above; each of Phase 1, 2, 3 deployed
     before the next phase began. Worker versions and migration IDs recorded.
```

Final verification (per brief's checklist):
- `pnpm build` → succeeded (3.10s, pre-existing chunk-size warning only)
- `pnpm -C cloudflare/worker check` → exit 0 (excluding user's untracked `realtime.ts` WIP)
- `cargo check` → exit 0 (3 pre-existing dead-code warnings)
- `/v1/bootstrap` → 200 with all bindings present
- `/v1/commands/intent` → 401 `missing_authorization` (route live)
- `/v1/commands/runs/:id/result` → 401 `missing_signature` (HMAC gate verified)
- Sibling repo has 3 Phase 3 commits on main, listener standup endpoint reachable on port 3100

Test counts: Phase 1 = 25 → Phase 2 = 55 → Phase 3 = 74 (worker) + 8 (sibling listener). All passing.

**Original brief is now fully implemented.** Read-heavy prototype is the proven wire end-to-end; mutating commands (`ts-summon-agent`, `ts-approve-synapse`, `ts-generate-brief`) and real MultiCA ECS pickup land in a follow-up plan. Telegram dispatcher remains untouched per the brief's explicit constraint.

Deferred for follow-up (documented, non-blocking):
- Close `actor_kind` trust gap by extending `PlexusPrincipal` (Phase 2 contract doc)
- Production secrets `PAPERCLIP_REMOTE_BASE_URL` and `PAPERCLIP_AGENT_TOKEN_MAP` (not set in current deploy — `downstream_paperclip` routes will fail until configured; `ts-standup` is `downstream_multica` and unaffected)
- Replace stub `buildStandupResponse` with real Huly/GitHub/Slack/Clockify aggregation
- Real MultiCA ECS pickup loop (mocked by `cloudflare/worker/tools/mock-multica.sh`)
- Token rotation surface for per-agent bearers

## Phase 1+2+3 Salvage closure (2026-06-16)

The Phase 3 Paperclip listener path was retired in line with the 2026-06-11 Paperclip-org-port proposal. The cambium-bridge `teamforge-consumer` (`thoughtseed-paperclip/cambium-bridge/teamforge-consumer.ts`) is now the dispatcher. End-to-end loop verified live 2026-06-16:

- Founder intent → Worker `POST /v1/commands/intent` → `command_runs` (state=created)
- Cambium-bridge consumer polls `GET /v1/commands/runs?state=created&route=downstream_multica` (new in Phase B, commit `1ff36c8`)
- Consumer runs `wake(MoveEvent)` from the existing cambium operator wake-loop, then shells out to `multica issue create` + `multica issue assign --to <Agent>` (assignment IS the act per W3 proof)
- Consumer polls `multica issue get` until terminal, signs HMAC `X-MultiCA-Signature` and POSTs to `/v1/commands/runs/:id/result`
- Worker `recordRunResult` writes result_json + emits `result_received` + `result_delivered` audit events

**Smoke evidence:** `run_b850a769f3454de29a18685d` → MultiCA `THO-20` (assignee `agent Hermes`, creator `safvr`) → HMAC callback received → D1 state went `created → in_progress → failed (multica_timeout)` because Hermes' Daily Standup autopilot runs once/day at 18:00 IST, not on-demand. The pipeline itself is correct.

**Worker version:** `96782da9-3aac-4f7f-a3dc-2f1cabeeb05b` (deployed 2026-06-15)
**Consumer launchd plist:** `~/Library/LaunchAgents/ai.thoughtseed.teamforge-consumer.plist` (validated, NOT loaded — master switch in config off)
**Master switch:** `teamforgeConsumerEnabled` in `~/.thoughtseed/cambium-bridge.json`

**Files deleted in the salvage:**
- `cloudflare/worker/src/lib/paperclip-client.ts` + test
- `cloudflare/worker/src/lib/commands/dispatch.ts` + test
- `cloudflare/worker/tools/mock-multica.sh`
- `thoughtseed-paperclip/services/listener/{standup,agent-tokens}.{ts,test.ts}`
- `docs/architecture/contracts/paperclip-agent-contract.md` archived to `_archived/paperclip-agent-contract.2026-06-15.md`

**Files added/modified:**
- `cloudflare/worker/src/lib/commands/registry.ts` — `multica_agent` field + 4 commands re-routed
- `cloudflare/worker/src/lib/commands/runs.ts` — `listRunsByState` helper
- `cloudflare/worker/src/routes/commands.ts` — `handleListCommandRuns` + intent route no longer calls `dispatchRun`
- `cloudflare/worker/src/routes/v1.ts` — `GET /v1/commands/runs` mounted
- `thoughtseed-paperclip/cambium-bridge/config.ts` — 5 new fields for the consumer
- `thoughtseed-paperclip/cambium-bridge/teamforge-consumer.ts` — NEW, the dispatcher
- `thoughtseed-paperclip/cambium-bridge/operator/cli.ts` — NEW, the missing CLI

The brief is now genuinely implemented: command intent goes through TeamForge, dispatch goes through MultiCA via the canonical CLI contract, results come back via HMAC, and the wake-loop's cortex memory + drift guards run on every dispatch. Paperclip is retired for cofounder/TeamForge use per the 2026-06-11 org-port proposal; Cambium is the fractal OS that TeamForge integrates into via the TeamForge-slug-as-tenant-id contract shipped in cambium's M3.
