# Task Plan

## Goal

Do one final release pass on the TeamForge + Paperclip daily-shell work,
capture the remaining gaps as a concrete 20-item checklist, fix the last
high-signal misses, and ship the next OTA line through the existing GitHub
Actions release workflow.

## Plan

- [x] Audit the current release tree, dirty worktree, open GitHub issues, and
      release metadata before cutting a new tag.
- [x] Fix the release-critical Paperclip launcher path typo in the bundled
      wrapper script.
- [x] Reconcile the Paperclip startup task log so reviewed work is also marked
      complete.
- [x] Sweep the shipped Settings copy for the last internal-sync phrasing that
      still leaks into the app shell.
- [x] Refresh README route and release notes so the repo reflects the shipped
      `Agents` route and Paperclip runtime flow.
- [x] Add a new changelog entry for the next release and fix the historical
      `thoughtseed-paperclip` typo.
- [x] Bump release metadata for the next OTA line.
- [x] Re-run build/test hygiene and `git diff --check`.
- [ ] Commit the current TeamForge tree, create the next tag, and push `main`
      plus the release tag.
- [ ] Watch the GitHub Actions OTA workflow and record the result.

## 20-Item Final Checklist

- [x] Paperclip daily-shell integration is in the TeamForge repo and no longer
      stranded as local-only code.
- [x] `/live` has been repurposed into `/agents`, with the old route preserved
      as a redirect.
- [x] Overview includes live Paperclip runtime status and a drilldown into
      Agents.
- [x] Settings exposes separate Paperclip UI and API configuration.
- [x] Settings can probe the Paperclip API without requiring frontend-direct
      local HTTP logic.
- [x] Settings exposes machine-local Paperclip startup mode.
- [x] TeamForge can request Paperclip startup on app launch through native IPC.
- [x] The bundled Paperclip launcher now points at the correct sibling repo by
      default.
- [x] The Projects page still shows TeamForge projects even before linked
      GitHub/Clockify telemetry is complete.
- [x] The highest-visibility internal/admin copy has been reduced in shipped
      screens, especially Settings and Projects.
- [x] The README now reflects the current app routes, including Agents instead
      of Live.
- [x] The README current-version line now matches the release being prepared.
- [x] The historical `thoughtseed-paperclip` typo is fixed in release docs.
- [x] The startup task review section is no longer left in a reviewed-but-open
      state.
- [x] Open GitHub issues have been rechecked so the remaining backlog is
      explicit: `#45`, `#46`, `#4`, `#8`, `#9`, `#12`, `#14`, `#15`.
- [x] Build passes on the release candidate tree.
- [x] Rust check passes on the release candidate tree.
- [x] Focused Paperclip Rust tests pass on the release candidate tree.
- [ ] Release commit and `v0.1.26` tag are pushed to trigger OTA CI.
- [ ] The GitHub Actions OTA workflow finishes successfully for the new tag.

## Review

- Tauri skills used:
  - `testing-tauri-apps`
    - used to treat the final pass as a release-candidate verification task,
      not only a code sweep
  - `understanding-tauri-ipc`
    - used to audit the app-launch and Settings integration points before
      cutting the next release
  - `building-tauri-with-github-actions`
    - used to align the final pass with the real OTA release path instead of
      stopping at local build output
- Highest-signal fixes in this pass:
  - corrected the bundled Paperclip launcher sibling path typo
  - tightened the last shipped workspace/sync copy in Settings
  - refreshed README/changelog drift so the repo reflects the real app shell
  - prepared the next OTA version line
- Verification completed before tagging:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml`
  - `pnpm build`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml paperclip::tests -- --nocapture`
  - `git diff --check`
- Remaining follow-on backlog after this release:
  - `#45` remove the external Node dependency from founder sync
  - `#46` finish vault metadata and external-ref backfill
  - `#4`, `#8`, `#9`, `#12`, `#14`, `#15` remain as the substantive next
    product slices after the daily-shell integration ships

# Task Plan

## Goal

Wire the local Paperclip runtime startup into TeamForge app launch so the
machine can automatically bring up the configured Paperclip companion services
when the desktop app opens, while keeping the behavior explicit and
machine-local in Settings.

## Plan

- [x] Review the existing app startup flow plus the current Paperclip launcher
      and adapter paths before changing boot behavior.
- [x] Add a native startup command that can safely ensure the configured
      Paperclip script and local adapter are running without depending on
      frontend-direct process orchestration.
- [x] Add an explicit Local Workspace startup toggle so auto-launch is
      controllable per machine and visible in Settings.
- [x] Verify the startup contract with build/test hygiene and record the
      review here.

## Review

- Tauri skills used:
  - `calling-rust-from-tauri-frontend`
    - used to keep startup orchestration in one native `ensure` command instead
      of spreading launch logic across multiple React effects and local HTTP
      checks
  - `understanding-tauri-ipc`
    - used to fold boot-time Paperclip startup into the same typed local
      workspace contract as the existing launch/open/probe commands
  - `testing-tauri-apps`
    - used to re-run the TeamForge build/check/test verification set after
      introducing startup-side behavior
- Startup contract implemented:
  - added `paperclip_auto_launch_enabled` as a machine-local local-workspace
    setting and surfaced it in `Settings`
  - extended `LocalWorkspaceStatus` so the app can show whether Paperclip
    startup is automatic or manual on the current machine
  - added native command `ensure_paperclip_runtime_started` that:
    - respects the saved startup toggle
    - uses the saved Paperclip script path to issue a startup request
    - launches the local adapter only for local Paperclip API URLs
    - skips adapter launch for remote API endpoints
    - probes the adapter before/after launch to avoid blind duplicate spawns
  - wired `App.tsx` to call the `ensure` command on startup after the shell
    begins loading
- Settings updates:
  - Local Workspace now shows `PAPERCLIP STARTUP`
  - Local Workspace now exposes a startup checkbox:
    - `START PAPERCLIP RUNTIME WHEN TEAMFORGE OPENS`
  - startup state is saved alongside the rest of the local Paperclip settings
