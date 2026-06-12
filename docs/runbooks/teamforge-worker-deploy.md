# Runbook — Deploying the TeamForge Worker (`teamforge-api`)

Safe, data-preserving deploy of the Cloudflare Worker (`cloudflare/worker/`,
`teamforge-api`) and its D1 (`teamforge-primary`). Satisfies the
[migration-rollback-contract](../architecture/contracts/migration-rollback-contract.md)
"Required Runbooks" gap. First executed 2026-06-12 (version `661e709a`) to
reconcile the time-entries work back into the canonical repo.

> **Golden rule:** the D1 migration **ledger is keyed by filename**. Never reuse
> or renumber an already-applied migration filename. New migrations are strictly
> additive and use `CREATE TABLE/INDEX IF NOT EXISTS`.

## Prerequisites
- `wrangler` authenticated via **OAuth** on the founder Mac. The static
  `CLOUDFLARE_API_TOKEN` lacks scope — **unset it** for every command:
  `env -u CLOUDFLARE_API_TOKEN …`.
- Run from the worker package so `wrangler.jsonc` + `migrations/` resolve:
  `pnpm -C cloudflare/worker exec wrangler …` (deps are installed at the repo root).
- Deploy **only** the canonical `cloudflare/worker/wrangler.jsonc` (name
  `teamforge-api`, route `forge.thoughtseed.space`, D1 `teamforge-primary`,
  id `d773aaa8-…`). Never deploy a dev-shaped wrangler.

## Procedure

### 0. Build gate (local, no network)
```bash
pnpm -C cloudflare/worker exec tsc -p tsconfig.json --noEmit   # must be clean (exit 0)
```
Do not proceed on any error. (`pnpm -C cloudflare/worker check` is the same.)

### 1. Pre-deploy snapshot — READ-ONLY (the go/no-go gate)
```bash
W="pnpm -C cloudflare/worker exec wrangler"
env -u CLOUDFLARE_API_TOKEN $W d1 migrations list teamforge-primary --remote
# tables that a pending migration would CREATE without IF NOT EXISTS (collision gate):
env -u CLOUDFLARE_API_TOKEN $W d1 execute teamforge-primary --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('handoffs','time_entries') ORDER BY name;"
# baseline row counts for any table you must preserve:
env -u CLOUDFLARE_API_TOKEN $W d1 execute teamforge-primary --remote \
  --command "SELECT COUNT(*) AS n FROM time_entries;"
```
**GATE:** if a pending migration contains a bare `CREATE TABLE x` (not
`IF NOT EXISTS`) and `x` already exists in prod → **STOP**; make it idempotent or
mark it applied before continuing. Record the baseline counts.

### 2. Apply migrations (the only D1 write)
```bash
env -u CLOUDFLARE_API_TOKEN $W d1 migrations apply teamforge-primary --remote
```
Non-interactive wrangler auto-answers the "continue?" prompt. Each migration shows
`✅`. Idempotent (`IF NOT EXISTS`) migrations are no-ops if the object exists.

### 3. Verify the migration (read-only)
```bash
# new tables exist; preserved tables unchanged; nothing pending:
env -u CLOUDFLARE_API_TOKEN $W d1 execute teamforge-primary --remote \
  --command "SELECT COUNT(*) AS n FROM time_entries;"   # == baseline from step 1
env -u CLOUDFLARE_API_TOKEN $W d1 migrations list teamforge-primary --remote   # → "No migrations to apply!"
```

### 4. Deploy
```bash
env -u CLOUDFLARE_API_TOKEN $W deploy   # note the Version ID
```

### 5. Smoke (prod)
```bash
B=https://teamforge-api.sheshnarayan-iyer.workers.dev
curl -s "$B/v1/bootstrap" | python3 -c "import sys,json;rs=json.load(sys.stdin)['data']['routeStatus'];print(rs)"
# unauth probes: 401 = live+gated · 404 = missing · 501 = stub/not-implemented (or wrong HTTP method)
for r in /v1/whoami /v1/time-entries /v1/handoffs /v1/onboarding-flows /v1/projects; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' "$B$r")" "$r"; done
# POST-only routes need POST (GET → 501 fall-through):
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/v1/time-entries" -H 'content-type: application/json' -d '{}'
```
Expect: bootstrap `routeStatus` advertises the live routes; gated routes `401`
with the `{ ok:false, error:{ code, message, retryable } }` envelope; a real
Plexus login (`/v1/whoami` + a `/v1/time-entries` POST) round-trips.

### 6. Merge to `main`
After prod smoke passes, merge the deploy branch to `main`.

## Rollback
The deploy is **additive** (new tables via `IF NOT EXISTS`, new routes, superset
auth) — nothing destructive runs, so rollback is code-only:
```bash
env -u CLOUDFLARE_API_TOKEN pnpm -C cloudflare/worker exec wrangler rollback   # or: wrangler deployments list → wrangler rollback <id>
```
Tables created by the migration simply remain (harmless; no down-migration drops
data). If a downstream cutover was gated on the deploy, also disable its feature
flag. Preserve the step-1 snapshot as reconciliation evidence.

## Notes / gotchas
- **Stale ledger rows are benign.** prod's ledger may hold a historical
  `0006_time_entries.sql` row (from the pre-reconciliation Archive lineage) even
  though the canonical file is now `0007_time_entries.sql`. **Do not delete it** —
  wrangler reconciles by filename and a "cleanup" would re-apply confusion.
- **Migration order going forward:** `0006_handoffs` → `0007_time_entries` →
  `0008_employees_email_unique` (WS3) → `0009_project_assignments` (WS4).
- **Cloudflare Access is LIVE** since WS5
  ([#81](https://github.com/Sheshiyer/team-forge-ts/issues/81)):
  `TF_ACCESS_TEAM_DOMAIN` (`red-queen-4dfa.cloudflareaccess.com`) and
  `TF_ACCESS_AUD` (comma-separated AUDs of the two Access apps:
  plexus-api.thoughtseed.space + forge.thoughtseed.space) are set in
  `wrangler.jsonc` vars. `GET /v1/whoami` is Access-JWT-only and **fail-closed**
  (401 without a verified identity). The workers.dev hostname remains the
  Access-bypassing m2m path (operator parity/roster pushes, Hermes) — those
  callers authenticate with Bearer/internal secret as before.
  - *Historical bug fixed here:* issue #81 was filed against a var-name mismatch
    (`access.ts` read `TF_ACCESS_AUD` while only `TF_ACCESS_AUDIENCE` was set —
    the latter is the `/v1/credentials` `?audience=` echo check, a different
    concern). Resolution kept `TF_ACCESS_AUD` for JWT verify and set it for real.
  - *Rollback:* `wrangler.jsonc` has `keep_vars: true`, so **deleting the vars
    from the file does NOT unset them on deploy** — use `wrangler rollback`, set
    them to `""`, or delete them in the dashboard. Unset/empty vars revert
    `verifyAccessJwt` to a no-op (Bearer-era behavior); whoami then 401s but no
    other route changes.
