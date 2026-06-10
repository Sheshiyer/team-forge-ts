# Architecture Changes — 2026-06-11

## Founder Secrets Layer (Cloudflare Zero Trust + KV)

Added an identity-bound secrets store to the TeamForge control plane so the two
co-founders can sync API keys/tokens, with agents getting read-only access to a
shared agent scope. Architecture pass — touches auth, storage, and the desktop/
agent caller contracts (all existing routes left unchanged).

### What changed

**Worker (`cloudflare/worker/`)**
- `src/lib/access-jwt.ts` (new) — validates Cloudflare Access JWTs inside the
  Worker (RS256 vs team JWKS, exact `aud`/`iss`, time window, JWKS cache) and
  resolves a principal (founder / agent / anonymous). Hardcoded
  `FOUNDER_ALLOWLIST`.
- `src/lib/secrets-crypto.ts` (new) — AES-256-GCM envelope seal/open, AAD bound
  to KV key + version, `kid` for rotation.
- `src/routes/secrets.ts` (new) — `/v1/secrets/*` CRUD with the per-scope authz
  matrix.
- `src/routes/v1.ts` — mounts `/v1/secrets/*` ahead of existing routes; the new
  family uses its own principal resolution, not `requireAppOrInternalAuth`. Also
  fixed two pre-existing `jsonError` calls missing the required `retryable`
  field (latent because the package had no `tsc` installed).
- `src/lib/env.ts` — added `SECRETS_KV`, `TF_SECRETS_MASTER_KEY`,
  `TF_ACCESS_TEAM_DOMAIN`, and a `KVNamespaceLike` interface.
- `wrangler.jsonc` — `kv_namespaces` binding `SECRETS_KV`
  (`f581ee25a19f4dca8e4386fba693bc75`, preview `af4a27a77672476a8da61b870e299801`)
  and the `TF_ACCESS_TEAM_DOMAIN` var.
- `scripts/secrets-crypto.test.mjs` (new) — standalone crypto verification.

**CLI (`scripts/teamforge-secrets.mjs`, new)** — founder CLI: list/get/put/del/
pull. Auth ladder: cloudflared access token (founder) → service token (agent
read) → internal secret (agent read). `pull` writes a `0600` env file.

**Docs** — `docs/runbooks/founder-secrets.md`,
`docs/runbooks/access-policy-fallback.md`, worker `README.md` section, plus vault
companions (`CLAUDE.md`, `00-meta/system-of-records.md`,
`00-meta/founder-vault-sync-contract.md`,
`00-meta/mocs/command-center-architecture.md`).

### Live resources created

| Resource | Value |
|---|---|
| KV namespace (prod) | `teamforge-secrets` — `f581ee25a19f4dca8e4386fba693bc75` |
| KV namespace (preview) | `teamforge-secrets_preview` — `af4a27a77672476a8da61b870e299801` |
| Worker secret | `TF_SECRETS_MASTER_KEY` (32-byte AES key, set via `wrangler secret put`) |
| Worker var | `TF_ACCESS_TEAM_DOMAIN=red-queen-4dfa.cloudflareaccess.com` |
| Deploy | `teamforge-api` version `01c27837-e41b-419e-a41c-fc02d74692b6` |

### Security model (RedTeam-hardened)

The collapse risk was the known **service-token 302 / Worker-only route** quirk
plus IP-bypass requests arriving with no JWT. Mitigations:

- The Worker validates the Access JWT cryptographically on every secrets request;
  it never trusts the edge. No JWT → machine/agent principal at most, never
  founder. **Verified**: the `workers.dev` origin (reachable without Access) and
  a forged assertion header both return `401`.
- Founder = signature + `aud` + `iss` pass **and** allowlisted email; a token
  with `common_name` is always an agent, never promoted to founder.
- Cross-founder isolation: private scope addressable only as `me`, resolved to
  the canonical allowlist email.
- Envelope AAD binds ciphertext to KV key + version (no relocation, no rollback).
  **Verified** by `secrets-crypto.test.mjs` (8/8).

### Follow-up resolved — bootstrap topology disclosure (sec-review C2)

`GET /v1/bootstrap` previously returned binding/route topology
(`bindings`, `routeStatus`) to anonymous callers, leaking which secrets/services
are configured. Investigation found **no caller** of `/v1/bootstrap` or
`/v1/remote-config` anywhere in the repo (Tauri app, frontend, scripts). Fixed by
splitting the payload: anonymous callers get only
`{service, phase, environment, defaultOtaChannel}` at HTTP 200 (liveness/version
probe preserved); `bindings` + `routeStatus` are returned only to authenticated
callers (via the existing `requireAppOrInternalAuth` combo used as a boolean).
`/v1/remote-config` left public — it exposes only feature flags + workspace mode,
no binding/secret topology. Deployed `teamforge-api` version
`139ca42e-ea46-4da0-99d0-8095c8fe57de`. Verified: anon origin response carries no
`bindings`/`routeStatus` keys and returns 200; healthz + secrets origin
unregressed.

### Founder @thoughtseed.space logins + zero-disk credentials (2026-06-11, later pass)

Per founder direction, the canonical logins are `shesh@thoughtseed.space` and
`mohan@thoughtseed.space`, and credentials must never be stored on local disk.

- **Worker allowlist:** `FOUNDER_ALLOWLIST` now leads with the two
  @thoughtseed.space addresses. The gmail addresses are retained as a TEMPORARY
  lockout fallback (Phase 1) and are removed (Phase 2) once @thoughtseed.space
  One-Time PIN login is confirmed and the Access dashboard policy is updated.
  Deployed version `6ed16ffb-b747-4151-adb0-0684e22ec144`.
- **CLI zero-disk:** `teamforge-secrets` gained `env` (prints `export K=V` for
  `eval`, in shell RAM) and `exec <scope> -- <cmd>` (injects into a subprocess
  env). Neither writes a file. `pull` is deprecated and warns (writes plaintext
  to disk).
- **Desktop zero-disk:** `src-tauri/src/db/queries.rs` now routes the five
  credential keys (`clockify_api_key`, `huly_token`, `slack_bot_token`,
  `github_token`, `cloud_credentials_access_token`) to a process-global
  in-memory map inside `get_setting`/`set_setting`/`delete_setting`. All 21
  existing readers are unchanged (interception, not rewiring). Startup calls
  `purge_sensitive_settings_from_disk` to clear any rows older builds wrote.
  `cargo check` passes. Runtime verification (build + run + inspect teamforge.db)
  is a founder step. Consequence: app restart requires re-auth/re-sync.
- **Pending:** Access dashboard policy update (add @thoughtseed.space, then
  Phase-2 remove gmail) — requires a scoped CF API token; the local token lacks
  Access scope.

### Known follow-ups

- **Access policy edit for Mohan is a manual dashboard step.** The founder Mac's
  `CF_API_TOKEN` is active but lacks Access scopes, and wrangler OAuth can't edit
  Access policies. The Worker allowlist already includes both Mohan emails; the
  Zero Trust Allow policy must be updated to match. See
  `docs/runbooks/access-policy-fallback.md`.
- `/v1/credentials` (shared vendor tokens) is unchanged — a future pass could
  migrate it onto this layer.
- `TF_INTERNAL_SHARED_SECRET` is not currently set; the internal-secret agent
  path is inactive until configured.
