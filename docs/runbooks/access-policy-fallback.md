# Cloudflare Access — Policy Edit & Fallback

The TeamForge API (`forge.thoughtseed.space`) sits behind Cloudflare Zero Trust
Access. This note covers editing the Access **policy** (who may reach the app)
and the fallback when API automation is unavailable.

## Current state (captured 2026-06-11, pre-change)

| Field | Value |
|---|---|
| Access app | `TeamForge API` (ID `6c2fc2fb-2e3d-4be4-b828-083a1292947b`) |
| AUD tag | `d3892b5d2a62027029b09b2fd015a9e8074d5efb38c443099f803517cb3feb51` |
| Team domain | `red-queen-4dfa.cloudflareaccess.com` |
| JWKS | `https://red-queen-4dfa.cloudflareaccess.com/cdn-cgi/access/certs` |
| Login methods | One-Time PIN (email) confirmed enabled; Google for the gmail identity |
| Service tokens | `teamforge-multica-bridge-v2` (`fd36d447-…`), `teamforge-api-client` (`b95444e1-…`), `teamforge-multica-bridge` (`5a551544-…`) |
| Known quirk | Service tokens return `302 service_token_status:false` on this Worker-only route; m2m falls back to `X-TeamForge-Internal-Secret` + IP bypass |

## Why this can't always be scripted

The founder Mac's `CF_API_TOKEN` (`~/.claude/.env`, id `ff3614fc…`) is **active
but lacks Access scopes** — `GET /accounts/.../access/*` returns
`10000 Authentication error`. Wrangler's OAuth login (workers/kv/d1) can deploy
the Worker and manage KV, but **cannot edit Access policies**. So Access policy
changes are a **manual dashboard step** unless a new scoped API token is minted.

## Required change: add Mohan to the founder allowlist

Two layers must agree:

1. **Worker code allowlist** (already done) —
   `cloudflare/worker/src/lib/access-jwt.ts` `FOUNDER_ALLOWLIST` includes
   `mohan@thoughtseed.space` and `mohanmv1711@gmail.com`.
2. **Access policy** (manual) — in the Zero Trust dashboard, the `TeamForge API`
   app's Allow policy must include those emails as `Emails` selectors.

### Canonical cutover to @thoughtseed.space (2026-06-11)

Canonical founder logins are `shesh@thoughtseed.space` and
`mohan@thoughtseed.space`. The old gmail addresses are removed once the new ones
are confirmed working. **Two phases — never remove the only working identity
before the replacement is confirmed deliverable (OTP is the only login method).**

**Phase 1 — ADD (do this first, additive, no lockout risk):**
1. Zero Trust → Access → Applications → **TeamForge API** → Policies → the Allow policy.
2. Under **Include → Emails**, add `shesh@thoughtseed.space` and
   `mohan@thoughtseed.space` *alongside* the existing entries. Do not remove
   anything yet.
3. Leave service-token Include rules untouched. Save (no redeploy needed — the
   Worker allowlist already includes both @thoughtseed.space addresses).
4. Each founder runs `cloudflared access login https://forge.thoughtseed.space`,
   enters their @thoughtseed.space address, completes the One-Time PIN, then
   `node team-forge-ts/scripts/teamforge-secrets.mjs list shared` to confirm.

**Phase 2 — REMOVE gmail (only after Phase 1 login is confirmed for BOTH founders):**
5. Tell the agent "confirmed" → it removes the two gmail addresses from the
   Worker `FOUNDER_ALLOWLIST` and redeploys.
6. In the dashboard, remove `sheshnarayan.iyer@gmail.com` and
   `mohanmv1711@gmail.com` from the Allow policy Include. Save.
7. End state: only `shesh@thoughtseed.space` + `mohan@thoughtseed.space` (plus
   the unchanged service tokens) can reach or be granted founder rights.

### Scripted alternative (if a scoped token is minted)

Mint an API token with **Account → Access: Organizations, Identity Providers,
Apps and Policies → Edit**, then:

```bash
export CF_ACCESS_TOKEN=<new-scoped-token>
ACC=9d9d23b27f32e70ae3afb6a1aa2c0f10
APP=6c2fc2fb-2e3d-4be4-b828-083a1292947b
# GET current policies first (capture before mutate):
curl -s -H "Authorization: Bearer $CF_ACCESS_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/access/apps/$APP/policies" | jq .
# Then PUT the updated Allow policy with the two emails added to include[].
```

Always GET-and-save the existing policy JSON before any PUT, and make changes
**additive** — never delete the service-token entries or the existing founder
email.

## Verifying after a policy change

```bash
cloudflared access login https://forge.thoughtseed.space   # as the new identity
node team-forge-ts/scripts/teamforge-secrets.mjs list shared
```
