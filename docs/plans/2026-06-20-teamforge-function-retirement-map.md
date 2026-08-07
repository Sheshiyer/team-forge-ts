# TeamForge Function Retirement Map

Date: 2026-06-20
Status: source-of-truth draft for wind-down
Scope: retire TeamForge as a desktop management project, extract surviving functions into Cambium and the curios.self Telegram surface.

## Decision

TeamForge is no longer a product surface. It is now an extraction source.

The target operating system has only three active top-level surfaces:

| Surface | Future role |
|---|---|
| Hermes | The communications and command agent. Telegram in/out, command interpretation, founder-safe summaries, audit messages. |
| Cambium | The operator brain. Wake loop, quest ledger, memory, gates, skill forge, tenant worlds, management state. |
| curios.self bot and mini app | The founder/cofounder management UI. Read-heavy panels, gated writes, Telegram-signed actions. |

MultiCA as an agent plane is retired from the target architecture. Any current `MultiCA` behavior must be re-owned by Hermes or Cambium, or archived. Do not add new work that depends on MultiCA agents, MultiCA issue assignment, `multica_agent`, `multica_service`, `aws_task_role`, or `downstream_multica`.

## Non-Negotiables

- Extract capabilities before deleting code.
- The Tauri desktop UI does not receive new management features.
- The Telegram mini app becomes the management surface, not a mirror of the desktop UI.
- Cambium owns operator state. Hermes owns communication. curios.self owns founder interaction.
- MultiCA is not a fourth active plane.
- No fake progress: every mini app card must derive from a real ledger, run, event, or gate queue entry.
- Writes stay gated: Telegram initData validation, founder allowlist, queue, audit, result acknowledgement.

## Function-By-Function Map

| TeamForge function | Current source | Extract into | Future owner | curios.self surface | Retirement disposition |
|---|---|---|---|---|---|
| Project and tenant identity | `projects`, `project_mappings`, TeamForge slug rules | Cambium tenant registry and quest/project evidence | Cambium | Tenant/project selector, project detail sheet | Preserve data model, retire desktop editor |
| Client profiles | `client_profiles`, `Clients` page | Cambium project evidence and client context | Cambium | Client/project detail sheet | Preserve as read model; only add writes if gated |
| `/ts-*` command vocabulary | `COMMAND_REGISTRY`, Hermes plugin docs | Hermes command registry plus Cambium command metadata | Hermes | Commands panel | Preserve vocabulary; remove MultiCA route fields |
| Command run records | `command_runs`, `command_audit_events` | Cambium command ledger or migrated TeamForge D1 table | Cambium | Run status sheet and activity feed | Preserve state machine; rename downstream owner |
| Command dispatch | `downstream_multica`, `teamforge-consumer`, callback route | Hermes -> Cambium wake loop -> result ack | Hermes + Cambium | Actions queue, "running/done/failed" statuses | Retire MultiCA dispatch path |
| Result callback | `POST /v1/commands/runs/:id/result`, `X-MultiCA-Signature` | Hermes/Cambium result acknowledgement | Cambium | Run terminal state | Replace MultiCA HMAC naming and actor identity |
| Audit events | command audit rows and result events | Cambium event log and story beats | Cambium | Story and Activity scenes | Preserve taxonomy, simplify actors |
| Handoffs | `handoffs`, `/ts-handoffs`, approve/reject flows | Cambium gate queue and Hermes audit messages | Cambium + Hermes | Gate tab: approve, reject, reroll | First gated write to port |
| Agent roster | TeamForge `Agents`, Paperclip operating profiles | Hermes/Cambium operator roster | Cambium | Agents sheet | Collapse agent plane to Hermes-led roles |
| Goals | `Goals` page, Paperclip `TASKS.md` editing | Cambium quest/skill forge records | Cambium | Quest or Skill panels | Preserve intent, retire file-editor UI |
| Routines | `Routines` page, Paperclip `MANIFEST.yaml` routines | Cambium skill forge and scheduled operator routines | Cambium | Skills/Routines sheet | Preserve routine definitions, retire desktop editor |
| Issues | `Issues` page, GitHub/Huly issue views | Cambium project evidence and gated action intents | Cambium | Work detail sheet | Preserve read model; actions go through gate |
| Inbox/intake | `Inbox`, Hermes raw-message normalization | Hermes intake -> Cambium event/gate queue | Hermes + Cambium | Inbox/Gate sheet | Preserve parser, retire desktop triage UI |
| Team snapshot | `team/snapshot`, Huly/Clockify/Slack sync | Cambium evidence adapters, optional story beats | Cambium | Status sheet | Preserve only if it informs decisions |
| Timesheet and quotas | Clockify-backed pages and commands | Optional evidence adapter | Cambium | Status detail only | Defer; do not make it a top-level mini app tab |
| Calendar/leave/holidays | local TeamForge calendar management | Optional ops evidence | Cambium | Hidden detail if needed | Archive unless still used operationally |
| Comms | Slack/Hermes logs | Hermes-owned communication health | Hermes | Status and Story scenes | Preserve Hermes health; retire Slack dashboard shape |
| Knowledge/skills | `Knowledge` page and skill records | Cambium skill forge | Cambium | Skills panel | Preserve skill telemetry and amendments |
| Activity feed | TeamForge activity and sync journal | Cambium story beats | Cambium | Story scene | Preserve as prose beats, not admin logs |
| Settings and credentials | Tauri settings + Worker credentials routes | Env/runbook managed config, minimal status checks | Hermes + Cambium | Health sheet only | Retire settings UI; keep runbooks |
| OTA/updater | Tauri release and updater flow | None | None | None | Delete after archive; no desktop app remains |
| Realtime/co-working rooms | TeamForge realtime routes and UI | Out of scope unless reused by Plexus | None for this migration | None | Archive, do not port by default |
| Agent feed export | `/v1/agent-feed/export`, TeamForge hypha | Cambium-native project/story emitter | Cambium | Story and Status scenes | Keep temporarily as migration bridge |
| Vault parity | `teamforge-vault-parity.mjs` | Cambium project evidence refresh | Cambium | Project evidence freshness | Preserve concepts, move execution into Cambium |
| Normalization/backfills | Huly/Clockify normalization routes | Maintenance scripts or evidence adapters | Cambium | No direct UI | Archive UI, keep scripts if still needed |
| Mission Cortex UI | `MissionCortexPage`, command membrane | curios.self command and status sheets | curios.self | Commands, Gate, Story | Preserve command ideas, retire visual shell |

