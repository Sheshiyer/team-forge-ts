# Phase 1-3 Salvage + TeamForge → Cambium-Bridge Wiring

**Date:** 2026-06-15 (revised after cambium-bridge re-read)
**Status:** draft proposal
**Context:** Phase 1-3 Hermes work in `team-forge-ts` assumes Paperclip-listener dispatch and an AWS-task callback that doesn't exist. The actual dispatcher already exists in `thoughtseed-paperclip/cambium-bridge/` — wake-loop, router, parseTelegramToMove, and multica-bridge upstream/downstream are all wired. The salvage is to **point the Worker's intent surface at the existing cambium-bridge wake-loop**, not to build new infra.

**Reference:** INFRA_STATUS.md §1-3, §6-7. The Paperclip retirement is done (W0-W5); cambium-bridge is the live dispatcher.

---

## 1 · What cambium-bridge already gives us

`/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-paperclip/cambium-bridge/`:

| Surface | File | Already does |
|---|---|---|
| Event-sourced wake-loop | `operator/wake-loop.ts` | `wake(MoveEvent) → WakeResult` (route → lane → action → viability → spend gate), `wakeAsync()` (embed to cortex + drift log + persist), `viabilitySweep()` |
| Move classification | `router/index.ts` | `routeMove(event) → {lane, agent, skill, gated, autoApprove}`, `parseTelegramToMove(cmd, args, userId)` already maps `ts-status`/`ts-run`/`ts-approve`/`ts-reject`/`ts-handoffs`/`ts-standup`/`ts-digest` |
| MultiCA upstream | `multica-bridge/upstream.ts` | POST to `bridgeApiUrl/v1/bridge/ingest` for insight/report/blocker/heartbeat/completion |
| MultiCA downstream | `multica-bridge/downstream.ts` | Polls `bridgeApiUrl/v1/bridge/directives/:member` + posts acks |
| Cortex memory | `cortex/index.ts` | `embedAndRemember`, `recall`, semantic memory with SQLite or Vectorize |
| Gates | `gates/{brand-dna,drift-guard,spend}.ts` | brand-DNA contraction check, drift classification, spend gates |
| Tenancy | `tenant/index.ts` | TeamForge-slug-keyed tenant registry (M3) |
| Config | `config.ts` | Already declares `teamforgeUrl`, `cfAccessClientId/Secret`, `teamforgeBearerToken`, `multicaApiUrl`, `bridgeApiUrl`, `bridgeToken` |

**The bit that's missing:** no file in cambium-bridge currently *consumes* TeamForge's `command_runs` table. The wake-loop is a library function with nobody calling it from TeamForge events.

**Also missing:** `operator/cli.ts` is referenced in `package.json` (`"operator:wake": "node operator/cli.ts wake"`) but doesn't exist on disk.

---

## 2 · The actual delta

### 2.1 In cambium-bridge — add ONE consumer file

`cambium-bridge/teamforge-consumer.ts` — a thin polling driver, ~150 lines:

```
loop every 5 s:
  runs = await fetch(`${teamforgeUrl}/v1/commands/runs?state=created&route=downstream_multica`,
                     headers={X-TeamForge-Internal-Secret})
  for run in runs:
    event = teamforgeRunToMoveEvent(run)        // map ts-* → MoveEvent
    decision = routeMove(event)                  // existing router
    result = wake(event)                          // existing wake-loop
    if not result.approved:
      await postCallback(run.id, "failed",
                        error: { code: "gated", message: result.action })
      continue
    // For downstream_multica route:
    multicaIssueId = await createMulticaIssue(decision.agent, event.content)
    await postCallback(run.id, "in_progress")
    finalState = await pollMulticaIssue(multicaIssueId)
    await wakeAsync(event, result, event.content, finalState.result)
    await postCallback(run.id, finalState.state, result: finalState.result)
```

- Uses existing `routeMove` + `wake` + `wakeAsync`
- Uses existing `multica-bridge/upstream.ts` patterns for MultiCA HTTP
- `postCallback` signs with `MULTICA_CALLBACK_SHARED_SECRET` and POSTs to `teamforge-api.workers.dev/v1/commands/runs/:id/result` (the Phase 2 route we already shipped)
- `teamforgeRunToMoveEvent`: simple mapper from `CommandRun` shape to `MoveEvent` shape (already similar — both have id/type/content/source/agent)

### 2.2 In cambium-bridge — add the missing CLI

`cambium-bridge/operator/cli.ts` — the file `package.json` already references but doesn't exist. Two commands:
- `node operator/cli.ts wake` — run a single wake from stdin (manual testing)
- `node operator/cli.ts consume` — start the TeamForge consumer loop (production)