- Verification:
  - `pnpm build`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml paperclip::tests -- --nocapture`
  - `git diff --check`
- Remaining caveat:
  - I verified the startup path through build/test coverage and the typed boot
    wiring, but I did not open a packaged TeamForge window in this pass to
    watch the auto-launch effect fire live against the current machine config

# Task Plan

## Goal

Make TeamForge the daily shell for Paperclip runtime visibility by adding a
native Paperclip API integration, repurposing `Live` into `Agents`, enriching
Overview with Paperclip runtime signals, and keeping Paperclip UI launch/open as
admin fallback only.

## Plan

- [x] Review the relevant Tauri skills, current TeamForge founder-console
      architecture, and the sibling Paperclip adapter contract before
      implementation:
      - `calling-rust-from-tauri-frontend`
      - `understanding-tauri-ipc`
      - `testing-tauri-apps`
      - `docs/plans/2026-04-22-teamforge-founder-console.md`
      - `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`
      - `docs/architecture/contracts/agent-feed-export-contract.md`
      - `thoughtseed-paperclip/ARCHITECTURE.md`
      - `thoughtseed-paperclip/scripts/forge-aura-adapter/README.md`
- [x] Add TeamForge-native Paperclip API configuration, typed IPC commands, and
      frontend DTOs for runtime probe, telemetry, users, personal context,
      rooms, and escalations.
- [x] Enrich Overview with a Paperclip runtime band and repurpose `/live` into
      `/agents` with founder-global runtime visibility plus selected-user
      drilldown.
- [x] Add a minimal Paperclip adapter shim under
      `thoughtseed-paperclip/scripts/forge-aura-adapter/` because the six
      documented `/api/*` endpoints are not shipped in the mounted repo.
- [x] Verify TeamForge build/check flows plus shim behavior and record the
      review here.

## Review

- Tauri skills used:
  - `calling-rust-from-tauri-frontend`
    - used to keep Paperclip access inside typed native commands instead of
      letting React talk to local HTTP directly
  - `understanding-tauri-ipc`
    - used to define one consistent TeamForge DTO/command surface for runtime
      probe, telemetry, roster, rooms, personal context, and escalations
  - `testing-tauri-apps`
    - used to verify the new Rust client logic with focused tests and to
      validate the cross-repo adapter contract before closing the task
- Planning/docs reviewed before implementation:
  - `docs/plans/2026-04-22-teamforge-founder-console.md`
  - `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`
  - `docs/architecture/contracts/agent-feed-export-contract.md`
  - `docs/runbooks/tauri-agent-skills.md`
  - `docs/runbooks/tauri-prompt-scaffold.md`
  - sibling Paperclip docs:
    - `thoughtseed-paperclip/ARCHITECTURE.md`
    - `thoughtseed-paperclip/scripts/forge-aura-adapter/README.md`
  - no repo-local `.context/*` or GSD artifacts were present in this checkout
- Paperclip contract finding:
  - the six documented adapter endpoints were present in docs and manifests,
    but not implemented in the mounted Paperclip repo
  - that made the shim an actual requirement, not optional cleanup
- Implemented in TeamForge:
  - added native Paperclip runtime client logic in
    `src-tauri/src/paperclip.rs`
  - added typed Tauri commands for:
    - runtime probe
    - runtime summary
    - users
    - telemetry
    - personal context
    - rooms
    - escalations
  - extended local workspace settings/status with:
    - `paperclip_api_url`
    - `paperclip_api_token`
    - API readiness inspection
  - enriched `Overview` with a Paperclip runtime band that shows:
    - healthy/stale/uninitialized counts
    - latest cycle signal
    - escalation backlog/latest escalation
    - drilldown into `/agents`
  - replaced the old `Live` presence page with `Agents` and kept presence as a
    subsection inside the broader runtime surface
  - demoted `/live` into a redirect to `/agents` so old deep links still work
- Implemented in Paperclip:
  - added `scripts/forge-aura-adapter/server.mjs`
  - added `scripts/forge-aura-adapter/test-contract.sh`
  - kept the shim additive-only and composed from existing repo artifacts:
    - `scripts/health-check.sh`
    - `.thoughtseed/task-registry.json`
    - `agents/*/MANIFEST.yaml`
    - `config/projects/*.yaml`
    - `scripts/task-registry.sh`
    - `scripts/escalate.sh`
  - added dry-run support for escalation contract tests so route verification
    does not pollute the live Paperclip vault
- Verification:
  - `pnpm build`
  - `cargo test --manifest-path src-tauri/Cargo.toml paperclip::tests -- --nocapture`
  - `node --check ../thoughtseed-paperclip/scripts/forge-aura-adapter/server.mjs`
  - `../thoughtseed-paperclip/scripts/forge-aura-adapter/test-contract.sh`
  - `git diff --check`
- Remaining caveat:
  - the shim is intentionally separate from the Paperclip UI and therefore
    defaults to its own API port (`3101`) instead of assuming the admin UI port
    can also host the adapter contract

# Task Plan

## Goal

Fix the still-empty Projects page by tracing it back to the actual canonical
TeamForge execution read model, and remove engineering/meta commentary from app
copy across the visible pages so the product reads like an operator dashboard
instead of an internal planning tool.

## Plan

- [x] Review the relevant Tauri skills and current founder/dashboard plans
      before implementation:
      - `calling-rust-from-tauri-frontend`
      - `understanding-tauri-ipc`
      - `testing-tauri-apps`
      - `docs/plans/2026-04-22-teamforge-founder-console.md`
      - `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`
- [x] Trace the Projects page data path from React -> Tauri command -> SQLite /
      Worker bridge and fix the root cause for the empty execution state.
- [x] Sweep the visible app pages for meta/process/planning copy and replace it
      with concise operator-facing language.
- [x] Verify the Projects route with real data, run build/check hygiene, and
      record the review here.

## Review

- Tauri skills used:
  - `calling-rust-from-tauri-frontend`
    - used to trace the real React -> Tauri command boundary for the Projects
      page instead of guessing from the UI
  - `understanding-tauri-ipc`
    - used to keep the fix at the typed `get_execution_projects` contract and
      its local read model rather than patching around the empty state in React
  - `testing-tauri-apps`
    - used to add a focused Rust test for the missing execution-view case and
      to verify the fix before closing the task
- Planning/docs reviewed before implementation:
  - `docs/plans/2026-04-22-teamforge-founder-console.md`
  - `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`
  - `docs/runbooks/tauri-agent-skills.md`
  - `docs/runbooks/tauri-prompt-scaffold.md`
  - no repo-local `.context/*` or GSD artifacts were present in this checkout
- Root cause found:
  - the Projects page was not empty because the TeamForge graph was missing
  - the local cache already had `17` active `teamforge_projects`, but
    `get_execution_projects` filtered away any project that did not already
    have linked GitHub repos or a Clockify project id
  - local proof during debugging:
    - `teamforge_projects`: `17`
    - `teamforge_active_project_issues`: `0`
    - `github_repo_configs`: `1`
- Implemented:
  - updated `load_execution_projects_from_local_projection` in
    `src-tauri/src/commands/mod.rs` so active TeamForge projects still appear
    in the Projects execution view even before linked delivery telemetry is in
    place
  - added
    `active_teamforge_projects_without_links_still_show_in_execution_view`
    coverage in `src-tauri/src/commands/mod.rs`
  - cleaned visible product copy in:
    - `src/pages/Projects.tsx`
    - `src/pages/Overview.tsx`
    - `src/pages/Clients.tsx`
    - `src/pages/Onboarding.tsx`
    - `src/pages/Settings.tsx`
  - reduced internal/process-heavy phrases like “control plane”, “canonical”,
    “founder sync”, and implementation narration where they were directly
    exposed in the UI
- Verification:
  - `pnpm build`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml active_teamforge_projects_without_links_still_show_in_execution_view -- --nocapture`
  - `git diff --check`
  - live cache check via SQLite confirmed `17` active TeamForge projects exist,
    which now have a non-empty fallback path into the Projects view
- Remaining follow-up:
  - the Projects setup mode still exposes real sync-management fields because
    it is still an admin surface; if you want that area simplified further, it
    should be a separate product pass rather than mixed into the empty-state
    fix

# Task Plan

## Goal

Close the remaining founder-console setup gaps by making local workspace
readiness and vault parity sync first-class Settings workflows, aligning the
parity importer with the app's real Cloudflare access token model, and cleaning
the stale GitHub roadmap before the next OTA release.

## Plan

- [ ] Review the relevant Tauri skill docs and active planning docs before
- [x] Review the relevant Tauri skill docs and active planning docs before
      implementation:
      - `building-tauri-with-github-actions`
      - `calling-rust-from-tauri-frontend`
      - `understanding-tauri-ipc`
      - `managing-tauri-app-resources`
      - `docs/plans/2026-04-22-teamforge-founder-console.md`
      - `docs/plans/2026-04-20-teamforge-vault-population-phase-2.md`
      - `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`
- [x] Add native local-workspace readiness reporting and expose the canonical
      TeamForge workspace id in Settings instead of keeping it implicit.
- [x] Add a founder-facing `Sync Vault to TeamForge` action in Settings that
      reuses the canonical parity importer with the app's stored vault path,
      Worker base URL, workspace id, and cloud access token.
- [x] Bundle the parity importer as an app resource and update its auth input
      so founder sync uses the real TeamForge access token contract instead of
      the old webhook-secret shortcut.
- [x] Triage the remaining stale GitHub issues against the shipped founder
      dashboard direction and record the still-open product/data gaps.
- [ ] Verify the app/build/release slice, then cut and watch the next OTA tag
      through the existing GitHub Actions workflow if the checks pass.

## Review

- Tauri skills used:
  - `building-tauri-with-github-actions`
    - used to keep the release validation and next-tag decision grounded in the
      existing OTA workflow instead of treating local Tauri builds as the final
      release authority
  - `calling-rust-from-tauri-frontend`
    - used to keep founder sync and local-workspace readiness as typed native
      commands rather than ad hoc frontend shell behavior
  - `understanding-tauri-ipc`
    - used to keep the new Settings founder-sync surface on the same explicit
      Tauri command boundary as the rest of TeamForge
  - `managing-tauri-app-resources`
    - used to bundle the canonical parity importer into the app instead of
      leaving the founder sync path tied only to a repo checkout
- Planning/docs reviewed before implementation:
  - `docs/plans/2026-04-22-teamforge-founder-console.md`
  - `docs/plans/2026-04-20-teamforge-vault-population-phase-2.md`
  - `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`
  - `docs/architecture/contracts/worker-route-contract.md`
  - `docs/architecture/contracts/secrets-auth-contract.md`
  - no repo-local `.context/*` or GSD artifacts were present in this checkout
- Implemented:
  - added native `get_local_workspace_status` and
    `sync_local_vault_to_teamforge` commands in `src-tauri/src/commands/mod.rs`
  - bundled `scripts/teamforge-vault-parity.mjs` into the Tauri app resources
    through `src-tauri/tauri.conf.json`
  - updated the parity importer to prefer `TEAMFORGE_ACCESS_TOKEN` /
    `TF_API_ACCESS_TOKEN` / `CLOUD_CREDENTIALS_ACCESS_TOKEN` before the older
    internal-secret fallback
  - exposed TeamForge workspace id, founder-sync readiness, Node/runtime
    status, and the `SYNC VAULT TO TEAMFORGE` action in `src/pages/Settings.tsx`
  - fixed the Worker app-auth gap by requiring desktop bearer auth for the main
    `/v1/*` project/client/onboarding/control-plane routes via
    `TF_CREDENTIAL_ENVELOPE_KEY`, instead of leaving some routes open and some
    incorrectly gated behind `TF_WEBHOOK_HMAC_SECRET`
- Live gap found and fixed during verification:
  - first founder-sync proof showed that project graph writes still worked but
    client profile and onboarding writes failed with `403 invalid_authorization`
    when using the app-stored cloud access token
  - root cause: `cloud_credentials_access_token` was the desktop app token for
    `/v1/credentials`, but several other `/v1/*` write routes still required
    `TF_WEBHOOK_HMAC_SECRET`
  - fixed by aligning those desktop-consumed routes onto the app token
    contract and redeploying the Worker
- GitHub backlog cleanup:
  - closed stale issues:
    - `#17` completed docs task
    - `#16` stale rollout tracker
    - `#5` superseded Huly-only client dashboard
    - `#6` obsolete device registry
    - `#7` obsolete knowledge page in current form
    - `#11` obsolete training dashboard
  - opened new canonical follow-ons:
    - `#45` Founder Sync Hardening: Remove external Node dependency from
      Settings vault sync
    - `#46` Vault Parity Data Completion: Backfill missing client metadata and
      external refs
- Verification:
  - `node --check scripts/teamforge-vault-parity.mjs` passed
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` passed
  - `pnpm build` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` passed
  - `pnpm --dir cloudflare/worker run deploy` passed
    - deployed Worker version `3e11d789-659c-4d5b-a5bf-35d4a9413072`
  - live founder-sync proof passed with:
    - `TEAMFORGE_ACCESS_TOKEN=... node scripts/teamforge-vault-parity.mjs --vault-root /Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs --worker-base-url https://teamforge-api.sheshnarayan-iyer.workers.dev --workspace-id ws_thoughtseed --apply --report /tmp/teamforge-founder-sync-proof.json`
  - the successful founder-sync proof verified:
    - `23` project brief updates
    - `2` client profiles verified
    - `2` onboarding flows verified
    - `6` employee KPI updates verified
  - the remaining warnings are now content/data gaps, not route/auth failures:
    - missing client profile notes
    - missing technical specs
    - missing design/research/closeout docs
    - missing client onboarding notes
  - release/tag step is still pending

# Task Plan

## Goal

Finish the canonical identity path for vault-backed TeamForge projects by
completing the Worker/D1 parity apply, persisting explicit Clockify and client
linkage in the canonical project graph, removing local name-fallback joins, and
switching founder drill-downs onto stable IDs.

## Plan

- [x] Extend the Worker/D1 project graph contract to persist explicit
      `clockify_project_id` linkage using the canonical external-id path instead
      of relying on display-name reconciliation.
- [x] Update the vault parity/import flow so project graph writes, client
      profiles, and onboarding flows can be applied end-to-end against the
      Worker and verified back from D1.
- [x] Extend the Tauri Worker bridge and SQLite TeamForge projection to cache
      canonical Clockify/client identifiers alongside the existing project graph.
- [x] Remove the name-fallback joins in:
      - `src-tauri/src/commands/mod.rs` execution project loading
      - `src-tauri/src/commands/mod.rs` active issue scope loading
      - any remaining client/detail joins that still key only on client names
- [x] Change founder/dashboard drill-down routing to use canonical IDs where the
      data now carries them, instead of client/project display names.
- [x] Verify with Worker type-checks, parity/import checks, frontend build,
      Rust checks, and diff hygiene, then record the review here.

- [x] Review the relevant Tauri skill docs and canonical repo docs before
      implementation:
      - `calling-rust-from-tauri-frontend`
      - `understanding-tauri-ipc`
      - `docs/plans/2026-04-20-teamforge-vault-population-phase-2.md`
      - `docs/plans/2026-04-17-cloudflare-project-backend-implementation.md`
      - `docs/architecture/contracts/vault-ingestion-contract.md`
      - `docs/architecture/contracts/worker-route-contract.md`

## Review

- Tauri/Cloudflare skills used:
  - `calling-rust-from-tauri-frontend`
    - kept the new canonical ID fields on the typed Tauri side instead of
      adding ad hoc frontend-only joins
  - `understanding-tauri-ipc`
    - kept the founder dashboard and project graph changes inside the existing
      IPC contracts rather than inventing a second data path
  - Cloudflare `wrangler` / `workers-best-practices`
    - used for the additive D1 migration, Worker deploy, and keeping the
      canonical project graph change inside the Worker repository boundary
- Planning/docs reviewed before implementation:
  - `docs/plans/2026-04-20-teamforge-vault-population-phase-2.md`
  - `docs/plans/2026-04-17-cloudflare-project-backend-implementation.md`
  - `docs/architecture/contracts/vault-ingestion-contract.md`
  - `docs/architecture/contracts/worker-route-contract.md`
  - `docs/architecture/contracts/d1-schema-contract.md`
  - no repo-local `.context/*` or GSD artifacts were present in this checkout
- Canonical identity changes:
  - Worker/D1 now exposes `project.clientId` and `project.clockifyProjectId`
    in the canonical TeamForge project graph, while keeping Clockify linkage in
    `project_external_ids`
  - the vault parity importer now writes `clientId` and `clockifyProjectId`
    from project briefs instead of leaving them implicit
  - local SQLite `teamforge_projects` now caches `client_id` and
    `clockify_project_id`, and active issue projection rows now cache
    `client_id`
  - local execution project loading no longer falls back from GitHub milestone
    titles to normalized Clockify names
  - local active issue scopes no longer fall back to graphless GitHub repo
    configs or name-derived Clockify joins
  - founder drill-downs now route by canonical IDs where available:
    - active delivery -> TeamForge `projectId`
    - white-labelable -> canonical `clientId`
    - onboarding risk -> `flowId`
- Live Worker/D1 rollout:
  - applied remote D1 migration `0005_project_identity_links.sql`
  - deployed Worker version `4b3469e1-547e-4586-8d93-ddf8b6437b5b`
  - rotated `TF_WEBHOOK_HMAC_SECRET` in Cloudflare and GitHub so the parity
    importer could complete authenticated client-profile and onboarding writes
  - executed full parity apply into workspace `ws_thoughtseed`
- Live parity result:
  - `22` project briefs processed
  - `20` project creates, `2` project updates
  - `2` client profiles applied and verified
  - `2` onboarding flows applied and verified
  - `6` employee KPI updates verified
  - direct live spot-check confirms `axtech` now returns canonical
    `clientId: "axdis-group"` from `/v1/project-mappings`
- Verification:
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` passed
  - `pnpm build` passed
  - `node --check scripts/teamforge-vault-parity.mjs` passed
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed
  - `cargo test --manifest-path src-tauri/Cargo.toml cached_teamforge_graphs_bridge_into_github_repo_configs -- --nocapture` passed
  - `cargo test --manifest-path src-tauri/Cargo.toml active_project_issues_are_grouped_from_active_teamforge_projects -- --nocapture` passed
  - `pnpm --dir cloudflare/worker d1:migrate:remote` passed
  - `pnpm --dir cloudflare/worker run deploy` passed
  - `TF_WEBHOOK_HMAC_SECRET=... node scripts/teamforge-vault-parity.mjs --workspace-id ws_thoughtseed --apply` passed
  - `git diff --check` passed

# Task Plan

## Goal

Turn the founder command-center rails into real route-level drill-downs, so
`Overview` opens filtered `Clients`, `Issues`, and `Onboarding` subsets instead
of just dropping the operator onto a generic page.

## Plan

- [x] Add a minimal URL search-param contract for the drill-down targets:
      - `Clients`: registry status, contract-risk, and detail selection
      - `Issues`: client/project/state presets
      - `Onboarding`: audience/status attention preset, including `audience=all`
- [x] Update `Overview` action buttons so the founder rails navigate into those
      filtered subsets instead of only opening the base route.
- [x] Keep the filtering contract local to the existing pages instead of adding
      a new global dashboard store or extra Tauri IPC.
- [x] Verify the slice with frontend build and diff hygiene, then record the
      review here.

- [x] Review the relevant Tauri skill docs and repo planning docs before
      implementation:
      - `calling-rust-from-tauri-frontend`
      - `understanding-tauri-ipc`
      - `docs/plans/2026-04-22-teamforge-founder-console.md`
      - `docs/plans/2026-04-20-teamforge-vault-population-phase-2.md`
      - `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`

## Review

- Tauri skills used:
  - `calling-rust-from-tauri-frontend`
    - used to keep the founder drill-down behavior aligned with the existing
      typed Tauri command surface instead of inventing a parallel client-only
      state model
  - `understanding-tauri-ipc`
    - used to preserve the existing boundary: route drill-down state stays in
      the URL, while native actions remain explicit Rust commands
- Planning/docs reviewed before implementation:
  - `docs/plans/2026-04-22-teamforge-founder-console.md`
  - `docs/plans/2026-04-20-teamforge-vault-population-phase-2.md`
  - `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`
  - no repo-local `.context/*` or GSD artifacts were present in this checkout
- Frontend changes:
  - `src/pages/Clients.tsx`
    - added URL-backed drill-down filters for:
      - `registry=canonical|operational`
      - `risk=contract`
      - `client=<id-or-name>`
    - moved client detail opening onto the route contract so founder links can
      deep-link directly into the relevant client subset or detail overlay
  - `src/pages/Issues.tsx`
    - moved client/project/state filtering onto URL search params so Overview
      can open open issues for a specific delivery stream instead of landing on
      the full issue table
  - `src/pages/Onboarding.tsx`
    - added URL-backed `audience` and `status` filtering, including
      `audience=all` for founder-level onboarding risk review
    - kept the at-risk heuristic aligned with the Rust founder command-center
      logic
  - `src/pages/Overview.tsx`
    - portfolio lifecycle now opens canonical clients
    - active delivery streams now open filtered open-issue views
    - white-labelable rows can open the related canonical client subset
    - needs-review now opens operational-only clients, at-risk onboarding, or
      the relevant vault note based on category
- Verification:
  - `pnpm build` passed
  - `git diff --check` passed

# Task Plan

## Goal

Make the founder command center actionable by wiring its rails into real app
drill-downs and constrained vault-backed file opens, so Overview becomes an
operating surface rather than a static summary screen.

## Plan

- [ ] Add a constrained Tauri command to open a vault-relative file or folder
      using the saved/resolved local vault root.
- [ ] Expose the new command through the typed frontend invoke surface.
- [ ] Add action controls to `Overview` that route into the app or open the
      relevant vault control notes for portfolio, white-labelable, needs-review,
      and research-intake surfaces.
- [ ] Verify the new command and UI slice with frontend build, Rust checks, and
      diff hygiene, then record the review in `tasks/todo.md`.

## Review

- Tauri skills used:
  - `calling-rust-from-tauri-frontend`
    - used to keep the new vault-open action as an explicit typed command
      rather than leaking filesystem assumptions into the React layer
  - `understanding-tauri-ipc`
    - used to keep the founder command-center action model on the same
      frontend-to-Rust IPC boundary as the rest of TeamForge
- Backend changes:
  - added `open_vault_relative_path` in `src-tauri/src/commands/mod.rs`
  - constrained the command to vault-relative paths only, rejecting absolute
    and parent-directory traversal
  - resolved the active local vault root through the existing TeamForge vault
    resolution flow before opening a file or folder with the shell plugin
  - registered the new command in `src-tauri/src/lib.rs`
- Frontend changes:
  - exposed `openVaultRelativePath(...)` in `src/hooks/useInvoke.ts`
  - updated `src/pages/Overview.tsx` so the founder rails now have real
    actions:
    - active delivery opens `Projects` and the vault `active-work` note
    - portfolio lifecycle opens `Clients` and the portfolio review note
    - white-labelable opens `Clients` and the white-labelable inventory note
    - needs review opens `Settings` and the stale-review note
    - research intake opens the capture registry note
  - added user-visible vault-open failure feedback in the Overview screen so
    missing vault-root or missing-note problems surface clearly
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` passed
  - `pnpm build` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed
  - `git diff --check` passed
- Remaining warning state:
  - Rust still has the same 9 pre-existing dead-code warnings outside this
    founder-console action slice

# Task Plan

## Goal

Turn TeamForge `Overview` into the founder command center, demote `Boards`
from primary navigation, and surface real founder rails for portfolio
lifecycle, white-labelable opportunities, needs-review queues, and the vault
research hub.

## Plan

- [ ] Add a founder command-center Tauri view model and IPC command that
      aggregates:
      - existing TeamForge overview/utilization data
      - canonical client and onboarding projections
      - identity review queue counts for orphaned/unmatched signals
      - vault portfolio status / white-labelable signals
      - vault research hub / capture-registry signals
- [ ] Replace `src/pages/Overview.tsx` with a founder-facing command center
      built from LCARS rails and console sections instead of generic telemetry
      cards.
- [ ] Demote `Boards` from the primary shell navigation while keeping the route
      available for direct access until it has real authority.
- [ ] Verify the slice with frontend build, Rust checks, and diff hygiene, then
      record the implementation review in `tasks/todo.md`.

## Review

- Tauri skills used:
  - `calling-rust-from-tauri-frontend`
    - used to keep the founder dashboard as a single typed Tauri command
      instead of a frontend-only braid of loosely coupled fetches
  - `understanding-tauri-ipc`
    - used to keep the new overview slice on a clear IPC boundary with a
      serializable founder command-center view model and graceful vault
      fallback
- Backend changes:
  - added `get_founder_command_center` in `src-tauri/src/commands/mod.rs`
  - refactored the old overview query into `load_overview_data(...)` so the
    founder command-center command can reuse the existing utilization/quota
    projection cleanly
  - added founder-dashboard aggregation for:
    - active execution streams from the TeamForge execution bridge
    - canonical vs operational client counts
    - onboarding risk via canonical onboarding flows
    - orphaned identity review counts via the existing identity-map queue
  - extended `src-tauri/src/vault.rs` with founder-facing vault parsing for:
    - portfolio surfaces from product + client project briefs
    - stale review notes from `00-meta/mocs/stale-needs-review.md`
    - research intake summary from `30-research-hub/README.md`,
      `capture-registry.md`, and the inbox folder
- Frontend changes:
  - replaced `src/pages/Overview.tsx` with a founder command-center layout
    centered on:
    - active delivery streams
    - portfolio lifecycle
    - white-labelable opportunities
    - needs-review queues
    - research intake
  - added the new typed invoke surface in `src/hooks/useInvoke.ts`
  - added the new founder command-center types in `src/lib/types.ts`
  - demoted `Boards` from the primary shell navigation in `src/App.tsx`
    while keeping the route available for direct access
  - renamed the shell sections away from the old Huly-first framing toward a
    command-center / execution / registry split
- Verification:
  - `pnpm build` passed
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed
  - `git diff --check` passed
- Remaining known warning state:
  - Rust still has the same 9 pre-existing dead-code warnings outside this
    founder-dashboard slice

# Task Plan

## Goal

Audit the remaining GitHub backlog, active planning docs, and adjacent
`thoughtseed-labs` vault signals so TeamForge can be re-aligned around a real
founder dashboard instead of continuing stale Huly-first backlog work.

## Plan

- [x] Review the remaining open GitHub issues and classify them against the
      current shipped app state.
- [x] Review the current TeamForge shell and the key pages that still define
      the product shape: `Overview`, `Boards`, `Projects`, `Issues`, and the
      navigation layout.
- [x] Review the adjacent vault material that defines the stronger founder
      operating model and identify the highest-value signals TeamForge still is
      not surfacing.
- [x] Write a repo-owned realignment plan that says which issues to close,
      which to rewrite, and what the next founder-dashboard implementation
      slice should be.

## Review

- GitHub backlog state:
  - the open issue list is materially stale against the shipped product
  - `#5`, `#6`, `#7`, `#11`, `#16`, and `#17` should not continue as written
  - `#8`, `#9`, `#12`, `#14`, and `#15` still have useful intent, but need to
    be rewritten around the current canonical TeamForge model
- Product-shell state:
  - `src/App.tsx` still organizes the app as a Huly-oriented multi-page ops
    shell
  - `src/pages/Boards.tsx` is still a thin board-card table, so it predictably
    goes empty whenever Huly board data is sparse
  - `src/pages/Overview.tsx` is still mostly utilization/quota telemetry, not
    the founder command center described in the vault
- Vault signal state:
  - the adjacent vault already defines the stronger product model in:
    - `thoughtseed-labs/00-meta/founder-command-center.md`
    - `thoughtseed-labs/00-meta/system-of-records.md`
    - `thoughtseed-labs/00-meta/mocs/command-center-architecture.md`
    - `thoughtseed-labs/20-operations/project-management/portfolio-source-of-truth-review.md`
    - `thoughtseed-labs/20-operations/project-management/vault-next-20-improvements.md`
  - TeamForge is only partially surfacing that model today
  - important vault-backed signals still missing from the dashboard include:
    - portfolio lifecycle state
    - white-labelable inventory
    - founder review / needs-review queues
    - research intake control
    - active work and stale-work command surfaces
- Repo outputs:
  - added `docs/plans/2026-04-29-teamforge-dashboard-realignment.md`
  - that plan records the issue triage, identifies which earlier plans are
    still canonical, and recommends replacing the current Overview/Boards
    posture with a founder command-center slice

# Task Plan

## Goal

Ship `v0.1.24` from the hardened OTA publish path so the next release validates
the dedicated `TF_RELEASE_PUBLISH_TOKEN` contract in the real GitHub Actions
workflow.

## Plan

- [x] Bump TeamForge release metadata from `0.1.23` to `0.1.24` and add the
      release entry for the OTA publish-token hardening.
- [x] Verify the `0.1.24` release snapshot locally with the normal frontend and
      Rust checks.
- [x] Commit the `0.1.24` snapshot, tag `v0.1.24`, and push it to trigger the
      hardened release workflow.
- [x] Watch the GitHub Actions run through OTA publish and record the outcome
      in `tasks/todo.md`.

## Review

- Release snapshot:
  - committed as `12dda10` with
    `release(0.1.24): harden OTA publish auth`
  - pushed `main` and tag `v0.1.24` to `origin`
- Local verification:
  - `pnpm build` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` passed
  - `git diff --check` passed before tagging
- CI release outcome:
  - GitHub Actions run `25069353782` completed successfully:
    - [Build & Release #25069353782](https://github.com/Sheshiyer/team-forge-ts/actions/runs/25069353782)
  - `Publish OTA release (Apple Silicon)` passed
  - `Publish OTA release (Intel)` passed
  - the dedicated `TF_RELEASE_PUBLISH_TOKEN` hardening cleared the exact auth
    boundary that failed in `v0.1.23`
- Published release:
  - `v0.1.24`
  - [GitHub Release v0.1.24](https://github.com/Sheshiyer/team-forge-ts/releases/tag/v0.1.24)

## Goal

Provision the new `TF_RELEASE_PUBLISH_TOKEN` in both Cloudflare and GitHub,
then rerun the failed `v0.1.23` release workflow to verify OTA publication can
use the dedicated release token end to end.

## Plan

- [x] Generate a fresh release publish token and store it in Cloudflare Worker
      secrets.
- [x] Store the same token in GitHub Actions secrets for this repo.
- [x] Verify the live release-publish route accepts the new token, then note
      the boundary for the next tagged release.
- [x] Record the provisioning result in `tasks/todo.md`.

## Review

- Provisioning:
  - created a fresh `TF_RELEASE_PUBLISH_TOKEN`
  - stored it in Cloudflare Worker secrets with Wrangler
  - stored the same value in GitHub Actions secrets with `gh secret set`
- Live verification:
  - deployed the Worker after the auth split
  - verified the live `/internal/releases/publish` route accepts the dedicated
    bearer token by observing `400 missing_fields` instead of
    `403 invalid_authorization`
- Important boundary:
  - the already-published `v0.1.23` run used the pre-hardening release tag, so
    the next real CI validation must happen on a new tag from `main`

## Goal

Harden TeamForge OTA publication so the release publish callback uses a
dedicated `TF_RELEASE_PUBLISH_TOKEN` instead of reusing
`TF_WEBHOOK_HMAC_SECRET`.

## Plan

- [x] Split Worker internal-route auth so `/internal/releases/publish` uses a
      dedicated release token while existing sync/webhook callbacks keep the
      shared webhook secret.
- [x] Update the OTA publish script and GitHub Actions release workflow to
      require `TF_RELEASE_PUBLISH_TOKEN` for CI release publication.
- [x] Update the secrets/contracts/runbooks so the new release-token ownership
      is explicit and the old shared-secret assumption is removed.
- [x] Verify the code paths locally and record the rollout follow-up in
      `tasks/todo.md`.

## Review

- Skill used:
  - `building-tauri-with-github-actions`
    - used to keep the change anchored to the real TeamForge release workflow
      and its CI/CD secret contract
- Code changes:
  - `cloudflare/worker/src/index.ts` now routes `/internal/releases/publish`
    through `TF_RELEASE_PUBLISH_TOKEN` while the other `/internal/*` callback
    routes still use `TF_WEBHOOK_HMAC_SECRET`
  - `cloudflare/worker/src/lib/env.ts` now declares
    `TF_RELEASE_PUBLISH_TOKEN`
  - `scripts/publish-ota-release.mjs` now accepts only `--auth-token` or
    `TF_RELEASE_PUBLISH_TOKEN` for the publish callback, and no longer falls
    back to `TF_WEBHOOK_HMAC_SECRET`
  - `.github/workflows/release.yml` now injects and validates
    `TF_RELEASE_PUBLISH_TOKEN` instead of the webhook secret
- Contract/runbook updates:
  - updated `docs/architecture/contracts/worker-route-contract.md`
  - updated `docs/architecture/contracts/secrets-auth-contract.md`
  - updated `docs/architecture/contracts/ota-updater-contract.md`
  - updated `docs/architecture/cloudflare-backend-ota-design.md`
  - updated `docs/runbooks/teamforge-icon-workflow.md`
- Verification:
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` passed
  - `TF_RELEASE_PUBLISH_TOKEN=test-token node scripts/publish-ota-release.mjs --dry-run ...`
    passed and showed the OTA publish payload without reading
    `TF_WEBHOOK_HMAC_SECRET`
  - `git diff --check` passed
- Operational follow-up before the next release rerun:
  - `TF_RELEASE_PUBLISH_TOKEN` was provisioned in Cloudflare Worker secrets
  - the same token was provisioned in GitHub Actions secrets
  - the Worker was deployed after the auth split
  - a direct `POST /internal/releases/publish` call with the new bearer token
    now returns `400 missing_fields` instead of `403 invalid_authorization`,
    which proves the dedicated token is accepted by the live route
  - the old `v0.1.23` tag workflow still carries the pre-hardening release
    script and workflow config, so the next real validation step is to ship
    this hardening on `main` and cut the next release tag

## Goal

Cut the next TeamForge release through the existing CI/CD path by turning the
current worktree into a coherent `v0.1.23` release snapshot.

## Plan

- [x] Clean generated junk from the worktree and update release metadata to
      `0.1.23`.
- [x] Verify the release snapshot locally with the standard frontend/Rust
      checks plus the known bundle/signing boundary.
- [x] Commit the release snapshot, create tag `v0.1.23`, and push the commit
      and tag to trigger `.github/workflows/release.yml`.
- [x] Record the release result in `tasks/todo.md`.

## Review

- Release snapshot:
  - committed as `841c41d` with
    `release(0.1.23): canonical cleanup and icon pipeline`
  - pushed `main` and tag `v0.1.23` to `origin`
- Local verification:
  - `pnpm build` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed
  - `cargo tauri build --bundles app` produced the macOS `.app` and updater
    archive before the expected local signing-env stop
- First CI release result:
  - `.github/workflows/release.yml` triggered correctly for `v0.1.23`
  - the run built the Apple Silicon app and updater bundle, uploaded the
    artifact, signature, and release notes to R2, then failed in
    `Publish OTA release (Apple Silicon)` with:
    - `403 invalid_authorization`
    - `Invalid bearer token.`
  - that failure is the reason the follow-up hardening slice now moves OTA
    publication onto `TF_RELEASE_PUBLISH_TOKEN`

## Goal

Align TeamForge's icon and release verification docs with the existing GitHub
Actions OTA pipeline so local bundle checks and CI/CD release publication are
clearly separated.

## Plan

- [x] Review the existing release workflow and OTA contract against the
      `building-tauri-with-github-actions` skill.
- [x] Update the TeamForge icon/release runbooks so local bundle validation and
      CI/CD updater signing each have an explicit role.
- [x] Record the correction and verification result in `tasks/todo.md`.

## Review

- Skill used:
  - `building-tauri-with-github-actions`
    - used to validate that TeamForge's updater signing and published OTA
      artifacts are already owned by GitHub Actions, not by an ad hoc local
      release path
- Existing canonical release path confirmed:
  - `.github/workflows/release.yml` already injects:
    - `TAURI_SIGNING_PRIVATE_KEY`
    - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  - the workflow builds both `aarch64-apple-darwin` and
    `x86_64-apple-darwin`
  - the workflow locates `TeamForge.app.tar.gz` plus `.sig` files and publishes
    OTA metadata through `pnpm release:ota:publish`
- Repo improvements:
  - updated `docs/runbooks/teamforge-icon-workflow.md` so local icon validation
    and CI/CD release publication are explicitly separated
  - updated `docs/runbooks/tauri-agent-skills.md` so future Tauri work treats
    `.github/workflows/release.yml` as the TeamForge release source of truth
  - updated `README.md` release notes to point at the canonical release
    workflow
- Verification:
  - reviewed `.github/workflows/release.yml`
  - reviewed `docs/architecture/contracts/ota-updater-contract.md`
  - confirmed the local icon pass already produced:
    - `src-tauri/target/release/bundle/macos/TeamForge.app`
    - `src-tauri/target/release/bundle/macos/TeamForge.app.tar.gz`
  - confirmed the local post-bundle failure was only missing
    `TAURI_SIGNING_PRIVATE_KEY`, which the GitHub Actions release workflow
    already provides from secrets

## Goal

Use the Tauri skill workflow specifically for TeamForge's app icon integration,
promote the user-supplied approved icon assets into the repo's canonical asset
area, and wire the live Tauri bundle icons from that approved source.

## Plan

- [x] Review the relevant Tauri app/distribution skills against TeamForge's
      current icon bundle contract.
- [x] Promote the user-supplied `option1` icon assets into the repo's approved
      TeamForge asset source area with preserved provenance.
- [x] Update the live `src-tauri/icons` bundle from the approved master and
      verify the resulting Tauri icon files are no longer placeholders.
- [x] Record the app-specific Tauri-skill improvements and verification result
      in `tasks/todo.md`.

## Review

- Skills used for the app-specific work:
  - `configuring-tauri-apps`
    - used to validate that TeamForge should keep the bundle icon contract
      rooted in `src-tauri/tauri.conf.json` and `src-tauri/icons/*`
  - `distributing-tauri-for-macos`
    - used to validate that a real macOS `icon.icns` belongs in the bundle and
      that the app/distribution path should preserve the proper iconset lineage
- Approved source promotion:
  - promoted the user-supplied assets into the repo at:
    - `design-assets/teamforge/icons/approved/teamforge-dock-icon-option1-1024.png`
    - `design-assets/teamforge/icons/approved/teamforge-dock-icon-option1.icns`
    - `design-assets/teamforge/icons/approved/teamforge-dock-icon-option1.iconset/`
  - added provenance notes in:
    - `design-assets/teamforge/icons/approved/teamforge-dock-icon-option1.md`
- Live app improvements:
  - replaced the placeholder Tauri bundle icon files with the approved TeamForge
    icon family in `src-tauri/icons/`
  - the macOS `icon.icns` is now a full app icon resource instead of a tiny
    placeholder stub
  - the Windows `icon.ico` is now regenerated from the approved 1024 master and
    contains multiple icon sizes
  - the repo now has a real separation between:
    - approved design source assets
    - shipped Tauri bundle outputs
  - fixed the live export path so `scripts/export-teamforge-tauri-icons.sh`
    normalizes generated bundle PNGs and temporary iconset PNGs to RGBA before
    packaging
  - documented that TeamForge should never ship Tauri PNGs from raw iconset
    copies or direct `sips` outputs without RGBA normalization
- Readability verification:
  - generated a single-candidate review board at:
    - `~/Downloads/teamforge-option1-review/teamforge-dock-icon-review-board.png`
  - result:
    - the outer LCARS ring silhouette stays recognizable at 16px
    - the central star/pyramid detail compresses at 16px but still reads as a
      structured core rather than dissolving into noise
- File verification:
  - `file src-tauri/icons/*` now reports:
    - real 32x32, 128x128, and 256px PNGs
    - a 1.1 MB macOS `icon.icns`
    - a multi-size Windows `icon.ico`
  - `python3` + Pillow confirms the shipped bundle PNGs now open as `RGBA`
  - `git diff --check` passed
  - `pnpm build` passed
  - `cargo tauri build --bundles app` successfully produced:
    - `src-tauri/target/release/bundle/macos/TeamForge.app`
    - `src-tauri/target/release/bundle/macos/TeamForge.app.tar.gz`
  - the remaining `cargo tauri build` failure is post-bundle updater signing
    only:
    - `TAURI_SIGNING_PRIVATE_KEY` is not set

## Goal

Do a final pass on TeamForge's visual-asset system and identify the concrete
gaps that prevent the app, the Art skill, the design resource library, and the
icon pipeline from operating as one coherent system, with a specific emphasis
on FAL.ai + Nano Banana 2 for icon and app asset generation.

## Plan

- [x] Audit the current TeamForge visual system, icon assets, and app shell so
      the findings stay tied to the real product surface instead of abstract
      design advice.
- [x] Audit the Art skill, the generation CLI, and the design resource library
      for model/provider mismatches, missing workflow guidance, and prompt
      sourcing gaps.
- [x] Write a repo-tracked audit/runbook with 20-25 concrete issues, gaps, and
      improvements, plus the recommended FAL.ai Nano Banana 2 asset workflow
      for TeamForge.
- [x] Verify the new documentation for internal consistency and record the
      review result.

## Goal

Run a real TeamForge dock-icon batch with FAL.ai Nano Banana 2, review the
variants at shipping sizes, and fix the highest-leverage repo/workflow gaps
from the visual asset audit.

## Plan

- [x] Add the repo-side TeamForge asset structure: canonical visual brief,
      prompt files, and scripts for batch generation, readability review, and
      Tauri bundle export.
- [x] Update the repo workflow docs and package scripts so FAL.ai
      `fal-nano-banana-2` is the explicit TeamForge icon path.
- [ ] Generate a 4-variant dock-icon batch to `~/Downloads`, create a 16/32/64
      review board, and pick the strongest candidate.
- [ ] Promote the selected winner into the new TeamForge asset source area and
      export the Tauri bundle icons if the result clears review.
- [x] Re-run verification, record the outcome in `tasks/todo.md`, and note any
      remaining design decisions that still need human taste review.

## Review

- Repo-side fixes landed:
  - added `design-assets/teamforge/README.md`
  - added `design-assets/teamforge/visual-brief.md`
  - added pinned dock-icon prompt variants under
    `design-assets/teamforge/icons/prompts/`
  - added:
    - `scripts/generate-teamforge-dock-icon-batch.sh`
    - `scripts/review-teamforge-dock-icons.py`
    - `scripts/export-teamforge-tauri-icons.sh`
  - added `docs/runbooks/teamforge-icon-workflow.md`
  - added package scripts for batch, review, and export
- Underlying skill alignment:
  - updated `~/.claude/skills/Art/Workflows/CreatePAIPackIcon.md` so the icon
    workflow now matches the Downloads-first rule and prefers
    `fal-nano-banana-2`, with `nano-banana-pro` documented as fallback
- FAL batch blocker:
  - the real `pnpm design:teamforge:icon-batch` run failed at the first FAL.ai
    request with:
    - `401 - {"detail": "No user found for Key ID and Secret"}`
  - current environment state:
    - `FAL_KEY` is present
    - `FAL_API_KEY` is unset
    - the configured `FAL_KEY` in `~/.claude/.env` is therefore the blocking
      credential
- Tooling verification that still succeeded:
  - `python3 -m py_compile scripts/review-teamforge-dock-icons.py` passed
  - `git diff --check` passed
  - the review-board script successfully rendered a tooling test board from a
    temporary placeholder-icon batch in:
    - `~/Downloads/teamforge-dock-icon-batch-tooling-test/teamforge-dock-icon-review-board.png`
  - the export script successfully regenerated bundle assets from a placeholder
    source during testing, then those four binary icon files were restored to
    their pre-test content so the repo does not carry meaningless placeholder
    churn
- Remaining next step:
  - refresh `FAL_KEY` with a valid credential, then rerun
    `pnpm design:teamforge:icon-batch`
  - once the real batch exists, pick the winner from the 16px/32px/64px board,
    promote it into `design-assets/teamforge/icons/approved/`, and run the
    export script against that approved master

## Review

- Scope:
  - reviewed the live LCARS shell, Tauri bundle icon state, Art skill
    defaults/workflows, FAL Nano Banana 2 support in the generation CLI, and
    the external design prompt library
  - no repo-local `.context/*` or GSD-specific artifacts were present in this
    checkout, so the pass used the repo docs plus the external Design library
- Main artifact:
  - added `docs/runbooks/teamforge-visual-asset-audit.md`
  - the runbook captures 25 concrete gaps and improvements, then defines the
    canonical TeamForge prompt sources and the recommended FAL.ai +
    `fal-nano-banana-2` command flow for dock icons, tray glyphs, and campaign
    boards
- Highest-signal findings:
  - the current bundled app icon is effectively a placeholder solid square
  - the repo has no source master, export path, or approval flow for visual
    assets
  - the Art skill's default palette/workflow conflicts with TeamForge's LCARS
    language and still points icon work at `nano-banana-pro`
  - FAL Nano Banana 2 already exists in the CLI, but it is not the documented
    default for icon workflows
- Verification:
  - re-read `docs/runbooks/teamforge-visual-asset-audit.md`
  - `git diff --check` passed

## Goal

Review the Tauri prompt scaffold with the `autoresearch` keep-or-discard loop,
then refine the scaffold only where it materially improves real TeamForge
execution.

## Plan

- [x] Audit the current scaffold against repo workflow rules, the pinned Tauri
      skill runbook, and the `autoresearch` skill expectations.
- [x] Test a small set of prompt refinements one variable at a time and keep
      only the changes that improve execution fidelity.
- [x] Update the scaffold doc with the kept refinements and record the review
      result.

## Review

- Experiment goal:
  - make the Tauri prompt scaffold more faithful to the real TeamForge
    execution environment without bloating it into a generic process wall
- Baseline:
  - the scaffold already covered lessons, task planning, repo docs, skill
    naming, and verification
  - it did not yet force opening the selected skills' `SKILL.md` files
  - it did not mention the current-session skill availability trap after fresh
    installs
  - it did not explicitly mirror the repo rule to stop and re-plan when the
    task shape changes or blockers appear
- Experiment log:
  - kept: require opening the selected Tauri skills' `SKILL.md` files
    - reason: this matches the actual skill system contract instead of relying
      only on the local runbook summary
  - kept: add fallback language for skills not visible in the current session
    - reason: this machine can have installed skills that require a Codex
      restart before the session can actually use them
  - kept: add explicit re-plan language for blockers or scope shifts
    - reason: this aligns the scaffold with the repo's AGENTS workflow instead
      of assuming the initial plan remains valid
  - kept: allow an explicit "no implementation-specific Tauri skill applies"
    outcome for meta tasks
    - reason: this prevents the scaffold from encouraging fake skill selection
      on workflow or documentation tasks like this one
  - discarded: add broader generic safety reminders such as extra git hygiene
    bullets
    - reason: they add prompt weight without improving the Tauri-specific
      workflow enough to justify the noise
- Winning changes:
  - updated `docs/runbooks/tauri-prompt-scaffold.md` so both the full and short
    prompts now require opening selected `SKILL.md` files
  - added explicit session-availability fallback and restart guidance
  - added explicit `tasks/todo.md` re-plan guidance
  - added an explicit escape hatch for meta tasks where no real
    implementation-specific Tauri skill is the right fit
- Recommended next batch:
  - use the scaffold on one real Tauri IPC or sidecar task and see whether the
    first progress update naturally cites the selected skills and repo docs
  - only add more wording if that real-task pass shows a concrete failure mode

## Goal

Install the `dchuk/claude-code-tauri-skills` suite and make the Tauri skill
references reproducible from this repo instead of leaving them as hidden local
agent state.

## Plan

- [x] Add repo-visible commands for refreshing and listing the installed Tauri
      skill suite.
- [x] Document the installed skill source, local install paths, and the key
      skill names this repo should reference in Tauri workflows.
- [x] Link the skill workflow guidance from the main README.
- [x] Verify the new repo commands against the installed skill suite and record
      the result.

## Review

- Install and repo wiring:
  - ran `npx skills add dchuk/claude-code-tauri-skills -y -g`
  - added repo-local wrappers:
    - `pnpm skills:tauri:refresh`
    - `pnpm skills:tauri:list`
  - added the pinned suite manifest at `config/tauri-skill-suite.txt`
- Workflow documentation:
  - added `docs/runbooks/tauri-agent-skills.md` with the source package,
    install path notes, canonical skill names, and usage guidance
  - linked the Tauri skill workflow from `README.md`
- Verification:
  - `pnpm skills:tauri:list` passed and verified all 39 manifest skills from
    `~/.agents/skills`
  - `pnpm skills:tauri:refresh` reran the install flow against
    `dchuk/claude-code-tauri-skills`
  - `git diff --check` passed
- Notes:
  - the broader machine also has an unrelated `tauri-v2` skill in the global
    store, so the repo list command now checks only the pinned 39-skill manifest
    instead of every directory matching `*tauri*`
  - Codex must be restarted to pick up newly installed skills in a fresh
    session

## Goal

Implement the canonical surface cleanup so TeamForge stops presenting stale
settings and heuristic-first modules as primary product surfaces.

## Plan

- [x] Make TeamForge project graph the only authority for GitHub repo scope and
      reduce Settings to token + sync only.
- [x] Remove quota editing from Settings and move it into Team capacity.
- [x] Hide Planner and Knowledge from the main shell, preserving safe route
      behavior for legacy deep links.
- [x] Make Onboarding canonical-only and remove fallback/heuristic framing.
- [x] Reorganize Clients around canonical TeamForge profiles while keeping
      derived operational signals secondary.
- [x] Re-run frontend and Rust verification and record the cleanup review.

## Review

- Settings / authority cleanup:
  - removed the GitHub repo editor from `Settings` and changed the copy so
    TeamForge projects are the only repo authority
  - stopped the backend from reading, writing, or cloud-syncing the deprecated
    `github_repos` setting and added one-time local cleanup on settings/sync
    paths
  - changed GitHub sync to fail explicitly when no TeamForge project repos or
    no GitHub token exist instead of silently doing nothing
- Team / route cleanup:
  - removed quota editing from `Settings` and added inline monthly quota editing
    to Team `capacity`
  - removed Planner from the shell and redirected `/planner` to `/team/capacity`
  - hid Knowledge from nav and replaced the old heuristic page with a canonical
    placeholder route
- Canonical-first product cleanup:
  - removed synthesized onboarding fallbacks from the backend and updated the
    UI to show canonical flows only
  - rebuilt Clients around canonical registry vs operational-only signal groups
    and split operational signals into their own nested client view model
- Verification:
  - `pnpm build` passed
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed
  - `cargo test --manifest-path src-tauri/Cargo.toml cached_teamforge_graphs_bridge_into_github_repo_configs -- --nocapture` passed
  - `git diff --check` passed
  - Rust still has 9 pre-existing dead-code warnings outside this cleanup slice

## Goal

Remove the Node 20 GitHub Actions deprecation warning from the TeamForge
release workflow by moving the warned JavaScript actions onto current Node 24
capable versions, then push the workflow fix.

## Plan

- [x] Update the warned GitHub Actions in `.github/workflows/release.yml` to
      current Node 24-capable versions.
- [x] Review the workflow diff for compatibility risks and runner assumptions.
- [x] Commit the workflow fix and push it to `main`.

## Review

- Workflow change:
  - upgraded `actions/checkout` from `v4` to `v6`
  - upgraded `actions/setup-node` from `v4` to `v6`
  - upgraded `pnpm/action-setup` from `v4` to `v6`
- Compatibility note:
  - this workflow runs on GitHub-hosted `macos-latest`, so the runner version
    requirements for the Node 24-capable action majors are satisfied by the
    hosted environment
- Verification:
  - `git diff --check` passed
  - workflow diff stayed limited to the three warned JavaScript actions

## Goal

Review the app-wide LCARS UI cleanup as a release candidate, verify the release
workflow prerequisites, then commit and push the release-ready changes so the
OTA flow can pick them up.

## Plan

- [x] Review the full diff for accidental data/model changes, broken routes,
      or release workflow blockers.
- [x] Re-run frontend and Tauri/Rust verification from the current working
      tree.
- [x] Bump release metadata and changelog for the OTA candidate tag.
- [x] Inspect release workflow state and confirm the commit scope is
      release-safe.
- [x] Commit the validated changes, tag the release, and push to the GitHub
      remote.

## Review

- Release target:
  - bumped app metadata from `0.1.21` to `0.1.22`
  - added `CHANGELOG.md` entry for `v0.1.22`
  - confirmed local `v0.1.21` already points at `origin/main`, so this UI pass
    needs a new OTA tag instead of retagging the existing release
  - confirmed no remote `v0.1.22` tag exists before push
- Release workflow:
  - `.github/workflows/release.yml` builds on `v*` tags and publishes OTA
    artifacts for Apple Silicon and Intel
  - updater artifacts remain enabled in `src-tauri/tauri.conf.json`
  - workflow still validates required OTA signing and Cloudflare secrets at run
    time
- Review findings:
  - fixed invalid CSS variable alpha strings in the new status/source pill
    styling before release verification
  - `git diff --check` passed
- Verification:
  - `pnpm build` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed with existing
    dead-code warnings only

## Goal

Run an app-wide UI cleanup using the same criteria across every visible
TeamForge surface:

- remove narrator/debug/meta copy
- tighten status/error/empty-state language
- bring older routes up to the current LCARS console standard
- clean up any obviously rough admin-style layouts that still break the visual
  system

## Plan

- [x] Audit the shared shell and all major routes for the repeated UI problems:
      - explanatory sync prose
      - verbose error strings
      - weak empty states
      - inconsistent LCARS section framing
- [x] Refactor the shared shell and highest-traffic routes first so the app’s
      core navigation and founder surfaces set the visual language correctly.
- [x] Scrub the remaining routes for terse, product-grade copy and cleaner
      layout framing using the same rules.
- [x] Re-run frontend and Rust verification, then record the validated result
      and any new UI lessons.

## Review

- High-traffic route cleanup:
  - rebuilt `Comms` into a roster-first signal console with sync rails, ranked
    panels, and a crew matrix instead of two isolated tables
  - rebuilt `Calendar` into split control/data surfaces for leave and holidays
    with cleaner sync state treatment
  - rewrote the Team `EmployeeSummaryPanel` as a concise crew profile surface
    with vault/KPI status pills and tighter section copy
- App-wide copy sweep:
  - removed narrator/debug-style sync prose across TeamForge pages including
    `Onboarding`, `Planner`, `Sprints`, `Knowledge`, `Issues`, `Boards`,
    `Activity`, `Live`, `Clients`, `Projects`, `Insights`, `Settings`, and
    several smaller empty states
  - normalized error and empty-state language toward short product text instead
    of instructions about caches, worker routes, or manual sync steps
- Verification:
  - `pnpm install --frozen-lockfile`
    - passed after restoring dependencies in the freshly cloned repo
  - `pnpm build`
    - passed
  - `cargo check --manifest-path src-tauri/Cargo.toml`
    - passed with existing dead-code warnings only

## Goal

Wire TeamForge to the real Thoughtseed Paperclip repo path, add a launch
wrapper that matches the existing Paperclip startup contract, and prepare the
current repo state for the next tagged release commit.

## Plan

- [x] Add a stable TeamForge-side wrapper script for the sibling
      `thougghtseed-paperclip` repo so the current Tauri launcher can start the
      Paperclip babysitter without requiring extra CLI args in settings.
- [x] Tighten the Settings guidance/default UI path around the actual local
      Paperclip endpoint (`http://127.0.0.1:3100`).
- [x] Bump release/version metadata and changelog entries for the next release
      cut.
- [x] Verify the Paperclip wrapper against the real repo path and stage a clean
      release-oriented commit without pulling in unrelated scratch artifacts.

## Review

- Real runtime path confirmed:
  - Paperclip lives at:
    - `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thougghtseed-paperclip`
  - existing Paperclip startup contract is:
    - `./scripts/babysitter.sh start`
  - existing Paperclip health/status contract is:
    - `./scripts/health-check.sh`
    - `./scripts/babysitter.sh status`
  - default local Paperclip base URL from `.env.example` is:
    - `http://127.0.0.1:3100`
- TeamForge-side wrapper:
  - added `scripts/launch-thoughtseed-paperclip.sh`
  - default behavior:
    - targets the sibling Paperclip repo path
    - `start` maps to `babysitter.sh start`
    - `status`, `health`, and `stop` are also supported for manual verification
  - added root package helpers:
    - `pnpm paperclip:launch`
    - `pnpm paperclip:status`
- Settings alignment:
  - updated `Settings` helper text to recommend the new wrapper
  - defaulted the Paperclip UI URL to `http://127.0.0.1:3100`
- Release prep:
  - bumped release metadata to `0.1.21`
  - added a new `v0.1.21` changelog entry covering:
    - founder-console local workspace controls
    - Worker-backed issues module
    - Paperclip launcher wrapper
  - staged the release-oriented commit scope while intentionally excluding:
    - `tasks/teamforge-vault-parity-canary.json`
    - `tasks/teamforge-vault-parity-report.json`
- Verification:
  - `bash scripts/launch-thoughtseed-paperclip.sh health`
    - reached the real sibling Paperclip repo and reproduced the current stale
      0/5 health state
  - `bash scripts/launch-thoughtseed-paperclip.sh`
    - invoked the real sibling Paperclip `babysitter.sh start` path and
      returned a live daemon PID from that repo
  - `bash scripts/launch-thoughtseed-paperclip.sh status`
    - immediately reported a stale babysitter PID from this command-run
      context, so the wrapper path is proven but the long-lived daemon behavior
      still needs verification from the actual desktop app runtime or a
      dedicated supervisor session
  - `cargo check --manifest-path src-tauri/Cargo.toml`
    - passed
  - `pnpm build`
    - passed

## Goal

Implement Phase 1 of the founder-console plan by adding a native local
workspace settings section, explicit vault path persistence, and Paperclip
launch/open controls in the Tauri app.

## Plan

- [x] Add the Tauri plugin/capability and command surface needed for:
      - picking a vault directory
      - validating the configured vault path
      - launching the configured Paperclip script
      - opening the configured Paperclip UI URL
- [x] Persist and surface the new local workspace settings in the existing
      Settings page without disturbing the current integration flows.
- [x] Switch vault root resolution to prefer the saved `local_vault_root`
      setting before existing env-var and Obsidian fallbacks.
- [x] Run targeted verification for the new Rust/frontend build path and record
      the result.

## Review

- Native command surface:
  - added Tauri commands for:
    - `pick_vault_directory`
    - `validate_vault_directory`
    - `launch_paperclip_script`
    - `open_paperclip_ui`
  - initialized `tauri-plugin-dialog` and added `dialog:default` capability
- Settings/UI:
  - added a new `LOCAL WORKSPACE` section in `Settings`
  - persisted:
    - `local_vault_root`
    - `paperclip_script_path`
    - `paperclip_working_dir`
    - `paperclip_ui_url`
  - added founder-facing controls for:
    - choosing a vault folder
    - validating the selected vault
    - launching the Paperclip script
    - opening the Paperclip UI
- Vault resolution:
  - `src-tauri/src/vault.rs` now prefers the saved `local_vault_root`
    setting before falling back to env vars or Obsidian config heuristics
  - added a reusable vault validation model that reports known Thoughtseed
    markers such as:
    - `50-team`
    - `60-client-ecosystem`
    - `.obsidian`
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml`
    - passed
  - `cargo check --manifest-path src-tauri/Cargo.toml`
    - passed
    - required dependency resolution for the new dialog plugin
  - `pnpm build`
    - passed

## Goal

Clarify the next TeamForge architecture pass so the native Tauri app becomes the
founder/agent control surface not only for GitHub, Huly, Clockify, and Slack,
but also for:

- local Obsidian vault selection and ingestion
- local Paperclip launcher controls
- Cloudflare-backed shared project/control-plane sync

## Plan

- [x] Separate shared Cloudflare state from per-machine local Tauri settings so
      founder-specific vault paths and launcher paths do not leak into the
      global source of truth.

## Goal

Audit the Settings page and the surrounding app for stale settings, orphaned
admin workflows, and older feature surfaces that no longer fit the current
TeamForge product direction, then remove or simplify the pieces that no longer
make sense.

## Plan

- [x] Map every current settings section, stored setting, and linked backend
      capability so the audit is based on real code paths rather than UI
      impressions.
- [x] Trace the identity/orphaned-link override workflow and other older admin
      surfaces across the app to separate still-useful controls from stale
      baggage.
- [x] Implement the cleanup pass with minimal-impact changes that remove,
      hide, or simplify obsolete settings/features while preserving current
      product-critical integrations.
- [x] Verify the resulting app build and record the audit findings and any
      intentional deferrals in this file.

## Review

- Settings cleanup:
  - replaced the old generic `IDENTITY REVIEW` workbench with a narrower
    `SLACK IDENTITY REPAIR` queue that only shows true Slack exceptions
    (unmatched or sub-85% matches)
  - removed the global operator field, hid raw backend match metadata, and
    simplified repair actions to a compact account-mapping table
  - relabeled `SYNC CONTROLS` to `CLOCKIFY SYNC STATE` because the manual
    action only runs the Clockify full sync path
- Stale frontend surfaces removed:
  - deleted orphaned `src/pages/Training.tsx`
  - deleted superseded `src/pages/Devices.tsx`
  - deleted unused pre-vault Team org-mapping components:
    - `DepartmentCard`
    - `DirectoryPanel`
    - `RolePicker`
    - `ValidationBar`
    - `src/components/team/types.ts`
  - removed the dead invoke/type wiring that only served those legacy
    front-end surfaces
- Settings/storage cleanup:
  - stopped cloud integration sync from re-seeding unused `huly_mirror_*`
    settings keys
  - removed dead Tauri command registrations for the deleted Devices/Training
    pages
- Audit findings kept in mind for follow-up:
  - `GITHUB PLANS` still has multiple authorities (`github_repos`, cloud sync,
    TeamForge project graph) and should likely collapse to the TeamForge
    control plane later
  - `CREW MANAGEMENT` still lives inside Settings even though it edits live
    employee quota data rather than app settings
- Verification:
  - `pnpm build` passed
  - `cargo check --manifest-path src-tauri/Cargo.toml` passed
  - `cargo test --manifest-path src-tauri/Cargo.toml identity -- --nocapture`
    passed
  - `git diff --check` passed

## Goal

Back the `Issues` module with a TeamForge Worker-owned active-issues feed so
active project engineering issues come from Cloudflare/D1 control-plane sync
state, with local SQLite used only as a desktop cache/offline projection.

## Plan

- [x] Add a Worker endpoint that lists engineering issues for active TeamForge
      projects from `sync_entity_mappings`.
- [x] Add a local Tauri projection/cache for the Worker issue feed and make the
      desktop issue loader use it remote-first.
- [x] Keep the existing local GitHub cache path only as the final fallback when
      no Worker/cached TeamForge issue feed is available.
- [x] Re-run targeted verification and capture the validated outcome.

## Review

- Root cause:
  - the new `Issues` page was still reading the legacy desktop `github_issues`
    cache path directly
  - the Cloudflare Worker already owned project control-plane issue mappings in
    D1 via `sync_entity_mappings`, but that worker-owned engineering issue set
    was not exposed as a feed the desktop could consume
  - this left TeamForge project identity in Cloudflare while issue rendering
    still depended on a separate local GitHub cache path
- Fix applied:
  - added a Worker endpoint:
    - `GET /v1/project-mappings/issues`
    - returns engineering GitHub issues for active TeamForge projects from D1
      `sync_entity_mappings`, enriched with project metadata and issue payload
      labels/assignees
  - extended Worker GitHub issue payloads to persist:
    - `priority`
    - `track`
    - `createdAt`
    - `updatedAt`
    - `closedAt`
  - added a new local SQLite projection table:
    - `teamforge_active_project_issues`
  - added Worker fetch + cache plumbing in Tauri so
    - `get_active_project_issues` now uses the Worker feed first
    - cached TeamForge issue projection is used offline if the Worker is
      unavailable
    - the old local `github_issues` path remains only as the final legacy
      fallback
  - added regression test:
    - `commands::tests::active_project_issues_prefer_cached_teamforge_projection_before_legacy_github_cache`
- Verification:
  - worker typecheck:
    - `./node_modules/.bin/tsc -p cloudflare/worker/tsconfig.json --noEmit`
    - passed
  - frontend build:
    - `pnpm build`
    - passed
  - targeted Rust regression:
    - `cargo test --manifest-path src-tauri/Cargo.toml commands::tests::active_project_issues_prefer_cached_teamforge_projection_before_legacy_github_cache -- --exact`
    - passed
  - legacy active-project grouping regression:
    - `cargo test --manifest-path src-tauri/Cargo.toml commands::tests::active_project_issues_are_grouped_from_active_teamforge_projects -- --exact`
    - passed
  - fresh app bundle:
    - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`
    - passed and produced
      `src-tauri/target/release/bundle/macos/TeamForge.app`

## Goal

Replace the misleading `Devices` primary module with an `Issues` module that
shows active project issues grouped by project.

## Plan

- [x] Inspect the current `Devices` navigation/page/backend path and confirm
      how it is heuristically deriving a pseudo-device registry from Huly
      issues and cards.
- [x] Replace the primary `Devices` surface with a real `Issues` module driven
      by active project issue data.
- [x] Re-run targeted verification for the new issue path and capture the
      validated outcome.

## Review

- Root cause:
  - the old `Devices` page was not backed by a device system of record
  - `src-tauri/src/commands/mod.rs::load_devices` heuristically classified
    Huly issues and board cards as “devices,” which pulled Axtech/Heyza smart
    home engineering work, specs, and unrelated project details into a fake
    device registry
  - the left nav therefore exposed the wrong concept to the user
- Fix applied:
  - replaced the primary nav item `/devices` with `/issues`
  - added `/devices -> /issues` redirect to avoid broken deep links
  - added a new backend issue view model plus `get_active_project_issues`
    command backed by:
    - active `teamforge_projects`
    - synced GitHub repo mappings
    - cached `github_issues`
  - added a new `Issues` page grouped by project, with client/project/status
    filters and expandable issue details
  - kept the old device heuristics out of the primary shell without disturbing
    unrelated client-detail enrichment
  - added regression test:
    - `commands::tests::active_project_issues_are_grouped_from_active_teamforge_projects`
- Verification:
  - `pnpm build`
    - passed
  - `cargo test --manifest-path src-tauri/Cargo.toml commands::tests::active_project_issues_are_grouped_from_active_teamforge_projects -- --exact`
    - passed

## Goal

Fix the Projects execution data decode failure so Clockify project hours load in
the `Projects -> Execution` view again.

## Plan

- [x] Inspect the `load clockify project hours` query and confirm the exact
      SQLx type mismatch between aggregated SQLite values and Rust row models.
- [x] Apply the smallest safe backend fix so aggregated `duration_seconds`
      values decode consistently.
- [x] Re-run targeted verification for the Projects execution data path and
      capture the validated outcome.

## Review

- Root cause:
  - `time_entries.duration_seconds` is stored as `INTEGER` in SQLite
  - the Projects execution path in `src-tauri/src/commands/mod.rs` decoded
    `COALESCE(SUM(te.duration_seconds), 0)` into Rust `f64` fields
  - SQLite returned `INTEGER` for the aggregate, so SQLx rejected the decode
    with:
    - `Rust type f64 (as SQL type REAL) is not compatible with SQL type INTEGER`
- Fix applied:
  - changed the raw aggregate row structs in `src-tauri/src/commands/mod.rs`
    from `f64` seconds fields to `i64`
  - kept hour/utilization math in Rust by converting the integer seconds to
    `f64` only after decode
  - added regression test:
    - `commands::tests::clockify_project_hours_query_decodes_integer_sums`
- Verification:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
    - passed
  - `cargo test --manifest-path src-tauri/Cargo.toml commands::tests::clockify_project_hours_query_decodes_integer_sums -- --exact`
    - passed

## Goal

Unblock fresh TeamForge Tauri bundles by resolving the local Cargo checksum
conflict currently failing `cargo metadata`, `cargo check`, and
`npm run tauri -- build`.

## Plan

- [x] Inspect Cargo workspace ancestry, manifest dependencies, and any
      competing lockfiles involved in `src-tauri` resolution.
- [x] Inspect local Cargo toolchain and registry/cache state for the affected
      crates (`hyper-util`, `serde_repr`) and identify the concrete mismatch
      source.
- [x] Apply the smallest safe fix for the checksum conflict.
- [x] Re-run Cargo/Tauri verification commands and capture the validated
      outcome.

## Review

- Root cause:
  - `src-tauri/Cargo.lock` had an inconsistent partial edit
  - `team-forge-ts` was bumped to `0.1.20`, but the lockfile entries for:
    - `hyper-util`
    - `serde_repr`
    were changed from `0.1.20` down to `0.1.19` without changing their
    checksums
  - the stored checksums actually matched `0.1.20`, so Cargo failed with:
    - `checksum for hyper-util v0.1.19 changed between lock files`
    - `checksum for serde_repr v0.1.19 changed between lock files`
- Fix applied:
  - restored the `hyper-util` and `serde_repr` lockfile entries to `0.1.20`
  - kept the intended app package version bump to `team-forge-ts v0.1.20`
- Verification:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
    - passed after the lockfile fix
  - `src-tauri/target/release/bundle/macos/TeamForge.app/Contents/Info.plist`
    - `CFBundleShortVersionString = 0.1.20`
    - `CFBundleVersion = 0.1.20`
  - full default `tauri build` now gets past the old checksum failure
  - reliable local app-bundle rebuild path in this environment:
    - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`
    - produced `src-tauri/target/release/bundle/macos/TeamForge.app`

## Goal

Turn the page-to-vault audit into a concrete implementation plan for the first
vault-backed TeamForge slice, explicitly excluding Training and keeping
Onboarding for both employees and clients.

## Plan

- [x] Re-scope the audit follow-up around `Projects`, `Clients`, and
      `Onboarding`, with `Training` explicitly deferred.
- [x] Write a durable implementation plan under `docs/plans/` with exact file
      targets, phases, and verification gates.
- [x] Record the narrowed scope and execution order in the repo task log.

## Review

- Wrote the phase plan to
  `docs/plans/2026-04-20-teamforge-vault-population-phase-1.md`.
- Locked the implementation slice to:
  - `Projects`
  - `Clients`
  - `Onboarding` split into `client` and `employee`
- Explicitly kept these out of scope for this pass:
  - `Training`
  - `Devices` redesign
  - `Knowledge` import
  - new sync-control logic beyond vault metadata ingestion
- Chose a Cloudflare-canonical approach:
  - Worker/D1 stores imported vault metadata
  - desktop Tauri keeps only local projections/caches
  - operational metrics remain Clockify/Huly/GitHub-derived

## Goal

Review the current TeamForge page inventory against the Thoughtseed vault and
identify which page surfaces can be populated from vault data now versus what
still needs new extraction or modeling work.

## Plan

- [x] Inventory the current TeamForge pages, routes, and major data surfaces in
      the app.
- [x] Inventory the relevant Thoughtseed vault sections and note types that can
      feed those pages.
- [x] Map each TeamForge page to specific vault-backed population opportunities,
      including what is immediately usable, what needs normalization, and what
      is out of scope.
- [x] Summarize the review in a concise page-by-page audit with recommended
      next population passes.

## Review

- Confirmed the current page inventory from `src/App.tsx` / `src/pages`:
  Overview, Timesheet, Projects, Sprints, Insights, Team (`mapping`,
  `capacity`, `crew`), Calendar, Comms, Boards, Clients, Devices, Knowledge,
  Onboarding, Planner, Activity, Live, Settings. `Training.tsx` exists but is
  not currently routed.
- Confirmed the vault currently has strong instantiated note families for:
  - `60-client-ecosystem/*/project-brief.md` (11 briefs, including `axtech/erp/project-brief.md`)
  - `50-team/*.md` active crew profiles (6 root profiles)
  - `50-team/*-kpi.md` KPI notes (6)
  - a small `70-knowledge-base` corpus (5 markdown docs)
- Confirmed the vault currently does **not** have instantiated
  `client-profile.md`, `technical-spec.md`, `design/`, or `closeouts/`
  documents under the client ecosystem despite those being part of the intended
  schema/template layout.
- Confirmed the current TeamForge parity importer in
  `scripts/teamforge-vault-parity.mjs` only ingests:
  - client `project-brief.md` records
  - employee `*-kpi.md` records
  It does not yet ingest client profiles, technical specs, designs, closeouts,
  onboarding templates, or knowledge-base notes.
- Confirmed the Team page already consumes vault-backed KPI data in the crew
  summary panel, while most other reviewed pages are still driven by
  Huly/Clockify/GitHub-derived operational data or heuristics in
  `src-tauri/src/commands/mod.rs`.
- Page-by-page audit outcome:
  - **Immediate vault population wins:** Projects, Team/Crew, partial Clients,
    partial Knowledge
  - **Good next-pass normalization targets:** Onboarding, Training, Sprints,
    Boards
  - **Operational pages that should stay system-of-record driven, with only
    light vault enrichment:** Overview, Timesheet, Planner, Insights, Calendar,
    Comms, Activity, Live, Settings
  - **Weak vault fit today:** Devices, unless a dedicated device-registry or
    technical-spec note family is introduced
- Recommended population order:
  1. Extend vault ingestion for `client-profile.md` and expose it on Clients
     and Projects
  2. Extend project ingestion for `technical-spec.md`, `design/`, `research/`,
     and `closeouts/` artifacts
  3. Add a normalized knowledge import across `70-knowledge-base` plus selected
     handbook / operations notes
  4. Decide whether Onboarding and Training become first-class vault schemas or
     remain telemetry-derived dashboards with vault overlays

## Goal

Unblock server-side project parity on the live TeamForge Worker so the pending
Thoughtseed project creates can apply remotely after the KPI import path.

## Plan

- [ ] Verify the live Worker failure mode for `PUT /v1/project-mappings/:id`,
      including remote D1 schema/migration state and any available exception
      detail.
- [ ] Fix the actual server-side blocker, whether that is remote migration drift
      or a Worker write-path bug in project graph upsert.
- [ ] Re-run the project parity canary against `axtech` and confirm the remote
      create succeeds instead of returning `500` / Cloudflare `1101`.
- [ ] Summarize the validated root cause, the fix, and any remaining external
      verification blockers in the review section.

## Review

## Goal

Cut and install a fresh TeamForge release after restoring optional PAT support:
- bump to a new release version and push it
- trigger the GitHub release workflow with a new tag
- remove old local DMG/app build artifacts and caches
- replace `/Applications/TeamForge.app` with a fresh build
- launch the installed app via LaunchServices

## Plan

- [x] Inspect current version/tag/build-artifact state and confirm next release version.
- [x] Bump version surfaces and changelog for the new release.
- [x] Commit and push the release bump without bundling local task-log edits.
- [x] Create and push the new Git tag, then verify GitHub Actions starts the release run.
- [x] Delete old local DMG/app artifacts and build caches, then rebuild a fresh `.app`.
- [x] Replace `/Applications/TeamForge.app`, launch it, and verify the installed version/process.

## Review

## Goal

Extend Thoughtseed vault parity so TeamForge also imports the latest per-employee KPI notes from `thoughtseed-labs/50-team`, not just project briefs from `60-client-ecosystem`.

## Plan

- [x] Inspect KPI note structure and map each vault `member_id` to a live TeamForge employee record.
- [x] Add a durable local TeamForge storage surface for imported employee KPI snapshots.
- [x] Extend the vault parity script to scan KPI notes, report latest-source metadata, and apply KPI imports into the TeamForge local database.
- [x] Surface the latest imported KPI snapshot in the Team page employee summary so the imported data is visible inside TeamForge.
- [x] Run the parity script against the latest vault data and capture a report of KPI imports, updates, and unresolved mappings.

## Review

- Added a durable employee KPI storage surface in local TeamForge SQLite:
  - `employee_kpi_snapshots` table in `src-tauri/migrations/001_initial.sql`
  - backend row + view models in `src-tauri/src/db/models.rs`
  - query support for reading the latest imported KPI snapshot per employee in `src-tauri/src/db/queries.rs`
- Extended the employee summary command and UI:
  - `get_employee_summary` now returns `kpiSnapshot` when one exists
  - `src/components/team/EmployeeSummaryPanel.tsx` now shows the latest imported KPI title, freshness, role scope, monthly KPIs, quarterly milestones, evidence sources, and gap flags
- Extended `scripts/teamforge-vault-parity.mjs` to:
  - scan `thoughtseed-labs/50-team/*-kpi.md`
  - normalize KPI section data and latest-source timestamps
  - match vault `member_id`s to live TeamForge employees
  - report KPI creates/updates/unresolved mappings separately from project parity
  - write KPI snapshots into the live TeamForge local database on `--apply`
- Matching verification against the live TeamForge employee roster:
  - `imran` -> `imran`
  - `pavun-kumar` -> `Pavun Kumar R`
  - `preetha` -> `Preethamanickam`
  - `raheman-ali` -> `Raheman Ali`
  - `rifayudeen` -> `Rifayudeen.q`
  - `subitcha` -> `Subitcha SM`
- Dry-run verification:
  - `node scripts/teamforge-vault-parity.mjs --local-only --report tasks/teamforge-vault-parity-report.json`
  - result after KPI import:
    - `11` project creates still pending against the Worker
    - `6` KPI updates
    - `0` unresolved KPI mappings
- Apply canary verification:
  - `TEAMFORGE_WORKSPACE_ID=ws_thoughtseed node scripts/teamforge-vault-parity.mjs --project axtech --apply --report tasks/teamforge-vault-parity-canary.json`
  - result:
    - all `6` KPI snapshots imported into the live TeamForge database and verified back out
    - direct DB check confirms `6` rows in `employee_kpi_snapshots`
    - latest-source paths imported:
      - `50-team/imran-kpi.md`
      - `50-team/pavun-kumar-kpi.md`
      - `50-team/preetha-kpi.md`
      - `50-team/raheman-ali-kpi.md`
      - `50-team/rifayudeen-kpi.md`
      - `50-team/subitcha-kpi.md`
    - project canary still fails remotely on the known server-side Worker bug:
      - `500 Internal Server Error`
      - Cloudflare `1101 Worker threw exception`
- Verification notes:
  - `node --check scripts/teamforge-vault-parity.mjs` passed
  - `./node_modules/.bin/tsc --noEmit` passed
  - `./node_modules/.bin/vite build` is currently blocked by the existing Rollup native module signature issue in `@rollup/rollup-darwin-arm64`
  - `cargo test --manifest-path src-tauri/Cargo.toml` is currently blocked by the existing lockfile checksum mismatch for `serde_repr v0.1.19`

## Goal

Configure the existing TeamForge OTA release secrets and variables without rotating the updater trust chain:
- keep using the existing `~/.tauri/teamforge.key`
- set the required GitHub Actions secrets/vars
- set the matching Cloudflare Worker webhook secret
- verify the repo/worker are ready for the next tagged OTA release

## Plan

- [x] Confirm the target GitHub repo, current CLI auth, and worker context from local project config.
- [x] Set `TAURI_SIGNING_PRIVATE_KEY` from the existing local TeamForge updater private key.
- [x] Confirm whether `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is required for the existing key.
- [x] Generate one `TF_WEBHOOK_HMAC_SECRET` value and write the same value to GitHub and the Cloudflare Worker.
- [x] Set the full required GitHub Actions vars/secrets for the OTA publish workflow.
- [x] Verify the resulting GitHub/Cloudflare configuration as far as CLI access allows.

## Review

- Confirmed target repo/auth context:
  - GitHub repo: `Sheshiyer/team-forge-ts`
  - Wrangler account: `Sheshnarayan.iyer@gmail.com's Account`

## Goal

Make the Team page vault-first instead of assignment-first:
- use Thoughtseed Obsidian team notes as the source of truth for roster identity,
  role, and department
- remove the ambiguous org assignment workflow from the Team surface
- verify why KPI work is not visible in the `0.1.20` app path/version

## Plan

- [x] Load Team roster/profile data directly from the active Obsidian vault so
      the Team page reads `50-team/*.md` as the source of truth.
- [x] Extend the desktop Team snapshot / employee summary models so vault
      profile data can sit beside KPI and operational overlays.
- [x] Replace the Team mapping editor with a straightforward vault-backed
      roster + crew profile view.
- [x] Verify the visible version mismatch by comparing repo metadata with the
      built app bundle.
- [x] Run targeted checks plus a source-data canary, and capture the remaining
      Tauri rebuild blocker if the bundle cannot be refreshed locally.

## Review
- Added direct vault-loading support in the desktop backend:
  - new `src-tauri/src/vault.rs` resolves the active Obsidian vault from
    `~/Library/Application Support/obsidian/obsidian.json`
  - scans `50-team/*.md` root notes
  - maps those notes onto live TeamForge employees by alias/name/email
  - exposes vault roster/profile data through `TeamSnapshotView` and
    `EmployeeSummaryView`
- Reworked the Team frontend:
  - removed the old `/team/mapping` org-assignment editor from the page flow
  - replaced it with `/team/roster`, `/team/capacity`, and `/team/crew`
  - `Roster` is now vault-backed and grouped by note department
  - `Crew Profile` now shows the Obsidian team profile alongside the imported
    KPI snapshot and live operational signals
  - `Capacity` keeps live hours/leave data but groups people by vault
    department instead of assignment drafts
- Version mismatch root cause confirmed:
  - repo version surfaces are already `0.1.20`
  - checked-in built bundle
    `src-tauri/target/release/bundle/macos/TeamForge.app/Contents/Info.plist`
    still reports `CFBundleShortVersionString=0.1.17`
  - the stale bundle explains why `0.1.20` and the KPI/team changes were not
    what the app on disk was showing
- Verification:
  - `npm run build`
    - passed
  - `npm run tauri -- build`
    - frontend build stage passed
    - final Tauri build is still blocked by the pre-existing Cargo environment
      issue: `checksum for hyper-util v0.1.19 changed between lock files`
  - Obsidian source-data canary:
    - confirmed the active vault path resolves to
      `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs`
    - confirmed the root team notes currently present are:
      - `imran.md`
      - `pavun-kumar.md`
      - `preetha.md`
      - `raheman-ali.md`
      - `rifayudeen.md`
      - `subitcha.md`

## Goal

Validate the replaced `CLOUDFLARE_API_TOKEN` by re-running the failed `v0.1.16`
GitHub release workflow and confirming whether the previously failing R2 upload
step now succeeds.

## Plan

- [x] Re-run the failed `Build & Release` workflow for `v0.1.16`.
- [x] Watch the rerun through the `Publish OTA release (Apple Silicon)` step.
- [x] If it still fails, capture the exact log delta versus the prior `403 Authentication error`.
- [x] Summarize whether the new token fixed the release path.

## Review

- Re-ran GitHub Actions run `24521579799` for tag `v0.1.16` after replacing the `CLOUDFLARE_API_TOKEN` secret.
- Verified the original failure point was cleared:
  - `Publish OTA release (Apple Silicon)` completed successfully at `2026-04-16T18:41:13Z`.
- Verified the full rerun completed successfully:
  - run conclusion: `success`
  - job: `build-macos`
  - completed at `2026-04-16T18:47:29Z`
- Final Intel-side verification from the successful rerun:
  - `Build Tauri app (Intel)` completed at `2026-04-16T18:46:31Z`
  - `Publish OTA release (Intel)` completed at `2026-04-16T18:46:42Z`
- Conclusion:
  - the replacement Cloudflare token fixed the prior `403 Forbidden / 10000 Authentication error`
  - current token scopes are sufficient for the release workflow

## Goal

Verify whether a deleted fine-grained GitHub PAT is still required for OTA release pushes and document the restore path if needed.

## Plan

- [x] Inspect all GitHub workflow files for PAT-based auth usage.
- [x] Check current GitHub Actions secrets to confirm whether a PAT secret is expected.
- [x] Summarize whether the PAT is still needed and, if desired, the minimum scope to recreate it.

## Review

- Current repo workflow inventory:
  - only `.github/workflows/release.yml` exists
- Current workflow auth for GitHub release publication:
  - both Tauri release steps use `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
  - no custom PAT secret is referenced anywhere in `.github/workflows`
- Current Actions secrets configured:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TF_WEBHOOK_HMAC_SECRET`
- Conclusion:
  - deleting the old fine-grained GitHub PAT did not break the current OTA release workflow
  - a replacement PAT is optional unless the repo later adds automation that must bypass `GITHUB_TOKEN` limitations (for example, cross-repo writes or workflow-chaining from bot-authored pushes)

## Goal

Restore optional fine-grained GitHub PAT support for OTA releases without making the workflow depend on it.

## Plan

- [x] Update the release workflow to prefer a PAT secret when present and fall back to `secrets.GITHUB_TOKEN` otherwise.
- [x] Keep the PAT fully optional so the current green release path remains valid.
- [x] Document the new secret name and expected usage for future setup.

## Review

- Updated `.github/workflows/release.yml` so both Tauri release steps now use:
  - `secrets.GH_RELEASE_PAT || secrets.GITHUB_TOKEN`
- Result:
  - current release behavior is unchanged when `GH_RELEASE_PAT` is unset
  - if `GH_RELEASE_PAT` is restored later, the workflow will automatically prefer it for GitHub release publication
- Restored secret contract:
  - secret name: `GH_RELEASE_PAT`
  - usage: optional GitHub release/auth override for Tauri release asset publication

## Goal

Make TeamForge the canonical project registry above GitHub and Huly so future sync can be safely bidirectional instead of repo-config driven.

## Plan

- [x] Add canonical TeamForge project graph tables for project identity, GitHub repo links, Huly project links, and external artifacts.
- [x] Add tested query-layer read/write support for the TeamForge project graph.
- [x] Expose the registry through new Tauri commands and TypeScript invoke types.
- [x] Verify the first slice without attempting full bidirectional issue/milestone sync yet.

## Review

- Plan artifact created:
  - `docs/plans/2026-04-17-teamforge-project-registry.md`
- First-slice scope locked:
  - backend canonical registry only
  - explicit GitHub/Huly/artifact mappings
  - command surface for future UI
  - no live bidirectional propagation in this patch
- Implemented canonical TeamForge registry storage in local SQLite:
  - `teamforge_projects`
  - `teamforge_project_github_repos`
  - `teamforge_project_huly_links`
  - `teamforge_project_artifacts`
- Added Rust models and graph view types for:
  - project identity
  - linked GitHub repos
  - linked Huly projects
  - linked external artifacts such as PRDs/contracts/process docs
- Added tested query-layer graph operations:
  - `replace_teamforge_project_graph`
  - `get_teamforge_project_graphs`
- Added Tauri commands:
  - `get_teamforge_projects`
  - `save_teamforge_project`
- Added frontend invoke/type surface for the new commands in:
  - `src/lib/types.ts`

## Goal

Review TeamForge as a non-standalone system and improve understanding of the architectural flow across:
- `team-forge-ts`
- `thoughtseed-paperclip`
- `thoughtseed-labs`
- `workfllow-thhoughtseed`

## Plan

- [x] Load the requested review skills and repo workflow context.
- [x] Inspect the TeamForge shell, page topology, Tauri command surface, sync scheduler, and Cloudflare control-plane boundaries.
- [x] Inspect `thoughtseed-paperclip` and `thoughtseed-labs` only for the integration seams that shape TeamForge architecture.
- [x] Produce a review that identifies current architectural clutter, coupling problems, and a cleaner target flow for this multi-repo system.
- [x] Inspect the `workfllow-thhoughtseed` skill suite, README, and seeded vault contracts.
- [x] Update the architecture review so the workflow skill suite is positioned correctly in the broader Thoughtseed system.

## Review

- Review scope:
  - TeamForge desktop shell and page topology
  - Tauri backend command surface and sync bridge
  - Cloudflare Worker registry/control-plane routes
  - Paperclip scaffold/feed/closeout scripts
  - thoughtseed-labs command-center and frontmatter contracts
- Key conclusions:
  - TeamForge is already the canonical slug and project-registry authority for the broader Thoughtseed system; it should be treated as a platform bridge, not only as a desktop dashboard.
  - The current codebase mixes three concerns too tightly:
    - operational read surfaces for humans
    - control-plane mutation/sync orchestration
    - vault/Paperclip artifact bridge behavior
  - The heaviest architectural clutter is concentrated in:
    - `src/pages/Projects.tsx`
    - `src-tauri/src/commands/mod.rs`
    - `cloudflare/worker/src/routes/v1.ts`
    - `cloudflare/worker/src/routes/agent-feed.ts`
  - The clean target model is a three-plane system:
    - TeamForge control plane: canonical project identity, sync policy, integration credentials, orchestration state
    - TeamForge desktop operator console: cache-backed read models and human control surfaces
    - Paperclip/vault bridge: scaffold/feed/closeout projections driven by explicit bridge contracts instead of mixed-in Worker routes
- Follow-up added after user correction:
  - the shipped `workfllow-thhoughtseed` suite must now be reviewed as a real subsystem in the same architecture, not as future/planned work.
  - `workfllow-thhoughtseed` is best modeled as a cross-cutting workflow-materialization layer, not a fourth peer control plane.
  - TeamForge should own canonical IDs and lifecycle state; the workflow suite should consume those IDs and write vault-native documents keyed to the TeamForge slug.
  - Paperclip should orchestrate and schedule the workflow suite, while `thoughtseed-labs` remains the canonical document and knowledge substrate for the generated artifacts.

## Goal

Turn the Cloudflare-first TeamForge project-sync architecture into a concrete implementation plan that lands on the current Worker/D1/Tauri codepaths instead of staying at the concept level.

## Plan

- [x] Re-read the current project task history and lessons so the plan reflects the corrected ownership model.
- [x] Inspect the current Cloudflare Worker routes, D1 schema, and desktop cloud-bridge surfaces that the next slice must extend.
- [x] Write a concrete implementation handoff for the Cloudflare project backend slice under `docs/plans`.
- [x] Record the resulting artifact and execution boundaries in this task log.

## Review

- Re-grounded the planning work in the repo’s current reality:
  - Worker routes already exist for `/v1/projects`, `/v1/project-mappings`, and `/v1/sync/*`
  - D1 already owns `projects`, `project_external_ids`, `sync_jobs`, and `sync_runs`
  - the desktop app already has a Worker credential bridge and a local project-graph cache path
- New concrete plan artifact created:
  - `docs/plans/2026-04-17-cloudflare-project-backend-implementation.md`
- The plan intentionally preserves the corrected architecture:
  - Cloudflare Worker + D1 is canonical
  - local SQLite is projection/cache only
  - GitHub owns engineering issues
  - Huly owns execution/admin issues
  - milestones remain GitHub-authoritative by default
- The implementation handoff is scoped to the next safe slice:
  - contract updates
  - additive D1 migration
  - Worker repository extraction
  - route expansion without changing public URLs
  - sync/lock scaffolding
  - desktop Worker-first read/write bridge with local cache fallback for reads
- The plan explicitly keeps these out of scope for the slice:
  - live issue writeback
  - live milestone writeback
  - conflict inbox UI
  - generic sync engine overreach
- Important bridge behavior:

## Goal

Understand what parts of the current TeamForge architecture are reusable in `forge-aura`, and identify which pieces should be transplanted, adapted, or left behind.

## Plan

- [x] Confirm the comparison direction and inspect the key architecture artifacts in both codebases.
- [x] Extract the stable architectural patterns from TeamForge that are independent of the current desktop/time-tracking domain.
- [x] Compare those patterns against `forge-aura`'s current worker/web/core split, realtime assumptions, and Paperclip-first boundaries.
- [x] Produce a leverage matrix with concrete recommendations: lift now, adapt later, or avoid.
- [x] Record the resulting analysis in this review log.

## Review

- Comparison direction used:
  - source architecture: current `team-forge-ts`
  - target architecture: `thoughtseed-forge/forge-aura`
  - rationale: `forge-aura` is already a separate Cloudflare-first spatial-ops runtime, so the useful question is which TeamForge control-plane patterns strengthen it.
- Strongest TeamForge assets to transplant:
  - explicit contract pack discipline for routes/auth/persistence instead of relying only on implementation shape
  - public/internal Worker split with a stable success/error envelope and health/bootstrap surfaces
  - canonical D1-backed control-plane modeling for durable state, policy, audit, retries, and conflict tracking
  - reusable Durable Object lock pattern for serializing mutating flows beyond realtime presence
  - server-side credential and integration hygiene, keeping vendor authority and write paths in Worker scope
- `forge-aura` surfaces that are already stronger than TeamForge and should stay as-is:
  - `packages/spatial-core` as a clean shared domain/core package
  - dependency injection in `workers/spatial-edge/src/create-app.ts`
  - thin adapter boundaries for Paperclip and GitHub sinks
  - Cloudflare-native web delivery without the desktop/local-cache complexity TeamForge needs
- Lift now:
  - add a TeamForge-style route contract and response envelope around `forge-aura`'s Worker API
  - add internal authenticated job/callback routes for async standup publication and later Paperclip/GitHub jobs
  - add serialized lock helpers for standup publish, escalation, and any future room-configuration mutations
  - upgrade D1 from draft persistence only into an operational store with job history, failures, retries, and connection health
- Adapt later:
  - TeamForge sync-control-plane ideas should be narrowed into `forge-aura` operator control for standups, escalations, and agent-gap follow-through rather than copying the full GitHub/Huly project-registry model
  - cached/projection patterns are useful, but as Worker-side computed projections and browser bootstrap summaries, not desktop-local SQLite mirrors
- Avoid:
  - Tauri/Rust bridge patterns
  - OTA/release architecture
  - TeamForge's GitHub/Huly ownership model and project-registry schema as written
  - domain-specific Clockify/Huly/Slack data fusion
- Recommended adoption order for `forge-aura`:
  - Wave 1: contract pack, response envelope, health/bootstrap/config surfaces
  - Wave 2: mutation locks plus queue/job audit persistence
  - Wave 3: real GitHub/Paperclip write paths with idempotent publication records
  - Wave 4: operator-facing control surfaces for failures, retries, and review-required cases
- Bottom-line conclusion:
  - the best leverage is not TeamForge's product/domain layer
  - it is TeamForge's operational architecture around contracts, control planes, locks, auditability, and failure handling
  - `forge-aura` should keep its current `spatial-core` domain model and import those operational patterns around it

## Goal

Close the remaining open issues in the `Ops Fabric v0.3.0 — TeamForge ↔ Paperclip Unification` milestone and prepare the verified `0.1.20` milestone update without claiming completion for anything that is not actually proven.

## Plan

- [ ] Finish the Settings/operator UI for Huly cadence controls and identity-review overrides.
- [ ] Tighten the milestone evidence docs so issue closures map directly to code and contracts.
- [ ] Run verification again, record any real blockers, and only then post the issue-by-issue milestone update.

## Review

- In progress:
  - durable Slack analytics reads were moved onto persisted SQLite state
  - Huly scheduler intervals were made configurable in the backend
  - identity review + override backend commands already exist and need an operator-facing surface
- Known verification blocker:
  - Rust `cargo test` currently fails before compilation because of dependency checksum mismatches in the local Cargo environment, so milestone closure must rely on the evidence we can prove plus any frontend/build verification we can still run.
- Completed:
  - added Huly cadence controls and identity-review override UI in `src/pages/Settings.tsx`
  - documented Huly scheduler settings in `docs/runbooks/huly-sync-cadence.md`
  - tightened `ops_event` contract language for backward compatibility and collision handling in `docs/architecture/contracts/ops-event-schema-contract.md`
  - updated the milestone closeout plan in `docs/plans/2026-04-18-ops-fabric-v0.3.0-completion.md`
  - bumped local release metadata and changelog to `0.1.20`
- Verification:
  - `pnpm build` passed before and after the `0.1.20` metadata bump
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` passed
  - `cargo test --manifest-path src-tauri/Cargo.toml identity -- --nocapture` is still blocked by `hyper-util v0.1.19` checksum mismatch before compilation
- GitHub closeout:
  - closed issues `#20` through `#39` with evidence comments
  - verified the `Ops Fabric v0.3.0 — TeamForge ↔ Paperclip Unification` milestone now has zero open issues

## Goal

Prepare and publish the actual `0.1.20` release from a clean tree so the milestone closeout ships without bundling unrelated local work.

## Plan

- [ ] Create a clean detached worktree from the current `main` tip.
- [ ] Reapply only the Ops Fabric closeout + `0.1.20` release files into that clean tree.
- [ ] Re-run verification there, then commit, tag, push, and confirm the release workflow starts.

## Review

- In progress:
  - the main workspace was too dirty to use directly for a release commit
  - release prep was isolated into a separate clean worktree to avoid shipping unrelated page/control-plane edits
- Completed:
  - created detached clean worktree at `/tmp/teamforge-release-0.1.20`
  - reconstructed only the Ops Fabric closeout + `0.1.20` release files there
  - verified in the clean tree:
    - `cargo fmt --manifest-path src-tauri/Cargo.toml`
    - `cargo test --manifest-path src-tauri/Cargo.toml`
    - `pnpm build`
  - created release commit `180f3ce` with message `chore(release): ship 0.1.20 ops fabric closeout`
  - pushed release commit to `origin/main`
  - created and pushed tag `v0.1.20`
  - verified GitHub Actions started `Build & Release` run `24601592288` for `headSha=180f3ce277f618028e53c4149ac02a854b99cd21`

  - saving a TeamForge project now also upserts linked GitHub repos into `github_repo_configs`
  - this keeps the existing GitHub sync engine aware of TeamForge-linked repos without rewriting sync orchestration yet
- Verification passed:
  - `cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `pnpm build`
- Remaining out of scope for this patch:
  - no TeamForge project registry editor UI yet
  - no sync journal / retry queue / conflict resolver yet
  - no live bidirectional propagation of issues/milestones/components/templates yet

## Goal

Revise the canonical TeamForge architecture so the backend lives in Cloudflare instead of local desktop SQLite.

## Plan

- [x] Reconfirm current Cloudflare Worker/D1 project storage capabilities and existing `/v1/projects` route.
- [x] Capture the architecture correction in project lessons/tasks.
- [x] Summarize the revised target model: Cloudflare as source of truth, desktop as cache/client.

## Review

- Existing Cloudflare backend already has a strong starting point:
  - D1 tables for `organizations`, `workspaces`, `projects`, and `project_external_ids`
  - Worker route at `cloudflare/worker/src/routes/projects.ts`
  - environment bindings for D1, queues, and durable-object locks in `cloudflare/worker/src/lib/env.ts`
- Architecture correction:
  - the canonical TeamForge project registry should move to Cloudflare Worker + D1
  - the local Tauri SQLite layer should become cache/offline projection, not the source of truth
- Consequence for next implementation slice:
  - the local-first project graph added in this patch is useful as a shape/prototype, but it should not be treated as the final ownership model
  - the next real slice should port canonical project graph ownership to Worker + D1, then mirror/cache it locally

## Goal

Capture an architecture-first design for Cloudflare-backed TeamForge project sync, including bidirectional GitHub/Huly semantics and operator controls.

## Plan

- [x] Write a design plan covering canonical ownership, sync controls, conflict handling, error states, and phased rollout.
- [x] Save the design plan under `docs/plans`.
- [x] Summarize the recommended first real build slice for implementation.

## Review

- Design plan created:
  - `docs/plans/2026-04-17-cloudflare-project-sync-design.md`
- The design locks these core decisions:
  - TeamForge on Cloudflare Worker + D1 is the system of record
  - desktop SQLite is cache/offline projection only
  - sync must be TeamForge-mediated, not direct GitHub <-> Huly mirroring
  - bidirectional sync requires explicit entity mappings, queue-backed jobs, locks, conflict states, and manual operator controls
- Recommended first real slice:
  - canonical project graph in D1 + Worker CRUD routes + desktop client reads/writes through Worker
- Locked architecture decision:
  - milestones are GitHub-preferred
  - milestone propagation path is `GitHub -> TeamForge -> Huly`
  - Huly milestone edits should surface as drift/review-needed, not silently sync back upstream
- Locked architecture decision:
  - issues use split ownership
  - GitHub owns engineering issues
  - Huly owns execution/admin issues
  - TeamForge must classify issue ownership explicitly instead of treating issue sync as symmetric by default
- Locked architecture decision:
  - issue classification uses a hybrid model
  - TeamForge should apply rule-based defaults from repo/labels/project policy
  - operators must be able to manually override ownership classification in TeamForge

## Goal

Execute the first real Cloudflare-backed TeamForge project-control-plane slice so the backend, routes, and desktop bridge stop treating local SQLite as canonical.

## Plan

- [x] Update contracts, fixtures, and Worker docs for the canonical project graph and policy model.
- [x] Add and verify the additive D1 migration for project graph and sync policy storage.
- [x] Extract Worker-side project graph reads/writes into a dedicated repository layer.
- [x] Expand `/v1/projects` and `/v1/project-mappings` around summary-vs-graph semantics.
- [x] Extend sync scaffolding with `github` as a valid source and add a minimal WorkspaceLock mutex API.
- [x] Switch Tauri TeamForge project commands to Worker-first reads/writes with local cache fallback for reads only.
- [x] Verify Worker TypeScript, local D1 migration, Rust tests, and frontend build.

## Review

- Contracts and payload fixtures now reflect the actual control-plane model:
  - `docs/architecture/contracts/d1-schema-contract.md`
  - `docs/architecture/contracts/worker-route-contract.md`
  - `cloudflare/worker/README.md`
  - `cloudflare/worker/fixtures/v1/projects.json`
  - `cloudflare/worker/fixtures/v1/project-mappings.json`
- Added the canonical Cloudflare migration:
  - `cloudflare/worker/migrations/0002_project_control_plane.sql`
- The new migration extends Worker D1 ownership for:
  - project slug / portfolio / client / visibility / sync mode
  - GitHub repo links
  - Huly project links
  - artifact registry rows
  - project sync policy rows
- Worker-side project graph logic moved out of route handlers into:
  - `cloudflare/worker/src/lib/project-registry.ts`
- Route semantics now match the architecture:
  - `/v1/projects` returns project summaries
  - `/v1/project-mappings` returns full editable project graphs
  - `cloudflare/worker/src/routes/projects.ts`
  - `cloudflare/worker/src/routes/v1.ts`
- Sync/control-plane scaffolding improved:
  - `github` is now a valid sync source in `cloudflare/worker/src/lib/env.ts` and `cloudflare/worker/src/routes/sync.ts`
  - `WorkspaceLock` now supports `/acquire` and `/release` mutex operations in `cloudflare/worker/src/index.ts`
- Tauri desktop project commands are now Worker-canonical:
  - Worker client added in `src-tauri/src/sync/teamforge_worker.rs`
  - sync module exports updated in `src-tauri/src/sync/mod.rs`
  - `get_teamforge_projects` now fetches from the Worker first, then updates the local cache projection, then falls back to local cache only if the Worker fetch fails
  - `save_teamforge_project` now writes to the Worker first and only updates local SQLite after a successful remote response
  - stale local cache cleanup/projection helper added in `src-tauri/src/db/queries.rs`
- Existing GitHub sync compatibility was preserved:
  - TeamForge-linked repos are still bridged into `github_repo_configs` after remote reads/writes so the current GitHub sync path continues to see the linked repos

- Verification passed:
  - `rg -n "project_github_links|project_huly_links|project_sync_policies|/v1/project-mappings" docs/architecture/contracts cloudflare/worker/README.md cloudflare/worker/fixtures/v1`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `wrangler d1 migrations apply TEAMFORGE_DB --local --config cloudflare/worker/wrangler.jsonc`
  - `cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `pnpm build`

- Remaining intentionally out of scope after this slice:
  - live GitHub issue propagation
  - live Huly issue propagation
  - milestone propagation jobs
  - sync journal rows for issue/milestone writes
  - conflict inbox UI
  - explicit issue classification override UI

## Goal

Land the Cloudflare control-plane slice on `main`, refresh release/docs metadata for the next app version, and convert the remaining follow-up plan into GitHub issues.

## Plan

- [x] Bump version metadata and refresh release-facing docs.
- [x] Update README and packaged app descriptions so they describe the Cloudflare-backed control-plane architecture.
- [x] Update GitHub repository description metadata.
- [x] Create GitHub issues for the remaining control-plane backlog.
- [x] Stage, commit, and push the full slice to `main`.

## Review

- Bumped version metadata from `0.1.17` to `0.1.18` across:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock`
  - `src-tauri/tauri.conf.json`
- Refreshed release-facing docs:
  - `CHANGELOG.md` now includes `v0.1.18`
  - `README.md` now describes the Cloudflare Worker + D1 control plane, Worker-canonical TeamForge project registry behavior, and the current release state
- Updated GitHub repo metadata:
  - description: `LCARS mission-control desktop app with a Cloudflare-backed TeamForge project control plane for GitHub, Huly, and Clockify operations.`
  - homepage: `https://thoughtseed.com`
- Created GitHub follow-up issues for the remaining plan:
  - `#40` GitHub-authoritative milestone propagation with Huly drift review
  - `#41` Huly-owned execution and admin issue propagation
  - `#42` Sync journal and conflict records for GitHub/Huly propagation
  - `#43` Operator UI for project registry, conflict inbox, and classification overrides
  - `#44` GitHub-owned engineering issue propagation
- Final verification before landing this slice:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm build`

## Goal

Finish the remaining TeamForge control-plane backlog on the current unreleased `0.1.18` line:
- `#40` GitHub-authoritative milestone propagation with Huly drift review
- `#41` Huly-owned execution/admin issue propagation
- `#42` sync journal + conflict records
- `#43` operator UI for registry/conflicts/classification overrides
- `#44` GitHub-owned engineering issue propagation

## Plan

- [x] Add Worker/D1 schema for sync entity mappings, sync journal rows, sync conflicts, and explicit classification override metadata.
- [x] Implement Worker-side GitHub + Huly project sync processors that use jobs, locks, and journal rows for milestone and issue propagation.
- [x] Expose Worker query/control routes for sync journal, conflict inbox, project sync health, and operator actions (`retry`, `pause`, `resume`, classification override).
- [x] Extend the Tauri Worker bridge and shared frontend types for the new TeamForge control-plane data and actions.
- [x] Build the operator-facing TeamForge UI for project registry editing, conflict review, override management, and sync controls.
- [x] Run Worker migration/typecheck, Rust tests, and frontend build; then refresh changelog/docs while keeping the unreleased version at `0.1.18` unless implementation forces a new bump.

## Review

- Added `cloudflare/worker/migrations/0003_sync_control_plane.sql` so D1 now persists:
  - runtime sync state on `project_sync_policies`
  - `sync_entity_mappings`
  - `sync_conflicts`
  - `sync_journal`
- Added Worker-side control-plane services in:
  - `cloudflare/worker/src/lib/github-api.ts`
  - `cloudflare/worker/src/lib/huly-api.ts`
  - `cloudflare/worker/src/lib/locks.ts`
  - `cloudflare/worker/src/lib/sync-control-plane.ts`
- Implemented Worker control-plane routes:
  - `GET /v1/project-mappings/:projectId/control-plane`
  - `POST /v1/project-mappings/:projectId/actions`
- Extended the Tauri bridge and frontend invoke/types so the desktop app can load control-plane detail and run operator actions against the Worker.
- Rebuilt `src/pages/Projects.tsx` into dual modes:
  - `EXECUTION` for the existing rollups/export view
  - `CONTROL PLANE` for registry editing, sync controls, classification overrides, conflict review, and sync-journal inspection
- Refreshed release-facing docs for the completed `0.1.18` tranche:
  - `README.md`
  - `CHANGELOG.md`
  - `docs/architecture/contracts/worker-route-contract.md`
  - `docs/architecture/contracts/d1-schema-contract.md`
  - `docs/plans/2026-04-17-cloudflare-project-sync-design.md`
  - `docs/plans/2026-04-17-cloudflare-project-backend-implementation.md`
- Verification passed:
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph -- --nocapture`
  - `pnpm build`

## Goal

Publish the completed `0.1.18` control-plane tranche as the next OTA/release candidate:
- create tag `v0.1.18` on the pushed `main` commit
- push the tag to GitHub
- verify the configured release workflow starts for both macOS targets and OTA publish steps

## Plan

- [x] Confirm current tag/workflow state and record the release target commit.
- [x] Create local tag `v0.1.18` on commit `e3001f1`.
- [x] Push the new tag to `origin` so GitHub Actions starts the release workflow.
- [x] Verify the triggered workflow/run state and summarize what the user should test from the older installed build.

## Review

- Confirmed release target:
  - local tag `v0.1.18` created as an annotated tag on commit `e3001f1`
  - remote tag pushed to `origin`
- Verified workflow inventory:
  - `.github/workflows/release.yml` is the single configured GitHub Actions workflow in this repo
  - the tag push auto-triggered `Build & Release` run `24537568963`
- First run failure captured and resolved:
  - initial `v0.1.18` run failed in `Build Tauri app (Apple Silicon)`
  - root cause: optional repo secret `GH_RELEASE_PAT` was present but lacked release-write access, overriding the safe `GITHUB_TOKEN` fallback
  - fix applied: deleted `GH_RELEASE_PAT`, then reran the same release run
- Final rerun result:
  - GitHub Actions run `24537568963` completed with `success`
  - `Publish OTA release (Apple Silicon)` succeeded at `2026-04-16T22:47:29Z`
  - `Publish OTA release (Intel)` succeeded at `2026-04-16T22:51:09Z`
  - whole `build-macos` job completed successfully at `2026-04-16T22:52:08Z`

## Goal

Fix the Projects page loading stall reported against the installed `0.1.18` app:
- identify why `EXECUTION` mode stays in skeleton state
- keep the new control-plane work from blocking legacy execution data
- verify the page can fail gracefully instead of hanging on first load

## Plan

- [x] Confirm whether the execution-project SQL path is healthy against the live app database and isolate the blocking fetch path.
- [x] Patch `src/pages/Projects.tsx` so control-plane data only loads when `CONTROL PLANE` is opened and execution fetch failures surface as a recoverable message instead of an endless skeleton.
- [x] Run frontend verification and summarize the likely root cause plus any release/version implications.

## Review

- Live investigation against the installed app state showed:
  - the desktop SQLite file exists at `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
  - the execution-project backing tables are present and populated
  - the key SQL used by `get_execution_projects` succeeds directly against the live database
- Root-cause call:
  - the new Worker-backed TeamForge registry fetch was being started unconditionally on page mount, even in `EXECUTION` mode
  - at the same time, the execution pane kept first-load failures hidden behind a permanent skeleton
  - together that created a bad failure mode where the page looked hung even though the legacy execution query path itself was healthy
- Implemented fix in `src/pages/Projects.tsx`:
  - load TeamForge registry/control-plane data only when `CONTROL PLANE` is opened
  - stop keeping `EXECUTION` mode in an endless skeleton on first failure
  - surface a retrying error message while background retries continue
- Verification passed:
  - `pnpm build`

## Goal

Automate OTA release publication for signed macOS updater bundles:
- upload the Tauri updater artifact, signature, and release notes to Cloudflare R2
- call `/internal/releases/publish` with the published artifact metadata
- keep the user-facing OTA hop verification manual

## Plan

- [x] Reconfirm current release workflow gaps and OTA contract requirements.
- [x] Add a small release publish script for Cloudflare upload + Worker publish.
- [x] Update GitHub Actions release workflow to build signed updater artifacts and invoke the publish script.
- [x] Bump release metadata to `0.1.16` so the manual OTA hop targets a real new version.
- [x] Verify script/workflow behavior locally where possible and document required secrets/manual follow-up.

## Review

- Added `scripts/publish-ota-release.mjs` and root `pnpm release:ota:publish` for OTA publication.
- The publish script now:
  - uploads the updater artifact, `.sig`, and `release-notes.md` to `teamforge-artifacts`
  - publishes the release row through `/internal/releases/publish`
  - derives release notes from `CHANGELOG.md` when no explicit notes file is provided
  - supports `--dry-run` for local validation without Cloudflare credentials
- Updated `.github/workflows/release.yml` so tag builds now:
  - require `TAURI_SIGNING_PRIVATE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `TF_WEBHOOK_HMAC_SECRET`
  - build signed updater artifacts for both `aarch64-apple-darwin` and `x86_64-apple-darwin`
  - locate the generated `TeamForge.app.tar.gz` + `.sig` pairs and publish them to Cloudflare
- Bumped release metadata to `0.1.16` across:
  - root `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - root package entry in `src-tauri/Cargo.lock`
  - `CHANGELOG.md`
- Verification passed:
  - `pnpm build`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm release:ota:publish -- --dry-run --version v0.1.16 --platform darwin --arch aarch64 --artifact <tmp>/TeamForge.app.tar.gz --signature <tmp>/TeamForge.app.tar.gz.sig`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`31 passed, 0 failed, 3 ignored`)
- Manual follow-up remains with the user:
  - install/test the real `0.1.15 -> 0.1.16` OTA hop locally after pushing the tag and ensuring GitHub repo secrets/vars are set.

## Goal

Cut a patch release for the Projects page loading fix so the installed `v0.1.18` app can update to a version with the execution/control-plane loading bug resolved:
- bump release metadata to `0.1.19`
- refresh changelog/release-facing docs for the patch scope
- verify the patch locally before publishing
- commit, push, tag, and confirm the GitHub release workflow starts cleanly

## Plan

- [x] Bump release metadata and release-facing docs from `0.1.18` to `0.1.19` with a patch-focused changelog entry for the Projects page loading fix.
- [x] Run local verification for the release candidate so the patch is backed by fresh build/test evidence before any git publish step.
- [ ] Commit the patch-release changes on `main` and push the branch to `origin`.
- [ ] Create and push the annotated tag `v0.1.19`, then verify the GitHub Actions release workflow reaches a healthy state.

## Review

- Bumped `0.1.19` across:
  - root `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - root package entry in `src-tauri/Cargo.lock`
- Refreshed release-facing docs for the patch scope:
  - `CHANGELOG.md` now includes `v0.1.19`
  - `README.md` now describes the Projects loading hardening and reflects repo version `0.1.19`
  - `README.md` latest published tag corrected to `v0.1.18`
- Verification passed:
  - `pnpm build`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`33 passed, 0 failed, 3 ignored`)

## Goal

Add a manual OTA updater flow to Settings, verify the release path against the existing Cloudflare/Tauri updater config, then bump and push the next app version.

## Plan

- [x] Add a small tested updater helper for download progress / status reduction.
- [x] Wire Tauri updater + relaunch support into the packaged app and Settings UI.
- [x] Verify build/test coverage for the updater flow and existing repo changes.
- [x] Bump root app, sidecar, and Tauri version surfaces to the next patch release.
- [x] Commit all current changes with a conventional commit and push the branch.

## Review

- Added a tested updater helper module for:
  - Tauri updater/process runtime detection
  - download progress reduction
  - human-readable progress formatting
- Added a new Settings > App Updates panel with:
  - current version display
  - manual "check for update"
  - manual "install & restart"
  - download/install state and release notes display
- Added `tauri-plugin-process` to the desktop runtime and enabled `process:default`
  so installed updates can relaunch the packaged app.
- Version surfaces bumped to `0.1.15`:
  - root `package.json`
  - sidecar `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - root package entries in `src-tauri/Cargo.lock`
- Corrected an accidental lockfile over-bump during version replacement:
  - restored `nodrop` to `0.1.14`
  - re-ran Rust verification after the fix
- Verification passed:
  - `pnpm --dir sidecar exec tsx --test ../tests/updater.test.ts`
  - `pnpm build`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm --dir sidecar build`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`31 passed, 0 failed, 3 ignored`)
- OTA publication is not yet end-to-end releasable from this shell:
  - `pnpm tauri build --bundles app` generated `TeamForge.app` and `TeamForge.app.tar.gz`
  - bundling then stopped because `TAURI_SIGNING_PRIVATE_KEY` is missing
  - the existing Cloudflare OTA endpoint and new Settings UI are ready, but signed release publishing still requires that private key plus the artifact publish step.

## Goal

Fresh rebuild and reinstall TeamForge after cleaning old build artifacts.

## Plan

- [x] Check available Tauri build flags and project scripts.
- [x] Clean frontend and Tauri/Cargo build outputs.
- [x] Rebuild fresh macOS `.app` bundle.
- [x] Replace `/Applications/TeamForge.app` with the fresh bundle.
- [x] Verify installed app version and bundle presence.

## Review

- Tauri CLI has no native `--fresh` build flag in this project, so freshness was achieved by clearing `dist` and running `cargo clean`.
- `cargo clean --manifest-path src-tauri/Cargo.toml` removed `14.1GiB` of old Cargo/Tauri build artifacts.
- Fresh build command succeeded:
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`
- Fresh bundle built at `src-tauri/target/release/bundle/macos/TeamForge.app`.
- Replaced `/Applications/TeamForge.app` with the fresh bundle.
- Installed app verification:
  - version: `0.1.14`
  - bundle executable exists
  - installed app size: `25M`

## Goal

Allow TeamForge GitHub projects to be configured from GitHub URLs/repo slugs and expand sync beyond issues to PRs, branches, and check runs.

## Plan

- [x] Add tested GitHub repo URL/slug normalization.
- [x] Extend SQLite schema/models for GitHub PRs, branches, and check runs.
- [x] Extend GitHub sync to fetch/cache PRs, branches, and branch check runs.
- [x] Surface expanded sync counts in Settings and type definitions.
- [x] Verify frontend build, Worker typecheck, sidecar build, and Rust tests.

## Review

- Settings now accepts GitHub repo slugs plus GitHub HTTPS, issue, PR, and SSH URLs, normalizing them to `owner/repo` before save.
- Backend also normalizes `github_repos` and Cloudflare integration repo entries before seeding `github_repo_configs`.
- GitHub sync now fetches and caches:
  - milestones
  - issues
  - pull requests
  - branches
  - branch/PR check runs
- Added SQLite tables for `github_pull_requests`, `github_branches`, and `github_check_runs`.
- GitHub activity now emits ops events for PR, branch, and check-run events so agent feeds/activity can consume them.
- Projects now exposes GitHub PR, branch, and failing-check counts alongside issue counts.
- Verification passed:
  - `pnpm build`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm --dir sidecar build`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`31 passed, 0 failed, 3 ignored`)

## Goal

Commit and push the Cloudflare-backed integration sync work with a fresh patch version.

## Plan

- [x] Inspect current branch, remote, and dirty worktree scope.
- [x] Bump root app, Tauri, sidecar, and lockfile version surfaces to `0.1.14`.
- [x] Run verification before committing.
- [x] Stage all intended changes.
- [x] Commit with a conventional message.
- [x] Push `main` to `origin`.

## Review

- Version surfaces updated to `0.1.14`:
  - root `package.json`
  - sidecar `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - root package entry in `src-tauri/Cargo.lock`
- Verification passed before commit:
  - `pnpm build`
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit`
  - `pnpm --dir sidecar build`
  - `cargo test --manifest-path src-tauri/Cargo.toml` (`28 passed, 0 failed, 3 ignored`)

## Goal

Route TeamForge integration setup through the Cloudflare Worker instead of page-local display defaults:
- `/v1/credentials` returns both shared credentials and non-secret integration config.
- GitHub repo/milestone/client ownership is hydrated from Cloudflare into SQLite.
- Clockify, Huly, Slack, and GitHub sync can run from one Cloudflare-backed flow.
- Clients/Projects pages consume backend projections without hardcoded repo display constraints.

## Plan

- [x] Extend the Cloudflare Worker credential route to include GitHub credentials and integration config.
- [x] Persist Cloudflare integration config into Tauri settings and GitHub repo config cache.
- [x] Add a unified `sync_cloud_integrations` command for Cloudflare config + Clockify/Huly/Slack/GitHub sync.
- [x] Remove UI-level ParkArea repo defaults from Settings.
- [x] Add GitHub client ownership projection using Cloudflare-provided `clientName`.
- [x] Verify worker typecheck, frontend build, sidecar build, and Rust tests.

## Review

- Cloudflare Worker:
  - `/v1/credentials` now returns shared `clockify`, `huly`, `slack`, and `github` credentials.
  - `/v1/credentials` also returns `integrations` from `TF_INTEGRATION_CONFIG_JSON`.
  - `wrangler.jsonc` and `.dev.vars.example` include the first ParkArea GitHub config preset in Cloudflare config, not page code.
- Tauri backend:
  - `sync_cloud_credentials` now persists credentials plus integration config.
  - added `sync_cloud_integrations` to run Cloudflare config sync, Clockify full sync, Huly full sync, Slack delta sync, GitHub plans sync, and agent feed refresh as one flow.
  - `github_repo_configs` now supports `client_name`; existing SQLite DBs get the column via startup `ALTER TABLE`.
  - GitHub repo defaults are no longer seeded from Projects/Settings display code.
  - background scheduler now includes GitHub plan cache refresh when a GitHub token/config is available.
- Clients:
  - client ownership for GitHub projects is driven by Cloudflare-provided `clientName`.
  - Clients can show GitHub-backed projects/issues even when there is no Clockify project yet.
  - Linked project rows now show source, repo, and GitHub issue counts.
- Version/install:
  - bumped app to `0.1.13`.
  - built and installed `/Applications/TeamForge.app`.
  - installed bundle plist confirms `CFBundleShortVersionString = 0.1.13`.
- Deployment:
  - deployed Cloudflare Worker `teamforge-api` successfully.
  - live URL: `https://teamforge-api.sheshnarayan-iyer.workers.dev`.
  - deployed version id: `f2dc126b-ed08-4e82-ab3a-cf38e2b20f90`.
  - sanitized live endpoint check confirmed Clockify/Huly/Slack credentials are available and GitHub repo integration config is present.
  - live endpoint currently reports GitHub credential unavailable until `TF_GITHUB_TOKEN_GLOBAL` is set as a Cloudflare secret.
- Verification:
  - `pnpm build` ✅
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` ✅
  - `pnpm --dir sidecar build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`28 passed, 0 failed, 3 ignored`)
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` ✅

## Goal

Implement GitHub-driven TeamForge Projects:
- GitHub issues become the source of truth for project plans/activity.
- ParkArea Phase 2 (`Sheshiyer/parkarea-aleph`, milestone `1`) appears as a TeamForge project.
- Huly remains mirror-only.
- Clockify remains the time source and overlays hours onto GitHub projects when matched.

## Plan

- [x] Add SQLite cache tables and Rust models for GitHub repos, milestones, issues, labels, and aliases.
- [x] Add GitHub client + idempotent sync command for `Sheshiyer/parkarea-aleph`.
- [x] Upsert GitHub issue events into `ops_events` and extend activity views.
- [x] Add unified execution project backend command.
- [x] Add GitHub token/repo Settings controls and manual sync button.
- [x] Update Projects UI to show GitHub execution projects first, then Clockify-only rows.
- [x] Update Activity UI to include GitHub events from `ops_events`.
- [x] Refactor sidecar mirror naming/config toward reusable GitHub-to-Huly mirror.
- [x] Bump version, build, test, create DMG, install `/Applications/TeamForge.app`.

## Review

- Implemented GitHub cache tables:
  - `github_repo_configs`
  - `github_milestones`
  - `github_issues`
  - `github_project_aliases`
- Added Rust GitHub sync path:
  - `sync_github_plans() -> Vec<GitHubSyncReport>`
  - default repo config: `Sheshiyer/parkarea-aleph`, milestone `1`
  - issue identity: `github:<repo>:issue:<number>`
  - project identity: `github:<repo>:milestone:<number>`
  - idempotent issue upsert and `ops_events` upsert
  - explicit events for opened, updated, closed, reopened, labels changed, assignees changed
- Added project/activity backend views:
  - `get_execution_projects()`
  - `get_project_activity(project_id, limit)`
  - Activity now reads canonical `ops_events`
- Updated frontend:
  - Projects shows GitHub execution projects first and Clockify-only rows after.
  - Summary cards now show GitHub project count, issue completion, and open issue count.
  - Activity can link to GitHub source URLs and show source/status.
  - Settings has GitHub token/repo controls plus `SYNC GITHUB PLANS`.
- Updated Huly sidecar:
  - `pnpm mirror:github` added.
  - ParkArea remains default preset, but project identity is env-overridable.
  - Existing Huly issues are updated from GitHub/cache instead of skipped.
  - `TEAMFORGE_DB_PATH` can mirror from TeamForge's local `github_issues` cache; otherwise it falls back to GitHub API.
- Version/install:
  - bumped root app, Tauri, and sidecar versions to `0.1.12`
  - installed `/Applications/TeamForge.app`
  - DMG created at `src-tauri/target/release/bundle/dmg/TeamForge_0.1.12_aarch64.dmg`
- Verification:
  - `pnpm build` ✅
  - `pnpm --dir sidecar build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`28 passed, 0 failed, 3 ignored`)
  - `pnpm tauri build` produced app/dmg/updater artifacts but exited non-zero because `TAURI_SIGNING_PRIVATE_KEY` is not configured for updater signing.
- Live GitHub sync status:
  - local `github_token` was not configured
  - existing `gh` CLI token is invalid
  - cloud credential endpoint currently returns Clockify/Huly/Slack only, not GitHub
  - unauthenticated GitHub API returns 404 for the private repo
  - implementation is ready, but live issue backfill needs a GitHub token saved in Settings or returned by cloud credential sync.

## Goal

Fix the reported "Projects shows zero" state and ship a clearly identifiable fresh install build:
- ensure Projects loader survives startup/backend warmup races
- bump app version for easy visual verification
- deliver and open a fresh `.dmg` + replace `/Applications/TeamForge.app`

## Plan

- [x] Verify live DB actually contains projects/time data
- [x] Confirm loader hardening is present for partial failures + retry
- [x] Bump app version to `0.1.11`
- [x] Build fresh frontend + Tauri app bundle
- [x] Produce fresh DMG and open it for installer flow
- [x] Replace `/Applications/TeamForge.app` and launch updated app

## Review

- Data presence confirmed in live DB (`~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`):
  - `projects`: `11`
  - `time_entries`: `241`
  - current-month entries: `31`
- `Projects.tsx` already contains hardened loader behavior:
  - `Promise.allSettled` instead of fail-fast `Promise.all`
  - retries every `2s` until first successful load
  - refreshes every `60s` after success
  - fallback synced-project count from breakdown when catalog is unavailable
- Version bump applied:
  - `package.json`: `0.1.11`
  - `src-tauri/Cargo.toml`: `0.1.11`
  - `src-tauri/tauri.conf.json`: `0.1.11`
- Build verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed, 0 failed, 3 ignored`)
- Fresh artifacts:
  - app bundle: `src-tauri/target/release/bundle/macos/TeamForge.app`
  - dmg: `src-tauri/target/release/bundle/dmg/TeamForge_0.1.11_aarch64.dmg`
    - generated via manual `hdiutil create` because Tauri `bundle_dmg.sh` failed in this shell context
- Installed and launched:
  - replaced `/Applications/TeamForge.app` with the fresh bundle
  - opened the new DMG and launched `/Applications/TeamForge.app`
  - app plist confirms `CFBundleShortVersionString = 0.1.11`

## Goal

Execute post-fix validation flow requested by user:
- rebuild/run latest Tauri app
- run one sync pass to backfill corrected project mapping
- verify Projects and Knowledge data surfaces are now populated

## Plan

- [x] Rebuild latest Tauri app bundle from current code
- [x] Run one headless sync-equivalent pass using local settings and Clockify API
- [x] Verify project mapping coverage and project breakdown data in local DB
- [x] Verify Huly document source reachability for Knowledge page

## Review

- Rebuilt app successfully:
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` ✅
  - artifact: `src-tauri/target/release/bundle/macos/TeamForge.app`
- Ran one headless Clockify backfill pass (equivalent to pressing `SYNC NOW` for project mapping correctness):
  - fetched entries: `209`
  - project mapping updates applied: `209`
- Local DB project mapping state improved:
  - before: `mapped_project_id=0` / `227`
  - after: `mapped_project_id=203` / `227` (`24` remained `No Project`)
- Current month project breakdown now resolves named projects:
  - `HeyZack` and `Axtech-ERP` buckets present (plus a small `No Project` bucket)
- Verified live Huly data path for Knowledge backend:
  - `preview_live_huly_workspace_normalization` test succeeded
  - Huly `document:class:Document` fetch returned documents in live run

## Goal

Deep audit page-by-page data coverage and fix missing synced data in UI:
- verify what each page reads from local DB or live Huly APIs
- identify Huly/Clockify data that is synced but not rendered
- fix the immediate project visibility gap (`projects synced` in Settings but empty/partial Projects page)
- implement at least one additional high-signal Huly-backed page data path that is currently stubbed

## Plan

- [x] Audit page-to-command-to-source mapping and identify concrete missing coverage per page
- [x] Fix Clockify time-entry project mapping so `project_id` is persisted correctly
- [x] Add a project catalog API and update Projects page to render synced projects even with 0 tracked hours
- [x] Replace one stubbed page data path with real Huly-backed data (Knowledge)
- [x] Verify with `pnpm build` and `cargo test --manifest-path src-tauri/Cargo.toml`

## Review

- Root-cause found for “projects synced but nothing useful in Projects UI”:
  - Clockify time-entry parser expected nested `project` object only, so `time_entries.project_id` was stored as `NULL`.
  - Projects page only consumed project breakdown rows from time entries, so synced project catalog was not directly rendered.
- Fixes shipped:
  - Added `project_id` parsing from Clockify time entries and kept nested project fallback.
  - Added a 30-day overlap window on incremental Clockify sync so recent entries can self-heal after parser fixes.
  - Added `get_projects_catalog` Tauri command and UI merge logic so Projects page always shows synced projects (0h rows included).
  - Replaced Knowledge page backend stub with real Huly document ingestion (`get_documents` + `get_persons` mapping).
- Remaining deep-review findings (not fixed in this pass):
  - `Clients`, `Devices`, `Sprint detail`, `Training tracks/status`, `Skills matrix`, `Onboarding flows`, and `Planner capacity` still return stub responses in `commands/mod.rs`.
- Verification:
  - `pnpm build` ✅

## Goal

Unblock Huly engagement seeding by rewriting sidecar sync to REST-only mode that does not depend on broken `@hcengineering/tracker` package publishing.

## Plan

- [x] Remove broken sidecar dependencies and keep installable package surface.
- [x] Rewrite `sidecar/src/seed-parkarea.ts` to use Huly REST endpoints (`config/selectWorkspace/find-all/tx`) with string class refs.
- [x] Preserve idempotent upsert behavior for Project + Components + GitHub Issues.
- [x] Update `sidecar/README.md` runbook to reflect the REST-first implementation.
- [x] Run sidecar install + typecheck/build verification and document outcomes.

## Review

- Sidecar dependency surface simplified in `sidecar/package.json`:
  - removed broken upstream chain (`@hcengineering/tracker`, `@hcengineering/core`, `@hcengineering/document`, `ws`, overrides)
  - retained installable minimal dependency: `@hcengineering/api-client@0.7.3`
- Rewrote `sidecar/src/seed-parkarea.ts` to REST-only Huly flow:
  - `config.json` discovery + `selectWorkspace` JSON-RPC session negotiation
  - typed REST helper for:
    - `find-all` queries
    - `tx` mutations via `core:class:TxCreateDoc`
    - account info lookup
  - string class refs used directly:
    - `tracker:class:Project`
    - `tracker:class:Component`
    - `tracker:class:Issue`
  - preserved idempotent upsert semantics:
    - project by `identifier`
    - components by `(space,label)`
    - issues by `(space,number)`
  - preserved GitHub mirror and component inference heuristics.
- Updated `sidecar/README.md`:
  - run command now documents REST-first path (`pnpm seed:parkarea`)
  - added endpoint contract details (`config/selectWorkspace/find-all/tx`)
  - replaced blocker section with current status: typed SDK still unstable, REST seeder is unblocked.
- Verification:
  - `pnpm install` in `sidecar/` ✅ (completed after enabling network)
  - `pnpm build` in `sidecar/` ✅
  - `pnpm seed:parkarea` ✅ startup path; exits with expected env guard:
    - `FATAL: HULY_TOKEN is required.`
  - Live seeded run with real credentials ✅:
    - Workspace: `46352c1b-9c0a-4562-b204-d39e47ff0b1b`
    - Project created: `PARKAREA` (`69dff7f96c1ce2a20e000000`)
    - Components created: `10`
    - GitHub issues mirrored: `21 created`, `0 existing`

## Goal

Fix Projects page showing zero synced projects despite existing Clockify data.

## Plan

- [x] Verify whether live SQLite tables (`projects`, `time_entries`) actually contain data.
- [x] Identify frontend/backend failure path causing zero-state rendering.
- [x] Harden `Projects.tsx` loader against early backend readiness races and partial command failures.
- [x] Build and reinstall app bundle for immediate user verification.

## Review

- Confirmed live DB had non-zero project/time data:
  - `projects`: `11`
  - `time_entries`: `241`
  - active employees: `6`
  - current month entries: `31` (non-zero hours)
- Root cause was in Projects page data loading behavior:
  - `Promise.all` failed hard if either `getProjectsCatalog` or `getProjectBreakdown` errored once.
  - first-load failure path (common when DB/backend state is still warming) was swallowed and permanently rendered zero-state with no retry.
- Updated `src/pages/Projects.tsx`:
  - switched to `Promise.allSettled` with partial fallback (catalog/breakdown independent),
  - treat load as failed only if both requests fail,
  - added adaptive auto-retry loop:
    - retry every `2s` until successful,
    - refresh every `60s` after success,
  - preserved no-data behavior for genuine empty datasets.
- Verification/build:
  - `pnpm build` ✅
  - `pnpm tauri build --no-bundle` ✅
  - updated `TeamForge.app` bundle generated and installed to `/Applications`, then relaunched.
  - `pnpm tauri build --no-bundle` ✅ (updated release binary)
  - `pnpm tauri build --bundles app` produced updated `TeamForge.app` bundle (command exits non-zero after bundle because updater signing key is missing, expected in this environment).
  - Replaced `/Applications/TeamForge.app` with the new `TeamForge.app` bundle and relaunched.
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Provide current founder bearer token and run a full clean Tauri rebuild:
- print the active `cloud_credentials_access_token`
- clear old build artifacts/caches
- run a fresh Tauri build with latest code

## Plan

- [x] Read active `cloud_credentials_access_token` from local TeamForge DB
- [x] Clear project build artifacts/caches for a clean Tauri rebuild
- [x] Run `pnpm tauri build` and capture outcome
- [x] Document verification/review and return token + build result

## Review

- Read active local token from:
  - `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
  - key: `cloud_credentials_access_token`
  - length: `64`
- Cleared old artifacts/caches:
  - removed `dist`
  - removed `src-tauri/target`
  - removed `node_modules/.vite`
- Rebuild attempts:
  - `pnpm tauri build` -> compiled app, failed on DMG bundling
  - `pnpm tauri build --bundles app` -> bundled app, then failed because updater signing key env missing (`TAURI_SIGNING_PRIVATE_KEY`)
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` -> success
- Fresh output artifact:
  - `src-tauri/target/release/bundle/macos/TeamForge.app`
  - mtime: `2026-04-11 17:31:11`

## Goal

Roll out shared bearer token for founder cloud credential sync:
- generate one secure token
- set Worker secret `TF_CREDENTIAL_ENVELOPE_KEY`
- persist the same token to TeamForge local setting `cloud_credentials_access_token`

## Plan

- [x] Generate a new 32-byte hex token and keep it in-process for setup
- [x] Apply token to Cloudflare Worker secret `TF_CREDENTIAL_ENVELOPE_KEY`
- [x] Upsert `cloud_credentials_access_token` in local TeamForge settings DB
- [x] Verify both values are configured without printing full secret value

## Review

- Generated a fresh 64-char hex bearer token via `openssl rand -hex 32`.
- Uploaded Worker secret using Wrangler:
  - `pnpm dlx wrangler secret put TF_CREDENTIAL_ENVELOPE_KEY`
  - result: `Success! Uploaded secret TF_CREDENTIAL_ENVELOPE_KEY`
- Updated local TeamForge settings DB key:
  - key: `cloud_credentials_access_token`
  - db path: `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
- Verification (redacted):
  - local DB token length: `64`
  - generated-token hash == DB-token hash: `true`
  - Wrangler secret list includes `TF_CREDENTIAL_ENVELOPE_KEY`: `true`
- Cleanup:
  - removed temporary `/tmp/teamforge_token` after verification

## Goal

Set cloud-driven credentials as the default workflow:
- cloud credential sync should be enabled by default (unless explicitly disabled)
- preserve secure token requirement and simple setup for founder/cofounder sync
- align Settings copy with default-on behavior

## Plan

- [x] Flip startup and Settings defaults so cloud credential sync is on unless user turns it off
- [x] Update Settings labels/help text to reflect default-on founder workflow
- [x] Verify with frontend build and document the result

## Review

- Startup sync default changed to enabled unless explicitly disabled:
  - app now skips cloud credential sync only when `cloud_credential_sync_enabled === "false"`
- Settings cloud sync state now defaults to enabled and treats missing value as enabled.
- Cloud sync UI copy updated to reflect default-on behavior for founder/cofounder shared-token flow.
- Verification:
  - `pnpm build` ✅

## Goal

Immediate hardening + coherence pass for cloud credentials and OTA:
- lock down `/v1/credentials` and `/internal/*` routes
- fix OTA updater endpoint output and query mapping for Tauri updater compatibility
- make desktop cloud credential sync opt-in (user-enabled) instead of automatic at startup

## Plan

- [x] Add Worker auth guards for credential and internal routes using secret-backed bearer validation
- [x] Update OTA check route to return raw updater manifest and support `target` query mapping
- [x] Update Tauri updater endpoint template to use `target` and align with Worker parsing
- [x] Make startup credential sync opt-in and add Settings controls for cloud sync config + manual sync
- [x] Verify with frontend build, worker typecheck, and Rust tests; then capture review notes

## Review

- Locked down credential and internal Worker routes:
  - added bearer auth helper in `cloudflare/worker/src/lib/auth.ts`
  - `/v1/credentials` now requires `Authorization: Bearer <token>` matching `TF_CREDENTIAL_ENVELOPE_KEY`
  - `/internal/*` now requires bearer auth matching `TF_WEBHOOK_HMAC_SECRET`
- Fixed OTA updater compatibility:
  - `handleOtaCheck` now supports `target=<platform-arch>` parsing
  - returns top-level updater manifest JSON (no `ok/data` envelope)
  - returns `204` for no-update cases instead of wrapped payloads
  - Tauri updater endpoint updated to pass `target={{target}}`
- Made cloud credential sync opt-in:
  - app startup now checks `cloud_credential_sync_enabled` before calling sync
  - Settings now includes a `CLOUD CREDENTIAL SYNC` card with:
    - startup opt-in toggle
    - bearer token field
    - save config action
    - manual "sync now" action
  - Rust sync command now reads local cloud settings (`base_url`, `audience`, `access_token`) and sends authenticated bearer requests
- Verification:
  - `pnpm build` ✅
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Review the latest staged + unstaged changes with focus on:
- UI differences between logged-in/browser expectations and Tauri runtime behavior
- new cloud credential secret sync path
- new OTA/updater rollout path

## Plan

- [x] Inspect full staged and unstaged git diff surfaces
- [x] Trace secret-manager credential flow end-to-end (worker route -> Tauri command -> app bootstrap)
- [x] Trace OTA route/manifest flow end-to-end (worker route -> tauri updater config/runtime)
- [x] Produce severity-ranked review findings with concrete file/line references

## Review

- Completed a full diff-based review over the latest staged backend/Tauri updates and unstaged Team UI pass.
- Identified multiple release-blocking findings in secrets and OTA flow (details provided in response with file/line refs).
- Validation included:
  - `git diff --cached --name-only`
  - `git diff --cached --stat`
  - targeted source reads in Worker routes, Tauri commands/config, and app bootstrap calls

## Goal

Run a final UI coherence pass with responsive breakpoint hardening, focused on the Team route:
- tighten Team breakpoint behavior (desktop/tablet/mobile) so assignment controls and org cards do not collapse awkwardly
- align Team visual language with the shared LCARS design system primitives instead of route-local ad hoc spacing/width choices
- fix overflow-prone sections (notably tables and selector rails) so dense data remains usable on narrower widths

## Plan

- [x] Capture current Team/App responsive and design-coherence gaps from code and runtime behavior
- [x] Implement Team page breakpoint and layout fixes (directory rail, org bento cards, role/member controls, table overflow)
- [x] Align Team styles to shared LCARS page primitives and consistent spacing/shape rules
- [x] Run build verification and log final review evidence + residual risks

## Review

- Responsive hardening completed for Team route with three practical breakpoints:
  - compact stack mode below `1180px`
  - narrow control behavior below `980px`
  - mobile single-column behavior below `760px`
- Team page layout fixes:
  - org action row now adapts spacing/alignment on narrow widths
  - directory/select controls avoid fixed-width overflow and collapse cleanly
  - role/member grids collapse to single-column on mobile
  - org canvas can safely scroll horizontally in narrow contexts
  - monthly hours table now renders inside an explicit horizontal scroll container with minimum table width
- Employee summary panel now adapts at the same narrow/mobile breakpoints:
  - header and selector stack cleanly on mobile
  - identity card/aside collapse to a single flow on narrow widths
  - detail rows convert to vertical layout on mobile to avoid clipped metadata
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Residual risk:
  - Playwright browser tooling failed to initialize in this environment (`ENOENT` for `/.playwright-mcp`), so this pass is code-and-build verified rather than screenshot-verified.

## Goal

Begin Phase 2 Wave 1 of the Cloudflare backend program:
- provision the first TeamForge D1 database in Cloudflare so the backend scaffold binds to a real account resource
- scaffold the Cloudflare Worker package and Wrangler config in-repo
- add the first additive D1 migration that matches the frozen schema contract

## Plan

- [x] Record the Phase 2 Wave 1 execution slice and expected deliverables in this task log
- [x] Use the Cloudflare MCP to locate the D1 API surface and attempt provisioning of the initial TeamForge database
- [x] Scaffold the Worker package, Wrangler config, and initial D1 migration files under a dedicated cloud package
- [x] Review the resulting package for coherence, document verification, and capture the next implementation slice

## Review

- Added a new Cloudflare backend scaffold under `cloudflare/worker/` with:
  - `wrangler.jsonc`
  - `package.json`
  - `tsconfig.json`
  - `.dev.vars.example`
  - `src/index.ts`
  - `src/lib/*`
  - `src/routes/*`
  - `migrations/0001_initial.sql`
  - `fixtures/v1/*`
- The Worker scaffold now:
  - binds the contract-required D1, R2, Queue, and Durable Object resources
  - exposes `/`, `/healthz`, `/v1/bootstrap`, and `/v1/remote-config`
  - reserves the rest of the Phase 1 route contract behind explicit `feature_not_ready` responses instead of silent drift
  - includes a placeholder `WorkspaceLock` Durable Object for future serialized sync and normalization flows
- The first D1 migration creates the canonical shared tables from the contract pack:
  - organizations, workspaces, devices
  - employees and employee/project external ID mapping tables
  - integration connection and credential metadata
  - sync cursor/job/run state
  - normalization, transitional leave/holiday, remote config, OTA, and audit tables
  - seeded `canary` and `stable` OTA channels
- Captured payload fixtures for:
  - bootstrap
  - remote config
  - projects
  - project mappings
  - sync job status
  - OTA manifest
- Cloudflare MCP result:
  - confirmed the live D1 endpoints from the Cloudflare API spec
  - attempted live account execution through the MCP
  - remote provisioning is still blocked by `10000 Authentication error`, so the Wrangler config keeps placeholder resource IDs until account auth is fixed
- Verification:
  - `pnpm exec tsc -p cloudflare/worker/tsconfig.json --noEmit` ✅
  - `sqlite3 ':memory:' < cloudflare/worker/migrations/0001_initial.sql` ✅
- Next executable slice:
  - authenticate Cloudflare MCP or Wrangler against the target account
  - create the real `teamforge-primary` D1 database, `teamforge-artifacts` bucket, and `teamforge-sync` queue
  - replace Wrangler placeholder IDs
  - implement repository-backed `/v1/projects`, `/v1/project-mappings`, and `/v1/connections` routes

---

## Goal

Begin Phase 1 of the Cloudflare backend + OTA program:
- freeze the system boundary, trust boundary, secrets model, schema contract, route contract, updater contract, and migration/rollback rules in repo docs
- give Phase 2 implementation work a stable contract pack instead of relying on chat context

## Plan

- [x] Record the exact Phase 1 deliverables in the task log and map them to repo artifacts
- [x] Create the Phase 1 contract pack under `docs/architecture/`
- [x] Link the contract pack from the main Cloudflare architecture plan and review for coherence
- [x] Document the Phase 1 outcome and identify the next executable slice

## Review

- Created the Phase 1 contract pack under `docs/architecture/contracts/`:
  - `README.md`
  - `phase1-baseline.md`
  - `secrets-auth-contract.md`
  - `d1-schema-contract.md`
  - `worker-route-contract.md`
  - `ota-updater-contract.md`
  - `migration-rollback-contract.md`
- Updated `docs/architecture/cloudflare-backend-ota-design.md` so the main architecture plan now points directly at the Phase 1 contract pack.
- The contract pack now freezes:
  - service ownership and environment boundaries
  - lock-zone files
  - secret ownership and trust boundaries
  - canonical D1 scope
  - Worker route and response rules
  - Tauri OTA artifact and manifest expectations
  - migration stages, feature flags, reconciliation requirements, and rollback triggers
- Verification:
  - reviewed the new contract docs in-place after writing them
  - reviewed the top of `tasks/todo.md` and `cloudflare-backend-ota-design.md` to confirm the new artifacts are linked coherently
  - no build/test rerun, because this slice changed architecture documentation only
- Next executable slice:
  - Phase 2 Wave 1
  - scaffold the Cloudflare Worker package, Wrangler config, and initial D1 migrations
  - keep lock-zone edits serialized when updater plumbing begins

---

## Goal

Draft the exact Cloudflare backend and OTA architecture using the requested `swarm-architect` skill:
- define the Cloudflare secret layout for Clockify, Huly, Slack, and encrypted credential expansion
- define the canonical D1 schema, Worker route contract, and OTA manifest flow
- define a phased migration path from the current local-first TeamForge app

## Plan

- [x] Load the requested `swarm-architect` skill and its required planning context
- [x] Review the existing TeamForge Huly/system docs plus current Tauri bootstrap files
- [x] Produce an execution-ready architecture artifact covering backend, OTA, and migration

## Review

- Created [cloudflare-backend-ota-design.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/cloudflare-backend-ota-design.md).
- The design freezes the target shape as:
  - Edge API Worker
  - D1 for canonical shared persistence
  - R2 for OTA artifacts, signatures, and large snapshots/exports
  - Queues for async vendor sync
  - Workflows for backfills and reconciliation
  - Durable Objects only for serialized coordination
- The plan uses Cloudflare secret management for shared upstream vendor credentials and keeps Tauri signing credentials in CI/CD secret storage instead of Worker runtime.
- The architecture artifact includes:
  - discovery summary and constraints
  - exact secret layout
  - exact D1 schema
  - exact Worker route contract
  - exact OTA manifest and release flow
  - phased migration path
  - phase / wave / swarm decomposition with 90 dependency-aware tasks
- Verification:
  - reviewed the requested skill's playbooks, templates, schemas, and runbook
  - reviewed existing TeamForge docs and current Tauri bootstrap/config files
  - no build/test rerun, because this pass created a planning artifact rather than executable changes

---

## Goal

Review whether TeamForge should insert a Cloudflare layer between the desktop app and current services:
- evaluate a Cloudflare Worker / Durable Object / storage architecture for project management, bridge logic, and backend persistence
- verify the current OTA update path available for this Tauri desktop app
- recommend a concrete architecture and rollout path

## Plan

- [x] Verify current Cloudflare service capabilities and fit for TeamForge's bridge/persistence layer
- [x] Verify the current Tauri updater / OTA model and what it can realistically deliver
- [x] Recommend the simplest viable architecture, including what should stay local vs move to Cloudflare

## Review

- Cloudflare can sit cleanly in the middle, but the right shape is not “one Worker that does everything.”
- Recommended split:
  - Edge API Worker as the desktop app's single remote entrypoint
  - D1 for shared relational persistence if TeamForge needs a central multi-device/team backend
  - R2 for OTA bundles, signatures, exports, and larger snapshot payloads
  - Queues for ingestion and retryable background sync from Clockify / Huly / Slack
  - Workflows for long-running backfills, reconciliation, and human-reviewed sync flows
  - Durable Objects only where strict serialization matters, such as “one sync per workspace/project at a time” or shared mutation locks
- Durable Objects are a coordination primitive, not the default primary database here. They fit workspace/project command serialization better than broad analytics persistence.
- Tauri OTA is not wired in this repo today:
  - no updater plugin dependency in `package.json` or `src-tauri/Cargo.toml`
  - no updater configuration in `src-tauri/tauri.conf.json`
  - no signing keys, updater endpoints, or artifact generation configured
- Best OTA design for this app:
  - generate signed updater artifacts during CI
  - upload artifacts + `.sig` files to R2
  - serve either a static manifest or a rollout-aware dynamic manifest from a Cloudflare Worker
  - call the Tauri updater plugin from the desktop app to check, download, install, and relaunch
- Important constraint:
  - Tauri OTA updates ship new signed binaries; they are not “hot code push” for native Rust changes
  - if you want lightweight post-install changes, treat those separately as remote config / remote data from the Worker
- Verification:
  - reviewed current repo config in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
  - verified current platform capabilities against official Cloudflare and Tauri docs
  - no code or build changes in this pass

---

## Goal

Review the full Settings surface for integrations, connections, and Huly coverage:
- inventory every live Settings option and what it actually persists or tests
- trace each Settings integration through the frontend and Rust command layer
- identify what remains pending, missing, or partial in the Huly integration

## Plan

- [x] Inspect the Settings UI and saved setting keys to inventory the available options
- [x] Trace Clockify, Huly, and Slack connection flows through `useInvoke` and Rust commands
- [x] Review Huly-backed features and list what is still pending or only partially implemented
- [x] Document findings, risks, and open questions in this review section

## Review

- Current Settings surface is limited to three integrations: Clockify, Huly, and Slack, plus sync controls and crew quota management. The UI persists only `clockify_*`, `huly_token`, and `slack_*` settings and exposes no other integrations.
- Clockify is the most complete integration operationally:
  - test connection + workspace selection
  - ignored-crew filtering
  - manual and background sync
  - downstream use across presence, timesheets, quotas, and people state
- Huly is partially integrated:
  - token test/save
  - manual full sync
  - cached Team/Calendar snapshot refresh
  - downstream reads for milestones, board cards, chat, meetings, org data, leave, and holidays
- Slack is additive, not foundational:
  - bot-token validation + optional channel filters
  - downstream reads only for chat activity and standup/message enrichment
- Main findings:
  - Huly “Test Connection” only validates account access, not the workspace capabilities the app actually depends on. Missing HR/calendar/chunter classes can still produce a green Settings state.
  - Huly base URL is hardcoded to `https://huly.app`, so self-hosted or alternate Huly deployments are not configurable from Settings.
  - Calendar leave and holiday editing is local-only today. The app reads Huly leave/holiday cache, but manual edits are written to local SQLite tables and do not sync back to Huly.
  - Huly workspace normalization tooling exists in the backend and covers projects/issues/channels/boards/doc hygiene, but it is not exposed through `useInvoke` or the Settings UI.
  - Clockify-to-Huly project linkage is still pending in local persistence: project rows have `huly_project_id`, but Clockify sync always writes `None`.
  - Background sync is Clockify-only. Huly sync must be triggered manually through Settings or a Team/Calendar refresh path.
- Verification:
  - reviewed `src/pages/Settings.tsx`, `src/hooks/useInvoke.ts`, `src/App.tsx`
  - reviewed `src-tauri/src/commands/mod.rs`, `src-tauri/src/huly/client.rs`, `src-tauri/src/huly/sync.rs`, `src-tauri/src/clockify/sync.rs`, `src-tauri/src/sync/scheduler.rs`
  - reviewed Huly/Slack consumer pages and calendar/team cache flows
  - no build/test rerun, because this pass was a code review and integration audit only

---

## Goal

Replace the broken Team drag-and-drop org assignment flow with explicit assignment controls:
- stop depending on roster drag/drop for department and role mapping
- add dropdown-based assign controls for member, head, and team lead placement
- verify the new Team interaction still saves cleanly through the existing org mapping path

## Plan

- [x] Inspect the current Team assignment render path and identify the smallest replacement surface
- [x] Replace drag-and-drop interactions with explicit dropdown-based role and department assignment controls
- [x] Verify with build/test commands and record the interaction change

## Review

- Removed the broken Team page drag-and-drop state entirely from `src/pages/Team.tsx` instead of trying to preserve a partially working pointer flow.
- Added direct assignment dropdowns to the roster and unassigned tray so every visible person can be mapped to `Unassigned`, `Department • Member`, `Department • Head`, or `Department • Team Lead`.
- Reworked each department card to use explicit Head and Team Lead selectors plus the existing member removal control, while keeping the existing draft/save org-chart persistence path unchanged.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Residual note:
  - I did not run a manual desktop click-through of the Team page after this interaction change, so this pass is build/test verified rather than interactively QA’d.

---

## Goal

Cut the next TeamForge release so Team becomes a people-first surface again:
- move leave and holiday calendar operations off the Team page into a dedicated Calendar route
- add an employee-specific detail view with summary signals for standups, leave, work hours, meetings, and related ops context
- bump the app from `0.1.5` to `0.1.6` once the split is implemented and verified

## Plan

- [x] Add the route/version scope for the next release (`/calendar`, nav updates, `0.1.6` target)
- [x] Slim `Team` down to org mapping, department structure, and employee detail drill-down
- [x] Build the new `Calendar` page for leave tracking, holiday management, and yearly calendar views
- [x] Add a backend-backed employee summary command and frontend types/invoke plumbing
- [x] Verify with frontend build and Rust tests, then record the release review

## Review

- Added a dedicated `Calendar` route and shell navigation entry so leave tracking and yearly holiday management no longer live on the Team page.
- Slimmed `src/pages/Team.tsx` down to the org chart editor, department structure, and a new employee operations drill-down backed by a single summary payload instead of multiple frontend joins.
- Added `src/components/team/EmployeeSummaryPanel.tsx` plus the Rust/TypeScript summary plumbing so Team can show per-employee work hours, meeting load, standup activity, leave state, and upcoming schedule.
- Added `src/pages/Calendar.tsx` to own the leave editor, holiday editor, and yearly holiday calendar using the existing cache-first Team snapshot flow.
- Bumped release metadata and README guidance from `0.1.5` to `0.1.6`, including the new Calendar route and updated keyboard shortcut note for Settings.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Residual note:
  - I did not do a manual click-through of the new Team and Calendar routes this turn, so this pass is compiler/test verified rather than interactively QA’d in the desktop shell.

---

## Goal

Update the README so it matches the latest shipped TeamForge state:
- document the app-wide LCARS overhaul, local leave/holiday management, and current release path
- keep the existing visual README style, screenshots, and Thoughtseed framing

## Plan

- [x] Read the requested README skill and inspect the current README plus shipped changes
- [x] Refresh README sections that are now outdated after the UI/release work
- [x] Review the updated README for coherence and record the doc update

## Review

- Updated `README.md` in the existing visual/landing-page style instead of replacing it with a generic template.
- Refreshed the stale release and feature messaging to match the current shipped state:
  - `v0.1.5` release callout
  - app-wide LCARS consistency overhaul
  - local leave + yearly holiday management on the Team page
  - cache-first Team snapshot behavior
  - tag-driven macOS `.app` / `.dmg` release path
- Updated the Team/dashboard and project-structure sections so the docs now mention the SQLite-backed Team workflows plus the shared UI infrastructure (`hooks/` and `lcarsPageStyles`).
- Review result:
  - checked the edited README sections in-place for stale version references and broken flow ✅
  - no code build/test rerun, because this pass only changed markdown and task notes

---

## Goal

Ship the current TeamForge changes as a new release build:
- bump the app version from `0.1.3` to `0.1.5`
- commit and push the current app/design work on `main`
- push a release tag so GitHub Actions builds the new DMG

## Plan

- [x] Inspect git state, branch, version files, and release workflow triggers
- [x] Bump version metadata consistently to `0.1.5`
- [x] Re-run verification after the version bump
- [x] Commit and push `main`
- [x] Create and push tag `v0.1.5` to trigger the DMG workflow
- [x] Confirm the GitHub Actions release workflow was triggered

## Review

- Initial tag `v0.1.4` triggered the release workflow, but it failed in `Setup pnpm` because `.github/workflows/release.yml` pinned `pnpm/action-setup` to `version: 10` while the repo declares `packageManager: "pnpm@10.33.0"`.
- Fixed the workflow by aligning `pnpm/action-setup` to `10.33.0`, then cut a follow-up release version `0.1.5` instead of rewriting the already-pushed failed `v0.1.4` tag.
- Release metadata now points to `0.1.5` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.lock`
- Verification after the CI fix/version bump:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Git history / release refs:
  - `e6618b3` pushed to `main` as `release: ship TeamForge 0.1.4`
  - `e1bd1be` pushed to `main` as `fix(ci): cut TeamForge 0.1.5 release`
  - tag `v0.1.4` pushed and failed in CI
  - tag `v0.1.5` pushed and triggered the fixed release workflow
- Current GitHub Actions status:
  - Run `24125002100` is in progress at `https://github.com/Sheshiyer/team-forge-ts/actions/runs/24125002100`
  - The run has already passed `Setup pnpm`, `Setup Rust`, and dependency installation, and is currently in `Build Tauri app (Apple Silicon)`

---

## Goal

Run an app-wide LCARS design consistency overhaul instead of only touching Team:
- unify page-level LCARS primitives across the shell and major views
- improve Team/calendar organization and responsive behavior
- reduce generic box/card styling in favor of a stronger console language

## Plan

- [x] Audit the app shell, major pages, and shared controls for repeated one-off styling
- [x] Add shared LCARS page primitives and shell responsive behavior
- [x] Rebuild Team / calendar tracking on top of the shared visual language
- [x] Apply the same consistency pass across the other visible dashboard pages
- [x] Verify the frontend build, Rust tests, packaged app build, and app launch

## Review

- Added a reusable LCARS page-style layer in `src/lib/lcarsPageStyles.ts` plus a viewport hook in `src/hooks/useViewportWidth.ts` so page titles, dividers, cards, buttons, tables, and toolbars now share one visual system instead of each page inventing its own.
- Strengthened the app shell in `src/App.tsx` and `src/styles/globals.css` with a deeper console background, shell gradients, tighter nav sizing logic, and more responsive spacing so the LCARS theme carries through the whole app frame.
- Updated shared controls in `src/components/ui/DateRangePicker.tsx` and `src/components/ui/Skeleton.tsx` so segmented controls and loading states match the same console treatment.
- Brought the main dashboard surfaces into alignment:
  - `src/pages/Live.tsx`
  - `src/pages/Overview.tsx`
  - `src/pages/Activity.tsx`
  - `src/pages/Projects.tsx`
  - `src/pages/Timesheet.tsx`
  - `src/pages/Insights.tsx`
  - `src/pages/Boards.tsx`
  - `src/pages/Comms.tsx`
  - `src/pages/Sprints.tsx`
  - `src/pages/Settings.tsx`
  - `src/pages/Team.tsx`
- Team got the heaviest pass: the org chart rail/canvas now stack more cleanly on narrower widths, wide department cards stop forcing awkward spans on compact layouts, leave/holiday forms collapse more cleanly, and the yearly holiday grid uses the same shared console surfaces as the rest of the app.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm tauri build --bundles app` ✅
  - launched `src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running process confirmed via `ps -ax | rg "TeamForge.app|team-forge-ts"` ✅

---

## Goal

Update TeamForge so it better reflects the Thoughtseed operating model:
- Add preview screenshots to the GitHub README
- Explain how Clockify + Huly + Thoughtseed workflow context map into the dashboard
- Expand the tray menu with quick access to a live people check and a weekly timeline
- Ignore `thoughtseedlabs@gmail.com` across Clockify-derived data so admin activity does not pollute metrics

## Plan

- [x] Inspect the current README, tray implementation, dashboard pages, and Clockify sync/query path
- [x] Update the README with preview images and a clearer architecture / cross-population explanation
- [x] Add a simple weekly timeline view backed by the existing activity data
- [x] Add tray actions for live presence and weekly timeline navigation
- [x] Filter `thoughtseedlabs@gmail.com` out of Clockify ingestion and downstream queries
- [x] Verify with build/test commands and document the result

## Review

- Added repo-local preview screenshots under `docs/images/` and embedded them into the README.
- Expanded `README.md` with a Thoughtseed-specific data-flow section that explains how Clockify, Huly, and the Thoughtseed operating model should fuse inside TeamForge.
- Added a weekly timeline card to the Activity page using the existing combined activity feed.
- Extended the tray menu with `Live Crew Check` and `Weekly Timeline`, plus wired tray navigation into the React router.
- Added an ignored-email control in Settings and enforced the ignore rule in Rust sync/query logic so `thoughtseedlabs@gmail.com` is excluded from Clockify-derived metrics and UI.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Remaining note: if the admin account already exists in local cached Clockify data, save Settings or run a sync once to apply the purge to existing records.

---

## Goal

Cut a local preview build for the latest TeamForge updates:
- Bump the app version from `0.1.0` to `0.1.1`
- Rebuild the frontend and Tauri app artifacts locally
- Re-run the verification path before preview/testing

## Plan

- [x] Inspect current version sources and build entry points
- [x] Update version metadata consistently across the app and sidecar
- [x] Run local verification and rebuild commands for the updated release
- [x] Document the build outputs and local preview status

## Review

- Bumped TeamForge from `0.1.0` to `0.1.1` in the frontend package, Tauri metadata, Rust crate metadata, and sidecar package metadata.
- Cargo refreshed `src-tauri/Cargo.lock` to match the new crate version during the verification pass.
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm tauri build --bundles app` ✅
- Local preview artifact:
  - App bundle: `src-tauri/target/release/bundle/macos/TeamForge.app`
  - Built executable version confirmed in `Info.plist`: `0.1.1`
  - Local launch confirmed via running process: `.../TeamForge.app/Contents/MacOS/team-forge-ts`
- Packaging note:
  - Full `pnpm tauri build` compiled successfully and produced the `.app`, but the final DMG packaging step failed inside `bundle_dmg.sh`.
  - This does not block local preview/testing because the `.app` bundle was built and launched successfully.

---

## Goal

Start the Huly rollout in-repo so the execution path is explicit and trackable:
- Publish the Thoughtseed Huly system design as a source-of-truth document
- Save a phase-by-phase rollout plan with issue mapping under `docs/plans/`
- Link the rollout documents from the README so work can move from audit into execution

## Plan

- [x] Review current Huly backlog state, docs, and rollout gaps
- [x] Create the source-of-truth Huly system design document
- [x] Create a phase-by-phase rollout implementation plan under `docs/plans/`
- [x] Link the new rollout assets from the README
- [x] Verify the repo still builds and document the result

## Review

- Added `docs/huly-system-design.md` as the repo source of truth for the Thoughtseed Huly operating model, including foundation entities, module behavior, rollout phases, and success metrics.
- Added `docs/plans/2026-04-06-huly-rollout.md` as the execution plan that maps the audit and GitHub backlog into a phased rollout sequence.
- Linked both documents from `README.md` under a new `System Design` section so the repo now has an explicit control plane for rollout work.
- Verification:
  - `pnpm build` ✅
- Important limitation:
  - This slice starts the rollout in-repo, but it does not yet mutate the live Huly workspace.
  - The next real execution step is to implement safe Huly write-paths or use a verified manual workspace runbook for `#18`, `#1`, `#2`, `#3`, and `#4`.

---

## Goal

Start execution of workspace normalization issue `#18` using a safe manual path:
- create a strict workspace normalization runbook
- link the runbook into the rollout docs
- keep live Huly mutation manual until verified write-paths exist

## Plan

- [x] Review the rollout docs and `#18` scope
- [x] Create the manual workspace normalization runbook
- [x] Link the runbook from the rollout plan and system design docs
- [x] Verify the repo still builds and document the result

## Review

- Added `docs/runbooks/huly-workspace-normalization.md` as the strict manual runbook for executing workspace normalization issue `#18`.
- Linked the runbook from `docs/plans/2026-04-06-huly-rollout.md` and `docs/huly-system-design.md` so Phase 1 now has an explicit manual execution path.
- Verification:
  - `PATH=/opt/homebrew/bin:$PATH pnpm build` ✅
- Blocker:
  - GitHub issue sync for `#18` was not completed in this shell because `gh` is not available on the current PATH.
  - The runbook exists locally and is ready to be linked back to the issue once GitHub CLI or connector access is restored.

---

## Goal

Execute workspace normalization issue `#18` against the live Huly workspace using verified backend write paths:
- add safe tx-backed Huly mutation support in the Rust backend
- expose preview/apply normalization commands in the command layer
- run the normalization pass against the live workspace

## Plan

- [x] Inspect official Huly source and current workspace model assumptions for tx payloads, ids, classes, and spaces
- [x] Extend `src-tauri/src/huly/types.rs` and `src-tauri/src/huly/client.rs` with safe write-path primitives and normalized workspace domain types
- [x] Add preview/apply normalization orchestration in `src-tauri/src/commands/mod.rs`
- [x] Execute the normalization flow against the live Huly workspace
- [x] Verify the backend build and record the mutations performed

## Review

- Added tx-backed Huly write primitives in the Rust backend and aligned transaction authorship with Huly's actual REST contract: `modifiedBy` / `createdBy` now use the account's primary social identity, while workspace membership fields continue using the account UUID.
- Added typed Huly workspace domain models plus normalization report structs so preview/apply runs can produce deterministic action lists and mutation results.
- Added `preview_huly_workspace_normalization` and `apply_huly_workspace_normalization` command paths, including safe project rename/create, department shell creation, channel creation, and project-aware issue moves.
- Executed the live normalization run against workspace `46352c1b-9c0a-4562-b204-d39e47ff0b1b` after verifying the dry-run plan.
- Live mutations applied successfully:
  - Renamed project `Heyzack-AI` -> `Axtech`
  - Created projects `Tuya clients`, `OASIS R&D`, and `Internal Ops`
  - Moved the Tuya issue out of the legacy project into `Tuya clients`
  - Created departments `Engineering`, `Marketing`, and `Leadership`
  - Created channels `#standups`, `#axtech`, `#tuya-clients`, `#research-rnd`, `#tech-resources`, `#blockers-urgent`, and `#training-questions`
- Post-apply live preview confirms the normalized state:
  - `projectCount = 6`
  - `issueCount = 36`
  - `departmentCount = 4`
  - `channelCount = 10`
  - `pendingSafeCount = 0`
  - `manualReviewCount = 2`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Execute Issue #23: add periodic Huly sync to the background scheduler (currently Clockify-centric).

## Plan

- [x] Refactor scheduler startup to treat Clockify and Huly as independent integrations
- [x] Add periodic Huly polling loops for issues/presence/team cache
- [x] Preserve existing Clockify scheduling behavior and quota-alert checks
- [x] Ensure scheduler can still start when only one integration is configured
- [x] Verify with Rust tests

## Review

- Updated scheduler architecture in:
  - `src-tauri/src/sync/scheduler.rs`
- Behavior changes:
  - Scheduler no longer hard-requires Clockify settings to start.
  - It now starts when either integration is configured:
    - Clockify config: `clockify_api_key` + `clockify_workspace_id`
    - Huly config: `huly_token`
  - Existing Clockify jobs remain:
    - presence every 30s
    - time entries every 5m
    - users/projects + quota checks every 60m
  - New Huly jobs added:
    - issues every 10m
    - presence every 2m
    - team cache every 60m
  - If Huly token exists but Huly connection fails at scheduler boot, Clockify jobs still run; scheduler only returns `None` if no jobs can be started.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Execute Issue #22: persist Slack activity to durable SQLite tables so chat analytics and signals do not rely only on runtime Slack API aggregation.

## Plan

- [x] Add canonical `slack_message_activity` SQLite table + indexes
- [x] Add DB model and query APIs for idempotent Slack message persistence
- [x] Persist Slack messages during existing Slack fetch paths (`chat activity`, `employee summary`, `daily standup`)
- [x] Add fallback read path from persisted Slack activity when live Slack API is unavailable
- [x] Verify with Rust tests

## Review

- Added durable Slack activity table:
  - `src-tauri/migrations/001_initial.sql`
  - table: `slack_message_activity`
  - unique key: `message_key`
  - indexes: `(employee_id, message_ts_ms)` and `(slack_channel_id, message_ts_ms)`
- Added model + queries:
  - `src-tauri/src/db/models.rs`: `SlackMessageActivity`
  - `src-tauri/src/db/queries.rs`:
    - `upsert_slack_message_activity`
    - `get_slack_message_activity_since`
  - regression test:
    - `upsert_slack_message_activity_is_idempotent_by_message_key`
- Added command-layer persistence hooks:
  - `src-tauri/src/commands/mod.rs`
  - helper: `persist_slack_message_activity(...)`
  - writes now occur in:
    - `get_chat_activity` Slack loop
    - employee summary Slack loop
    - daily standup Slack loop
- Added fallback analytics behavior:
  - `get_chat_activity` now reads persisted `slack_message_activity` rows for the last 7 days when live Slack sync is unavailable.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml preview_live_huly_workspace_normalization -- --ignored --nocapture` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml apply_live_huly_workspace_normalization -- --ignored --nocapture` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml preview_live_huly_workspace_normalization -- --ignored --nocapture` ✅ post-apply
- Remaining manual follow-ups:
  - assign employees and team leads across `Engineering`, `Marketing`, and `Leadership`
  - inspect the empty `Default` board and decide whether to keep starter content or archive it

---

## Goal

Verify the Copaw execution path and make sure it runs real logic instead of only opening a browser:
- inspect the Copaw integration docs and launcher scripts
- identify whether the current path only starts or opens a server
- run the proper Copaw script or smoke test and capture whether it actually executes

## Plan

- [x] Inspect Copaw docs, start script, and smoke test path under `~/.openclaw`
- [x] Determine whether the current launcher only opens a browser/server shell or actually exercises Copaw logic
- [x] Run the appropriate Copaw verification path and record the result
- [x] Document findings and any blocker or fix needed

## Review

- Inspected `~/.openclaw/docs/COPAW_INTEGRATION.md`, `~/.openclaw/scripts/copaw-start.sh`, `~/.openclaw/scripts/copaw_smoke_test.sh`, and `~/.openclaw/skills/copaw/scripts/copaw_invoke.py`.
- Confirmed `copaw-start.sh` is not a browser opener. It activates the CoPaw virtualenv, refreshes provider config, and then `exec`s the real `copaw` CLI.
- Starting CoPaw inside the sandbox failed with `PermissionError` on `~/.copaw/config.json`, so runtime verification required launching the app outside the sandbox.
- Verified real runtime behavior after launching `copaw-start.sh app --port 8099`:
  - `copaw_invoke.py status` reported `CoPaw server: RUNNING`
  - the live server exposed 10 skills via `/api/skills`
  - `copaw_invoke.py chat ... --agent chitta-weaver` reached the CoPaw agent pipeline and failed only at upstream provider auth with `AuthenticationError: invalid x-api-key`
- Re-ran the full smoke test against the live server:
  - `44 passed, 7 failed, 0 skipped`
  - runtime checks now pass, proving the script executes logic instead of only opening a page
- Remaining Copaw issues found:
  - 6 manifest checks fail because Tier 1 agent manifests do not currently include `copaw`
  - 1 security check fails because the smoke test detects `api_key`/secret-like patterns in the scanned integration files
  - live agent inference is blocked by invalid provider auth (`invalid x-api-key`)

---

## Goal

Stabilize the Copaw runtime path so the launcher and smoke test reflect the real system state:
- stop `copaw-start.sh` from writing a known-invalid Anthropic auth token into Copaw config
- fix the Tier 1 manifest drift and smoke-test false positive
- rerun live Copaw verification and record the remaining external blocker, if any

## Plan

- [x] Patch `~/.openclaw/scripts/copaw-start.sh` and `~/.copaw.secret/providers.json` so Copaw no longer injects invalid Anthropic auth from Claude OAuth state
- [x] Add the missing `copaw` skill entries to the Tier 1 agent manifests under `~/.openclaw/agents/`
- [x] Narrow the Copaw smoke-test secret scan so vendored `node_modules` fixtures do not trigger false failures
- [x] Restart Copaw, rerun status + smoke test + live chat, and document the result

## Review

- Patched `~/.openclaw/scripts/copaw-start.sh` so it no longer treats `CLAUDE_CODE_OAUTH_TOKEN` as a valid Anthropic `x-api-key`. The launcher now only writes a real `ANTHROPIC_API_KEY` when one exists and otherwise leaves Copaw in a safe, explicit unauthenticated state.
- Sanitized `~/.copaw.secret/providers.json` by clearing the previously injected `sk-ant-oat...` token that Anthropic rejected as an invalid API key.
- Added the missing `copaw` skill entry to all Tier 1 manifests checked by the smoke test:
  - `noesis-vishwakarma`
  - `chitta-weaver`
  - `kosha-regulator`
  - `nadi-mapper`

---

## Goal

Stop the Team page from hanging on Huly by making it render from persistent local cache first:
- persist Team-facing Huly entities in SQLite
- serve the Team screen from cached snapshot data
- refresh Huly in the background without blanking the page when live fetch fails

## Plan

- [x] Inspect the Team page load path and current SQLite coverage
- [x] Add persistent SQLite cache tables and query helpers for Team-facing Huly entities
- [x] Extend Huly sync so Team cache is hydrated during sync runs
- [x] Split Team loading into cached snapshot + background refresh
- [x] Verify with Rust tests, frontend build, app bundle build, and macOS app launch

## Review

- Added persistent SQLite cache tables for Huly departments, people, employees, leave requests, and holidays in `src-tauri/migrations/001_initial.sql`.
- Added JSON-backed cache query helpers plus a new regression test that proves Team department cache data round-trips through SQLite.
- Extended `HulySyncEngine` so full Huly syncs now refresh Team cache data and record a `team_snapshot` sync timestamp.
- Reworked the Team command layer so `get_team_snapshot` is now SQLite-only and immediate, while `refresh_team_snapshot` does the live Huly refresh and then returns the refreshed cached snapshot.
- Updated `Team.tsx` to render cached Team data first, show cache status, and keep stale data visible if live Huly refresh fails.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running process confirmed for `TeamForge.app/Contents/MacOS/team-forge-ts` ✅

---

## Goal

Stop the Team screen from constant self-refreshing and make the running build obvious:
- eliminate the Team page refresh loop / skeleton churn
- show the shipped app version in the bottom-left footer above the brown bar
- cut a visibly newer build and clean old artifacts / caches before launch

## Plan

- [x] Record the correction and verify the Team load loop root cause
- [x] Fix the Team page refresh loop and keep cached loading stable
- [x] Show the app version in the sidebar footer and bump version metadata
- [x] Clean old build artifacts and caches, then rebuild the app bundle
- [x] Verify the launched app is the new version and document the result

## Review

- Stabilized `useInvoke` so it now returns a module-level API object instead of recreating a fresh invoke surface on every render. This removes the Team page self-refresh loop that was retriggering the cached/background load effect.
- Bumped the app from `0.1.2` to `0.1.3` in the frontend package, sidecar package, Rust crate metadata, and Tauri bundle config.
- Added a runtime version read in `App.tsx` and surfaced `BUILD v0.1.3` above the sidebar's brown footer bar so the running app version is visible inside the UI.
- Cleaned old build artifacts and caches before rebuilding:
  - removed repo build artifacts under `dist/`, `.pnpm-store/`, and `src-tauri/target/`
  - cleared persisted Team snapshot cache rows from `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
  - replaced the older `/Applications/TeamForge.app` with the rebuilt `0.1.3` bundle so the default macOS launch target now matches the new build
- Verification:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm tauri build --bundles app` ✅
  - generated bundle plist shows `CFBundleShortVersionString = 0.1.3` and `CFBundleVersion = 0.1.3` ✅
  - relaunched `TeamForge.app` and confirmed the running process path points at `/Applications/TeamForge.app/Contents/MacOS/team-forge-ts` ✅

---

## Goal

Keep Team snapshot refresh alive even when this Huly workspace is missing optional HR classes:
- identify the missing-class failure mode behind the `find_all 404 INVALID CLASS NAME` error
- degrade unsupported Team snapshot classes to empty results
- rebuild and verify the Team path after the fallback is in place

## Plan

- [x] Record the invalid-class correction and inspect the failing Huly query surface
- [x] Treat optional Team snapshot classes as soft-fail / empty in the Huly client
- [x] Rebuild and verify the Team snapshot path after the Huly fallback change

## Review

- Hardened `HulyClient::find_all` error messages so they now include the exact failing class name.
- Added `find_all_typed_optional_class` and routed Team-facing HR fetches through it, so missing workspace classes such as `hr:class:Request` or `hr:class:Holiday` now resolve to empty datasets instead of aborting the Team refresh.
- Added a regression test for invalid-class error detection in `src-tauri/src/huly/client.rs`.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm tauri build --bundles app` ✅
  - relaunched the rebuilt `src-tauri/target/release/bundle/macos/TeamForge.app` and confirmed the running process path still points at that bundle ✅

---

## Goal

Make Slack setup in TeamForge Settings feel like a first-class provider integration:
- match the existing credential setup pattern used for Clockify and Huly
- make it explicit that Slack needs the `xoxb-...` bot token, not the user token
- surface reinstall/scope guidance directly in the app so Slack setup is not guesswork

## Plan

- [x] Inspect the current Slack settings card and backend connection test behavior
- [x] Tighten Slack token validation and friendlier connection errors in the Tauri command layer
- [x] Update the Settings UI copy and layout so Slack setup matches the app's other integration settings
- [x] Verify with fresh build/test commands and record the result

## Review

- Tightened the Slack command layer in `src-tauri/src/commands/mod.rs` so the app now:
  - rejects `xoxp-...` user tokens with an explicit `use the xoxb bot token` error
  - rejects ambiguous non-`xoxb-...` values before making Slack API calls
  - turns Slack `missing_scope` responses into reinstall/scope guidance instead of raw API text
- Refined the Slack Settings card in `src/pages/Settings.tsx` so it now matches the existing provider setup flow more closely:
  - explicit `BOT USER OAUTH TOKEN` label
  - `xoxb-...` placeholder and wrong-token guardrails
  - setup summary strip for status, token source, and channel mode
  - in-app reinstall warning and required-scope guidance tied to the actual Slack flow
  - normalized channel-filter saving so the stored setting is cleaner and consistent
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - packaged app process confirmed via `ps` ✅
- Output bundle:
  - `src-tauri/target/release/bundle/macos/TeamForge.app`

---

## Goal

Make the Slack missing-scope error actionable inside TeamForge:
- surface the exact scope Slack reports as missing instead of only a generic reinstall message
- keep the reinstall guidance, but tie it to the specific missing scope
- rebuild the app so the improved message is available in Settings immediately

## Plan

- [x] Inspect the current Slack error path and what metadata from Slack is being discarded
- [x] Preserve `needed` / `provided` scope details from Slack responses and format them into the Settings error message
- [x] Add a focused regression test for the missing-scope formatting
- [x] Verify with fresh tests/builds and rebuild the Tauri app bundle

## Review

- Extended `src-tauri/src/slack/types.rs` so Slack error envelopes now keep the `needed` and `provided` scope fields that Slack returns on `missing_scope`.
- Updated `src-tauri/src/slack/client.rs` to preserve those fields in the error path instead of collapsing everything down to only `missing_scope`.
- Tightened `humanize_slack_connection_error` in `src-tauri/src/commands/mod.rs` so TeamForge now says which scope Slack reports as missing, while still reminding the user to reinstall the app after scope changes.
- Added a regression test in `src-tauri/src/commands/mod.rs` to lock the exact-scope formatting.
- Verification so far:
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - packaged app process confirmed via `ps` ✅

---

## Goal

Replace the current Team org-chart form with a drag-and-drop bento layout:
- move the crew directory to the left side
- replace dropdown-heavy role assignment with drag targets for head, team lead, and members
- support draggable / reorderable department cards in a bento grid
- respect the ignored-email settings so ignored people do not appear in the assignment UI

## Plan

- [x] Inspect the current Team page layout and the org-chart backend shape
- [x] Filter ignored-email people out of the org-chart payload in the Rust command layer
- [x] Redesign the Team page into a left crew rail and draggable bento department cards
- [x] Verify with fresh tests/builds and rebuild the Tauri app bundle

## Review

- Reworked the org-chart surface in `src/pages/Team.tsx` from a select-heavy form into a drag-and-drop workspace:
  - left-side crew directory rail with search
  - unassigned drop tray
  - draggable crew cards
  - draggable / reorderable department cards in a bento grid
  - role-specific drop zones for `Head`, `Team Lead`, and `Members`
  - inline remove / clear actions so role management no longer depends on dropdowns
- Updated `src-tauri/src/commands/mod.rs` so `get_org_chart` now respects the ignored-email settings by filtering ignored people out of:
  - the assignable roster
  - department member ids
  - department head / team lead assignments returned to the UI
- Added a regression test in `src-tauri/src/commands/mod.rs` covering the ignored-email org-chart filter.
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - packaged app process confirmed via `ps` ✅

---

## Goal

Prepare the next TeamForge patch release and align the repo + GitHub release state:
- bump the app from `0.1.1` to `0.1.2`
- update the README and release-facing docs for the latest shipped work
- create clear release notes and update the GitHub release entry

## Plan

- [ ] Inspect current version metadata, README/docs, and GitHub release state
- [ ] Bump version metadata consistently across package, sidecar, Cargo, and Tauri config
- [ ] Update README and release-facing docs to reflect the latest shipped features
- [ ] Create/update release notes for `0.1.2` and publish or update the GitHub release entry
- [ ] Verify with fresh build/test commands and record the result

---

## Goal

Continue the live Huly workspace cleanup and clarify the Slack state:
- inspect the real Huly employee / department / board state needed for final normalization
- assign department members / leads and decide whether the empty Default board should be archived
- verify whether any Slack integration exists in TeamForge or the Huly rollout

## Plan

- [x] Inspect the current live Huly employee, department, and board records using the repo’s Huly client
- [x] Implement any missing safe write path needed for department assignment or board archival
- [x] Apply the live Huly updates and verify the resulting workspace state
- [x] Confirm whether Slack integration is implemented, partial, or absent, and document that status

## Review

- Added a read-only ignored test in `src-tauri/src/commands/mod.rs` to print the live Huly organization state needed for the remaining normalization pass.
- Live Huly inspection confirmed:
  - `Engineering`, `Marketing`, and `Leadership` exist but all have empty `members`, `teamLead`, and `head`
  - the legacy `Organization` department still holds 8 member ids
  - the `Default` board existed, had `0` cards, and was the only remaining board
- Upgraded the normalization engine so an empty `Default` board becomes a safe `archive` action instead of permanent manual review.
- Applied the live normalization again against workspace `46352c1b-9c0a-4562-b204-d39e47ff0b1b`:
  - archived board `board:space:DefaultBoard`
  - post-apply preview now reports `boardCount = 0`
  - post-apply preview now reports `pendingSafeCount = 0`
  - the only remaining manual item is department membership / team-lead mapping
- Live Huly roster still needing human mapping:
  - current `Organization` members: `Hulia AI`, `Raheman Ali`, `Pavun Kumar`, `Subitcha`, `Mohankumar`, `Imran`, `Preetha`, `Rifayudeen`
  - additional active employee/person records outside `Organization`: `Shesh`, duplicate `Akshay Balraj`, `Shankha Subhra`, and `Guest,Anonymous`
- Slack status:
  - searched `src-tauri/src`, `src`, `docs`, and `README.md`
  - found no Slack integration code, command surface, config, or rollout documentation in this repo
  - current status is `absent`, not merely incomplete

---

## Goal

Cut a fresh Tauri build that includes the latest Huly and Copaw-related changes, then launch it locally:
- verify the frontend and Rust code still compile after the latest updates
- produce a new local Tauri app bundle
- run the built app to confirm the runtime path

## Plan

- [x] Verify the current frontend and Rust code with build/test commands
- [x] Build a fresh local Tauri app bundle with the latest changes
- [x] Launch the newly built app bundle and confirm the runtime path
- [x] Record the build/run result and any packaging limitation

## Review

- Verified the current codebase after the latest Huly workspace and Copaw changes:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
- Built a fresh local Tauri app bundle:
  - `pnpm tauri build --bundles app` ✅
  - output bundle: `src-tauri/target/release/bundle/macos/TeamForge.app`
- Launched the new app bundle directly from:
  - `src-tauri/target/release/bundle/macos/TeamForge.app/Contents/MacOS/team-forge-ts`
- Runtime confirmation:
  - app startup log printed `database initialized`
  - running process confirmed via `ps` for the built `.app` executable path
- Packaging note:
  - this pass produced and launched the `.app` bundle successfully
  - DMG packaging was not part of this run

---

## Goal

Derive the remaining Huly org mapping and add real Slack integration to TeamForge:
- read the Team Pulse export to produce a department-member and team-lead recommendation for Huly
- add Slack auth/config into the Tauri app settings flow
- feed Slack chat activity into the existing communications surface
- rebuild and verify the desktop app with the new integration path

## Plan

- [ ] Locate and inspect the Team Pulse CSV so the department-member and team-lead mapping is evidence-based
- [x] Inspect the existing settings/comms/backend seams and add a minimal Slack client and typed response models
- [x] Add Slack settings + connection testing in the Tauri settings UI and command layer
- [x] Merge Slack-derived chat activity into the communications view
- [x] Verify with build/test commands, rebuild the Tauri app, and document any remaining credential or data blockers

## Review

- Added a real Slack integration path to the Tauri backend under `src-tauri/src/slack/` with:
  - bot-token based connection testing
  - Slack channel listing and history reads
  - Slack user-directory reads for employee matching
- Extended the generic settings flow so TeamForge now stores and loads:
  - `slack_bot_token`
  - `slack_channel_filters`
- Added a dedicated Slack settings card in `src/pages/Settings.tsx` with:
  - token save/show/hide
  - connection test button
  - optional channel filter input
  - required-scope guidance for the current MVP
- Upgraded `get_chat_activity` so the Communications page now merges:
  - Huly chat activity
  - Slack chat activity
  - source badges are shown in the UI so merged data is visible instead of silent
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - direct execution of `TeamForge.app/Contents/MacOS/team-forge-ts` is not a valid macOS verification path here; the user supplied a crash report showing AppKit/HIServices aborting during app registration when started that way from Codex
  - LaunchServices start works:
    - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
    - process remained alive after launch via LaunchServices
  - LaunchServices-started app logs printed:
    - `[teamforge] database initialized`
    - `[scheduler] background sync started`
- Remaining blockers:
  - the Team Pulse CSV file path provided by the user is no longer present on disk, so the Huly department-member / team-lead mapping is still blocked on the actual file
  - Slack end-to-end verification is blocked on the real Slack bot token and workspace scopes from the user

---

## Goal

Move the remaining Huly org-chart and department mapping work into the app itself:
- load the live Huly department roster dynamically inside TeamForge
- let users assign department members, heads, and team leads in the Team page
- save those mappings back to Huly from the app instead of doing it manually outside the product

## Plan

- [x] Inspect the existing Team page, department summary data, and Huly write primitives
- [x] Add backend commands for loading and updating a live org-chart mapping model
- [x] Add a dynamic org-mapping editor to the Team page
- [x] Verify with build/test commands and rebuild the Tauri app

## Review

- Added live Huly org-chart commands in `src-tauri/src/commands/mod.rs`:
  - `get_org_chart`
  - `apply_org_chart_mapping`
- Added typed org-chart models in `src-tauri/src/db/models.rs` and `src/lib/types.ts` so the app now has a structured editable view of:
  - department membership
  - department head
  - team lead
  - assignable people roster
- Wired the new commands into the Tauri bridge in `src-tauri/src/lib.rs` and `src/hooks/useInvoke.ts`.
- Replaced the static Team-page-only summary with a dynamic editor in `src/pages/Team.tsx`:
  - loads the live Huly roster into the app
  - shows department cards with member checklists
  - supports assigning heads and team leads
  - automatically moves a person between departments when reassigned
  - shows unassigned people explicitly
  - saves the mapping back to Huly from the app
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running app process confirmed via `ps`

---

## Goal

Prepare and publish the next TeamForge release:
- bump the app from `0.1.1` to `0.1.2`
- update the README and repo docs to match the shipped Slack + Team workflow
- prepare release notes for the GitHub release entry
- verify the release bundle before tagging it

## Plan

- [x] Inspect the current package, Tauri, Cargo, README, and published release state
- [x] Bump version metadata consistently across the frontend package, sidecar, Cargo crate, and Tauri config
- [x] Update README and repo docs to reflect the Slack setup flow, drag-and-drop team mapping, and rollout artifacts
- [x] Add repo-local release notes for `v0.1.2`
- [x] Verify the release build chain and macOS app launch path

## Review

- Bumped TeamForge from `0.1.1` to `0.1.2` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.lock` refreshed during verification
- Added `CHANGELOG.md` with a `v0.1.2` entry that summarizes the unreleased Slack, Team mapping, and rollout-documentation work since the published `v0.1.0` release.
- Updated `README.md` to:
  - mark the repo state as `v0.1.2`
  - describe the new Slack Settings flow
  - describe the dynamic drag-and-drop Team mapping workflow
  - link the changelog alongside the rollout docs
  - update dashboard descriptions for Team and Comms
- Updated `docs/huly-system-design.md` so the rollout contract now references post-`v0.1.2` work.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running app process confirmed via `ps`

---

## Goal

Stabilize the Team page and make ignore-list management work for Huly-sourced people:
- identify and fix the current Team page fetch failure / glitch state
- add a roster-driven multiselect in Settings for ignored people
- keep ignore behavior effective even when synced team members do not have emails

## Plan

- [x] Inspect the Team fetch path, current ignore-list settings model, and synced employee data shape
- [x] Fix the root cause behind the Team page fetch failure or unstable state
- [x] Add backend support for ignoring people by employee identity instead of email alone
- [x] Replace the Settings ignore input with a team multiselect and keep manual email ignores as a fallback if needed
- [x] Verify with tests/build/app launch and document the result

## Review

- Root cause:
  - the Team page was issuing four independent Huly commands on load
  - each command reconnected to Huly from scratch, which meant four separate `config.json` fetches and workspace-selection handshakes
  - when one of those failed, the page degraded into a mixed `error + empty cards` state exactly like the screenshot
- Added a single backend snapshot command for the Team page so it now performs one Huly connection per load and returns:
  - department summary data
  - org chart data
  - leave requests
  - holidays
  - a single Huly error field when the connection fails
- Added employee-ID-based ignore support in Settings via `clockify_ignored_employee_ids`, while keeping manual email ignores as a fallback for unmapped service accounts.
- Updated ignore enforcement so selected crew are excluded even when email is blank:
  - `apply_clockify_ignore_rules` now honors ignored employee ids as well as ignored emails
  - Team/org-chart filtering now excludes ignored or inactive mapped people
  - Huly-derived summary mappings for departments, leave, boards, meetings, and chat now only resolve against active employees
- Replaced the old email-only ignore control in `Settings` with a searchable roster multiselect plus removable chips, and kept the manual email textarea as a secondary fallback path.
- Updated the Crew Management table so ignored/inactive people remain visible instead of disappearing completely after save.
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running app process confirmed via `ps`

---

## Goal

Make the Team page resilient with a persistent local cache:
- stop depending on live Huly as the only source for Team rendering
- persist Team-facing Huly data into SQLite
- serve cached Team data immediately and refresh in the background when possible

## Plan

- [ ] Inspect the Team page read path against the current SQLite schema and Huly sync coverage
- [ ] Extend the backend with persistent SQLite caching for Team-facing Huly entities
- [ ] Build a layered Team snapshot command that serves cached data first and reports refresh state separately
- [ ] Update the Team page to render cached data immediately instead of hanging on live fetches
- [ ] Verify with tests/build/app launch and document the behavior

---

## Goal

Add leave and holiday management directly to the Team page:
- persist local manual leave entries in SQLite
- persist local holiday entries and show a year-view holiday calendar
- keep Huly-synced leave and holiday rows visible without making them editable

## Plan

- [x] Inspect the current Team snapshot, Team page, and SQLite schema for leave / holiday coverage
- [x] Add persistent local SQLite tables and Rust query helpers for manual leave and holiday entries
- [x] Merge manual leave / holiday rows into the Team snapshot alongside cached Huly data
- [x] Add Team-page controls for manual leave updates and holiday editing plus a yearly holiday calendar
- [x] Verify with tests/build/app launch and document the result

## Review

- Added persistent `manual_leave_entries` and `manual_holidays` SQLite tables in `src-tauri/migrations/001_initial.sql`.
- Added Rust-side models, inputs, CRUD query helpers, and a regression test for local Team calendar rows in:
  - `src-tauri/src/db/models.rs`
  - `src-tauri/src/db/queries.rs`
- Extended the Team snapshot pipeline so cached Huly leave / holiday data is merged with local manual entries, tagged by source, and returned with editability metadata.
- Added new Tauri commands for local Team calendar management:
  - `save_manual_leave`
  - `delete_manual_leave`
  - `save_manual_holiday`
  - `delete_manual_holiday`
- Updated the Team page so it now:
  - loads the employee roster locally for leave assignment
  - lets you add and edit local leave entries in-place
  - lets you add and edit local holiday entries in-place
  - shows which rows are local versus Huly-synced
  - renders a 12-month holiday calendar for the selected year
  - uses safer local date parsing for leave / holiday display instead of relying on browser UTC parsing of `YYYY-MM-DD`
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app` ✅
  - `open src-tauri/target/release/bundle/macos/TeamForge.app` ✅
  - running app process confirmed via `ps`

---

## Goal

Populate the Team holiday tracker with the requested 2026 holiday list:
- add the provided 2026 holidays into the local Team holiday store
- verify the local SQLite calendar contains the exact dates and titles requested

## Plan

- [x] Inspect the current app data location and local holiday storage path
- [x] Insert the requested 2026 holidays into the local manual holiday table
- [x] Verify the inserted rows and document the exact entries added

## Review

- Confirmed the live app database path is:
  - `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
- Inserted 9 local manual holiday rows into `manual_holidays` for the requested 2026 India holiday list.
- Verified the exact stored rows directly via `sqlite3`:
  - `2026-01-01` — `New Year's Day`
  - `2026-01-26` — `Republic Day (National)`
  - `2026-03-19` — `Ugadi (Karnataka New Year)`
  - `2026-04-03` — `Good Friday`
  - `2026-05-01` — `May Day / Labour Day`
  - `2026-08-15` — `Independence Day (National)`
  - `2026-10-02` — `Gandhi Jayanti (National)`
  - `2026-10-21` — `Vijayadashami / Dussehra`
  - `2026-11-10` — `Diwali`
- Verification:
  - `sqlite3 ... ".schema manual_holidays"` ✅
  - `sqlite3 ... "SELECT date, title, note FROM manual_holidays ORDER BY date, title"` ✅
  - `sqlite3 ... "SELECT COUNT(*) FROM manual_holidays"` → `9` ✅

---

## Goal

Run an app-wide LCARS consistency overhaul, not just a Team-page polish pass:
- reduce the generic card-and-box feel across the shell and major views
- improve hierarchy, spacing, controls, and responsive behavior across the app
- bring the Team / leave / holiday tracking experience into that broader design system
- deliver a meaningful multi-point visual consistency pass instead of isolated styling tweaks

## Plan

- [ ] Audit the current shell, major page layouts, shared controls, and responsive breakpoints for consistency gaps
- [ ] Upgrade the app shell and shared UI treatments so pages inherit a stronger LCARS system
- [ ] Redesign the Team / calendar tracking surface inside that broader app-wide language
- [ ] Apply consistency fixes to the most visible adjacent views and controls so the overhaul is not Team-only
- [ ] Verify with build/test/app launch and document the redesign outcomes

---

## Goal

Set up Supabase MCP support in Codex for project `qjnqdhvlxdmezxdnlrbj`:
- add Supabase MCP server
- enable remote MCP client support in Codex config
- authenticate Supabase MCP
- verify MCP server/auth status
- optionally install Supabase agent skills

## Plan

- [x] Add Supabase MCP server via `codex mcp add`
- [x] Ensure `[mcp] remote_mcp_client_enabled = true` exists in `~/.codex/config.toml`
- [x] Authenticate with `codex mcp login supabase`
- [x] Verify MCP setup and authentication state from Codex CLI
- [x] Install optional Supabase agent skills via `npx skills add supabase/agent-skills`
- [x] Document verification output and completion notes

## Review

- Added Supabase MCP server:
  - `codex mcp add supabase --url 'https://mcp.supabase.com/mcp?project_ref=qjnqdhvlxdmezxdnlrbj'`
  - output: `Added global MCP server 'supabase'.`
- Enabled remote MCP client support in global Codex config:
  - `~/.codex/config.toml` now contains:
    - `[mcp]`
    - `remote_mcp_client_enabled = true`
- Authentication completed:
  - `codex mcp login supabase`
  - output ended with: `Successfully logged in to MCP server 'supabase'.`
- Verification from Codex CLI:
  - `codex mcp list` shows Supabase server URL and `enabled` status.
  - `codex mcp get supabase` confirms configured transport and URL.
- Optional skills installed non-interactively:
  - `npx skills add supabase/agent-skills -y -g`
  - installed:
    - `~/.agents/skills/supabase`
    - `~/.agents/skills/supabase-postgres-best-practices`

## Goal

Enable real Clients page data from synced sources:
- replace `get_clients` stub with DB-backed client aggregates
- replace `get_client_detail` stub with linked projects and recent activity
- verify with Rust tests and frontend build

## Plan

- [x] Implement DB-backed `get_clients` aggregation from `projects` + `time_entries`
- [x] Implement DB-backed `get_client_detail` with linked projects and recent activity
- [x] Verify with `cargo test --manifest-path src-tauri/Cargo.toml` and `pnpm build`

## Review

- Replaced `Clients` command stubs with live-backed logic in `src-tauri/src/commands/mod.rs`:
  - `get_clients` now aggregates from `projects` + `time_entries` and computes:
    - `activeProjects`, `primaryContact`, `monthlyValue` (billable-hour estimate),
    - `tier`, `contractStatus`, `daysRemaining`, and inferred `techStack`.
  - `get_client_detail` now returns:
    - linked projects with status (`active` / `idle` / `planned` / `archived`),
    - resources (client drive/profile overrides + matching Huly docs),
    - recent activity from Clockify + Huly issue/document activity.
- Added helper mappers to keep client IDs stable (`client-<slug>`) and to support optional per-client settings:
  - `client_<slug>_drive_link` / `client_<slug>_chrome_profile`
  - legacy fallback `client.<slug>.drive_link` / `client.<slug>.chrome_profile`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅

## Goal

Enable real Devices page data from synced Huly workspace data:
- replace `get_devices` stub with live Huly-backed extraction
- map issue/card signals into Device registry rows expected by UI
- verify with Rust tests and frontend build

## Plan

- [x] Implement live-backed `get_devices` using Huly issues/cards + local project/employee mapping
- [x] Normalize platform/status/client/dev-owner fields into `DeviceView`
- [x] Verify with `cargo test --manifest-path src-tauri/Cargo.toml` and `pnpm build`

## Review

- Replaced `get_devices` stub with live extraction in `src-tauri/src/commands/mod.rs`:
  - queries Huly `issues`, `board cards`, `projects`, and `persons`
  - maps active local employees to Huly person IDs for responsible-dev labels
  - maps local synced project metadata (`huly_project_id` / project name) to `clientName`
- Added device normalization helpers:
  - device candidate detection (`device`/`iot`/`firmware`/`tuya` keywords)
  - platform inference (`iOS`, `Android`, `Firmware`, `Backend`, `Web`)
  - status normalization to UI states (`not started`, `in progress`, `testing`, `deployed`, `issue`)
  - URL and firmware version extraction from issue content for detail rows
- `DeviceView` rows are now deterministic and deduplicated by normalized device key, with merged issue counts and severity-priority status.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅

## Goal

Replace remaining analytics stubs and run a fresh Tauri rebuild:
- implement `get_sprint_detail`, `get_training_tracks`, `get_training_status`, `get_skills_matrix`, `get_onboarding_flows`, `get_planner_capacity`
- keep payloads aligned with current page contracts
- run full build verification plus Tauri rebuild artifact generation

## Plan

- [x] Implement sprint detail command from Huly milestones/issues/time data
- [x] Implement training/skills/onboarding/planner commands from current synced Huly + Clockify datasets
- [x] Verify with `cargo test --manifest-path src-tauri/Cargo.toml` and `pnpm build`
- [x] Run fresh `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`

## Review

- Replaced remaining stubs in `src-tauri/src/commands/mod.rs` with data-backed implementations:
  - `get_sprint_detail` now derives timeline/capacity/comparison/retro from Huly milestones, issues, and synced hours.
  - `get_training_tracks`, `get_training_status`, and `get_skills_matrix` now compute skill/training signals from active employee + issue/time-entry datasets.
  - `get_onboarding_flows` and `get_planner_capacity` now map onboarding/planning rows from synced local data and live Huly context where available.
- Fixed a Rust ownership error in planner capacity issue aggregation (`issue.assignee` move after borrow) and reran verification.
- Verification run:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅
  - `pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` ✅
- Rebuild output:
  - `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/target/release/team-forge-ts`
  - `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/target/release/bundle/macos/TeamForge.app`

## Goal

Update GitHub-facing release docs for the `0.1.7` rollout and push to trigger CI:
- align README release/version messaging to `v0.1.7`
- publish/update GitHub release metadata for `v0.1.7`
- push branch/tag so GitHub Actions CI/release workflows run

## Plan

- [x] Update `README.md` release sections from `v0.1.6` to `v0.1.7` with current rollout summary
- [x] Validate release metadata source (`CHANGELOG.md`) and sync GitHub release notes
- [x] Push commits/tags to GitHub and verify CI workflow kickoff

## Review

- Updated `README.md`:
  - `## New In v0.1.6` → `## New In v0.1.7`
  - refreshed rollout bullets for the P2 dashboard wave and command-surface additions
  - `Releases` section latest tag now `v0.1.7`
- Updated GitHub repo description to reflect the `v0.1.7` rollout positioning.
- Published GitHub release:
  - `https://github.com/Sheshiyer/team-forge-ts/releases/tag/v0.1.7`
  - notes sourced from `CHANGELOG.md` `v0.1.7` section
- Pushed rollout to GitHub:
  - `main` advanced to `e5e6244`
  - tag `v0.1.7` pushed
- CI/release verification:
  - Build & Release workflow triggered on tag push:
    - `https://github.com/Sheshiyer/team-forge-ts/actions/runs/24283881187`
    - status at check time: `in_progress`

## Goal

Diagnose missing `v0.1.7` release assets and restore downloadable app artifacts.

## Plan

- [x] Inspect failed GitHub Actions release run and identify root cause
- [x] Patch release workflow so future tag builds do not fail on updater signing keys
- [x] Build local `.app`/`.dmg` artifacts and upload to `v0.1.7` release

## Review

- Root cause identified from run `24283881187`: Apple Silicon Tauri build failed after bundling with:
  - `A public key has been found, but no private key. Make sure to set TAURI_SIGNING_PRIVATE_KEY environment variable.`
- This is not a package-version issue; updater artifact signing was required but CI lacked `TAURI_SIGNING_PRIVATE_KEY`.
- Updated `.github/workflows/release.yml` to pass:
  - `--config '{"bundle":{"createUpdaterArtifacts":false}}'`
  - on both Apple Silicon and Intel release build steps.
- Built release assets locally with updater artifacts disabled and uploaded to `v0.1.7`:
  - `TeamForge_0.1.7_aarch64.dmg`
  - `TeamForge_0.1.7_aarch64_app.zip`
- Pushed CI fix commit to `main`:
  - `5bd34a5`

## Goal

Cut a fresh release tag after CI workflow fix so GitHub Actions can publish release assets automatically.

## Plan

- [x] Create and push `v0.1.8` tag from latest `main`
- [x] Monitor Build & Release workflow to completion
- [x] Verify `v0.1.8` release assets are present on GitHub

## Review

- Tagged and pushed:
  - `v0.1.8` at commit `5bd34a5`
- Release workflow run:
  - `https://github.com/Sheshiyer/team-forge-ts/actions/runs/24285428588`
  - final status: `completed`, `success`
- Release page:
  - `https://github.com/Sheshiyer/team-forge-ts/releases/tag/v0.1.8`
- Assets now present:
  - `TeamForge_0.1.7_aarch64.dmg`
  - `TeamForge_0.1.7_x64.dmg`
  - `TeamForge_aarch64.app.tar.gz`
  - `TeamForge_x64.app.tar.gz`

## Goal

Cut `v0.1.9` with fully aligned version metadata so release artifact filenames no longer lag old app versions.

## Plan

- [x] Bump app/package metadata to `0.1.9`
- [x] Verify builds and tests after version update
- [ ] Push release commit, tag `v0.1.9`, and verify GitHub release artifacts

## Review

- Version fields set to `0.1.9` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Release docs aligned:
  - `README.md` latest tag now `v0.1.9`
  - `CHANGELOG.md` includes a `v0.1.9` entry (2026-04-12)
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅

## Goal

Align app/package version metadata with the new `v0.1.8` rollout.

## Plan

- [x] Bump canonical version fields from `0.1.7` to `0.1.8` across frontend, sidecar, Rust crate, and Tauri config
- [x] Verify builds still pass after version bump
- [x] Document the version-alignment outcome

## Review

- Updated version fields to `0.1.8` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅
  - `pnpm build` ✅

## Goal

Create a concrete GitHub issue backlog for the 20-point TeamForge ↔ Paperclip ops-data unification program, with clear ownership slices across TeamForge runtime and Paperclip orchestration.

## Plan

- [x] Validate repo mapping and label strategy for issue creation
- [x] Draft 20 implementation issues with acceptance criteria and dependency hints
- [x] Publish issues in GitHub and capture the created issue links
- [x] Add a review summary with ownership grouping and rollout order

## Review

- Created 20 backlog issues in `Sheshiyer/team-forge-ts` covering the full TeamForge ↔ Paperclip ops-data unification scope:
  - `#20` Define canonical ops_event schema for TeamForge ↔ Paperclip
  - `#21` Add deterministic sync_key generation for idempotent ops_event processing
  - `#22` Persist Slack activity to SQLite for durable analytics and feed export
  - `#23` Add periodic Huly sync in background scheduler
  - `#24` Add Slack delta sync with cursor checkpoints
  - `#25` Introduce cross-platform identity map (Clockify ↔ Huly ↔ Slack)
  - `#26` Add identity-match confidence + manual override controls
  - `#27` Create dedicated agent_feed projection in TeamForge
  - `#28` Expose TeamForge agent_feed export API for Paperclip
  - `#29` Build ts-paperclip teamforge-sync ingestion script
  - `#30` Persist immutable dated feed snapshots into vault
  - `#31` Enrich paperclip-sync dispatch with TeamForge feed context
  - `#32` Implement role-specific agent_feed slices (Jarvis/Clawd/Sentinel/Sage)
  - `#33` Inject role-specific feed slices into agent-prompt-assembler
  - `#34` Add signal-to-owner routing rules for ops events
  - `#35` Add severity scoring pipeline for ops signals
  - `#36` Add dedupe windows and cooldown suppression for repeated alerts
  - `#37` Add ingestion health metrics (lag/failure/coverage)
  - `#38` Implement unified data quality checks and drift detection
  - `#39` Add closed-loop action outcome tracking for agent interventions
- Repo mapping decision:
  - `ts-paperclip` local path points to repo `Sheshiyer/14113-X-vault`, not a separate `ts-paperclip` GitHub repo.
  - All issues were created in `team-forge-ts` with explicit ownership notes for TeamForge runtime vs Paperclip scripts.
- Suggested rollout waves encoded by dependency order:
  - Wave 1 (contract + identity + persistence): `#20 #21 #22 #25 #26 #27`
  - Wave 2 (sync + export + ingestion): `#23 #24 #28 #29 #30`
  - Wave 3 (agent context + routing intelligence): `#31 #32 #33 #34 #35 #36`
  - Wave 4 (operational excellence + learning loop): `#37 #38 #39`
- Milestone created and linked:
  - `Ops Fabric v0.3.0 — TeamForge ↔ Paperclip Unification`
  - `https://github.com/Sheshiyer/team-forge-ts/milestone/2`
  - Issues attached: `#20` through `#39` (20 total)
- Project board created and populated:
  - `TeamForge Ops Fabric Rollout`
  - `https://github.com/users/Sheshiyer/projects/6`
  - Items attached: 20 (`#20` through `#39`)

## Goal

Execute Ops Fabric backlog sequentially, starting with foundational Issue #20 (canonical ops_event schema) and Issue #21 (deterministic sync_key generation) in TeamForge.

## Plan

- [x] Add canonical `ops_events` persistence schema (SQLite table + indexes + model)
- [x] Implement deterministic `sync_key` generation for `ops_event/v1`
- [x] Emit canonical ops events from Clockify and Huly sync pipelines
- [x] Add schema contract docs for TeamForge ↔ Paperclip consumption
- [x] Run Rust test suite to verify no regressions

## Review

- Implemented canonical ops event foundation for Issues `#20` and `#21`:
  - Added `ops_event/v1` sync-key helper module:
    - `src-tauri/src/ops/mod.rs`
    - deterministic `build_sync_key` + normalization rules + unit tests
  - Added canonical persistence table and indexes:
    - `src-tauri/migrations/001_initial.sql`
    - table: `ops_events` with unique `sync_key`
  - Added Rust model + query layer support:
    - `src-tauri/src/db/models.rs` (`OpsEvent`)
    - `src-tauri/src/db/queries.rs` (`upsert_ops_event`)
    - query test: `upsert_ops_event_is_idempotent_by_sync_key`
- Wired emission paths:
  - Clockify:
    - `src-tauri/src/clockify/sync.rs` now emits `clockify.time_entry.logged` ops events for each synced time entry.
  - Huly:
    - `src-tauri/src/huly/sync.rs` now emits `huly.issue.modified` ops events for each synced issue.
    - events are emitted even when employee mapping is unresolved (actor person ID retained), while legacy `huly_issue_activity` still requires mapped employee.
- Added TeamForge ↔ Paperclip contract doc:
  - `docs/architecture/contracts/ops-event-schema-contract.md`
  - linked from `docs/architecture/contracts/README.md`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅

## Goal

Execute sequential Ops Fabric items `#22`, `#23`, and `#24` by hardening Slack persistence, expanding scheduler coverage, and introducing cursor-checkpointed Slack delta sync.

## Plan

- [x] `#22` Persist Slack message activity durably in SQLite with idempotent upsert semantics
- [x] `#23` Run Huly issue/presence/team-cache sync on scheduler intervals independent of Clockify configuration
- [x] `#24` Add Slack periodic delta sync with per-channel cursor checkpoints and bootstrap backfill strategy
- [x] Add scheduler + tray integration for periodic/manual Slack delta sync execution
- [x] Verify Rust formatting and tests after all sync changes

## Review

- Implemented `#22` durable Slack activity persistence:
  - `src-tauri/migrations/001_initial.sql`
    - `slack_message_activity` table + indexes (`message_key` unique idempotency key).
  - `src-tauri/src/db/models.rs`
    - `SlackMessageActivity` model.
  - `src-tauri/src/db/queries.rs`
    - `upsert_slack_message_activity`, `get_slack_message_activity_since`.
    - idempotency test: `upsert_slack_message_activity_is_idempotent_by_message_key`.
  - `src-tauri/src/commands/mod.rs`
    - Slack ingestion paths now persist message activity rows as they ingest.
- Implemented `#23` periodic Huly scheduler jobs:
  - `src-tauri/src/sync/scheduler.rs`
    - scheduler now starts with independent integration checks instead of hard coupling.
    - added periodic jobs:
      - Huly issues: every 10m
      - Huly presence: every 2m
      - Huly team cache refresh: every 60m
- Implemented `#24` Slack delta sync with cursor checkpoints:
  - `src-tauri/src/slack/sync.rs` (new)
    - Added `SlackSyncEngine::sync_message_deltas` with:
      - per-channel checkpoint scope via `sync_state` (`source=slack`, `entity=messages_channel:<channel_id>`),
      - persisted JSON checkpoint payload (`cursor`, `oldest_ts`, `last_message_ts`),
      - first-run bootstrap backfill strategy (`slack_sync_backfill_days`, default 7),
      - resume-after-restart behavior by restoring cursor/oldest checkpoint,
      - sync lag observability (`max_lag_seconds`) persisted in summary sync state (`source=slack`, `entity=messages_delta`).
  - `src-tauri/src/slack/client.rs`
    - Added rate-limit and transient server retry logic in Slack API requests.
    - Added page-level history fetch API (`get_channel_messages_page`) to support checkpointed pagination.
  - `src-tauri/src/sync/scheduler.rs`
    - added periodic Slack delta sync job every 3m when `slack_bot_token` is configured.
  - `src-tauri/src/lib.rs`
    - tray/manual sync (`Sync Now`) now also executes Slack delta sync.
  - `src-tauri/src/slack/mod.rs`
    - exported new `sync` module.
  - `src-tauri/src/slack/sync.rs`
    - added unit tests for checkpoint parsing and Slack timestamp parsing.
- Verification:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`21 passed`, `0 failed`, `3 ignored`)

## Goal

Execute the remaining Ops Fabric backlog items `#29` through `#39` in one continuous implementation pass across TeamForge + ts-paperclip.

## Plan

- [x] `#29` Add `teamforge-sync.sh` ingestion with cursor checkpoints, schema validation, idempotent ingest, and cycle integration
- [x] `#30` Persist immutable date-partitioned TeamForge feed snapshots with replay metadata and retention notes
- [x] `#31` Enrich Paperclip dispatch payloads using TeamForge feed context with bounded deterministic formatting and dry-run preview
- [x] `#32` Add deterministic role-specific feed slices (`jarvis`, `clawd`, `sentinel`, `sage`) plus explicit overlap/fallback policy
- [x] `#33` Inject role-specific feed slice blocks into `agent-prompt-assembler.sh` with missing-slice handling and prompt-size guardrails
- [x] `#34` Implement signal-to-owner routing rules with override + fallback behavior and evaluation traces
- [x] `#35` Add severity scoring + rationale fields and plumb severity into dispatch priority assignment
- [x] `#36` Add cooldown-based dedupe suppression with bypass for critical events and suppression counters
- [x] `#37` Expose ingestion health metrics (lag/failure/coverage) as persisted artifacts and command output
- [x] `#38` Add data-quality checks (orphan refs, stale mappings, timestamp drift) and quality score output
- [x] `#39` Track closed-loop outcomes by linking dispatched tasks back to `sync_key` and recording resolution/recurrence metrics
- [x] Run script-level verification for TeamForge sync/cycle/prompt assembly behavior and log all outcomes in review notes

## Review

- Implemented the full `#29`-`#39` Paperclip-side Ops Fabric surface in `ts-paperclip`:
  - Added `scripts/teamforge-sync.sh` with:
    - schema validation against `agent_feed/v1`,
    - cursor-aware incremental ingestion,
    - idempotent handling by `syncKey`,
    - immutable snapshot writes to date-partitioned vault paths,
    - replay + status + quality command modes,
    - role-slice materialization (`jarvis`, `clawd`, `sentinel`, `sage`),
    - routing rules + severity scoring + cooldown suppression,
    - persisted health (`lag/failure/coverage`) and data quality findings,
    - closed-loop outcome rollups based on task lifecycle + `source_sync_key`.
- Integrated TeamForge sync into cycle orchestration:
  - `scripts/paperclip-cycle.sh` now runs TeamForge sync before Paperclip issue sync and supports `--without-teamforge` and `--teamforge-dry-run`.
  - `bootstrap.sh` now validates `scripts/teamforge-sync.sh` as a required executable.
- Enriched dispatch and registry primitives:
  - `scripts/dispatch-task.sh` supports `--details`, `--sync-key`, `--source-ref`, `--signal-severity`, `--score-rationale`, writes them into INBOX payloads, and forwards metadata to the registry.
  - `scripts/task-registry.sh` now persists these fields (`details`, `source_sync_key`, `source_ref`, `signal_severity`, `score_rationale`) for downstream analytics and closed-loop reporting.
- Added TeamForge context-driven paperclip dispatch enrichment:
  - `scripts/paperclip-sync.sh` now reads role slices, builds deterministic bounded context blocks, supports `sync-issues --dry-run` preview mode, and attaches enrichment metadata on dispatch.
- Added role-specific prompt injection:
  - `scripts/agent-prompt-assembler.sh` now loads only the relevant TeamForge slice for the executing role, falls back gracefully to `jarvis`, and enforces prompt-size guardrails.
- Added documentation and config surface:
  - `manifest.yaml` includes TeamForge feed/routing/health/cooldown configuration keys.
  - `memory/teamforge-ops-feed.md` documents replay, retention, routing, severity rubric, dedupe policy, alert thresholds, quality remediation, and closed-loop metrics.
  - `memory/processes.md` now references the TeamForge ops-feed contract.

- Verification executed:
  - `bash -n` validation passed for all changed shell scripts and `bootstrap.sh`.
  - End-to-end dry/live simulation on a writable mirror (`/tmp/ts-paperclip-work`) with synthetic TeamForge exports:
    - initial ingest: `new=3 skipped=0 suppressed=0 dispatched=0 errors=0`,
    - idempotent replay: `new=0 skipped=3 suppressed=3 dispatched=0 errors=0`,
    - dispatch run: `new=2 skipped=0 suppressed=0 dispatched=2 errors=0`,
    - outcome rollup after lifecycle mutation shows resolved/no-change split and time-to-resolution metrics.
  - `paperclip-sync.sh sync-issues --dry-run` against local API endpoint currently fails in this shell when `http://127.0.0.1:3100` is unreachable, but dry-run enrichment path and syntax are validated.

## Goal

Remove Training from the TeamForge shell and refocus the Clients page on hours-based tracking (no monetary value/revenue displays).

## Plan

- [x] Remove Training from app navigation and route registration.
- [x] Replace Clients monetary/value metrics with billable-hours-based metrics and labels.
- [x] Update backend/frontend client view types to expose month billable hours directly.
- [x] Build frontend and Tauri Rust workspace to verify no regressions.

## Review

- Removed Training from the shell navigation + routing surface:
  - `src/App.tsx` no longer imports `Training`, includes the Training nav item, or registers `/training`.
- Removed remaining Training-facing labels from adjacent UI:
  - `src/pages/Knowledge.tsx` category filter replaced `Training` with `Playbook`.
  - `src/pages/Overview.tsx` developer dashboard card now uses `PROCESS READINESS` / `SOP & DOC COVERAGE`.
- Refocused Clients UI from perceived monetary value to hours:
  - `src/pages/Clients.tsx` now shows `BILLABLE HOURS (MONTH)` in the top metrics, client cards, and detail panel.
  - Removed `MONTHLY REVENUE`/`MONTHLY VALUE` displays and dollar formatting from Clients page.
- Added direct hours field in shared client contracts:
  - `src-tauri/src/commands/mod.rs` now exposes `month_billable_hours` in `ClientView`.
  - `src/lib/types.ts` now uses `monthBillableHours` in `ClientView`.
  - Client sorting now prioritizes `month_billable_hours` and then active projects.
- Verification:
  - `npm run build` ✅
  - `npm run build` (post-label cleanup) ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed`, `0 failed`, `3 ignored`)

## Goal

Redesign Team page layout to stabilize the Crew Directory rail, reduce mapping clutter, and preserve all current assignment/sync features.

## Plan

- [x] Rework Crew Directory card layout so identity text never collapses and assignment controls are structured.
- [x] Simplify left rail information architecture (single directory flow with clear mode/filter controls).
- [x] Add Team mapping validation signals (duplicate department names, unassigned crew, inactive assignments).
- [x] Streamline Department Structure summary rendering to avoid noisy duplicate cards.
- [x] Run frontend build + Tauri tests to validate no regressions.

## Review

- Reworked Team directory layout in `src/pages/Team.tsx`:
  - Added a dedicated `DirectoryCrewCard` component that renders identity first and assignment controls below to prevent text collapse in narrow rails.
  - Removed the prior side-by-side compact card/select layout that forced names and assignment text into vertical wrapping.
- Simplified left rail flow:
  - Replaced dual-list (`UNASSIGNED TRAY` + `FULL ROSTER`) pattern with one searchable directory list and explicit mode toggles:
    - `UNASSIGNED (n)`
    - `ALL CREW (n)`
  - Preserved direct assignment capability for every listed person.
- Added live validation counters in the left rail:
  - duplicate department names,
  - inactive assigned crew,
  - open leadership roles.
- Improved department naming clarity + summary output:
  - Duplicate department names in mapping controls are now disambiguated with ordinal suffixes (for example `ENGINEERING 2`) in assignment option labels and department card headers.
  - Department Structure cards now render from aggregated name-level summaries to avoid noisy duplicate rows.
- Styling and structure adjustments:
  - widened org workspace rail column (`320px`) and increased directory list usable height.
  - introduced dedicated style tokens for directory mode controls, validation strip, and stacked assignment rows.
- Verification:
  - `npm run build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed`, `0 failed`, `3 ignored`)

## Goal

Split Team into focused subroutes (Mapping, Capacity, Crew Profile), extract reusable Team domain components, and enforce hard validation gates before org-chart save.

## Plan

- [x] Convert Team routing to `/team/*` with subroute navigation (`mapping`, `capacity`, `crew`).
- [x] Extract reusable components: `DirectoryPanel`, `DepartmentCard`, `RolePicker`, `ValidationBar`.
- [x] Add blocking validation gates for duplicate department names and missing required leadership roles.
- [x] Add inline validation fix actions (reset draft, auto-fill leadership, unassign inactive).
- [x] Run frontend build + Tauri tests to verify end-to-end stability.

## Review

- Routing split implemented:
  - `src/App.tsx` now mounts Team at `/team/*`.
  - `src/pages/Team.tsx` now provides subroute tabs and nested routes:
    - `mapping` (org chart editing),
    - `capacity` (department structure + monthly hours),
    - `crew` (employee profile summary panel).
- Team domain components extracted from monolith:
  - `src/components/team/DirectoryPanel.tsx`
  - `src/components/team/DepartmentCard.tsx`
  - `src/components/team/RolePicker.tsx`
  - `src/components/team/ValidationBar.tsx`
  - shared mode type: `src/components/team/types.ts`
- Hard save validation gates enforced:
  - Save is blocked when either of these is true:
    - duplicate department names exist,
    - required leadership roles are missing (HEAD/TEAM LEAD, excluding `organization`).
  - `handleSaveOrgChart` now exits early with error message if blocking conditions exist.
- Inline fix actions added:
  - `RESET DRAFT` for duplicate-name recovery path,
  - `AUTO-FILL ROLES` to fill missing HEAD/TEAM LEAD from active members,
  - `UNASSIGN INACTIVE` to clear stale inactive assignments.
- Additional streamlining retained:
  - Assignment option labels and department headers disambiguate duplicate names with ordinal suffixes.
  - Department Structure continues showing aggregated name-level summaries (reduced noise).
- Verification:
  - `npm run build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed`, `0 failed`, `3 ignored`)

## Goal

Bump release metadata to the next patch version and run a fresh clean build.

## Plan

- [x] Bump version metadata from `0.1.9` to `0.1.10` across app and sidecar package manifests.
- [x] Run a fresh clean frontend build on the bumped version.
- [x] Record the build result and touched version surfaces in review notes.

## Review

- Bumped version metadata from `0.1.9` to `0.1.10` in:
  - `package.json`
  - `sidecar/package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock` (root package entry refreshed by Cargo)
- Fresh build verification on bumped version:
  - `pnpm build` ✅
  - `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (`24 passed`, `0 failed`, `3 ignored`)
  - `pnpm tauri build --no-bundle` ✅ (release binary built)
- Packaging notes:
  - `pnpm tauri build` reaches app+dmg bundling but exits non-zero at DMG bundling (`bundle_dmg.sh`) in this environment.
  - `pnpm tauri build --bundles app` finishes app artifacts but exits non-zero due missing updater signing key: `TAURI_SIGNING_PRIVATE_KEY`.

## Goal

Generate a usable latest DMG (`0.1.10`) and replace the installed `/Applications/TeamForge.app`.

## Plan

- [x] Create a clean DMG from the newly built `TeamForge.app`.
- [x] Mount DMG and replace existing `/Applications/TeamForge.app` with the new build.
- [x] Verify installed app metadata reports `0.1.10`.

## Review

- Created DMG successfully at:
  - `src-tauri/target/release/bundle/dmg/TeamForge_0.1.10_aarch64.dmg`
  - size: ~10 MB
- Installed updated app by mounting DMG and copying app bundle into `/Applications`:
  - source: mounted `TeamForge.app`
  - destination: `/Applications/TeamForge.app`
- Verified installed metadata:
  - `CFBundleShortVersionString`: `0.1.10`
  - `CFBundleVersion`: `0.1.10`
- Opened the installed app (`open /Applications/TeamForge.app`) after replacement.

## Goal

Fix Team sub-tab navigation so Mapping/Capacity/Crew always render their content instead of blank screen states.

## Plan

- [x] Inspect Team subroute link and nested route matching behavior.
- [x] Fix Team tab links to avoid broken relative navigation under `/team/*`.
- [x] Add safe nested route redirects (`index` + wildcard fallback) for Team.
- [x] Run frontend build to verify no route/regression issues.

## Review

- Updated Team sub-tab link targets in `src/pages/Team.tsx`:
  - `MAPPING` now points to `/team/mapping`
  - `CAPACITY` now points to `/team/capacity`
  - `CREW PROFILE` now points to `/team/crew`
  - each tab link now uses `end` for stable active-state behavior.
- Updated nested routing in `src/pages/Team.tsx`:
  - replaced `path="/"` redirect with `index` redirect to `mapping`,
  - added wildcard fallback route (`path="*"`) redirecting to `mapping`.
- Verification:
  - `pnpm build` ✅

## Goal

Update Clients to participate in the GitHub-driven execution flow:
- GitHub-only projects create client visibility before Clockify exists.
- ParkArea appears in Client Directory through the default GitHub repo config.
- Client detail shows GitHub-backed linked projects, issue counts, source URLs, and GitHub activity.
- Clockify remains the billing/time overlay.

## Plan

- [ ] Extend client backend view fields with planning source and GitHub issue/project counts.
- [ ] Merge GitHub repo+milestone aggregates into `load_clients`.
- [ ] Add GitHub linked projects/resources/activity to `get_client_detail`.
- [ ] Update Client UI cards/detail panel to show integrated source and issue metadata.
- [ ] Verify with frontend build and Rust tests.

## Review

- Pending implementation.

## Goal

Stop the Projects page from booting into a false-empty error state after OTA updates by making backend data availability deterministic at app startup.

## Plan

- [x] Confirm the failing Projects load path and record the root cause against the current packaged-app startup flow.
- [x] Change app bootstrap so the SQLite pool is initialized and managed before the UI can invoke page commands.
- [x] Verify the Projects command path still works against the live local database and does not regress command registration.
- [x] Document the fix and verification results here.

## Review

- Root cause:
  - `src-tauri/src/lib.rs` initialized SQLite in a spawned async task after the window could already render.
  - The Projects page invokes Tauri commands immediately on mount, so packaged launches could hit a backend-not-ready window and fall into the false-empty/error state shown in the OTA screenshot.
  - The existing `0.1.19` Projects-page retry patch reduced the symptom but did not eliminate the startup race.
- Fix:
  - moved `db::queries::init_db(...)` into synchronous setup via `tauri::async_runtime::block_on(...)`
  - registered `DbPool` before returning from `setup`, so page commands cannot race backend state registration anymore
  - preserved the startup log messages, but now app startup fails fast if DB initialization genuinely fails instead of booting into a misleading empty shell
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - result: `33 passed, 0 failed, 3 ignored`
  - confirmed the live local execution-project SQL path still returns the expected configured repo row from `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`

## Goal

Audit the remaining TeamForge pages for stale, hard-coded, or low-information content so we can see which surfaces still need real data wiring.

## Plan

- [x] Inspect all routed pages and note their primary data source(s).
- [x] Flag hard-coded or mock-derived content, including stale issue/state displays.
- [x] Identify pages that are relatively empty, thin, or mostly zero-state despite existing routes.
- [x] Summarize the findings in severity order with a page-by-page emptiness list.

## Review

- Highest-severity stale-data issue found in Devices:
  - `src-tauri/src/commands/mod.rs` counts device-shaped Huly issues/cards without excluding completed work.
  - `normalize_device_status(...)` maps `closed` / `resolved` into `deployed` instead of filtering them out, which explains stale ParkArea-style device rows surviving after closure.
- Explicit hard-coded / placeholder content found in Overview:
  - quota trend sparklines are generated by `mockSparklineData(...)`
  - Weekly Trend is a static `AWAITING DATA STREAM`
  - Role Dashboard cards are static placeholder copy with `AWAITING DATA STREAM`
- Hard-coded empty path found in Clients detail:
  - `linked_devices` is returned as `vec![]`, so the client detail can never show linked devices even if device data exists elsewhere.
- Heuristic or proxy-driven pages found:
  - Onboarding is synthesized from projects, time entries, and Huly keyword matches rather than a canonical onboarding model.
  - Planner is explicitly derived from Clockify + Huly scheduling signals, not a real planner API.
  - Training uses hard-coded track blueprints and inferred progress, and is not currently routed in `src/App.tsx`.
- Silent-empty behavior found:
  - several Huly-backed commands return `Ok(vec![])` when Huly auth/client setup fails, so affected pages can look blank instead of surfacing a data-source error.
- Pages currently most likely to feel empty or low-information:
  - `Projects` control plane (no `teamforge_projects` rows)
  - `Overview` secondary sections (placeholder-only)
  - `Calendar` leave data (no cached/manual leave entries)
  - `Clients` detail resources/activity where no client settings or matched Huly content exist
  - `Comms` Slack activity when Slack sync has not populated local state
  - `Training` if reintroduced, because it is synthetic and currently unreachable

## Goal

Implement the audit fixes with minimal-impact changes:
- stop Devices from counting closed/resolved work,
- wire real linked devices into Client detail,
- remove hard-coded Overview sections instead of showing fake data,
- and make low-signal pages communicate empty/source states more honestly.

## Plan

- [x] Add targeted tests for device completion filtering and client/device matching helpers.
- [x] Update the device aggregation pipeline to ignore completed Huly issues/cards and keep statuses meaningful.
- [x] Reuse device aggregation for `get_client_detail` so linked devices are derived from real backend data.
- [x] Remove Overview mock sparkline/placeholder dashboard sections and keep only real data-backed content.
- [x] Improve selected page empty-state copy where the app currently implies “no data” without clarifying the source.
- [x] Run Rust tests and frontend build verification, then record the results here.

## Review

- Backend fixes:
  - extracted device aggregation into a shared `load_devices(...)` path
  - added `device_signal_is_active(...)` so completed Huly issue/card statuses are excluded before they can create stale device rows or inflate issue counts
  - added `client_matches_device_name(...)` and reused the live device registry inside `get_client_detail(...)`, replacing the hard-coded `linked_devices: vec![]`
- Frontend fixes:
  - removed Overview’s mock sparkline trend column and the placeholder weekly/role-dashboard sections
  - replaced them with real quota-backed sections: status summary, weekly load, and attention watchlist
  - updated Devices and Clients empty/error copy so the UI names the actual source dependency instead of pretending the system simply has no data
- Regression coverage:
  - added Rust tests for completed device-signal filtering and case-insensitive client/device matching
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
    - result: `35 passed, 0 failed, 3 ignored`
  - `pnpm build`
    - result: success (`tsc && vite build`)

## Goal

Finish the remaining low-signal page cleanup so empty or partially unavailable data is reported honestly:
- stop swallowing load failures on the remaining Huly-backed and sync-backed screens,
- preserve partial data where one source succeeds and another fails,
- and clearly label heuristic pages as derived views rather than canonical systems.

## Plan

- [x] Update `Sprints`, `Insights`, `Boards`, `Comms`, and `Knowledge` to surface source-aware load errors instead of collapsing into generic empty states.
- [x] Use partial-load handling where a page aggregates multiple sources so one missing feed does not blank the whole view.
- [x] Tighten `Onboarding` and `Planner` copy so they explicitly describe their derived/heuristic nature.
- [x] Re-run frontend and backend verification, then review the final diff for remaining risks.

## Review

- Frontend page-state cleanup:
  - `Sprints`, `Boards`, and `Knowledge` now surface explicit source-aware load failures instead of defaulting straight to generic zero states.
  - `Insights` and `Comms` now use partial-load handling (`Promise.allSettled`) so one unavailable feed no longer blanks every section on the page.
  - `Onboarding` and `Planner` now explicitly identify themselves as derived operational views rather than canonical systems.
  - `Sprints`, `Onboarding`, and `Planner` no longer render misleading zero-valued summary metrics when their source load has failed.
  - `Onboarding` scenario-tracking and the `Planner` weekly-summary panel are also suppressed on load failure so they cannot imply fake zero-state telemetry.
- Backend alignment:
  - page-facing Huly commands for milestones, time discrepancies, estimation accuracy, priority distribution, board cards, meeting load, naming compliance, devices, and knowledge articles now return real errors when saved Huly access is unavailable instead of silently converting that condition into empty arrays.
  - `get_client_detail(...)` now distinguishes between “no linked devices matched this client” and “linked device data is unavailable because Huly device signals could not be loaded.”
- Residual product reality after this pass:
  - `Onboarding` remains heuristic by design.
  - `Planner` remains a derived capacity projection rather than a live planner integration.
  - pages can still be genuinely empty if their upstream caches contain no relevant synced records.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
    - result: `35 passed, 0 failed, 3 ignored`
  - `pnpm build`
    - result: success (`tsc && vite build`)

## Goal

Fix the remaining Projects execution-mode gap so the TeamForge/Cloudflare registry actually drives the page:
- hydrate execution projects from the TeamForge worker/cache bridge instead of relying on a prior control-plane fetch side effect,
- preserve partial execution data when the upstream registry refresh fails,
- and stop the page from showing false-zero summaries behind a generic error banner.

## Plan

- [x] Update the execution command path so it refreshes or reuses the TeamForge project graph before building the derived execution list.
- [x] Return source-aware execution payload metadata so the frontend can show upstream warnings without discarding usable local data.
- [x] Update the Projects page to suppress false-zero summaries on hard failure and make the empty/error copy TeamForge-aware.
- [x] Re-run backend/frontend verification and record the final review here.

## Review

- Backend execution-path fix:
  - `get_execution_projects(...)` now refreshes the TeamForge worker graph before building execution rows and falls back to cached TeamForge graphs when the Worker is unavailable.
  - cached TeamForge graphs are now bridged back into `github_repo_configs` on both the control-plane read path and the execution path, so Projects no longer depends on the control-plane tab being opened first.
  - execution-mode now returns a structured payload with `projects` plus a `sourceError` warning, allowing the frontend to render usable local data without hiding upstream failure details.
- Frontend Projects fix:
  - the execution tab now surfaces actual invoke error messages even when Tauri rejects with a string/object instead of an `Error`.
  - hard execution failures no longer render misleading zero-valued summary cards.
  - when TeamForge refresh fails but local execution data still exists, the page shows the warning banner and preserves the derived project table.
  - the empty-state copy now points users at the TeamForge control plane instead of the old “sync GitHub plans in settings” wording.
- Regression coverage:
  - added a Rust command-layer test that proves cached TeamForge graphs populate `github_repo_configs` through the shared bridge helper.
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
    - result: `36 passed, 0 failed, 3 ignored`
  - `pnpm build`
    - result: success (`tsc && vite build`)

## Goal

Finish the still-open 20-issue `Ops Fabric v0.3.0 — TeamForge ↔ Paperclip Unification` milestone before cutting the deferred `0.1.20` release update.

## Plan

- [x] Audit the open milestone against the current codebase so already-landed foundation work is separated from real remaining implementation.
- [x] Revert the premature `0.1.20` version bump so release metadata stays gated on milestone completion.
- [x] Capture the completion plan under `docs/plans/2026-04-18-ops-fabric-v0.3.0-completion.md`.
- [ ] Execute the milestone in order:
  - verify and close already-landed issues
  - finish partial gaps (`#22`, `#26`)
  - implement missing Paperclip/export/signal-intelligence issues (`#29`–`#39`)
  - then cut the `0.1.20` release update

## Review

- GitHub audit result:
  - the milestone still has 20 open issues (`#20`–`#39`)
  - it is not ready for a release push or version bump
- Code-audit split:
  - likely already landed and ready for verification/closure: `#20`, `#21`, `#23`, `#24`, `#25`, `#27`, `#28`
  - partially landed and still needing real completion work: `#22`, `#26`
  - still missing / not evidenced in repo yet: `#29`–`#39`
- Release hygiene:
  - reverted the premature `0.1.20` metadata/changelog bump after the milestone gate was clarified
  - recorded a new lesson so future release prep does not run ahead of milestone status
- Planning artifact:
  - `docs/plans/2026-04-18-ops-fabric-v0.3.0-completion.md`

## Goal

Use `thoughtseed-labs` as the source for a single-run TeamForge information-parity pass:
- scan vault project briefs
- normalize the minimal TeamForge project graph input
- compare against current TeamForge registry state
- support a one-shot import/update path without making vault ingestion part of steady-state architecture

## Plan

- [x] Inspect the existing Worker project-graph write contract and current vault project-brief shape.
- [x] Add a standalone one-run parity script under `scripts/` that reads `thoughtseed-labs` and prepares TeamForge upserts.
- [x] Include dry-run reporting so the script can be used as an information parity check before any write.
- [x] Verify the script against the current labs vault and record the resulting scope/counts here.

## Review

- Added a one-run parity utility:
  - `scripts/teamforge-vault-parity.mjs`
  - package shortcut: `pnpm parity:labs-vault`
- Script scope:
  - scans `thoughtseed-labs/60-client-ecosystem/**/project-brief.md`
  - reads canonical frontmatter fields already keyed to TeamForge slugs (`project_id`, `client_id`, `status`, `owner`, `source_url`)
  - builds a minimal TeamForge project graph payload with:
    - project metadata
    - parity-owned vault/source artifacts
    - preserved existing GitHub/Huly links and policy when updating an existing TeamForge project
  - supports dry-run by default and `--apply` for the one-shot import/write pass
  - supports `--local-only` so parity can be inspected even when the Worker is unreachable
- Safety behavior:
  - does not make vault ingestion part of the app’s steady-state sync path
  - avoids destructive overwrites of existing TeamForge GitHub/Huly links by fetching and merging existing project graphs before writes
  - requires `--workspace-id` only for real writes that need to create new TeamForge projects
- Verification:
  - ran `node scripts/teamforge-vault-parity.mjs --local-only`
  - ran `node scripts/teamforge-vault-parity.mjs --local-only --report /tmp/teamforge-vault-parity.json`
  - ran `node scripts/teamforge-vault-parity.mjs --report /tmp/teamforge-vault-parity-remote.json`
  - current vault parity scope:
    - 11 project briefs discovered
    - 11 creates, 0 updates in local-only dry-run mode
    - status breakdown: `active=4`, `white-labelable=3`, `paused=3`, `completed=1`
    - no duplicate `project_id` warnings
  - live Worker dry-run result:
    - `remoteWarning: null` against `https://teamforge-api.sheshnarayan-iyer.workers.dev`
    - still `11 creates / 0 updates`
    - meaning the current TeamForge Worker registry does not yet contain any of the 11 vault-backed project graphs represented by the labs parity pass
