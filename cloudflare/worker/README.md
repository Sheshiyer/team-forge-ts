# TeamForge Cloudflare Worker

This package is the Phase 2 Wave 1 scaffold for the TeamForge Cloudflare backend.

It aligns with the frozen contracts in:

- `docs/architecture/contracts/secrets-auth-contract.md`
- `docs/architecture/contracts/d1-schema-contract.md`
- `docs/architecture/contracts/worker-route-contract.md`
- `docs/architecture/contracts/ota-updater-contract.md`

## Auth (current, post-WS5)

App routes accept three tiers (`requireAppOrInternalAuth` in `src/routes/v1.ts`):

1. **Cloudflare Access JWT** — `Cf-Access-Jwt-Assertion` header (or
   `CF_Authorization` cookie) verified by `src/lib/access.ts` against
   `TF_ACCESS_TEAM_DOMAIN` + `TF_ACCESS_AUD` (comma-separated AUD list; two
   Access apps front this worker: plexus-api.thoughtseed.space for Plexus
   employees, forge.thoughtseed.space for the operator).
2. **Internal shared secret** — `X-TeamForge-Internal-Secret` header
   (`TF_INTERNAL_SHARED_SECRET`), m2m via the workers.dev hostname.
3. **App Bearer** — `Authorization: Bearer` (`TF_CREDENTIAL_ENVELOPE_KEY`).

`GET /v1/whoami` is the exception: Access-JWT-only and fail-closed (401 without
a verified identity) — it is how Plexus resolves the signed-in employee's email.
`TF_ACCESS_AUDIENCE` is unrelated to JWT verification: it is the
`/v1/credentials` `?audience=` echo check for the desktop credential handout.

### Weekly reporting context

`GET /v1/reporting/weekly-context` is a separate, read-only machine boundary.
The custom domain has two independent authentication layers:

1. Cloudflare Access authenticates the machine at the edge using
   `CF-Access-Client-Id` and `CF-Access-Client-Secret`.
2. The Worker application authenticates the reporting consumer using
   `Authorization: Bearer $TF_REPORTING_READ_TOKEN`.

The reporting bearer is dedicated: app credential-envelope, webhook, and
temporary internal-bridge secrets are not accepted. Configure
`TF_REPORTING_WORKSPACE_ID` on the Worker; callers cannot select or override a
workspace. The response contains only versioned aggregate counts and bounded
seven-day/latest-historical freshness metadata. Overall freshness is `fresh`
only when all four required sources are fresh; partial evidence is `mixed`.
Every response sets `Cache-Control: no-store`.

Configure both server-owned values without printing or committing them:

```bash
pnpm exec wrangler secret put TF_REPORTING_READ_TOKEN
pnpm exec wrangler secret put TF_REPORTING_WORKSPACE_ID
```

Load the three caller credentials from an approved runtime secret store, then
run a redacted metadata-only probe. Never inline their values in shell history:

```bash
curl --fail-with-body --silent --show-error \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID:?load from secret store}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET:?load from secret store}" \
  -H "Authorization: Bearer ${TF_REPORTING_READ_TOKEN:?load from secret store}" \
  "${TEAMFORGE_BASE_URL:?set base URL}/v1/reporting/weekly-context" \
  | jq '{ok,schemaVersion:.data.schemaVersion,generatedAt:.data.generatedAt,window:.data.window,projects:.data.projects,clients:.data.clients,kpis:.data.kpis,freshness:.data.freshness}'
```

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

## GitHub App control plane

Private repository authority uses one public, unlisted GitHub App so the same
App can be installed on the Thoughtseed Labs organization and the founders'
personal accounts. The path never reads
`TF_GITHUB_TOKEN_GLOBAL`; that variable remains only for legacy sync behavior
outside this control plane. App and installation tokens are held in Worker
memory only, scoped to numeric repository IDs whenever the repository is
known, and are never logged or persisted.

Configure the non-secret values as Worker variables:

- `TF_GITHUB_APP_ID`
- `TF_GITHUB_APP_SLUG`
- `TF_GITHUB_APP_CLIENT_ID`
- `TF_GITHUB_APP_CALLBACK_URL` (`https://<worker>/v1/github/callback`)
- `TF_GITHUB_ALLOWED_INSTALLATION_ACCOUNTS`
  (`Organization:thoughtseed-labs:65741640,User:Sheshiyer:7611727,User:psychon7:47470954`;
  exact `Type:login:numeric-account-id` entries)
