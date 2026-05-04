# Codebase Concerns

**Analysis Date:** 2026-05-04
**Latest shipped release:** v0.1.28 (Paperclip runtime ops + approvals)
**Working tree:** dirty — `src-tauri/src/db/{models,queries}.rs`, `src-tauri/src/huly/{client,types}.rs`, `src-tauri/src/slack/types.rs`, `tasks/todo.md` (dead-code cleanup pass not yet committed)

---

## Open Issues

The following 8 GitHub issues are open against `Sheshiyer/team-forge-ts`. These are sourced live from `gh issue list --state open`.

### #45 — Founder Sync Hardening: Remove external Node dependency from Settings vault sync (P1, backend, foundation)

- **Intent:** TeamForge founder sync currently shells out to the bundled parity script via the host-installed Node runtime. That works for founder machines today but is a deployment gap for OTA-shipped builds.
- **What's broken / undecided:** Need to commit to ONE durable runtime path:
  - native Rust importer (rewrite `scripts/teamforge-vault-parity.mjs` in Rust, behind a Tauri command), or
  - packaged Node sidecar (re-introduce a managed Node binary as a Tauri sidecar)
- **Files / modules likely to change:**
  - `scripts/teamforge-vault-parity.mjs` (current Node script, ~vault parity importer)
  - `src-tauri/src/commands/mod.rs` — `sync_local_vault_to_teamforge`, `get_local_workspace_status`
  - `src-tauri/tauri.conf.json` — bundled resources (currently bundles the parity script + adapter); sidecar config would change here
  - `src-tauri/Cargo.toml` if a Rust importer replaces the script
  - `src/pages/Settings.tsx` — Local Workspace status UI (must keep working through the new path)
- **Constraints to preserve:** canonical parity behavior for project briefs, client profiles, onboarding flows, employee KPI notes; Settings workflow + Local Workspace status model; no changes to Worker/D1 data model; no founder-dashboard redesign.

### #46 — Vault Parity Data Completion: Backfill missing client metadata and external refs (P1, foundation)

- **Intent:** The live founder-sync proof from v0.1.25 ran clean on routes and auth, but surfaced content/data warnings: missing client-profile notes, technical specs, design/research/closeout docs, client onboarding notes, and projects without canonical `clockifyProjectId` refs in vault frontmatter.
- **What's broken / missing:** Vault notes themselves (in `thoughtseed-labs` vault), not the importer. Backfill is a data task, but verification belongs in TeamForge.
- **Files / modules likely to change:**
  - Vault content under sibling `thoughtseed-labs/60-client-ecosystem/*` (briefs, profiles, onboarding) and `50-team/*-kpi.md`
  - `scripts/teamforge-vault-parity.mjs` if warning categories or rules need refinement
  - Worker-side D1 reads via the same route surface — no schema change expected
- **Verification target:** rerun `pnpm exec node scripts/teamforge-vault-parity.mjs --apply ...`; warning count should drop materially. TeamForge canonical identity must stay on IDs, not names.
- **Warning patterns to look for during `/gsd:debug`:** "missing client profile notes", "missing technical specs", "missing design/research/closeout docs", "missing client onboarding notes", "project without canonical clockifyProjectId".

### #4 — Data Foundation: Implement 8 Relation types between entities (P1, huly-api, foundation)

- **Intent:** Knowledge-graph layer across TeamForge entities. 8 relation types: Blocks, Relates To, Duplicates, Creates Resource, Documents In, Involves Device, Part of Sprint, Client Assignment.
- **What's missing:** No relation table or read-model surface exists yet. Sprint burndown (#8), client→project rollups, blocked-task chains in Insights, related-issue hover state all depend on this foundation.
- **Files / modules likely to change:**
  - `cloudflare/worker/migrations/*.sql` — new relations table (probably `entity_relations` with `(source_type, source_id, target_type, target_id, relation_kind, metadata, ...)`)
  - `cloudflare/worker/src/routes/` — new relation endpoints
  - `src-tauri/src/db/models.rs` + `src-tauri/src/db/queries.rs` — local cache
  - Tauri commands in `src-tauri/src/commands/mod.rs`
  - Frontend: `src/lib/types.ts`, hooks under `src/hooks/`, and consuming pages (Insights, Sprints, task detail hovers).