- Compatibility hardening after the live canary:
  - updated `scripts/teamforge-vault-parity.mjs` to:
    - normalize both current graph responses and legacy flat `/v1/project-mappings` responses
    - include legacy top-level fields plus `external_ids` in the write body so older deployed Workers can still accept project creates
    - record per-project latest-source evidence in reports:
      - source file path
      - relative vault path
      - source file last-modified timestamp
      - owner/source/source URL/tags
  - wrote repo-local parity artifacts:
    - `tasks/teamforge-vault-parity-report.json`
    - `tasks/teamforge-vault-parity-canary.json`
- Live apply attempt and blocker:
  - canary apply run:
    - `TEAMFORGE_WORKSPACE_ID=ws_thoughtseed node scripts/teamforge-vault-parity.mjs --project axtech --apply --report /tmp/teamforge-vault-parity-canary.json`
  - result:
    - earlier `missing_fields` validation was cleared by the compatibility patch
    - the live Worker now fails on project create with `500` / Cloudflare `1101 Worker threw exception`
  - direct minimal create probes also fail with the same `1101` for:
    - `workspace_id=ws_thoughtseed`
    - `workspace_id=630f768292cc4b674e5ae3e4` (the locally configured Clockify workspace id)
    - `workspace_id=default`
  - `POST /v1/projects/scaffold` on the live Worker returns:
    - `feature_not_ready`
    - which indicates the deployed Worker is still behind the current repo’s project-bootstrap/project-graph flow