- `TF_GITHUB_ALLOWED_ACTORS`
  (`Sheshiyer:7611727,psychon7:47470954`; `login:numeric-user-id` pairs)

Configure secret values with `wrangler secret put`:

- `TF_GITHUB_APP_PRIVATE_KEY`
- `TF_GITHUB_APP_CLIENT_SECRET`
- `TF_GITHUB_APP_WEBHOOK_SECRET`
- `TF_GITHUB_APP_STATE_SIGNING_SECRET` (at least 32 characters)

The GitHub App must use the callback path above as both its OAuth callback and
post-install setup URL, and must send webhooks to
`POST /v1/github/webhook`. Configure only these two exact paths as public
Cloudflare Access bypasses. Every other `/v1/github/*` path remains behind
Cloudflare Access and resolves a registered Plexus principal; connection,
repository selection, verification, and writes require a workspace admin.
Activity sync is available to active registered workspace members for their
same-workspace project.

Each founder enrolls separately through GitHub App OAuth. During actor
enrollment, the Worker uses the ephemeral GitHub user access token only for
`GET /user` and `GET /user/installations`, requires access to any active
installation already bound to the workspace, and then discards the token. D1 stores only the
verified numeric GitHub user ID, login snapshot, and Plexus identity mapping.
Login text is never sufficient authority: the configured login and immutable
numeric user ID must both match.

GitHub delivers the `installation` and `installation_repositories` webhook
events to every GitHub App automatically; they are not selectable in the
optional event-subscription list. Leave unrelated optional events unchecked.
Install the App separately on each approved account, choose **Only select
repositories**, and select only that account's approved repositories.
The Worker rejects the GitHub `repository_selection: all` grant and ignores
signed public-App webhooks from non-allowlisted accounts before persisting
installation or repository facts.

Required GitHub App repository permissions are:

- Metadata: read
- Contents: read and write
- Pull requests: read and write
- Issues: read
- Actions: read
- Checks: read

The Worker requests the least subset for each token. Discovery alone receives
an installation-wide metadata-read token because numeric repository IDs are
not yet known. Verification and activity tokens are narrowed to one repository;
write tokens are narrowed to one repository and cannot update the default
branch, force references, or modify `.github/workflows`.

Routes:

- `GET /v1/github/connection`
- `POST /v1/github/connect/start` (`{ "accountId": <numeric allowlisted ID> }`)
- `GET /v1/github/actor`
- `POST /v1/github/actor/enroll/start`
- `GET /v1/github/repositories`
- `POST /v1/projects/:projectId/github-repo/verify`
- `POST /v1/projects/:projectId/github-activity/sync`
- `POST /v1/projects/:projectId/github-pull-requests`
- `GET /v1/github/callback` (public, signed single-use state)
- `POST /v1/github/webhook` (public, `X-Hub-Signature-256`)

Apply migrations `0012_github_app_control_plane.sql`,
`0013_github_workspace_actors.sql`, and
`0014_github_multi_owner_installations.sql` before enabling the routes.
It stores OAuth/install correlation state, immutable signed installation
facts, multiple exact account-scoped workspace bindings, numeric repositories,
delivery dedupe/leases, project verification, and idempotent write receipts.
Repository verification requires numeric `installationId` and `repositoryId`;
activity and writes use the project's persisted installation. It stores no
OAuth token, installation token, client secret, webhook secret, private key,
or PAT.

Immediate founder revocation is fail-closed: remove the founder's
`login:numeric-id` pair from `TF_GITHUB_ALLOWED_ACTORS` or revoke their active
Plexus administrator role. Every guarded write rechecks both controls and then
rechecks the actor's live numeric repository permission before mutation. A
local organization-membership preflight is setup guidance only; server
authority is the pinned founder IDs, exact allowlisted installation accounts,
active Plexus admin, and live per-repository permission.

### Founder inputs before setup

Collect only these non-secret decisions/identifiers before an owner-admin
approves the installation:

- ownership model: one shared GitHub organization or separate founder accounts
- both founders' GitHub usernames and verified/noreply commit email addresses
- each pilot repository's `owner/name` (the Worker resolves numeric IDs from the signed installation/API authority)
- merge policy (required reviews/checks and who may merge)
- confirmation that an organization/repository owner-admin approves installation

Never paste a PAT, GitHub password, App private key, client secret, webhook
secret, or state-signing secret into Plexus, an issue, chat, or repository
documentation. Enter Worker secrets directly with `wrangler secret put` from a
trusted operator shell.
