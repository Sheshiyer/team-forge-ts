# TeamForge Vault Population Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the completed Phase 1 vault-read slice into a real end-to-end TeamForge demo by restoring live Worker writes, applying client profiles and onboarding flows, seeding one concrete vault dataset, and proving the imported data appears in the app.

**Architecture:** Keep Cloudflare Worker + D1 as the canonical metadata store and Tauri SQLite as a local projection/cache only. Phase 2 should avoid broad redesign: first restore live project-graph writes on the deployed Worker, then expose canonical write routes for client profiles and onboarding flows, then wire the parity script to those routes and seed one real client + employee onboarding dataset.

**Tech Stack:** Node.js parity importer, Cloudflare Worker + D1, Wrangler deployment/migration flow, Rust/Tauri + SQLx SQLite cache, React/TypeScript UI, Thoughtseed Markdown/frontmatter contracts

**Known scope guardrails:** Keep `Training`, `Devices` redesign, and generalized knowledge import out of scope. Current JS/TS/Worker verification is healthy, including `pnpm build`. Treat only the Cargo checksum mismatch as an external blocker, and only pull it into scope if this phase expands back into Rust/Tauri changes.

---

### Task 1: Restore the live Worker project-graph write path

**Files:**
- Modify: `cloudflare/worker/src/routes/projects.ts`
- Modify: `cloudflare/worker/src/routes/v1.ts`
- Modify: `cloudflare/worker/src/lib/project-registry.ts`
- Modify: `docs/architecture/contracts/worker-route-contract.md`
- Review evidence from: `tasks/teamforge-vault-parity-canary.json`

**Step 1: Reproduce the current live failure with the existing canary target**

Run:
```bash
TEAMFORGE_WORKSPACE_ID=ws_thoughtseed node scripts/teamforge-vault-parity.mjs --project axtech --apply --report tasks/teamforge-vault-phase-2-project-canary.json
```

Expected right now:
- remote project create still fails on the live Worker with `500` / Cloudflare `1101`

**Step 2: Isolate whether the failure is deploy drift, route drift, or D1/migration drift**

Check:
- current local `PUT /v1/project-mappings/:id` path in `cloudflare/worker/src/routes/v1.ts`
- `handlePutProjectMappings` in `cloudflare/worker/src/routes/projects.ts`
- current graph-upsert logic in `cloudflare/worker/src/lib/project-registry.ts`
- whether the deployed Worker still behaves like the older `feature_not_ready` scaffold path called out in `tasks/todo.md`

The output of this step must name the exact root cause before any fix is accepted.

**Step 3: Implement the smallest code/deploy fix that makes one project create succeed**

Requirements:
- do not redesign the project control plane
- preserve the existing `project-mappings` compatibility path used by the parity script
- keep the write payload backward-compatible with the current script contract where possible

**Step 4: Verify locally, then verify live**

Run:
```bash
./node_modules/.bin/tsc -p cloudflare/worker/tsconfig.json --noEmit
TEAMFORGE_WORKSPACE_ID=ws_thoughtseed node scripts/teamforge-vault-parity.mjs --project axtech --apply --report tasks/teamforge-vault-phase-2-project-canary.json
```

Expected:
- Worker TypeScript passes
- `axtech` no longer fails with `1101`
- the report shows at least one successful remote project apply

### Task 2: Add canonical Worker write routes for client profiles and onboarding flows

**Files:**
- Modify: `cloudflare/worker/src/routes/projects.ts`
- Modify: `cloudflare/worker/src/routes/v1.ts`
- Modify: `docs/architecture/contracts/worker-route-contract.md`

**Step 1: Expose client-profile writes through the public API**

Add:
- `PUT /v1/client-profiles/:clientId`

Use the existing `upsertClientProfile(...)` registry helper instead of creating a second write path.

**Step 2: Expose workspace-scoped onboarding replacement through the public API**

Add:
- `PUT /v1/onboarding-flows`

Requirements:
- request body must include `workspaceId`
- route must replace the workspace-scoped flow set atomically using the existing `replaceOnboardingFlows(...)` helper
- response should return the normalized flow list after write so the importer can verify what landed

**Step 3: Update the route contract doc**

Document exact payload shapes for:
- client profile write
- onboarding flow write
- expected success/error response envelopes

**Step 4: Verify Worker compile**

Run:
```bash
./node_modules/.bin/tsc -p cloudflare/worker/tsconfig.json --noEmit
```

Expected:
- new route handlers and payload types compile cleanly

### Task 3: Teach the parity script to apply client profiles and onboarding flows

**Files:**
- Modify: `scripts/teamforge-vault-parity.mjs`
- Modify: `tasks/todo.md`

