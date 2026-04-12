# Agent Feed Export Contract (`exportAgentFeedSnapshot`)

## Purpose

Define the stable TeamForge command/API boundary that Paperclip uses to pull feed snapshots without coupling to internal SQLite schema.

## Command Surface

- Tauri command: `export_agent_feed_snapshot`
- Request payload:
  - `sinceCursor` (optional): `"<detected_at>|<sync_key>"`
  - `sinceTimestamp` (optional): RFC3339 or ISO datetime
  - `limit` (optional): `1..5000` (default `500`)
- Response payload:
  - `schemaVersion`: currently `agent_feed/v1`
  - `generatedAt`: snapshot generation timestamp
  - `sinceCursor` / `sinceTimestamp`: echoed request filters
  - `nextCursor`: cursor to continue incremental polling
  - `hasMore`: indicates additional rows beyond current page
  - `lag`: source/projection lag metadata
  - `items`: projected feed rows

## Cursor Semantics

- Cursor is monotonic over `(detected_at, sync_key)` ordering.
- Incremental polling query:
  - rows where `detected_at > cursor.detected_at`
  - or `detected_at == cursor.detected_at` and `sync_key > cursor.sync_key`
- Consumers should persist `nextCursor` and replay safely (rows remain idempotent by `sync_key`).

## Error Envelope

Command errors are machine-parseable JSON strings:

```json
{
  "code": "invalid_cursor",
  "message": "Cursor must be encoded as '<detected_at_rfc3339>|<sync_key>'"
}
```

Known error codes:

- `invalid_cursor`
- `invalid_since_timestamp`
- `query_failed`
- `lag_metadata_failed`

## Source Lag Metadata

`lag` includes:

- `projectionLagSeconds`: delay since `agent_feed` projection last refresh
- `maxSourceLagSeconds`: worst lag across core upstream syncs
- `sources[]`: per-source/entity lag entries (`clockify`, `huly`, `slack`, `agent_feed`)

## Example Response

```json
{
  "schemaVersion": "agent_feed/v1",
  "generatedAt": "2026-04-12T22:20:09Z",
  "sinceCursor": "2026-04-12T22:00:00Z|ops:v1:...",
  "sinceTimestamp": null,
  "nextCursor": "2026-04-12T22:19:47Z|ops:v1:slack:slack.message.posted:...",
  "hasMore": false,
  "lag": {
    "projectionLagSeconds": 42,
    "maxSourceLagSeconds": 125,
    "sources": [
      {
        "source": "clockify",
        "entity": "time_entries",
        "lastSyncAt": "2026-04-12T22:18:30",
        "lagSeconds": 99
      }
    ]
  },
  "items": [
    {
      "syncKey": "ops:v1:huly:huly.issue.modified:huly_issue:issue_123:...",
      "source": "huly",
      "eventType": "huly.issue.modified",
      "severity": "info",
      "ownerHint": "Feed Owner"
    }
  ]
}
```
