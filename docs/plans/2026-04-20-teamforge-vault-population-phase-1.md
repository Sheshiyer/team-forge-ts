# TeamForge Vault Population Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand TeamForge's vault-backed product surfaces for `Projects`, `Clients`, and `Onboarding`, while explicitly leaving `Training` out of scope for this slice.

**Architecture:** Keep Cloudflare Worker + D1 as the canonical store for imported vault metadata. Extend the existing vault parity importer so it normalizes three explicit note families from the Thoughtseed vault: client profiles, enriched project artifacts, and onboarding flows split by audience (`client` vs `employee`). Keep operational telemetry pages system-driven; merge vault data into those pages only where it adds structured context rather than replacing live ops data.

**Tech Stack:** Node.js vault importer, Cloudflare Worker + D1, Rust/Tauri + SQLx/SQLite, React/TypeScript, Markdown frontmatter contracts in the Thoughtseed vault

**Known verification constraints:** `vite build` is currently blocked by the existing Rollup native-module signature issue, and broad `cargo test` is currently blocked by the existing `serde_repr v0.1.19` checksum mismatch. Use targeted TypeScript checks plus `node --check` while this slice is in flight, and only promote broader verification back into the gate once those unrelated blockers are cleared.

---

### Task 1: Define the vault contracts for client profiles and dual onboarding

**Files:**
- Modify: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/00-meta/frontmatter-schema.md`
- Modify: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/60-client-ecosystem/client-profile-template.md`
- Create: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/80-templates/client-onboarding-flow-template.md`
- Create: `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/80-templates/employee-onboarding-flow-template.md`
- Create: `docs/architecture/contracts/vault-ingestion-contract.md`

**Step 1: Define structured frontmatter for `client-profile`**

Lock the required fields to match the current TeamForge `Clients` and `Projects` screens:
- `client_id`
- `client_name`
- `industry`
- `primary_contact`
- `engagement_model`
- `active`
- `onboarded`
- `project_ids`
- `stakeholders`
- `strategic_fit`
- `risks`
- `resource_links`

**Step 2: Define two onboarding note families instead of one mixed schema**

Create explicit contracts for:
- `client-onboarding-flow`
- `employee-onboarding-flow`

Both note families should share:
- stable `flow_id`
- `status`
- `owner`
- `starts_on`
- `audience`
- ordered task list with `task_id`, `title`, `completed`, `completed_at`, `resource_created`, `notes`

Only client onboarding notes should carry:
- `client_id`
- `project_ids`
- `primary_contact`
- `workspace_ready`

Only employee onboarding notes should carry:
- `member_id`
- `manager`
- `department`
- `joined_on`

**Step 3: Write the repo-side contract doc**

Document how each vault note family maps into TeamForge:
- `client-profile` -> `Clients` page enrichment + project profile context
- `project-brief` + `technical-spec`/`design`/`research`/`closeouts` -> `Projects` artifact rail
- `client-onboarding-flow` + `employee-onboarding-flow` -> `Onboarding` page tabs

**Step 4: Verification**

Manual review checklist:
- contracts avoid Training fields entirely
- onboarding is explicitly split into `client` and `employee`
- no field names depend on free-form prose parsing where a structured value will do

### Task 2: Extend the Cloudflare canonical model for client profiles and onboarding flows

**Files:**
- Create: `cloudflare/worker/migrations/0004_vault_population.sql`
- Modify: `cloudflare/worker/src/lib/project-registry.ts`
- Modify: `cloudflare/worker/src/routes/projects.ts`
- Modify: `cloudflare/worker/src/routes/v1.ts`
- Modify: `docs/architecture/contracts/worker-route-contract.md`

**Step 1: Add D1 tables for structured vault-backed records**

Add:
- `client_profiles`
- `onboarding_flows`
- `onboarding_tasks`

Do **not** add a new project artifact table; reuse `project_artifacts` and extend only the allowed `artifact_type` values to cover:
- `vault-project-brief`
- `vault-technical-spec`
- `vault-design-doc`
- `vault-research-doc`
- `vault-closeout-doc`

**Step 2: Extend the project registry library**

Add typed read/write helpers for:
- upserting a client profile by `client_id`
- listing client profiles by workspace
- attaching a client profile summary to project graph responses when `project.client_name` or `project.slug` matches
- replacing onboarding flows and tasks atomically per workspace

**Step 3: Expose read surfaces through Worker routes**

Add or extend endpoints for:
- list client profiles
- fetch client profile by `client_id`
- list onboarding flows filtered by `audience`
- include enriched artifact metadata in project detail responses

Keep the response shapes flat and TS-friendly; avoid Markdown-heavy payloads in the first slice except where the UI truly needs body content.

**Step 4: Verification**

Run:
```bash
./node_modules/.bin/tsc -p cloudflare/worker/tsconfig.json --noEmit
```

Expected:
- Worker types compile with the new D1 tables and route shapes

### Task 3: Extend the vault importer for client profiles, richer project artifacts, and onboarding flows

**Files:**
- Modify: `scripts/teamforge-vault-parity.mjs`
- Modify: `docs/plans/2026-04-20-teamforge-vault-population-phase-1.md`
- Modify: `tasks/todo.md`

**Step 1: Add new discovery passes**

Extend the importer to scan:
- `60-client-ecosystem/*/client-profile.md`
- `60-client-ecosystem/*/technical-spec.md`
- `60-client-ecosystem/*/design/**/*.md`
- `60-client-ecosystem/*/research/**/*.md`
- `60-client-ecosystem/*/closeouts/**/*.md`
- onboarding notes under the template-backed locations defined in Task 1

**Step 2: Normalize each note family into explicit records**

Produce normalized record sets for:
- `projectBriefRecords`
- `clientProfileRecords`
- `projectArtifactRecords`
- `onboardingFlowRecords`

Avoid implicit matching on titles where a slug/id exists. Use vault-relative paths as durable provenance fields.

**Step 3: Extend apply/report modes**

When `--apply` is set:
- upsert project graphs and artifact links
- upsert client profiles
- replace onboarding flows/tasks for the targeted workspace

When `--report` is set:
- emit counts for project briefs, client profiles, artifacts, and onboarding flows separately
- emit missing-schema warnings for expected-but-absent note families

**Step 4: Verification**

Run:
```bash
node --check scripts/teamforge-vault-parity.mjs
node scripts/teamforge-vault-parity.mjs --local-only --report tasks/teamforge-vault-population-phase-1-report.json
```

Expected:
- syntax check passes
- report contains distinct sections for `projects`, `clientProfiles`, `projectArtifacts`, and `onboardingFlows`

### Task 4: Extend the desktop remote-sync and local projection layer

**Files:**
- Modify: `src-tauri/migrations/001_initial.sql`
- Modify: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/db/queries.rs`
- Modify: `src-tauri/src/sync/teamforge_worker.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useInvoke.ts`