- **Why P1:** This is the unlock for #8 (sprint burndown) and several #12 cards. Issues #8/#9/#12/#14/#15 are P2 partly because #4 is not in place.

### #8 — Enhance Sprints page: Sprint Ceremonies & Burndown (P2, frontend)

- **Intent:** Add sprint burndown chart (SVG), capacity panel (per-person scheduled vs available from Clockify + Huly Planner), prominent sprint goal, retro notes, and sprint-vs-sprint comparison.
- **What's missing:** Current Sprints page only renders milestones with progress bars.
- **Files / modules likely to change:**
  - `src/pages/Sprints.tsx`
  - Clockify time-entry aggregation and Huly Sprint class reads in `src-tauri/src/commands/mod.rs` and the Huly client (`src-tauri/src/huly/client.rs`)
  - Possibly depends on #4 (Part of Sprint relation) and #15 (Planner data) for full capacity math.

### #9 — Enhance Team page: HR Time-Off, Monthly Hours, Remote Visibility (P2, frontend+backend)

- **Intent:** Auto-deduct approved leave (`hr:class:Request`) from quota math, exclude holidays (`hr:class:Holiday`), show remote/timezone indicators, optional org-chart view from `hr:class:Department`.
- **Partially shipped (v0.1.7):** Monthly hours + remote visibility section landed. Time-off auto-adjustment + holiday calendar exclusion + org-chart view still outstanding.
- **Files / modules likely to change:**
  - `src/pages/Team*.tsx` (and any Team subroutes)
  - `src-tauri/src/huly/client.rs` — graceful 404 INVALID CLASS NAME degradation already exists; HR class queries may need cache plumbing
  - `src-tauri/src/db/queries.rs` — Team snapshot cache
- **Trap (from `tasks/lessons.md` lines 14, 15):** Huly workspaces do not always expose every class. HR `find_all` calls must fail gracefully on `404 INVALID CLASS NAME` instead of breaking snapshot refresh. Local leave/holiday tracking is expected to be editable directly in Team — do NOT hide that workflow in a separate screen or depend on optional Huly HR modules for basic editing.

### #12 — Implement Role-Based Dashboards (Executive, PM, Developer) (P2, frontend)

- **Intent:** Three Overview layouts driven by role: Executive (5 cards), PM (5 cards), Developer (5 cards). Role selector in Settings or auto-detect from Huly `team_role`.
- **Partially shipped (v0.1.7):** Role-based dashboard scaffolding is present. Some cards depend on signals that don't exist yet (Knowledge Gaps card needs #4 Documents In; Code Reviews card needs richer GitHub PR pull; Learning Path needs the deprecated Training surface revisited).
- **Files / modules likely to change:** `src/pages/Overview.tsx`, dashboard card components under `src/components/`, role detection in Tauri command layer.

### #14 — New Feature: Client Onboarding Template & Flow Tracking (P2, frontend)

- **Intent:** Onboarding flow per client: create record → duplicate template project → tasks auto-tagged → linked resources (GitHub org, Vercel) → archive when complete. TeamForge dashboard surfaces progress tracker, resource creation status, time-to-onboard metric, template compliance.
- **Status:** Onboarding page exists (v0.1.7, then promoted to canonical-only view in v0.1.23). Template-driven duplication and resource-creation auto-linking still missing.
- **Files / modules likely to change:** `src/pages/Onboarding.tsx`; Worker routes for onboarding flow templating; Huly project duplication logic.

### #15 — Integrate Huly Planner data for personal time-blocking visibility (P2, backend, huly-api)

- **Intent:** Surface Huly Planner time-blocked schedules (8h/day slots, focus blocks, visibility settings) in the Team page (scheduled vs actual) and as a weekly capacity dashboard in Insights.
- **Open question:** Does Huly expose Planner data via REST (`time:class:ToDo`, `planner:class:Slot`)? The issue body lists API research as the first checkbox. **`tasks/lessons.md` lesson 31:** when upstream SDK packages are transitively broken on npm, do NOT stall feature delivery on dependency firefighting; pivot immediately to a REST transaction path that uses stable endpoint contracts already proven in this repo. Apply the same rule here — if the SDK doesn't expose Planner classes, skip to direct REST against the already-proven `find_all`-style transactions in `src-tauri/src/huly/client.rs`.
- **Files / modules likely to change:** `src-tauri/src/huly/client.rs`, `src-tauri/src/huly/types.rs`, Tauri commands, Team capacity table in `src/pages/Team*.tsx`, Insights page.

