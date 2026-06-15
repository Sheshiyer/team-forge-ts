# Paperclip Dedicated-Agent Contract

> System of record: `thoughtseed-paperclip/services/listener/standup.ts` (listener) and `cloudflare/worker/src/lib/paperclip-client.ts` (Worker client).

## Scope

Remote-safe HTTP interface for Paperclip dedicated agents. Used by both
MultiCA (for `downstream_multica` routes like `ts-standup`) and the
TeamForge Worker (for `downstream_paperclip` routes like `ts-summon-agent`,
`ts-generate-brief`).

The existing Telegram dispatcher and local CLI flows remain untouched —
this is a separate, parallel envelope.

## Request — `POST /api/agents/:agent_id/standup`

```typescript
interface PaperclipStandupRequest {
  agent_id: string;            // matches the path param
  scope: {
    project_id?: string;
    date?: string;             // YYYY-MM-DD; default = today
  };
  correlation_id: string;      // echoed verbatim in response
  requester: {
    kind: "multica_service" | "teamforge_worker";
    identity: string;          // free-form caller identifier for audit
  };
}
```

## Response

```typescript
interface PaperclipStandupResponse {
  agent_id: string;
  correlation_id: string;
  state: "succeeded" | "failed";
  data?: {
    yesterday: string[];
    today: string[];
    blockers: string[];
    confidence: number;        // 0..1
  };
  error?: { code: string; message: string };
  sources: Array<{
    kind: "huly" | "github" | "slack" | "clockify";
    id: string;
    ts: number;                // epoch ms
  }>;
}
```

## Auth — per-agent bearer tokens

Each dedicated agent has its own bearer token. The listener loads them from
the `PAPERCLIP_AGENT_TOKENS` env var, which is a JSON object:

```json
{ "agent-engineering-lead": "<token-1>", "agent-ceo": "<token-2>" }
```

The Worker mirrors the map in its own secret `PAPERCLIP_AGENT_TOKEN_MAP`
(same format). Both must hold the same value for any agent that's reachable.

There is **no** global API key. A request with a valid token for agent A
cannot access agent B's endpoint — the verifier matches the path param.

| HTTP | Cause |
|---|---|
| 200 | succeeded or failed envelope (caller distinguishes via `state`) |
| 400 | malformed request (`missing_correlation_id`, `missing_scope`, `missing_requester`, `invalid_json`) |
| 401 | `missing_authorization` — no `Authorization: Bearer` header |
| 403 | `invalid_token` or `invalid_scheme` |
| 404 | `agent_not_registered` — agent_id has no entry in the token map |

## End-to-end flow (ts-standup)

1. Hermes UI clicks command → Tauri `post_command_intent` → Worker `/v1/commands/intent`
2. Worker writes `command_runs` row, route = `downstream_multica`, state = `created`
3. MultiCA picks up the `created` run (separate AWS infra; mocked via `cloudflare/worker/tools/mock-multica.sh` for Phase 3)
4. MultiCA → Paperclip `POST /api/agents/:agent_id/standup` (this contract)
5. MultiCA → Worker `POST /v1/commands/runs/:id/result` (Phase 2 callback)
6. Worker writes `result_json` + emits `result_received` + `result_delivered`
7. Hermes UI polls `GET /v1/commands/runs/:id` every 1500ms — surfaces state progression + final result

For `downstream_paperclip` routes (e.g. `ts-summon-agent`), step 3-5 collapses:
the Worker's `dispatchRun` calls `paperclip-client` directly and persists the
result via the same `recordRunResult` path.

## Known limitations & forward links

- **Stub data:** Phase 3's `buildStandupResponse` returns an empty but well-formed
  envelope. Real source aggregation (Huly issues, GitHub PRs, Slack messages,
  Clockify entries) lives in a follow-up plan. The wire is proven; the agents
  fill it in.
- **No streaming.** Long-running standup requests block the caller. If
  aggregation exceeds the 10-second timeout, the Worker's `paperclip-client`
  returns `paperclip_unavailable`. Future: switch to async kickoff + the Phase 2
  callback path for Paperclip too.
- **Token rotation** is manual today — `wrangler secret put PAPERCLIP_AGENT_TOKEN_MAP`
  on the Worker side and `PAPERCLIP_AGENT_TOKENS` env update on the listener. A
  token-management surface lives in a separate plan.
