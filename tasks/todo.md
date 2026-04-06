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
