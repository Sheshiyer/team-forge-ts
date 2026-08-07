# Founder Command Registry Contract

> System of record: Cloudflare Worker, `cloudflare/worker/src/lib/commands/registry.ts`.

## Vocabulary

All founder/cofounder commands are prefixed `ts-` and registered in
`COMMAND_REGISTRY`. The registry is the single source of truth — UI
surfaces (cortex command ring, settings, palette) must read from it
rather than hardcode IDs.

**UI shorthand vs transport ID:** the cortex UI (`src/lib/commandCortex/lensTypes.ts`)
uses unprefixed shorthand IDs (`route-work`, `summon-agent`, `brief`, `trace`,
`stabilize`, etc.) for compactness in keyboard hotkeys and UI labels. The Tauri
transport layer is responsible for prepending `ts-` before POSTing to
`/v1/commands/intent`. The registry rejects any unprefixed ID with
`unknown_command` (HTTP 400).

## Initial Command Vocabulary (Phase 1)

| Command ID | Route | Mutates | Allowed actors |
|---|---|---|---|
| `ts-standup` | `hermes_bridge` | no | founder, cofounder |
| `ts-summon-agent` | `cambium_operator` | yes | founder, cofounder |
| `ts-approve-synapse` | `cambium_operator` | yes | founder, cofounder |
| `ts-status` | `cambium_operator` | no | founder, cofounder |
| `ts-trace-signal` | `cambium_operator` | no | founder, cofounder, employee |
| `ts-generate-brief` | `hermes_bridge` | no | founder, cofounder |

## State Machine

```
created → accepted → in_progress → succeeded | failed | partial | cancelled
```

- `created` — Worker has accepted the intent and persisted a run.
- `accepted` — auth + permission verified; Hermes/Cambium has acknowledged.
- `in_progress` — downstream worker is executing.
- `succeeded` — completed with a final `result_json`.
- `failed` — terminal error; `error_code` + `error_message` set.
- `partial` — some downstream agents responded, others didn't.
- `cancelled` — caller or system cancelled before completion.

Timestamps `accepted_at` and `completed_at` are **write-once**: the Worker
preserves the original transition time on subsequent updates via
`COALESCE(...)`. The `state` column itself is overwritten on every
`transitionRun` call — callers are responsible for legality (state-machine
ordering is not enforced at the persistence layer).

For `hermes_bridge` and `cambium_operator` routes, the response carries
`state: "created"` and the transition to `accepted` arrives via the result
acknowledgement path (`POST /v1/commands/runs/:id/result`). The `legacy_multica`
route name is compatibility-only and must not be used by new registry specs.

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

The original user `payload` is captured on the `command_received` audit event
(field `payload_json` contains `{command_id, correlation_id, payload}`). The
`command_runs` row itself does not store the payload — readers seeking the
original request must join through `command_audit_events` filtered by
`kind = 'command_received'`. This is the canonical payload source for
downstream consumers (Hermes bridge, Cambium operator queue, or legacy drains).

## Routes

- `POST /v1/commands/intent` — caller posts a `CommandIntent`; Worker validates,
  creates run, returns `{run_id, state}`. Status: `201 Created`.
- `GET /v1/commands/runs/:id` — read full run state. Status: `200` with the
  run row, or `404` with `not_found` if the ID does not exist.

Both routes are gated by `requireAppOrInternalAuth` (CF Access JWT, m2m shared
secret, or app Bearer). Per-command authorization is performed by the registry's
`isAuthorized(commandId, actorKind)` helper.

### Error taxonomy

| Code | HTTP | Cause |
|---|---|---|
| `bad_json` | 400 | request body is not valid JSON |
| `invalid_intent` | 400 | missing field, or `actor_kind` / `auth_mode` not in enum, or `payload` is not an object |
| `unknown_command` | 400 | `command_id` not in registry |
| `forbidden` | 403 | actor_kind not in `allowed_actor_kinds` for this command |
| `not_found` | 404 | run_id has no matching row (GET only) |
| `database_unavailable` | 503 | `TEAMFORGE_DB` binding missing |
| `internal_error` | 500 | unexpected D1 failure during create/audit/transition (retryable) |

## Known Limitations

- **Actor-kind trust gap:** `actor_kind` is currently read from the request
  body, which is untrusted client input. When `PlexusPrincipal` gains an
  `actor_kind` field (Phase 2 likely), the route handler must derive
  `actor_kind` from the authenticated principal rather than from
  `intent.actor_kind`. Today this is acceptable because all registered commands
  share the founder/cofounder tier; it becomes exploitable once service-only
  commands ship.
- **No idempotency on `correlation_id`:** two POSTs with the same
  `correlation_id` produce two distinct runs. Dedup logic is deferred to Phase
  2 if needed.

## Phase Boundaries

- **Phase 1 (this contract):** intake + persistence + read. No downstream
  dispatch.
- **Phase 2:** `POST /v1/commands/runs/:id/result` callback from MultiCA;
  state transitions `accepted → in_progress → succeeded | failed | partial`;
  `result_json` / `error_code` / `error_message` columns populated.
- **Phase 3:** Paperclip dedicated-agent envelope round-trip for
  `downstream_paperclip` route; first end-to-end `ts-standup` standup result.
