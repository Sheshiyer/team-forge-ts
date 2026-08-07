# Hermes/Cambium Command Contract

> System of record: Cloudflare Worker command registry,
> `cloudflare/worker/src/lib/commands/registry.ts`.

## Scope

TeamForge is no longer an agent plane. The command surface is being retired into
three surviving systems:

- Hermes interprets founder intent and shapes command language.
- Cambium owns quest state, memory, gates, execution, and results.
- curios.self is the founder cockpit, Telegram bot, and Telegram mini app.

MultiCA is not an active execution authority. It is retained only as legacy
provenance and callback-drain compatibility until old records are archived.

## Active Route Vocabulary

| Route | Owner | Purpose | New registry specs |
|---|---|---|---|
| `hermes_bridge` | Hermes -> Cambium | Interpret founder-facing commands and bridge them into Cambium | yes |
| `cambium_operator` | Cambium | Execute quests, approvals, memory/status reads, and result acknowledgements | yes |
| `legacy_multica` | Legacy drain | Keep old MultiCA callback/drain tooling visible until removal | no |

`downstream_multica`, `multica_agent`, `multica_service`, and `aws_task_role`
are retired vocabulary. They must not appear in new command specs, UI copy, or
operator setup instructions.

## Command Spec Shape

Each command spec declares:

- `route`: one of the active Hermes/Cambium routes.
- `operator_lane`: the Hermes/Cambium lane that receives the work.
- `state_owner`: `cambium` for all active commands.

`operator_lane` replaces `multica_agent`. It names a capability lane, not a
personified agent assignment.

## Queue Semantics

`POST /v1/commands/intent` validates the founder command and writes a
`command_runs` row in `created`.

`GET /v1/commands/runs?state=created&route=hermes_bridge` returns work for the
Hermes bridge.

`GET /v1/commands/runs?state=created&route=cambium_operator` returns work for
Cambium.

`GET /v1/commands/runs?state=created&route=legacy_multica` is a compatibility
route. New command specs must not target it. Because historical rows do not
store route separately from `command_id`, exact old-route reconstruction needs a
separate migration or archive job if it becomes operationally necessary.

## Result Acknowledgement

The existing `POST /v1/commands/runs/:id/result` callback route remains
available while legacy MultiCA callbacks drain. It is not the final
Hermes/Cambium auth contract.

Target replacement:

- `X-Hermes-Signature` or an internal Cambium queue token replaces
  `X-MultiCA-Signature`.
- `HERMES_CALLBACK_SHARED_SECRET` or a Cambium-scoped token replaces
  `MULTICA_CALLBACK_SHARED_SECRET`.
- Replay protection, scoped auth, telemetry, and expiry are required before the
  legacy verifier is removed.

## curios.self Language

Founder-facing surfaces should use:

- Command
- Approval
- Quest
- Memory
- Result
- Blocked

Do not expose MultiCA, agent plane, downstream agent, or task-role language in
curios.self.

## Retirement Order

1. Move registry/type vocabulary to Hermes/Cambium.
2. Keep old callback verification as a flagged legacy drain.
3. Stop Cambium normal quest/story pushes from reading `~/.multica`.
4. Render old MultiCA evidence as `legacy_multica`.
5. Drain AWS MultiCA last.
