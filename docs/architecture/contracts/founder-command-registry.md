# Founder Command Registry Contract

> System of record: `cloudflare/worker/src/lib/commands/registry.ts`. See
> `hermes-cambium-command-contract.md` for the retirement boundary.

## Vocabulary

All command IDs use the `ts-` prefix. `COMMAND_REGISTRY` contains only commands
that this Worker can currently accept without an external executor.
`RETIRED_COMMANDS` recognizes command IDs that moved to Hermes or Cambium so
callers receive a typed replacement instead of creating an orphaned run.

## Current command disposition

| Command ID | TeamForge status | Owner | Result |
|---|---|---|---|
| `ts-trace-signal` | active | Cambium | local Worker run, immediately `accepted` |
| `ts-standup` | retired | Hermes | HTTP `410`; use Hermes `/ts-standup` |
| `ts-summon-agent` | retired | Cambium | HTTP `410`; use quest/operator intake |
| `ts-approve-synapse` | retired | Cambium | HTTP `410`; use the gate queue |
| `ts-generate-brief` | retired | Hermes | HTTP `410`; use Hermes synthesis |

Retired IDs are intentionally absent from `COMMAND_REGISTRY`. They cannot be
selected by the run-reader route filter and cannot create `command_runs` rows.

## Active state machine

```text
created -> accepted -> in_progress -> succeeded | failed | partial | cancelled
```

The retained local command performs `created -> accepted` during intake. Run
history remains readable through authenticated `GET /v1/commands/runs/:id` and
`GET /v1/commands/runs?state=...&route=local_worker` requests.

## Authentication and attribution

Authority is derived by the server, never from body claims:

- registered Access admin -> `founder`
- registered Access employee -> `employee`
- valid internal Hermes/parity credential -> delegated `founder`
- generic app bearer -> `403 command_identity_required`

The body retains actor fields for wire compatibility, but a mismatch with the
authenticated principal returns `403` and no run is created.

## Error taxonomy

| Code | HTTP | Cause |
|---|---|---|
| `bad_json` | 400 | Body is not JSON |
| `invalid_intent` | 400 | Missing or invalid intent field |
| `unknown_command` | 400 | ID is neither active nor recognized as retired |
| `forbidden` | 403 | Authenticated actor lacks command authority |
| `command_identity_required` | 403 | Generic app bearer has no founder command identity |
| `command_retired` | 410 | Command moved to Hermes or Cambium; no run created |
| `callback_retired` | 410 | External result mutation path is permanently closed |
| `not_found` | 404 | Run ID has no matching row |
| `database_unavailable` | 503 | D1 binding missing for an active command |

## Historical boundary

Immutable migration values and archived callback contracts document how old
runs were stored. They do not authorize current actors, routes, callbacks, or
provisioning. CI scans active code/config to enforce that distinction.