---

## Architectural Decisions Still Pending

These are explicit forks in the road that have NOT been resolved as of v0.1.28. Each is the gray area for the relevant issue.

### Founder sync runtime path (drives #45)

- **Decision:** Native Rust importer vs. packaged Node sidecar.
- **Rust importer pros:** No external runtime, single bundle, OTA-safe by default, no PATH games on `node`.
- **Rust importer cons:** Re-implements `scripts/teamforge-vault-parity.mjs` (markdown frontmatter parsing, vault traversal, Worker route calls, dry-run reporting).
- **Node sidecar pros:** Reuse existing JS importer almost as-is; Tauri sidecar packaging is documented.
- **Node sidecar cons:** Adds a bundled Node binary per platform (size + signing surface); forks a runtime contract Tauri otherwise doesn't need.
- **Already done in v0.1.25:** Importer is bundled as a Tauri app resource (so no repo-checkout assumption); but it's still invoked through host Node.
- **Already done in v0.1.27:** Paperclip runtime adapter has the same shape — bundled `.mjs` resource — and it works because it's launched through the host Node. Same gap.

### Approvals queue source of truth (drives next Paperclip phase after v0.1.28)

- **Current state:** Approvals are heuristic — derived from CEO/founder ownership + blocked state + escalation tags + approval keyword matching against the Paperclip task registry. Resolutions are written back as task metadata.
- **Pending:** A first-class approvals/governance contract in the sibling Paperclip repo, with a real registry instead of derivation. Until that lands, the TeamForge approvals queue cannot be trusted as a complete view.
- **Caveat from `todo.md:163-168`:** "the approvals queue is still heuristic until the sibling repo grows a more explicit approvals/governance contract". Goals, budgets, and richer runtime admin actions are explicitly deferred to the next Paperclip phase.

### Paperclip warm-start dry-run semantics

- **Caveat from `todo.md:163-167`:** `warm-start` has no native dry-run mode in the sibling Paperclip repo, so the adapter simulates dry-run success when `PAPERCLIP_ADAPTER_DRY_RUN=1`. This means contract tests pass even though the real warm-start isn't exercised. Live warm-start verification has to happen in a non-dry-run pass, or the sibling repo needs a real `--dry-run` flag.

### Multi-workspace support

- **Code marker:** `cloudflare/worker/src/routes/agent-feed.ts:104` — `const workspaceId = "default"; // TODO: resolve from env/context when multi-workspace lands`
- **Implication:** Agent feed is hard-coded single-workspace. Any path that talks to agent-feed assumes one workspace. Multi-workspace is not on the roadmap right now, but the assumption is load-bearing.

### Issue ownership boundary (already partly decided)

- **Lesson 28:** GitHub <-> Huly sync is NOT globally bidirectional. GitHub owns engineering issues; Huly owns execution/admin issues.
- **Lesson 29:** Default to hybrid classification — rule-based domain detection with explicit durable manual override. Not pure automation, not pure manual.
- **Status:** The control-plane shipped in v0.1.18 supports classification overrides. Make sure new sync work in #4 / #8 doesn't drift back to "everything syncs both ways".

### Sibling Paperclip repo coupling

- **Lesson 48:** "an OTA release only helps if the runtime contract is bundled or app-owned rather than stranded in a sibling repo."
- **Status:** Adapter fallback bundled in v0.1.27. But `babysitter.sh start`, runtime scripts (`scripts/health-check.sh`, `scripts/warm-start.sh`, `scripts/refresh-stale.sh`), and the task registry all still live in the sibling `thoughtseed-paperclip` repo. The launcher script path defaults to the sibling repo.
- **Risk:** Any TeamForge feature that depends on Paperclip-side scripts cannot be guaranteed on a fresh founder machine until either the sibling repo is treated as a hard install dependency or the scripts are also bundled. v0.1.27 only solves the adapter — not the underlying script dependency.

---

## In-Code TODOs / FIXMEs

The codebase is mostly clean of TODO/FIXME markers. After filtering noise (status string literals like `"todo"`, profile IDs containing "hacker", `tracker:status:todo` Huly enum values), the live findings are:

