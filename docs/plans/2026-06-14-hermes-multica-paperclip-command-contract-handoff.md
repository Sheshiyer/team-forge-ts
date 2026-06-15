# Handoff: Hermes / MultiCA / Paperclip Command Contract

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