**Step 1: Add local cache/projection structs**

Add local SQLite-backed projection tables for:
- cached client profiles
- cached onboarding flows
- cached onboarding tasks

Keep local storage projection-only. The Worker remains canonical.

**Step 2: Add remote fetch/update surfaces**

In the Worker client and Tauri commands, add typed functions for:
- `get_teamforge_client_profiles`
- `get_teamforge_client_profile`
- `get_teamforge_onboarding_flows`

Then add command-level aggregation helpers:
- merge client profile fields into current operational `ClientView`/`ClientDetailView`
- expose onboarding flows by `audience`

**Step 3: Preserve existing operational metrics**

Do not replace:
- client billable hours
- active project counts
- live issue/device/clockify activity

Instead, merge the new vault-backed fields onto the existing operational aggregates.

**Step 4: Verification**

Run:
```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsc -p cloudflare/worker/tsconfig.json --noEmit
```

Expected:
- frontend and Worker TypeScript surfaces stay aligned after the new API types/hooks land

### Task 5: Enrich the Clients page with structured vault profile data

**Files:**
- Modify: `src/pages/Clients.tsx`
- Modify: `src/lib/types.ts`

**Step 1: Extend the client summary cards without replacing the current metrics**

Add fields sourced from the vault profile:
- engagement model
- profile completeness
- strategic fit / portfolio category
- richer stakeholder/contact block

Keep the current operational metrics at the top of each card.

**Step 2: Expand the detail panel**

Surface:
- profile overview
- stakeholders
- strategic fit
- risks/watch-outs
- resource links

Keep linked projects, linked devices, and recent activity sourced from current live data.

**Step 3: Empty-state behavior**

If a client exists operationally but has no imported profile:
- show the current operational view
- add a clear “No vault client profile yet” state
- link that state to the expected `client-profile.md` contract terminology

**Step 4: Verification**

Run:
```bash
./node_modules/.bin/tsc --noEmit
```

Expected:
- no TS regressions after adding the enriched client view shapes

