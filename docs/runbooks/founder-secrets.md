# Founder Secrets — Runbook

TeamForge secrets layer: identity-bound API keys and tokens, encrypted in
Cloudflare KV, synced between the two co-founders and readable by agents.

- **API:** `https://forge.thoughtseed.space/v1/secrets/*` (behind Cloudflare Access)
- **CLI:** `team-forge-ts/scripts/teamforge-secrets.mjs`
- **Storage:** KV namespace `teamforge-secrets` (`SECRETS_KV` binding),
  AES-256-GCM envelope-encrypted with the Worker secret `TF_SECRETS_MASTER_KEY`.
- **Identity:** Cloudflare Access JWT, validated **inside the Worker** against the
  team JWKS (`red-queen-4dfa.cloudflareaccess.com`). The Worker never trusts the
  edge alone — a forged assertion or an IP-bypass request gets no founder rights.
- **Founder logins (canonical):** `shesh@thoughtseed.space` and
  `mohan@thoughtseed.space` (One-Time PIN to the mailbox). During cutover the old
  gmail addresses remain as a TEMP fallback in the Worker allowlist; they are
  removed in Phase 2 once @thoughtseed.space login is confirmed working.
- **Zero-disk:** credentials are never written to disk. Use `env`/`exec` (below)
  for the CLI, and the desktop app holds synced credentials in RAM only.

## Scopes & permissions

| Request scope | Stored as | Founder | Service token / internal secret |
|---|---|---|---|
| `me` | `founder/<your-email>/<name>` | read + write (yours only) | no access |
| `shared` | `shared/<name>` | read + write (both founders) | no access |
| `agents` | `agents/<name>` | read + write | **read only** |

A founder addresses their own private scope only as the literal `me` — there is
no way to name the other founder's private namespace. Cross-founder private
secrets are unaddressable by design.

## One-time founder setup

```bash
# 1. Install cloudflared (already done on the founder Mac):
brew install cloudflared

# 2. Log in once (opens a browser; enter your @thoughtseed.space address,
#    then the One-Time PIN emailed to that mailbox):
cloudflared access login https://forge.thoughtseed.space

# 3. Verify:
node team-forge-ts/scripts/teamforge-secrets.mjs list shared
```

The login token is cached by cloudflared and auto-refreshed. The CLI shells out
to `cloudflared access token` on each call — no token ever lives in a file.

## Daily usage

```bash
S="node team-forge-ts/scripts/teamforge-secrets.mjs"

# List (names + masked values + version, never plaintext):
$S list me
$S list shared
$S list agents

# Read one (masked by default; --reveal to print the value):
$S get shared OPENAI_API_KEY --reveal

# Write (value as arg, or piped on stdin so it stays out of shell history):
printf '%s' "$THE_SECRET" | $S put shared OPENAI_API_KEY
$S put me NOTION_TOKEN secret_xxx

# Delete:
$S del me NOTION_TOKEN

# Inject a whole scope into your CURRENT shell, in memory, nothing on disk:
eval "$(teamforge-secrets env shared)"
echo "$OPENAI_API_KEY"   # now set in this shell only; gone when the shell exits

# Or run one command with the secrets injected into just its environment:
teamforge-secrets exec agents -- ./run-agent.sh
teamforge-secrets exec shared -- node build.js
```

**Zero-disk is the default.** `env` prints `export K=V` lines for `eval` (values
live only in the shell's memory); `exec` injects them into a single subprocess.
Neither writes a file. Prefer these over anything that lands on disk.

```bash
# DEPRECATED — writes plaintext to disk, warns when used. Only for legacy tools
# that cannot read env vars. Never commit the file; delete it when done.
$S pull agents --out ./.agent-secrets.env
```

## Agent / machine access (read-only `agents/*`)

Agents and m2m callers use a Cloudflare Access **service token**, set in env:

```bash
export CF_ACCESS_CLIENT_ID=<id>.access
export CF_ACCESS_CLIENT_SECRET=<secret>
node team-forge-ts/scripts/teamforge-secrets.mjs list agents
node team-forge-ts/scripts/teamforge-secrets.mjs get agents SOME_KEY --reveal
```

Service tokens can **only read** the `agents/` scope. They cannot write anything
and cannot touch `me`/`shared`. If a service token hits the known Worker-route
302 quirk at the edge, fall back to `TF_INTERNAL_SHARED_SECRET` from an
IP-bypass-allowed machine (same read-only `agents` rights).

## Rotation

- **A founder secret value:** just `put` it again — version increments, old
  ciphertext is superseded (and the AAD version guard rejects rollback).
- **The master key (`TF_SECRETS_MASTER_KEY`):** envelopes carry a `kid` (`k1`)
  to support multi-key rotation. Rotating requires reading each secret with the
  old key and re-`put`ting under a new key id — do this with a dedicated
  migration, not by hand, before retiring the old key.

## Desktop app (zero-disk credentials)

The TeamForge desktop app holds synced credentials in **memory only**. On login
it auto-syncs vendor tokens (Clockify, Huly, Slack, GitHub) and keeps them in a
process-global in-memory store — they are never written to the local SQLite
settings database. The Access token is treated the same way.

Consequences:
- **On every app restart you re-authenticate / re-sync.** Nothing credential-shaped
  survives a quit. This is intentional ("nothing locally stored").
- Older builds may have written credentials to `teamforge.db`; the app now
  **purges** those rows on startup (`purge_sensitive_settings_from_disk`).
- Non-credential settings (base URL, audience, UI prefs) still persist normally.

Implementation: `src-tauri/src/db/queries.rs` routes the keys
`clockify_api_key`, `huly_token`, `slack_bot_token`, `github_token`,
`cloud_credentials_access_token` to the in-memory store inside
`get_setting`/`set_setting`/`delete_setting`; all other settings are unchanged.

## Adding a founder to Cloudflare Access

The allowlist of founder *emails* is hardcoded in
`cloudflare/worker/src/lib/access-jwt.ts` (`FOUNDER_ALLOWLIST`). The Access
*policy* (who can reach the app at all) is separate and lives in the Zero Trust
dashboard. Both must include the email. See
[`access-policy-fallback.md`](./access-policy-fallback.md).

## Disaster: locked out

If a founder cannot complete One-Time PIN (email delivery), the second
allowlisted address (`mohanmv1711@gmail.com` for Mohan) is a fallback identity.
If both fail, edit the Access policy in the Zero Trust dashboard (manual) —
service tokens and `TF_INTERNAL_SHARED_SECRET` keep agent reads working
meanwhile.