| File:line | Snippet | Concern |
|-----------|---------|---------|
| `cloudflare/worker/src/routes/agent-feed.ts:104` | `const workspaceId = "default"; // TODO: resolve from env/context when multi-workspace lands` | Hard-coded workspace; multi-workspace not yet supported. |
| `src-tauri/src/github/types.rs:108` | `#[allow(dead_code)]` | Field intentionally retained for future GitHub field surfacing. Re-audit when GitHub coverage expands. |
| `src-tauri/src/commands/mod.rs:11696` | `#[ignore] async fn inspect_live_huly_org_state()` | Live-only Huly inspection test. Not run by default. Useful for debugging Huly drift but easy to forget. |
| `src-tauri/src/commands/mod.rs:11762` | `#[ignore] async fn preview_live_huly_workspace_normalization()` | Live preview-only normalization test. |
| `src-tauri/src/commands/mod.rs:11773` | `#[ignore] async fn apply_live_huly_workspace_normalization()` | Live apply-only normalization test. Mutates the live Huly workspace if run. |

No `FIXME`, `HACK`, or `XXX` markers anywhere in `src-tauri/src`, `src/`, `cloudflare/`, or `scripts/` after filtering. The codebase is unusually low on inline tech-debt comments — most caveats live in `tasks/todo.md` Review/Residual blocks instead. Treat that file as the canonical debt log.

### Ignored tests are NOT silent skips

The 3 `#[ignore]` tests in `commands/mod.rs` exist because they require live Huly credentials. They are not regressions to fix; they are operator inspection tools. If the Huly client API surface changes, run them manually with `--ignored` against a real workspace before tagging a release.

---

## Recurring Traps from `tasks/lessons.md`

These are the patterns that have bitten repeatedly. Future phases should treat them as guardrails, not suggestions.

### Verification authenticity (lessons 5, 24, 32, 45, 911-from-todo:908-911)

- "Sync succeeded" ≠ "page renders data". After any sync change, verify the EXACT read-model query feeding the page. v0.1.28's auto-launch caveat (`todo.md:908-911`) is exactly this trap: build/test passed, but a packaged TeamForge window was not opened to watch the auto-launch fire.
- For launchers, prove the runtime path with a live functional invocation, not a process check or a page that opened.
- On macOS, verify bundled Tauri apps via `open TeamForge.app` (LaunchServices), not by directly executing `TeamForge.app/Contents/MacOS/...`.

### Fragile Team-page render path (lessons 12, 13)

- Team data needs a persistent SQLite-backed cache. Don't render from live Huly directly.
- `useInvoke`'s returned object cannot go directly into effect dependencies — stabilize it first or the page will re-render-loop and look like endless loading.
- Files at risk: `src/pages/Team*.tsx`, any Team-related hook in `src/hooks/`.

### Huly class availability (lessons 14, 15)

- `find_all` for HR data MUST degrade on `404 INVALID CLASS NAME`. Whole snapshot must not fail because one class is unavailable. This affects #9 directly.
- Local leave/holiday tracking should NOT be hidden behind optional Huly HR modules.

### Canonical identity (lessons 27, 37, 45)

- Cloudflare Worker + D1 own project identity and sync state. Local SQLite is cache/offline projection only.
- Vault parity must inspect `60-client-ecosystem` AND `50-team/*-kpi.md` — don't stop at project briefs.
- Do not surface heuristic objects as primary modules (the `Devices` registry was replaced with a real `Issues` module in v0.1.21 because of this).

### Settings UX (lessons 8, 9, 10, 11)

- Name the EXACT credential type (e.g., "Slack Bot User OAuth token"), not generic "token".
- Preserve structured failure detail like missing OAuth scope — don't collapse into generic error strings.
- Roster-based selectors over email matching for Huly-sourced people (emails may not exist).
- Roster-based dropdowns over drag-and-drop for org/department assignment.

### Founder-control-plane scope (lessons 27, 42, 43, 47)

- Local vault access and local launcher actions are first-class Tauri features. Cloudflare/D1 is the shared source of truth. Absolute local paths are per-machine settings only.
- For Paperclip launcher: wrap the existing `babysitter.sh start` entrypoint, do not invent a new process model.
- Resolve native defaults in the backend so Settings looks pre-configured on first run.

