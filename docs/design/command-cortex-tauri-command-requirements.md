# Command Cortex Tauri Command Requirements

Phase 3 only stubs founder commands in the UI. It does not introduce new Tauri commands, capabilities, or permission scopes.

## Current Safe Commands

These UI commands are display-only stubs:

- `Trace Signal`
- `Summon Agent`
- `Stabilize Branch`
- `Approve Synapse`
- `Escalate Human`
- `Split Pathway`
- `Extract Memory`
- `Route Work`
- `Generate Brief`
- `Quarantine Risk`

## Future Backend/Tauri Requirements

Before any command mutates state, create a dedicated security-reviewed task for the matching Tauri command and capability.

| UI command | Likely backend action | Security note |
|---|---|---|
| Trace Signal | Read entity relations, activity, source traces | Read-only; can use existing relation/activity APIs where possible |
| Summon Agent | Create Paperclip task/escalation or queue item | Mutating; validate node ID and target agent in Rust/backend |
| Stabilize Branch | Generate or route stabilization plan | Mutating if persisted; require explicit confirmation |
| Approve Synapse | Resolve Paperclip approval or review gate | Mutating; require task ID and approval payload validation |
| Escalate Human | Create escalation or notification | Mutating; validate recipient and severity |
| Split Pathway | Create child issue/project/workstream | Mutating; highest risk, needs explicit confirmation |
| Extract Memory | Read vault/knowledge context | Read path scope must remain narrow |
| Route Work | Route intake or issue ownership | Mutating; must preserve audit trail |
| Generate Brief | Synthesize existing context | Read-only unless saved |
| Quarantine Risk | Change issue/project risk state | Mutating; require rollback path |

## Tauri Guardrails

- Keep Tauri v2 default-deny permissions.
- Prefer reusing existing commands before adding new Rust IPC.
- Validate every command argument in Rust/backend.
- Treat new filesystem, network, shell, or sidecar scopes as security changes.
- Do not allow Command Cortex visual components to call `invoke` directly; route through page-level adapters.
