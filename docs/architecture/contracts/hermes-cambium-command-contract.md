# Hermes/Cambium Command Contract

> System of record: `cloudflare/worker/src/lib/commands/registry.ts` and the
> Hermes/Cambium production repositories. This document describes TeamForge's
> retirement boundary; it does not create a new queue consumer.

## Authority

- Hermes owns founder-facing command interpretation and result delivery.
- Cambium owns operator state, quests, gates, memory, execution, and results.
- curios.self owns founder/cofounder interaction.
- TeamForge retains only explicitly local Worker behavior and historical run reads.
- MultiCA is legacy provenance, not an active execution or rollback authority.

## TeamForge intake

`POST /v1/commands/intent` has two outcomes:

1. An ID in `COMMAND_REGISTRY` is authenticated, authorized, and executed by
   the declared local Worker route.
2. An ID in `RETIRED_COMMANDS` returns HTTP `410` with `command_retired`, the
   surviving owner, and replacement surface before D1 is accessed.

TeamForge must not enqueue Hermes/Cambium work until a separate integration has
round-trip consumer proof. Failing closed is safer than creating an apparently
successful run that no current consumer can acknowledge.

## Result and provisioning boundary

- `POST /v1/commands/runs/:id/result` is a credential-free `410` tombstone.
- No callback HMAC secret or external task identity exists in active Worker types.
- `GET /v1/member/provision` returns retained member/Paperclip data only.
- Historical callback envelopes may remain in archived docs; they cannot mutate D1.

## Resurrection prevention

Worker CI runs `pnpm check:retired-routing`. The guard scans tracked and
nonignored active code, configuration, tests, and current documentation,
including new planning files. Only immutable migrations, generated/binary
artifacts, archived contracts, and documents carrying an explicit historical
record marker are exempt so history remains auditable without becoming
authority.