### 2.3 In cambium-bridge — add config entries

Extend `config.ts`:
- `teamforgeInternalSecret: string` — for the new `?state=created` Worker route
- `multicaCallbackSharedSecret: string` — for HMAC-signing the callback (same secret we deployed)
- `teamforgeConsumerEnabled: boolean` (default `false` for safety)
- `teamforgeConsumerIntervalMs: number` (default `5000`)

### 2.4 In team-forge-ts Worker — add ONE internal route

`cloudflare/worker/src/routes/commands.ts`:
- Add `GET /v1/commands/runs?state=created&route=<route>&limit=<n>` (m2m auth via `TF_INTERNAL_SHARED_SECRET`)
- Returns list of `command_runs` matching filter
- No new D1 schema; just a SELECT on the existing table

### 2.5 In team-forge-ts Worker — registry update

`cloudflare/worker/src/lib/commands/registry.ts` — re-route the 4 commands that were `downstream_paperclip` to `downstream_multica`:
- `ts-standup` → `downstream_multica` (already)
- `ts-summon-agent` → `downstream_multica` (was paperclip)
- `ts-approve-synapse` → `downstream_multica` (was paperclip)
- `ts-trace-signal` → `local_worker` (unchanged)
- `ts-generate-brief` → `downstream_multica` (was paperclip)

Add to each spec: `multica_agent: "Hermes" | "CEO" | "Engineer" | "Scientist" | "Designer" | "Synthesist"` — the MultiCA agent name the consumer dispatches to.

### 2.6 In team-forge-ts Worker — delete dead code

- `cloudflare/worker/src/lib/paperclip-client.ts` + test — DELETE
- `cloudflare/worker/src/lib/commands/dispatch.ts` + test — DELETE (the cambium-bridge consumer handles dispatch; Worker is dumb intake)
- `cloudflare/worker/src/routes/commands.ts` — remove the `dispatchRun(env, run)` call inside `handleCommandIntent`; Worker just creates the run and returns; consumer picks it up
- Remove `downstream_paperclip` from `CommandRoute` type
- `cloudflare/worker/tools/mock-multica.sh` — DELETE (real consumer makes this obsolete)
- `docs/architecture/contracts/paperclip-agent-contract.md` — MOVE to `_archived/`

### 2.7 In team-forge-ts Worker — keep as-is

- Phase 1 data model (`types.ts`, `runs.ts`, migration `0010`)
- Phase 1 registry skeleton (just re-route per §2.5)
- Phase 2 callback (`callback.ts`, `result-storage.ts`, `auth-multica.ts`, `commands-callback.ts`) — this is exactly where the consumer posts
- Phase 3 Tauri + UI — Worker target unchanged
- Phase 2 contract doc — edit to say the consumer in cambium-bridge honors this

### 2.8 In thoughtseed-paperclip — clean Phase 3 listener (W6)

- `services/listener/{standup,agent-tokens}.{ts,test.ts}` — DELETE at W6 archive (≥ 2026-06-18)
- Listener mount lines in `services/listener/index.ts` — REVERT at W6

### 2.9 launchd

`~/Library/LaunchAgents/ai.thoughtseed.teamforge-consumer.plist` — supervises `node cambium-bridge/operator/cli.ts consume`. Matches existing pattern (`ai.multica.daemon`, `ai.hermes.multica-relay`).

---

## 3 · End-to-end flow once §2 lands

1. Founder clicks `Standup` in Cortex UI
2. Tauri `post_command_intent` → Worker `POST /v1/commands/intent`
3. Worker `handleCommandIntent` validates intent, creates `command_runs` row with `state=created`, emits `command_received` + `run_created` audit, returns `201 { run_id, state: "created" }`
4. UI starts polling `GET /v1/commands/runs/:id` every 1500 ms
5. (5 s later) Cambium-bridge consumer's tick polls `GET /v1/commands/runs?state=created&route=downstream_multica`
6. For the new run: consumer builds `MoveEvent { type: "probe", content: "/ts-standup", source: "manual", tenantId, agent: "Hermes" }`
7. `routeMove(event)` returns `{ lane: "heartbeat", agent: "hermes", skill: "viability-sweep", autoApprove: true }`
8. `wake(event)` returns `{ approved: true, ... }`
9. Consumer creates MultiCA issue via the existing `multica-bridge/upstream.ts` pattern (POST insight/heartbeat) AND/OR shells `multica issue assign --to Hermes` (whichever turns out to be the real enqueue contract)
10. Consumer signs HMAC + POSTs to `/v1/commands/runs/:id/result` with `state: "in_progress"`
11. Consumer polls MultiCA issue until terminal state
12. Consumer reads agent's final comment, signs HMAC + POSTs `state: "succeeded"` with `result: <data>`
13. `wakeAsync()` embeds the situation in cortex + persists
14. UI's poll picks up `state: "succeeded"` + `result_json`, membrane renders the standup

