# Changelog

All notable changes to TeamForge are documented in this file.

## v0.1.2 - 2026-04-08

This release packages the full set of unreleased TeamForge work since the published GitHub release `v0.1.0`, including the earlier local-only `0.1.1` preview cut.

### Added

- Slack connection settings with explicit Bot User OAuth token handling, optional channel filters, and a dedicated connection test flow.
- Slack-backed chat activity enrichment in the Communications dashboard so Slack and Huly motion can be read together.
- Drag-and-drop org chart mapping in the Team page with crew cards, bento department tiles, role drop zones, and an unassigned tray.
- Repo-native rollout documents for Huly system design, phased rollout planning, and workspace normalization runbooks.

### Changed

- Slack scope failures now surface the exact missing scope Slack reports instead of a generic permissions error.
- Ignored Clockify email settings now propagate into org chart retrieval so admin/service accounts do not appear in roster mapping.
- README now documents the Slack setup flow, the dynamic Team workflow, and the current rollout artifacts.
- Release metadata has been aligned to `0.1.2` across the frontend package, sidecar package, Tauri config, and Rust crate.

### Verification

- `cargo test --manifest-path src-tauri/Cargo.toml`
- `pnpm build`
- `pnpm tauri build --bundles app`

## v0.1.0 - 2026-04-06

- Initial public TeamForge release with the LCARS shell, Clockify dashboards, Huly integration, tray actions, and macOS packaging baseline.