**Step 1: Replace the current `worker-route-pending` placeholders with real apply helpers**

Implement parity-script apply helpers for:
- `PUT /v1/client-profiles/:clientId`
- `PUT /v1/onboarding-flows`

Keep the existing project-graph apply path unchanged except for whatever Task 1 needs.

**Step 2: Keep reporting explicit by note family**

The report must continue to separate:
- `projects`
- `clientProfiles`
- `projectArtifacts`
- `onboardingFlows`
- `employeeKpis`

But after this task:
- `clientProfiles.applyPath` must no longer say `worker-route-pending`
- `onboardingFlows.applyPath` must no longer say `worker-route-pending`
- apply failures must be reported separately for project graphs, client profiles, and onboarding flows

**Step 3: Add post-apply verification reads**

After apply:
- fetch back the written client profile by `client_id`
- fetch back onboarding flows for the target `workspace_id`
- include a small verification summary in the report instead of relying only on HTTP 200s

**Step 4: Verify dry-run and syntax before live apply**

Run:
```bash
node --check scripts/teamforge-vault-parity.mjs
node scripts/teamforge-vault-parity.mjs --local-only --report tasks/teamforge-vault-phase-2-dry-run.json
```

Expected:
- syntax check passes
- report still emits distinct sections for each note family

### Task 4: Seed one minimal real vault dataset for a true end-to-end demo

**Files:**
- Create: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/60-client-ecosystem/axtech/client-profile.md`
- Create: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/60-client-ecosystem/axtech/technical-spec.md`
- Create: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/60-client-ecosystem/axtech/onboarding/client-onboarding-flow.md`
- Create: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/50-team/onboarding/imran-onboarding-flow.md`
- Reference: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/80-templates/client-onboarding-flow-template.md`
- Reference: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/80-templates/employee-onboarding-flow-template.md`

**Step 1: Instantiate a real client profile for `axtech`**

Required frontmatter fields:
- `client_id`
- `client_name`
- `engagement_model`
- `active`
- `industry`
- `primary_contact`
- `onboarded`
- `project_ids`
- `stakeholders`
- `strategic_fit`
- `risks`
- `resource_links`

Use the existing `axtech` project ids already present in the vault instead of inventing new ids.

**Step 2: Seed one technical spec so the Projects artifact rail has a richer doc type**

Requirements:
- path must stay under `60-client-ecosystem/axtech/`
- include either `project_id` frontmatter or enough ancestry for the existing artifact resolver to associate it correctly

**Step 3: Seed one client onboarding flow and one employee onboarding flow**

Client onboarding note requirements:
- path under `60-client-ecosystem/axtech/onboarding/`
- `audience: client`
- `client_id` present
- ordered task checklist in the body

Employee onboarding note requirements:
- path under `50-team/onboarding/`
- `audience: employee`
- `member_id: imran`
- ordered task checklist in the body

**Step 4: Manual contract review**

Before apply, confirm:
- no `Training` fields slipped into either note family
- `audience` matches the path family
- every note has a stable id field (`client_id` or `flow_id` / `member_id`)

### Task 5: Run the live canary and verify the data in TeamForge

**Files:**
- Create: `tasks/teamforge-vault-phase-2-report.json`
- Create: `tasks/teamforge-vault-phase-2-canary.json`
- Modify: `tasks/todo.md`

**Step 1: Run the full dry-run after seeding**

Run:
```bash
node scripts/teamforge-vault-parity.mjs --local-only --report tasks/teamforge-vault-phase-2-report.json
```

Expected:
- seeded `axtech` profile and onboarding records are counted as ready for apply

**Step 2: Run the live apply canary**

Run:
```bash
TEAMFORGE_WORKSPACE_ID=ws_thoughtseed node scripts/teamforge-vault-parity.mjs --project axtech --apply --report tasks/teamforge-vault-phase-2-canary.json
```

Expected:
- project graph apply succeeds
- client profile apply succeeds
- onboarding flow apply succeeds

**Step 3: Verify Worker reads**

Confirm the live Worker returns the seeded records through:
- `GET /v1/project-mappings`
- `GET /v1/client-profiles`
- `GET /v1/client-profiles/axtech`
- `GET /v1/onboarding-flows?workspace_id=ws_thoughtseed`

**Step 4: Verify the app surfaces**

In TeamForge, confirm:
- `Clients` shows `axtech` vault profile enrichment without losing operational metrics
- `Projects` shows vault client context and the new technical-spec artifact rail entry
- `Onboarding` shows the imported client and employee flows in the correct tabs

**Step 5: Record the review**

Append a review section to `tasks/todo.md` covering:
- what landed
- exact commands run
- whether any external blockers remain
- what should be the next slice after the live demo succeeds