## MultiCA Retirement Map

The existing code and docs contain a real MultiCA spine. It must be retired deliberately, not ignored.

| Current MultiCA coupling | Future replacement | Required action |
|---|---|---|
| `CommandRoute = "downstream_multica"` | `hermes_bridge` or `cambium_operator` route | Rename route type and update registry/tests. |
| `multica_agent` on each command | `hermes_handler` or `operator_lane` | Replace agent assignment with Hermes/Cambium routing metadata. |
| `ActorKind = "multica_service"` | `hermes_service` or `cambium_operator` | Remove/tombstone MultiCA actor kind after migration. |
| `AuthMode = "aws_task_role"` | Telegram founder auth, Hermes local auth, or Cambium internal token | Remove AWS-task callback semantics. |
| `CommandStateOwner = "multica"` | `cambium` | Make Cambium the durable result owner. |
| `MULTICA_CALLBACK_SHARED_SECRET` | `HERMES_CALLBACK_SHARED_SECRET` or Cambium internal queue token | Rename only when callback path is implemented. |
| `X-MultiCA-Signature` | `X-Hermes-Signature` or internal queue ack | Retire in API contract docs. |
| `docs/architecture/contracts/multica-execution-contract.md` | `hermes-cambium-command-contract.md` | Archive old contract after replacement doc lands. |
| `bin/quine/hyphae/multica.ts` in Cambium | Hermes/Cambium activity emitter | Replace story/feed source with non-MultiCA evidence. |
| MultiCA health/status cards | Hermes/Cambium health | Remove MultiCA from status calculations. |
| `multica issue assign` | Hermes dispatch to Cambium wake loop | No future command should shell or call MultiCA. |

## Target Command Flow

```text
Founder/cofounder opens curios.self
  -> Telegram initData proves founder identity
  -> mini app reads Cambium ledger/status/story
  -> founder taps gated action or types /ts-* command
  -> Hermes receives/interprets the command
  -> Cambium wake loop decides, gates, persists, and executes
  -> Hermes posts audit/result back to Telegram
  -> Cambium refreshes the ledger
  -> curios.self shows the new state
```

There is no MultiCA step in the target flow.

## Extraction Sequence

### Phase A: Freeze and label

- Freeze TeamForge desktop feature work.
- Add archive labels to docs that still present TeamForge as the active UI.
- Add deprecation notes to MultiCA contracts.
- Keep existing Worker routes operational until replacement paths pass.

### Phase B: Port read models

- Move project/client/handoff/agent/status read models into Cambium-derived envelopes.
- Replace `teamforgeActivityBeats` with Cambium-native project and Hermes activity beats.
- Remove MultiCA-derived status from quest and command panels.

### Phase C: Port gated writes

- Port handoff approve/reject/reroll first.
- Port `ts-status`, `ts-projects`, `ts-handoffs`, and `ts-agent` as read-heavy mini app sheets.
- Port `ts-run` only after Hermes/Cambium queue execution is live.

### Phase D: Replace command runtime

- Rename command routes away from `downstream_multica`.
- Replace callback naming and auth semantics.
- Remove MultiCA actor/auth/state owner enums from the active command contract.
- Archive `multica-execution-contract.md`.

### Phase E: Archive TeamForge

- Archive Tauri UI, updater, screenshots, and desktop release machinery.
- Preserve Worker migrations and scripts as historical extraction references.
- Keep a final `ARCHIVE.md` explaining what moved where.

## Acceptance Criteria

- A reader can see exactly where each TeamForge function goes.
- No future owner is named `MultiCA`.
- Hermes, Cambium, and curios.self are the only active top-level surfaces.
- The map distinguishes preserve, port, archive, and delete decisions.
- The map names concrete code/contracts that must change in the implementation wave.
- No secrets or live credential values appear in this document.

## Immediate Next Implementation Checklist

- [x] Create the replacement `hermes-cambium-command-contract.md`.
- [x] Update `COMMAND_REGISTRY` away from `downstream_multica` and `multica_agent`.
- [x] Update command tests to expect Hermes/Cambium routing metadata.
- [ ] Replace Cambium `multica` hypha usage in quest/story generation.
- [ ] Update curios.self Commands panel to read the new command metadata.
- [x] Add a deprecation banner to the old MultiCA execution contract.
- [ ] Add TeamForge desktop archive notice after parity is confirmed.