No new infra. Zero net-new code that duplicates cambium-bridge functionality. The Mac mini daemon already runs cambium-bridge code; we add ONE consumer file + ONE config block + ONE Worker route + ONE launchd plist.

---

## 4 · Decision points

### D1 · MultiCA enqueue contract from the consumer
- [ ] Shell out to `multica issue assign --to <agent>` (the documented contract)
- [ ] Use the existing `multica-bridge/upstream.ts` HTTP pattern (already wired to `curious.thoughtseed.space/v1/bridge/ingest`)
- [ ] Try MultiCA REST `POST /api/issues` with `assignee_id` first; fall back to CLI if it doesn't enqueue
- [ ] **Recommendation:** try `multica` CLI first (matches W3 proof in retirement proposal), fall back to upstream-bridge ingest if the CLI isn't on PATH

### D2 · Paperclip Phase 3 leftover code (worker + sibling)
- [ ] Delete now (5 commits in team-forge-ts main + 3 in sibling repo main; clean revert before they ossify)
- [ ] Wait for W6 archive ceremony (≥ 2026-06-18) and sweep then
- [ ] Leave as frozen reference exhibit

### D3 · `paperclip-agent-contract.md`
- [ ] Move to `docs/architecture/contracts/_archived/`
- [ ] Delete
- [ ] Rewrite header as historical exhibit, leave content

### D4 · Where the consumer config lives
- [ ] `~/.thoughtseed/cambium-bridge.json` (same file cambium-bridge already reads)
- [ ] `.env` in cambium-bridge dir (separate file)
- [ ] AWS Secrets Manager fetched at consumer start

### D5 · Worker internal listing route
- [ ] Add `GET /v1/commands/runs?state=&route=&limit=` as proposed (m2m auth, paginated, dead simple)
- [ ] Push-only model: Worker publishes to a queue, consumer subscribes (more work; queue config; possibly Cambium Worker as the broker)
- [ ] **Recommendation:** the GET route. Already have `TEAMFORGE_DB`, `TF_INTERNAL_SHARED_SECRET`, and the pattern in `commands.ts`

### D6 · Consumer state-write back to TeamForge
- [ ] HMAC callback through the Phase 2 route we already shipped (`POST /v1/commands/runs/:id/result`)
- [ ] Internal m2m secret + direct write endpoint (smaller crypto surface)
- [ ] **Recommendation:** the Phase 2 HMAC callback — the route, verifier, idempotency, and audit emit are all already shipped and tested

---

## 5 · What changes vs the previous draft of this plan

I had proposed a new top-level script `team-forge-ts/cloudflare/worker/tools/teamforge-multica-bridge.mjs` and a new launchd plist for it. That was wrong — it duplicated the wake-loop/router/multica-bridge work that cambium-bridge already does. The corrected plan: add a thin consumer **inside** cambium-bridge that wraps the existing surfaces. Same launchd supervision pattern; one file instead of a parallel system.

---

## 6 · Rollout sequence (once decisions in §4 land)

1. Apply file dispositions in §2.6 + §2.8 (delete dead Paperclip code)
2. Add `GET /v1/commands/runs?state=&route=&limit=` Worker route (§2.4)
3. Update registry per §2.5 (re-route + `multica_agent` field)
4. Deploy Worker
5. Add `teamforge-consumer.ts` + `operator/cli.ts` + config entries in cambium-bridge (§2.1-2.3)
6. Smoke locally: run `node operator/cli.ts consume` against a manually-created `ts-standup` run
7. Install launchd plist (§2.9), watch logs for 1 h
8. Update `docs/architecture/contracts/multica-execution-contract.md` to describe the cambium-bridge consumer
9. Update INFRA_STATUS.md §7-8 (closed loop, gap removed)
10. Update handoff brief closure note (closure now genuine, not aspirational)

---

## 7 · Out of scope here

- AWS task role creation (not needed under this design — the consumer runs on Mac mini, not AWS)
- IaC capture of AWS state (separate plan)
- Backend task def drift rollout (separate ops task)
- Mutating commands wired to Cortex UI (`ts-summon-agent`, `ts-approve-synapse`) — small UI follow-up once consumer is live
- Replacing the existing TG dispatcher / hermes-tg-relay (untouched; Hermes sole-channel rule preserved)
- Phase 14 Realtime work in team-forge-ts (separate WIP)
- The hermes-aws-ts repo (planning hub only; nothing lands there under this design)
