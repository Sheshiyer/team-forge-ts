# Phase 1 Baseline Contract

## Purpose

This document freezes the non-negotiable boundaries for the TeamForge Cloudflare backend and OTA program.

Phase 2 implementation must not drift from this baseline without an explicit contract update.

## Approved Service Boundary

### Cloudflare services in scope

- Worker
  - single public API entrypoint for the desktop app
  - internal callbacks for sync, release publication, and reconciliation
- D1
  - canonical shared relational persistence
- R2
  - OTA artifacts
  - signatures
  - exports
  - large sync snapshots when needed
- Queues
  - retryable vendor sync requests
  - deferred reconciliation work
- Workflows
  - long-running backfills
  - replay jobs
  - staged normalization orchestration
- Durable Objects
  - serialized coordination only
  - not the primary database

### Explicitly not the primary database

- Durable Objects
- R2
- local SQLite

## Desktop App Boundary

The Tauri app is allowed to own:

- local cache and offline continuity
- updater UX
- local analytics cache for recent views
- device-scoped state that is not canonical team state

The Tauri app is not allowed to remain the permanent owner of:

- shared Clockify, Huly, or Slack credentials
- shared project mapping state
- shared workspace normalization decisions
- OTA release publishing logic

## Canonical Ownership

| Concern | Canonical owner |
|---|---|
| workspace/project/people shared state | D1 |
| vendor credentials | Cloudflare secret management or encrypted D1 records |
| desktop cache | local SQLite |
| release artifacts | R2 |
| release selection | Worker |
| sync orchestration | Queues + Workflows |
| mutation locks | Durable Objects |

## Environment Model

### Environments

- `dev`
  - local or isolated Worker environment
  - disposable D1 database
  - disposable R2 path
- `staging`
  - production-like Worker
  - staging D1 and R2
  - canary OTA only
- `prod`
  - production Worker
  - production D1 and R2
  - stable and canary channels

### Promotion order

1. dev
2. staging
3. prod canary
4. prod stable

## Lock Zones

These files are serialized lock zones for implementation:

- [package.json](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/package.json)
- [src-tauri/Cargo.toml](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/Cargo.toml)
- [src-tauri/tauri.conf.json](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/tauri.conf.json)
- [src-tauri/src/lib.rs](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/src/lib.rs)
- release workflow files under `.github/workflows/` once added or modified

No parallel task should co-own a lock-zone file in the same wave.

## Approved Rollout Shape

### Phase 1

- contract freeze only
- no broad backend cutover
- no direct removal of local SQLite fallback

### Phase 2

- cloud data plane
- route plane
- async orchestration

### Phase 3

- OTA plumbing
- app integration
- central mapping ownership

### Phase 4

- migration
- canary rollout
- hardening

## Out Of Scope For Phase 1

- full user auth system
- multi-tenant credential vault at scale
- complete replacement of local SQLite
- complete Huly write-path ownership transfer
- non-macOS OTA rollout

## Contract Change Rule

If any of these must change, stop implementation and update the contract pack first:

- service ownership
- lock zones
- environment promotion model
- canonical owner of shared mappings
- offline fallback expectation