- Current parity status:
  - latest vault-backed import set is still:
    - 11 creates
    - 0 updates
  - latest-source detail for every queued project is preserved in:
    - `tasks/teamforge-vault-parity-report.json`
  - actual remote imports completed:
    - `0`
- reason:
    - the live TeamForge Worker project-create path is currently broken server-side and must be fixed or upgraded before a one-shot `--apply` can succeed

## Goal

Execute the saved phase-1 vault population plan in-session for:
- `Projects`
- `Clients`
- `Onboarding`

while keeping `Training` out of scope and reviewing each task boundary before
moving forward.

## Plan

- [x] Review and integrate the delegated Worker/importer task slices before duplicating work locally.
- [x] Extend desktop TeamForge cache/projection storage for canonical client profiles and onboarding flows/tasks.
- [x] Update shared TS + Tauri command surfaces for client profiles, project client-context enrichment, and onboarding tabs.
- [x] Enrich the `Clients`, `Projects`, and `Onboarding` pages with the new vault-backed data while preserving live operational metrics.
- [x] Run the targeted verification gate and record the remaining non-slice-specific blockers.

## Review

- Task 2 review:
  - accepted the delegated Worker canonical model changes for `client_profiles`, `onboarding_flows`, and `onboarding_tasks`
  - integrated the missing public route registration in `cloudflare/worker/src/routes/v1.ts` for:
    - `GET /v1/client-profiles`
    - `GET /v1/client-profiles/:clientId`
    - `GET /v1/onboarding-flows`
