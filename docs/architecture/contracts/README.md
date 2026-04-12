# TeamForge Phase 1 Contract Pack

This folder contains the approved Phase 1 contract baseline for the Cloudflare backend and OTA program.

These documents freeze the design assumptions that must remain stable before Phase 2 implementation begins.

## Files

- [phase1-baseline.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/phase1-baseline.md)
  - system boundary
  - environment model
  - lock zones
  - rollout assumptions
- [secrets-auth-contract.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/secrets-auth-contract.md)
  - secret ownership
  - trust boundary
  - app-to-worker auth
  - worker-to-vendor auth
- [d1-schema-contract.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/d1-schema-contract.md)
  - canonical table inventory
  - ownership rules
  - source-of-truth rules
  - migration constraints
- [worker-route-contract.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/worker-route-contract.md)
  - public app routes
  - internal sync routes
  - response and error envelopes
  - async job rules
- [ota-updater-contract.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/ota-updater-contract.md)
  - Tauri updater touchpoints
  - artifact publishing contract
  - manifest shape
  - rollout channels
- [migration-rollback-contract.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/migration-rollback-contract.md)
  - local-first migration stages
  - cutover flags
  - reconciliation evidence
  - rollback triggers
- [ops-event-schema-contract.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/ops-event-schema-contract.md)
  - canonical `ops_event/v1` envelope
  - deterministic `sync_key` idempotency contract
  - source event-type mapping for TeamForge ↔ Paperclip
- [agent-feed-schema-contract.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/agent-feed-schema-contract.md)
  - curated `agent_feed/v1` projection schema
  - owner-hint derivation and polling indexes
  - incremental-lookback refresh strategy
- [agent-feed-export-contract.md](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/docs/architecture/contracts/agent-feed-export-contract.md)
  - TeamForge export command contract for Paperclip consumers
  - cursor/timestamp filter semantics and continuation rules
  - machine-parseable error envelope + lag metadata

## Phase 1 Done Standard

Phase 1 is complete only when:

- these contracts are stable enough for parallel implementation
- no unresolved lock-zone conflicts remain
- the migration path preserves offline fallback
- the OTA path is explicitly signed and rollback-capable
- vendor API tokens are no longer planned to reside on desktop clients
