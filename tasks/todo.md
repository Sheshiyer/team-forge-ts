# Task Plan

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