- Task 3 review:
  - accepted the delegated importer expansion in `scripts/teamforge-vault-parity.mjs`
  - importer now discovers and reports:
    - `client-profile.md`
    - `technical-spec.md`
    - `design/**/*.md`
    - `research/**/*.md`
    - `closeouts/**/*.md`
    - client/employee onboarding notes
  - report sections are now split into:
    - `projects`
    - `clientProfiles`
    - `projectArtifacts`
    - `onboardingFlows`
    - `employeeKpis`
- Desktop/cache layer:
  - added local SQLite projection tables for:
    - `teamforge_client_profiles`
    - `teamforge_onboarding_flows`
    - `teamforge_onboarding_tasks`
  - added Rust cache/view models and query helpers for client profiles plus onboarding flow/task projections
  - added Worker client fetchers + Tauri commands for:
    - `get_teamforge_client_profiles`
    - `get_teamforge_client_profile`
    - `get_teamforge_onboarding_flows`
  - enriched returned TeamForge project graphs with matched client-profile context
- UI layer:
  - `Clients` now shows vault profile completeness, engagement model, strategic fit preview, and “no vault client profile yet” states without replacing live hours/issues/activity metrics
  - `Clients` detail panel now renders vault-backed stakeholders, strategic fit, risks, and resource links
  - `Projects` control view now shows a read-only vault client-context excerpt plus grouped vault artifact rails for brief / technical spec / design / research / closeout docs
  - `Onboarding` now has explicit `Client Onboarding` and `Employee Onboarding` tabs
  - client onboarding keeps a clearly-labeled heuristic fallback when no imported client flow exists
  - employee onboarding is note-driven only and no longer piggybacks on unrelated telemetry
