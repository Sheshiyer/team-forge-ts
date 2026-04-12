# Ops Event Schema Contract (`ops_event/v1`)

## Purpose

Define the canonical event envelope shared between TeamForge and Paperclip so ingestion, routing, and task creation remain idempotent across Clockify, Huly, and Slack.

## Canonical Version

- `schema_version`: `ops_event/v1`
- Owned by TeamForge runtime.
- Consumers (Paperclip and downstream agents) must treat unknown versions as incompatible and skip safely.

## SQLite Canonical Table

TeamForge persists the contract in `ops_events`:

- `id` INTEGER PK AUTOINCREMENT
- `sync_key` TEXT UNIQUE NOT NULL
- `schema_version` TEXT NOT NULL
- `source` TEXT NOT NULL
- `event_type` TEXT NOT NULL
- `entity_type` TEXT NOT NULL
- `entity_id` TEXT NOT NULL
- `actor_employee_id` TEXT NULL
- `actor_clockify_user_id` TEXT NULL
- `actor_huly_person_id` TEXT NULL
- `actor_slack_user_id` TEXT NULL
- `occurred_at` TEXT NOT NULL (RFC3339 UTC preferred)
- `severity` TEXT NOT NULL (`info` default in v1)
- `payload_json` TEXT NOT NULL (source-native event payload)
- `detected_at` TEXT NOT NULL

## Deterministic `sync_key` Contract

- Built by TeamForge function:
  - [src-tauri/src/ops/mod.rs](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/src/ops/mod.rs)
- Canonical input segments in order:
  - `source`
  - `event_type`
  - `entity_type`
  - `entity_id`
  - `actor_employee_id`
  - `actor_clockify_user_id`
  - `actor_huly_person_id`
  - `actor_slack_user_id`
  - `occurred_at`
- Output shape:
  - `ops:v1:<normalized segments joined by ':'>`
- Normalization rule:
  - trim + lowercase
  - allow `[a-z0-9-_.]`
  - all other chars become `_`
  - empty optional segment becomes `na`

This is the idempotency key for downstream task creation and alerting.

## v1 Event Types Emitted Today

- `clockify.time_entry.logged` (`entity_type=clockify_time_entry`)
- `huly.issue.modified` (`entity_type=huly_issue`)

Slack and additional signal classes are additive and must preserve `ops_event/v1` envelope compatibility.

## Consumer Rules (Paperclip)

- Deduplicate on `sync_key`.
- Trust `schema_version` before field interpretation.
- Preserve raw `payload_json` in feed artifacts.
- Route by `event_type`, `severity`, and actor fields (if available).

## Example

```json
{
  "sync_key": "ops:v1:huly:huly.issue.modified:huly_issue:issue_123:emp_1:na:person_44:na:2026_04_12t17_20_00z",
  "schema_version": "ops_event/v1",
  "source": "huly",
  "event_type": "huly.issue.modified",
  "entity_type": "huly_issue",
  "entity_id": "issue_123",
  "actor_employee_id": "emp_1",
  "actor_huly_person_id": "person_44",
  "occurred_at": "2026-04-12T17:20:00Z",
  "severity": "info",
  "payload_json": "{\"identifier\":\"TS-99\",\"title\":\"Fix sync\"}"
}
```
