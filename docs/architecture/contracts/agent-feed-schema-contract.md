# Agent Feed Schema Contract (`agent_feed/v1`)

## Purpose

Define the curated TeamForge projection consumed by Paperclip so downstream polling does not need to join multiple raw activity tables.

## Canonical Projection

TeamForge materializes `agent_feed` with one row per canonical ops event (`sync_key` unique):

- `id` INTEGER PK AUTOINCREMENT
- `sync_key` TEXT UNIQUE NOT NULL
- `schema_version` TEXT NOT NULL
- `source` TEXT NOT NULL
- `event_type` TEXT NOT NULL
- `entity_type` TEXT NOT NULL
- `entity_id` TEXT NOT NULL
- `occurred_at` TEXT NOT NULL
- `detected_at` TEXT NOT NULL
- `severity` TEXT NOT NULL
- `owner_hint` TEXT NULL
- `actor_employee_id` TEXT NULL
- `actor_clockify_user_id` TEXT NULL
- `actor_huly_person_id` TEXT NULL
- `actor_slack_user_id` TEXT NULL
- `payload_json` TEXT NOT NULL
- `metadata_json` TEXT NULL
- `refreshed_at` TEXT NOT NULL

## Owner Hint Rule

`owner_hint` is derived in this priority order:

1. employee display name from `actor_employee_id`
2. `slack:<actor_slack_user_id>`
3. `huly:<actor_huly_person_id>`
4. `clockify:<actor_clockify_user_id>`
5. null if no actor identity exists

## Refresh Strategy

- Projection refresh runs in TeamForge as `incremental-lookback`:
  - read last projection sync timestamp from `sync_state(source='agent_feed', entity='projection')`
  - reprocess a rolling 7-day lookback window
  - upsert by `sync_key` for idempotent rebuild semantics
- This strategy supports:
  - late-arriving source events
  - corrected identity mappings
  - deterministic replay without duplicate feed rows

## Query Performance Baseline

The table includes polling-oriented indexes:

- `idx_agent_feed_occurred_at` on `occurred_at DESC`
- `idx_agent_feed_severity_occurred` on `(severity, occurred_at DESC)`
- `idx_agent_feed_owner_occurred` on `(owner_hint, occurred_at DESC)`

Paperclip consumers should poll by recency and optionally severity/owner hints to keep query cost bounded.

## Consumer Rules (Paperclip)

- Deduplicate on `sync_key`.
- Treat `payload_json` as immutable source payload.
- Use `metadata_json.projection == "agent_feed/v1"` to validate projection version.
- For alerts/tasks, prioritize `owner_hint`, `severity`, and `event_type`.