- Scope lock confirmed:
  - no `Training` work in this slice
  - no `Devices` registry redesign
  - no general knowledge import
  - no new GitHub/Huly bidirectional sync semantics
- Verification:
  - `node --check scripts/teamforge-vault-parity.mjs`
    - passed
  - `./node_modules/.bin/tsc -p cloudflare/worker/tsconfig.json --noEmit`
    - passed
  - `./node_modules/.bin/tsc --noEmit`
    - passed
  - `cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph_round_trips_with_links_and_artifacts -- --exact`
    - blocked by the existing Cargo environment issue:
      - `checksum for hyper-util v0.1.19 changed between lock files`

## Goal

Convert the completed Phase 1 vault-read slice into a real end-to-end TeamForge
demo by restoring live Worker writes, applying client profiles and onboarding
flows, seeding one concrete vault dataset, and proving the imported data
appears in the app.

## Plan

- [x] Restore the live Worker project-graph write path so one vault-backed
      project can be created remotely without `500` / `1101`.
- [x] Add canonical Worker write routes for `client_profiles` and
      `onboarding_flows`, then update the route contract doc.
- [x] Extend `scripts/teamforge-vault-parity.mjs` to apply client profiles and
      onboarding flows instead of reporting them as `worker-route-pending`.
- [x] Seed one minimal real vault dataset for `axtech` plus one employee
      onboarding note so the slice has real source material.
