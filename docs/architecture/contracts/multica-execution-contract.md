# MultiCA Execution Contract

> System of record: Cloudflare Worker, `cloudflare/worker/src/routes/commands-callback.ts`.

## Scope

For every run whose registry route is `downstream_multica`, the
**cambium-bridge teamforge-consumer** (running on the Mac mini under launchd,
`ai.thoughtseed.teamforge-consumer.plist`) polls the Worker queue, dispatches
the work to a MultiCA agent (via `multica issue assign` or the upstream-bridge
`/v1/bridge/ingest` endpoint), waits for the agent's terminal comment, then
posts the result back to TeamForge via `POST /v1/commands/runs/:id/result`.

No `safvr` IAM user, no Telegram dispatcher involvement, no AWS ECS task role.
The Worker is dumb intake + state-of-record; the consumer owns dispatch.

### Queue Interface — `GET /v1/commands/runs?state=&route=&limit=`

The consumer polls this endpoint every ~5s (configurable via
`teamforgeConsumerIntervalMs` in cambium-bridge config). Auth is the same
`requireAppOrInternalAuth` chain used by other commands routes — typically
the `X-TeamForge-Internal-Secret` header carrying `TF_INTERNAL_SHARED_SECRET`.

| Query param | Required | Notes |
|---|---|---|
| `state` | yes | One of `created|accepted|in_progress|succeeded|failed|partial|cancelled` |
| `route` | no | `downstream_multica` or `local_worker`. Resolved via registry → `command_id IN (...)` filter |
| `limit` | no | Positive integer, defaults to 50, capped at 200 |

Response: `{ ok: true, data: { runs: CommandRun[], count: number } }`,
runs sorted ascending by `requested_at`. The consumer's typical poll is
`?state=created&route=downstream_multica&limit=20`.

Each `CommandSpec` in the registry now carries a `multica_agent` field
(`"Hermes"` for `ts-standup`, `"CEO"` for `ts-summon-agent`/`ts-approve-synapse`,
`"Synthesist"` for `ts-generate-brief`, `"Scientist"` for `ts-trace-signal`).
The consumer reads this to pick the assignee when calling `multica issue assign`.

## Callback Envelope

```typescript
interface MultiCaResultEnvelope {
  run_id: string;
  correlation_id: string;
  state: "in_progress" | "succeeded" | "failed" | "partial";
  result?: Record<string, unknown>;       // canonical structured result
  error?: {                               // required when state === "failed"
    code: string;
    message: string;
    retryable: boolean;
  };
  partial_failures?: Array<{              // optional when state === "partial"
    agent_id: string;
    error_code: string;
    error_message: string;
  }>;
  completed_at?: number;                  // epoch ms; defaults to server now
}
```

## Auth — HMAC over body

Each callback carries `X-MultiCA-Signature: <lowercase-hex>` where the value is
`HMAC-SHA256(MULTICA_CALLBACK_SHARED_SECRET, raw_request_body)`. Verification is
constant-time via Web Crypto `crypto.subtle.verify`. The secret is set on the
Worker via:

```bash
pnpm -C cloudflare/worker exec wrangler secret put MULTICA_CALLBACK_SHARED_SECRET
```

Absence of the secret returns 503 `server_misconfigured` — the route fails
closed, not open.

## State Transitions

| envelope.state | Worker action | Audit events emitted |
|---|---|---|
| `in_progress` | UPDATE state, leave `completed_at` null | `downstream_agent_responded` |
| `succeeded` | UPDATE state + `result_json` + `completed_at` (via COALESCE) | `result_received`, `result_delivered` |
| `failed` | UPDATE state + `error_code` + `error_message` + `completed_at` | `failure` |
| `partial` | UPDATE state + `result_json` (aggregated) + `completed_at`; emit failures payload | `partial_failure` |

`completed_at` is write-once via COALESCE — first terminal callback wins.

## Idempotency

If the stored run already has `state === envelope.state` AND the envelope's
`state` is terminal (`succeeded`, `failed`, `partial`) AND the
`correlation_id` matches, the route returns 200 with the existing run and
performs no DB writes / audit emits. This is safe under MultiCA retry storms.

Non-terminal `in_progress` callbacks are NOT short-circuited — each one
re-emits the audit event for telemetry, but the row's `accepted_at` is
preserved by the COALESCE in the UPDATE.

## Route — `POST /v1/commands/runs/:id/result`

| HTTP | Cause |
|---|---|
| 200 | callback accepted (whether new write or idempotent no-op); body is the canonical run row |
| 400 `bad_json` | request body is not valid JSON |
| 400 `invalid_envelope` | envelope missing fields, wrong types, or `failed` without `error` block |
| 400 `run_id_mismatch` | path `:id` does not equal envelope.run_id |
| 400 `correlation_mismatch` | envelope.correlation_id does not equal the stored run's correlation_id |
| 401 `missing_signature` | `X-MultiCA-Signature` header absent |
| 403 `invalid_signature` | signature does not verify against `MULTICA_CALLBACK_SHARED_SECRET` |
| 404 `not_found` | no run exists for the path `:id` |
| 503 `server_misconfigured` | `MULTICA_CALLBACK_SHARED_SECRET` not set |
| 503 `database_unavailable` | `TEAMFORGE_DB` binding missing |
| 500 `internal_error` | unexpected D1 failure (retryable) |

## Sample Callback (lowercase-hex sig)

```bash
BODY='{"run_id":"run_abc","correlation_id":"c-1","state":"succeeded","result":{"yesterday":["x"],"today":["y"],"blockers":[],"confidence":0.9}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$MULTICA_CALLBACK_SHARED_SECRET" | awk '{print $2}')
curl -X POST https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/commands/runs/run_abc/result \
  -H "content-type: application/json" \
  -H "X-MultiCA-Signature: $SIG" \
  -d "$BODY"
```

## Known limitations & forward links

- **No anti-replay window.** A captured signed envelope can be replayed
  forever (idempotency makes this a no-op, but it still emits an audit
  event for `in_progress`). If this proves abusable, add a `timestamp` field
  to the envelope + reject if `|now - timestamp| > 5min`.
- **Command identity is server-derived.** The body-level `actor_kind` remains
  for wire compatibility, but it cannot grant authority. The Worker maps a
  registered Access role or verified credential class to the persisted actor;
  generic app Bearers are service principals and cannot forge founder access.
- **Paperclip retirement (Phase A, 2026-06-15)** removed the
  `downstream_paperclip` route and the in-Worker `paperclip-client.ts` /
  `dispatch.ts` glue. All Phase 3 commands that previously took that path
  (`ts-summon-agent`, `ts-approve-synapse`, `ts-generate-brief`) are now
  routed `downstream_multica` with an explicit `multica_agent` field on
  their registry spec.
- **Dispatch ownership (Phase B, 2026-06-16)** moved to the cambium-bridge
  `teamforge-consumer` on the Mac mini. The Worker is dumb intake; the
  consumer polls `GET /v1/commands/runs?state=created&route=downstream_multica`
  every ~5s, calls `multica issue assign --to <multica_agent>`, polls the
  MultiCA issue until terminal state, and posts back via this contract's
  callback route. No AWS infra dependency.