### Release hygiene (lessons 22, 23, 25, 26, 35)

- Local `cargo tauri build` signing failures are non-canonical. CI (`.github/workflows/release.yml`) is the real updater-signing path.
- If updater public key matches local keypair, REUSE that private key for CI secrets — don't rotate the trust chain by accident.
- Don't bump version metadata before milestone completion is audited.
- `TAURI_SIGNING_PRIVATE_KEY` must be present in CI or updater artifacts will fail to publish.

### Copy / IA discipline (lessons 16, 18, 19, 20, 33, 44, 46)

- Don't squeeze responsibilities into one page; split routes when responsibilities diverge.
- LCARS shell uses segmented rails/bands/strips — not generic dashboard cards or boxed admin panels.
- App-wide design overhauls should sweep ALL routes, not just the page mentioned first.
- Replace process/meta phrasing ("control plane", "canonical", "founder sync", "sync prose") with operator-facing language across the whole app, not just one screen.
- Remove mock/placeholder dashboard sections entirely; don't dress them up as "temporary".

### Routing fragility (lesson 30)

- Nested sub-tabs under splat routes (e.g., `/team/*`, `/agents/*`) need stable absolute targets and BOTH `index` AND `*` fallback redirects. Plain relative tab links cause blank pages on deep / malformed URLs.

### One-shot fetch (lesson 32)

- If a page can load before Tauri command state is ready, never leave it on a one-shot fetch. Always add retry + partial-failure fallback. Otherwise startup races freeze the UI into a false zero-state.

---

## Deferred Verifications

Things that ARE shipped but were NOT verified in the originally intended way. These need UAT and are the most likely source of "we thought this worked" regressions.

| Feature | Shipped in | Deferred verification | Source |
|---------|-----------|----------------------|--------|
| Paperclip auto-launch on TeamForge open | v0.1.26 (boot wiring) | Packaged TeamForge window was not opened to watch auto-launch fire live against the current machine config. Build/test/Rust compile coverage only. | `tasks/todo.md:908-911` |
| `warm-start` action contract | v0.1.28 | Adapter SIMULATES dry-run success because the sibling repo's `warm-start.sh` has no native dry-run mode. Real warm-start path is only hit by non-dry-run runs. | `tasks/todo.md:164-166` |
| Approvals queue completeness | v0.1.28 | Heuristic derivation from task registry. Will under-report / over-report until the sibling repo grows an explicit approvals contract. | `tasks/todo.md:167-168` |
| Founder-sync OTA-from-fresh-machine | v0.1.25 | Verified locally with the current dev machine's host Node runtime. NOT verified on a clean machine without `node` on PATH. This is exactly what #45 is about. | CHANGELOG v0.1.25 verification block, issue #46/#45 |
| Vault metadata content completeness | v0.1.25 | Founder-sync proof completed with content/data warnings still present. Not a route/auth issue, but the warnings are real and #46 owns the cleanup. | `tasks/todo.md:1209-1213` |
| Sibling Paperclip babysitter health | v0.1.27 (Settings setup) | Babysitter still reports stale PIDs even though the adapter starts and works. TeamForge-side path is green; sibling-repo supervisor needs its own fix. | `tasks/todo.md:704-707` |
| Local Tauri updater signing on macOS | v0.1.23+ | Local `cargo tauri build --bundles app` stops at the missing `TAURI_SIGNING_PRIVATE_KEY` check. CI is the real signer. Fine for normal flow, but it means there is no local end-to-end updater-bundle smoke test. | `tasks/todo.md:518-520`, lesson 23 |
| `cargo test identity` failure on local machine | v0.1.20 | `cargo test identity` reported a checksum mismatch for `hyper-util v0.1.19` BEFORE compilation. Not a TeamForge code bug, but means the identity module hasn't been re-tested locally since v0.1.20. | CHANGELOG v0.1.20 |

---

## Dead-code / Dependency Drift

### In-flight dead-code cleanup (uncommitted as of 2026-05-04)

The current dirty worktree (`git diff --stat HEAD`) shows a focused dead-code removal pass touching:

