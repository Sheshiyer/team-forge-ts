# TeamForge Cloudflare Worker

This package is the Phase 2 Wave 1 scaffold for the TeamForge Cloudflare backend.

It aligns with the frozen contracts in:

- `docs/architecture/contracts/secrets-auth-contract.md`
- `docs/architecture/contracts/d1-schema-contract.md`
- `docs/architecture/contracts/worker-route-contract.md`
- `docs/architecture/contracts/ota-updater-contract.md`

## Scope

Wave 1 provides:

- a dedicated Worker codebase scaffold
- a Wrangler configuration with the required bindings
- an additive `0001_initial.sql` D1 migration
- a follow-on project control-plane migration for canonical TeamForge project graph storage
- sample payload fixtures for the first public route set
- `/v1/credentials` as the desktop integration boundary for shared vendor tokens
  and non-secret mapping/config

Wave 1 does not yet provide:

- live Cloudflare resource IDs
- complete route implementations
- vendor sync logic
- OTA publication logic
- live GitHub or Huly issue/milestone propagation

## Current Cloudflare Status

The Cloudflare MCP spec is reachable in this environment, but live account execution is currently blocked by an authentication error:

- `10000 Authentication error`

Because of that, `wrangler.jsonc` still contains placeholder IDs for:

- the D1 database
- the R2 bucket
- the sync queue

## Expected Remote Resource Names

- Worker name: `teamforge-api`
- D1 database name: `teamforge-primary`
- R2 bucket name: `teamforge-artifacts`
- Queue name: `teamforge-sync`

## Next Steps

1. Authenticate the Cloudflare MCP or Wrangler against the target account.
2. Apply the additive project control-plane migration so D1 owns:
   - canonical project metadata
   - GitHub repo links
   - Huly project links
   - project artifacts
   - project sync policy
3. Create the R2 bucket and queue, then replace the remaining placeholders if still missing.
4. Implement the first repository-backed project routes:
   - `/v1/projects` for summary rows
   - `/v1/project-mappings` for full project graph reads/writes
5. Add queue consumers and Durable Object coordination for sync flows.

## Project Control Plane

The current architectural direction is:

- Cloudflare Worker + D1 is the canonical TeamForge control plane
- local SQLite in the desktop app is a cache/offline projection only
- GitHub owns engineering issues
- Huly owns execution/admin issues
- milestones are GitHub-authoritative by default

The Worker project routes are expected to separate summary and graph concerns:

- `/v1/projects`
  - project list and sync-health summary
- `/v1/project-mappings`
  - full editable project graph including links, artifacts, and policy

## Integration Config

`/v1/credentials` returns:

- `credentials`: shared Clockify, Huly, Slack, and GitHub tokens from Worker secrets.
- `integrations`: non-secret mapping/config from `TF_INTEGRATION_CONFIG_JSON`.

The desktop app persists that config into local SQLite before syncing. Display
pages should consume the backend projections and should not hardcode repo,
client, milestone, Huly, Clockify, or Slack assumptions.

Example `TF_INTEGRATION_CONFIG_JSON`:

```json
{
  "github": {
    "repos": [
      {
        "repo": "Sheshiyer/parkarea-aleph",
        "displayName": "ParkArea Phase 2 - Germany Launch",
        "clientName": "ParkArea",
        "defaultMilestoneNumber": 1,
        "enabled": true
      }
    ]
  },
  "huly": { "mirrorMode": "read_only", "mirrorEnabled": true },
  "slack": {},
  "clockify": {}
}
```

## Founder secrets layer — `/v1/secrets/*` (2026-06-11)

Identity-bound secret storage for the two co-founders. Distinct from
`/v1/credentials` (which serves shared *vendor* integration tokens to the desktop
app and is unchanged). This layer stores arbitrary API keys/tokens, encrypted,
keyed to founder identity.

**Auth is self-contained** — this route family does NOT use the app
Bearer / internal-secret combo. It resolves its own principal in
`src/lib/access-jwt.ts`:

- **founder** — request carries a Cloudflare Access JWT that the Worker validates
  itself (RS256 vs team JWKS, exact `aud`, exact `iss`, time window) AND whose
  `email` claim is byte-equal to a hardcoded `FOUNDER_ALLOWLIST` entry.
- **agent** — a valid Access JWT with a `common_name` (service token), or a valid
  `X-TeamForge-Internal-Secret` header. Read-only on `agents/*`.
- **anonymous** — everything else → `401`.

The Worker never trusts the edge: a forged `Cf-Access-Jwt-Assertion` header or an
IP-bypass request (no JWT) cannot obtain founder rights. Verified by hitting the
`workers.dev` origin directly — both return `401`.

### Authz matrix

| principal | `me` (founder/self) | `shared` | `agents` |
|---|---|---|---|
| founder | read + write | read + write | read + write |
| service token | — | — | read |
| internal secret | — | — | read |
| anonymous | 401 | 401 | 401 |

A founder's private scope is addressed only as the literal `me`; the other
founder's private namespace is unaddressable.

### Routes

| Method | Path | Action |
|---|---|---|
| GET | `/v1/secrets/<scope>` | list names + metadata (never values) |
| GET | `/v1/secrets/<scope>/<name>` | read one (decrypted) |
| PUT | `/v1/secrets/<scope>/<name>` | create/update, body `{ "value": "..." }` |
| DELETE | `/v1/secrets/<scope>/<name>` | delete |

`<scope>` ∈ `me | shared | agents`. Names match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`.

### Storage & crypto

- KV namespace `teamforge-secrets` (binding `SECRETS_KV`).
- Values sealed with AES-256-GCM under the Worker secret `TF_SECRETS_MASTER_KEY`
  (base64 of 32 bytes). AAD binds each ciphertext to its exact KV key **and**
  version, so a blob cannot be relocated or rolled back. Envelope carries a `kid`
  for future key rotation.
- KV metadata holds only name / scope / created_by / updated_by / updated_at /
  version / masked — no plaintext.

### Config

- Var `TF_ACCESS_TEAM_DOMAIN` = `red-queen-4dfa.cloudflareaccess.com`.
- Secret `TF_SECRETS_MASTER_KEY` via `wrangler secret put` (never in `vars`).
- CLI: `scripts/teamforge-secrets.mjs`. Runbook + Access policy steps:
  `docs/runbooks/founder-secrets.md`, `docs/runbooks/access-policy-fallback.md`.