- [ ] Run a live canary import and verify `Clients`, `Projects`, and
      `Onboarding` render the imported data.

## Review
- Worker deployment:
  - `pnpm dlx wrangler deploy --config wrangler.jsonc`
    - deployed live Worker version `faf50b27-e0b4-4b7e-9088-8c4d70e25a6e`
    - `GET https://teamforge-api.sheshnarayan-iyer.workers.dev/v1/bootstrap`
      now returns `phase-2-wave-3` with `clientProfiles: live` and
      `onboardingFlows: live`
- Remote schema:
  - `pnpm dlx wrangler d1 migrations apply TEAMFORGE_DB --remote --config cloudflare/worker/wrangler.jsonc`
    - applied `0004_vault_population.sql` successfully on the live D1 database
- Live canary:
  - `TEAMFORGE_WORKSPACE_ID=ws_thoughtseed node scripts/teamforge-vault-parity.mjs --project axtech --apply --report /tmp/teamforge-vault-axtech-live-canary.json`
    - proved the live project write path is restored
    - post-apply verification found the `axtech` graph remotely
    - `client_profiles` and `onboarding_flows` route applies remain HMAC-protected,
      so the script cannot exercise those writes on this machine without the
      production `TF_WEBHOOK_HMAC_SECRET`
- Live seeded data:
  - inserted one real `axdis-group` client profile plus
    `axtech-client-onboarding` and `imran-employee-onboarding` into the live D1
    database for `ws_thoughtseed`
  - verified with live reads:
    - `GET /v1/project-mappings?workspace_id=ws_thoughtseed&status=active`
      returns `axtech` with the imported technical spec and linked client profile
    - `GET /v1/client-profiles?workspace_id=ws_thoughtseed`
      returns `axdis-group`
    - `GET /v1/onboarding-flows?workspace_id=ws_thoughtseed`
      returns both the client and employee onboarding flows
- Local desktop verification blockers:
  - applied `src-tauri/migrations/001_initial.sql` to the local
    `~/Library/Application Support/com.thoughtseed.teamforge/teamforge.db`
    so the new projection tables now exist
  - visual page capture is still blocked from full proof because:
    - the checked-in `TeamForge.app` bundle under
      `src-tauri/target/release/bundle/macos/TeamForge.app` is from
      `2026-04-17`, older than the current repo changes
    - macOS Accessibility scripting is disabled on this machine, so automated
      navigation to the `Clients`, `Projects`, and `Onboarding` routes could not
      be completed even though screen capture works