- `src-tauri/src/db/models.rs` (-12 lines) — removed `HulyDocumentActivity`
- `src-tauri/src/db/queries.rs` (-158 lines) — removed `upsert_employee_kpi_snapshot`, `get_identity_external_ids_for_employee`, `get_github_issues_for_project`, `get_presence`, `get_huly_issue_activities`
- `src-tauri/src/huly/client.rs` (-53 lines) — removed `CORE_CLASS_TX_REMOVE_DOC`, `remove_doc`, `get_members`
- `src-tauri/src/huly/types.rs` (-46 lines) — removed `SelectWorkspaceRequest`, `AccountsResponse`, `AccountsResponse::into_login_info`, `HulyMember`
- `src-tauri/src/slack/types.rs` (-1 line) — removed `user_id` from `SlackAuthTestData`

This pass is documented in `tasks/todo.md:1-51` and reduces `cargo check` to zero warnings. It needs to be committed.

**Risk:** Some of the removed query helpers (`get_identity_external_ids_for_employee`, `get_huly_issue_activities`, `upsert_employee_kpi_snapshot`) sound load-bearing for #4 (relations) and #15 (planner). Verify those issues' implementation plans don't quietly depend on resurrecting these helpers. If they do, the helpers should come back when needed rather than be preserved unused.

### Hyper-util checksum mismatch

Local `cargo test identity` from v0.1.20 reported a checksum mismatch on `hyper-util v0.1.19`. May still be present. Run `cargo update -p hyper-util` if it recurs.

---

## Test Coverage Gaps

| Untested area | Files | Risk | Priority |
|---------------|-------|------|----------|
| Live Huly normalization | `src-tauri/src/commands/mod.rs:11696,11762,11773` (all `#[ignore]`) | Huly workspace mutations are only tested manually. A regression in normalization logic ships silently unless someone runs `--ignored`. | Medium |
| Founder sync against fresh machine | None — current verification uses host Node | OTA installs without `node` on PATH would fail. This is literally #45. | High |
| Paperclip warm-start (real path) | Adapter test contract uses `PAPERCLIP_ADAPTER_DRY_RUN=1` | Real warm-start is exercised only manually. | Medium |
| Approvals heuristic accuracy | `src-tauri/src/paperclip.rs` approvals derivation | Queue completeness is unverified — no fixture comparing derived queue to a known-good list. | Medium |
| Multi-workspace agent feed | `cloudflare/worker/src/routes/agent-feed.ts` | Hard-coded `"default"`. No test covers the multi-workspace case because it's not yet a feature. | Low (becomes High when multi-workspace lands) |
| Vault parity content rules | `scripts/teamforge-vault-parity.mjs` | Warning categories (missing client profile, missing tech specs, etc.) are reported but not asserted in any automated test. #46 work needs to know which warning to expect. | Medium |
| Team page snapshot fallback | `src/pages/Team*.tsx`, Huly client | Lessons 12-15 say this surface has bitten before; defensive cache + 404 INVALID CLASS NAME handling exists but is not regression-locked. | Medium |

---

## Quick Reference for `/gsd:discuss-phase` and `/gsd:debug`

**For #45 (Founder sync hardening):** Start at the Architectural Decisions section above — Rust importer vs. Node sidecar is the gating call. Then read `scripts/teamforge-vault-parity.mjs`, `src-tauri/src/commands/mod.rs` (`sync_local_vault_to_teamforge`, `get_local_workspace_status`), and `src-tauri/tauri.conf.json` resource bundle config. The CHANGELOG v0.1.25 verification block has the exact command shape that must keep working.

**For #46 (Vault parity data completion):** Warning patterns to grep for in importer output: "missing client profile notes", "missing technical specs", "missing design", "missing research", "missing closeout", "missing client onboarding notes", "without canonical clockifyProjectId". The fix is in vault content (sibling `thoughtseed-labs` repo), not in TeamForge source. Verify warning count drops with the same parity command from CHANGELOG v0.1.25.

**For #4 (8 Relations):** This unlocks #8 sprint burndown and several #12 cards. Schema-first work in `cloudflare/worker/migrations/`. Don't model relations as bidirectional global syncs — apply lessons 28-29.

**For Paperclip-related debugging:** `cargo test --manifest-path src-tauri/Cargo.toml paperclip::tests -- --nocapture` is the canonical Rust path. `bash -n ../thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh` validates the adapter contract. Adapter fallback order is sibling repo → bundled app resource → TeamForge repo checkout.

---

*Concerns audit: 2026-05-04 against v0.1.28*
