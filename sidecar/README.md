# Huly Sidecar — GitHub Engagement Mirror

> Mirrors a GitHub-backed ThoughtSeed engagement (Project + Components + Issues) into Huly Tracker, populating enums per [`../docs/huly-system-design.md`](../docs/huly-system-design.md). Huly is mirror-only in v1; GitHub remains the source of truth.

## What it does

For a given engagement (e.g. ParkArea Phase 2):
1. Authenticates to Huly Accounts (`selectWorkspace`) and resolves workspace REST session credentials
2. **Upserts** the Project (`PARKAREA`) — idempotent
3. **Upserts** the 10 parallel-track Components (`contracts`, `backend-core`, `backend-domain`, `backend-payments`, `frontend-public`, `frontend-provider`, `frontend-admin`, `infra`, `i18n`, `qa`)
4. **Fetches** GitHub issues from `TEAMFORGE_DB_PATH` cache when provided, otherwise from the configured GitHub repo
5. **Mirrors** each into Huly Tracker as `Issue`, mapped to the right Component, with priority/status from labels
6. **Updates** existing Huly issues from GitHub on re-run, including closed status

REST endpoints used:
- `GET /config.json`
- `POST selectWorkspace` (JSON-RPC to `ACCOUNTS_URL`)
- `GET /api/v1/find-all/{workspace}`
- `POST /api/v1/tx/{workspace}`

Idempotent — safe to re-run.

## Setup

```bash
cd team-forge-ts/sidecar
pnpm install
cp .env.example .env
# Edit .env — fill in HULY_TOKEN, HULY_WORKSPACE
```

## Run

```bash
# Mirror the ParkArea preset
HULY_BASE_URL=https://huly.app \
HULY_WORKSPACE=$HULY_WORKSPACE \
HULY_TOKEN=$HULY_TOKEN \
GITHUB_REPO=Sheshiyer/parkarea-aleph \
GITHUB_TOKEN=$(gh auth token) \
pnpm mirror:github
```

To mirror from TeamForge's local GitHub cache instead of calling GitHub directly, pass the SQLite path:

```bash
TEAMFORGE_DB_PATH="$HOME/Library/Application Support/com.thoughtseed.teamforge/teamforge.db" \
HULY_WORKSPACE=$HULY_WORKSPACE \
HULY_TOKEN=$HULY_TOKEN \
GITHUB_REPO=Sheshiyer/parkarea-aleph \
pnpm mirror:github
```

Expected output:
```
Connecting to Huly...
  Base URL: https://huly.app
  Workspace: 46352c1b-...
✓ Connected as you@example.com (workspace: 46352c1b-...)
+ Created Project 'PARKAREA' (id: ...)
+ Created Component 'contracts' (id: ...)
+ Created Component 'backend-core' (id: ...)
... (8 more)
Fetching GitHub issues from Sheshiyer/parkarea-aleph...
  Found 21 issues
+ Issue #1 → Huly (component: mapped)
+ Issue #2 → Huly (component: mapped)
... (19 more)
✓ Issues: 21 created, 0 updated in Huly

=== Summary ===
Project:    PARKAREA (...)
Components: 10
Workspace:  46352c1b-...

Open in Huly to review.
```

## Security

- **NEVER** commit `.env` or `HULY_TOKEN` (already in repo `.gitignore`)
- **ROTATE** your Huly token immediately if it has been exposed in any chat, log, or screen-share
- Regenerate via Huly settings → API tokens
- Token rotation cadence: every 90 days minimum (per `docs/engagement-playbook.md` storage rules)

## Reusing for other engagements

Use environment overrides for the project identity:

```bash
PROJECT_IDENTIFIER=CLIENTX \
PROJECT_NAME="Client X Phase 1" \
PROJECT_DESCRIPTION="Mirror of GitHub execution plan" \
GITHUB_REPO=owner/repo \
GITHUB_TOKEN=$(gh auth token) \
HULY_TOKEN=$HULY_TOKEN \
HULY_WORKSPACE=$HULY_WORKSPACE \
pnpm mirror:github
```

The GitHub fetch + Huly issue upsert logic is engagement-agnostic. The script prefers TeamForge's cached `github_issues` rows when `TEAMFORGE_DB_PATH` is set, then falls back to the GitHub API. The default `COMPONENTS` array and `inferComponent()` heuristics are ParkArea-shaped presets; adjust those when the repo uses different track labels.

## Future work (per playbook)

- GitHub webhook bridge: GitHub issue/PR changes → Huly mirror update, Clockify time overlay
- Auto-create Huly `Client` class entry from contract PDF metadata
- Time-tracking sync (Clockify → Huly time entries)
- Periodic re-sync (cron) to catch GitHub status changes

## Upstream package note (2026-04-16)

Huly's typed SDK chain (`@hcengineering/tracker` and related packages) is currently inconsistent on npm, but this seeder is now **unblocked** because it no longer depends on those packages.

Current sidecar dependency surface is intentionally minimal and installable:
- `@hcengineering/api-client@0.7.3` (kept for compatibility)
- native `fetch` + direct Huly REST calls for transactor operations

If Huly republishes a stable typed SDK chain later, we can optionally reintroduce typed refs. Until then, this script remains operational via REST.

## Troubleshooting

**`config.json lookup failed` / `selectWorkspace failed`**
- Check `HULY_BASE_URL` (or `HULY_PLATFORM_URL`) points to your Huly app host.
- Check `HULY_TOKEN` is valid and not expired.
- Ensure `HULY_WORKSPACE` matches the workspace UUID/slug for that token.

**`401 Unauthorized` from GitHub fetch**
- Run `gh auth login` then `gh auth token` to regenerate

**`Project already exists` repeatedly**
- Working as designed (idempotent). To recreate from scratch, archive in Huly UI first.

**Install failures in CI/network-restricted shells**
- `pnpm install` requires registry access; retry with network-enabled runner.