### Task 6: Enrich the Projects page with richer vault artifacts and client context

**Files:**
- Modify: `src/pages/Projects.tsx`
- Modify: `src/lib/types.ts`

**Step 1: Expand the artifact model shown in the control surface**

Surface artifact groups by type:
- brief
- technical spec
- design
- research
- closeout

Keep the existing generic artifact editor, but give imported vault artifacts a stable display treatment.

**Step 2: Add client profile excerpting**

When a selected project has a matching imported client profile, show a compact excerpt:
- client name
- primary contact
- engagement model
- strategic fit
- risks

Keep it read-only in this slice; editing still happens in the vault first.

**Step 3: Preserve TeamForge control-plane behavior**

Do not mix vault artifacts into sync policy, conflicts, or retry logic. This slice is about display and import completeness, not sync-control semantics.

**Step 4: Verification**

Run:
```bash
./node_modules/.bin/tsc --noEmit
```

Expected:
- no TS regressions after project artifact and client excerpt rendering changes

### Task 7: Split the Onboarding page into employee and client flows

**Files:**
- Modify: `src/pages/Onboarding.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src-tauri/src/commands/mod.rs`

**Step 1: Replace the single mixed onboarding list with two explicit tabs**

Add two top-level views:
- `Client Onboarding`
- `Employee Onboarding`

The tab model should come from `audience`, not from inferred card titles.

**Step 2: Render explicit imported task lists**

For each flow, render:
- owner
- start date
- elapsed days
- status
- ordered tasks with completion state and resource-created metadata

Do not synthesize employee onboarding from unrelated telemetry.

**Step 3: Add controlled fallback for client onboarding only**

If a client has no imported onboarding note yet:
- optionally show the current heuristic client onboarding flow behind a clearly labeled fallback state
- do **not** do the same for employees; employee onboarding should be note-driven or empty

**Step 4: Verification**

Run:
```bash
./node_modules/.bin/tsc --noEmit
```

Expected:
- the Onboarding page compiles cleanly with separate `client` and `employee` flow shapes

### Task 8: Final verification, documentation, and scope lock

**Files:**
- Modify: `tasks/todo.md`
- Modify: `tasks/lessons.md`
- Modify: `docs/plans/2026-04-20-teamforge-vault-population-phase-1.md`

**Step 1: Run the slice-level verification commands**

Run:
```bash
node --check scripts/teamforge-vault-parity.mjs
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsc -p cloudflare/worker/tsconfig.json --noEmit
```

Expected:
- importer syntax passes
- frontend TS passes
- Worker TS passes

**Step 2: Record blocked-but-known broader verification**

Call out explicitly in `tasks/todo.md` that:
- `vite build` remains blocked by the existing Rollup native-module signature issue
- broad `cargo test` remains blocked by the existing `serde_repr` checksum issue

These are not slice-specific failures.

**Step 3: Lock scope**

Document the deliberate non-goals for this slice:
- no Training work
- no Devices registry redesign
- no Knowledge import yet
- no new bidirectional sync logic between GitHub and Huly

**Step 4: Commit**

```bash
git add docs/plans/2026-04-20-teamforge-vault-population-phase-1.md tasks/todo.md tasks/lessons.md
git commit -m "docs(planning): define phase 1 vault population plan"
```

## Execution Status

### Implemented

- Worker canonical model for:
  - `client_profiles`
  - `onboarding_flows`
  - `onboarding_tasks`
- Worker read routes for:
  - `GET /v1/client-profiles`
  - `GET /v1/client-profiles/:clientId`
  - `GET /v1/onboarding-flows`
- parity importer discovery/reporting for:
  - `client-profile.md`
  - `technical-spec.md`
  - `design/**/*.md`
  - `research/**/*.md`
  - `closeouts/**/*.md`
  - client/employee onboarding notes
- desktop cache/projection layer for client profiles + onboarding flows/tasks
- shared TS/Tauri types + invoke surfaces for canonical client-profile/onboarding reads
- UI enrichment on:
  - `Projects`
  - `Clients`
  - `Onboarding`

### Verified

- `node --check scripts/teamforge-vault-parity.mjs`
- `./node_modules/.bin/tsc -p cloudflare/worker/tsconfig.json --noEmit`
- `./node_modules/.bin/tsc --noEmit`

### Remaining external blocker

- targeted Cargo verification is still blocked by the existing dependency-checksum
  environment issue:
  - `checksum for hyper-util v0.1.19 changed between lock files`
