# Task Plan

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
