# TeamForge Function Retirement Map

Date: 2026-06-20
Status: current extraction and retirement source of truth

## Decision

TeamForge is no longer an agent execution plane. Its surviving capabilities
move into Hermes, Cambium, or the curios.self founder surface. MultiCA is not a
fourth active plane and must not receive new commands, credentials, callbacks,
health requirements, or provisioning metadata.

## Ownership map

| TeamForge capability | Surviving owner | Disposition |
|---|---|---|
| Founder command language | Hermes | Interpret and deliver Telegram commands |
| Quest, memory, gate, and result state | Cambium | Own durable operator state and execution |
| Founder/cofounder management UI | curios.self | Read-heavy panels and Telegram-signed gated writes |
| TeamForge command run history | TeamForge/Cambium migration | Preserve as read-only history; do not treat as a queue |
| TeamForge desktop management UI | None | Archive after extraction proof |
| External agent callback and provisioning | None | Retire credentials and mutation authority |

## Command disposition

| Legacy TeamForge command | Current owner/surface | TeamForge intake behavior |
|---|---|---|
| `ts-standup` | Hermes `/ts-standup`, backed by Cambium routine evidence | `410 command_retired`; no run created |
| `ts-summon-agent` | Cambium quest and operator intake | `410 command_retired`; no run created |
| `ts-approve-synapse` | Cambium gate queue | `410 command_retired`; no run created |
| `ts-generate-brief` | Hermes synthesis over Cambium evidence | `410 command_retired`; no run created |
| `ts-trace-signal` | Cambium-owned retained Worker read path | Active `local_worker` run |

The retired route names, agent-assignment fields, service actor, and AWS task
callback identity are historical vocabulary only. They may remain in immutable
migrations and archived contracts, but never in active source or configuration.

## Target flow

```text
founder/cofounder
  -> Hermes interprets command
  -> Cambium decides, gates, persists, and executes
  -> Hermes delivers audit/result
  -> curios.self renders Cambium state
```

There is no MultiCA step in the target flow.

## Retirement acceptance

- Retired command IDs fail before D1 run creation.
- The former external result callback cannot authenticate or mutate state.
- Member provisioning returns no retired endpoint or workspace bundle.
- Current docs name Hermes and Cambium as the only command owners.
- CI rejects retired execution vocabulary in active code and configuration.
- Historical docs and immutable migrations remain readable.
