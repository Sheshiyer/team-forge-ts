# Huly Sync Cadence Runbook

## Purpose

Document the runtime settings that control TeamForge background Huly polling so operators can tune issue, presence, and team-cache cadence without changing code.

## Canonical Settings

TeamForge background sync reads these SQLite settings keys:

- `huly_sync_issues_interval_seconds`
- `huly_sync_presence_interval_seconds`
- `huly_sync_team_cache_interval_seconds`

If a setting is absent or invalid, TeamForge falls back to the built-in default.

## Current Defaults

- Issues: `600` seconds
- Presence: `120` seconds
- Team cache: `3600` seconds

These defaults are defined in:

- [src-tauri/src/sync/scheduler.rs](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/src/sync/scheduler.rs)

## Operational Guidance

- Lower the issues interval when you need faster Huly issue activity reflection in `ops_events` and `agent_feed`.
- Lower the presence interval when near-real-time crew presence matters more than API volume.
- Lower the team-cache interval only when people/structure metadata changes frequently enough to justify the extra refresh cost.
- Keep the team-cache interval materially slower than presence polling unless there is a clear operational reason to do otherwise.

## Applying Changes

Operator flow:

1. Open TeamForge `Settings`.
2. Update the Huly cadence fields.
3. Save settings.
4. TeamForge restarts the background scheduler so the new windows apply immediately.

Programmatic flow:

1. Persist the three settings keys.
2. Call `start_background_sync`.

## Verification

- Confirm the settings were saved in `settings`.
- Confirm background sync restarted successfully.
- Confirm Huly sync timestamps in `sync_state` move at the expected cadence for:
  - `huly/issues`
  - `huly/presence`
  - `huly/team_cache`
