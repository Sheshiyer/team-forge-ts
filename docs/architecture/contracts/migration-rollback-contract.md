# Migration And Rollback Contract

## Purpose

This document freezes how TeamForge moves from the current local-first model to the Cloudflare-backed shared-state model without losing offline continuity.

## Migration Principles

- local SQLite remains available during the migration
- shared mappings move first
- credentials move server-side before shared ownership is considered complete
- OTA rollout follows backend and migration readiness, not the other way around

## Migration Stages

### Stage 1: shadow backend

- Worker and D1 exist
- app continues to read primarily from local SQLite
- backend mirrors canonical mapping and connection state

### Stage 2: shared mapping ownership

- project mappings move to D1
- employee external IDs move to D1
- local SQLite becomes a cache of shared mapping state

### Stage 3: server-managed connections

- desktop no longer owns raw vendor tokens as the intended workflow
- Settings reads connection health from Worker

### Stage 4: OTA and remote config

- updater plugin is live
- remote config can gate backend cutover
- staged canary rollout is available

### Stage 5: cache-mode desktop

- app reads from Worker when available
- local SQLite serves last-known state when offline

## Required Feature Flags

The backend cutover must be gateable with remote config flags such as:

- `cloud_bootstrap_enabled`
- `cloud_project_mappings_enabled`
- `cloud_connections_enabled`
- `ota_checks_enabled`
- `ota_canary_channel_enabled`

## Required Reconciliation Evidence

Before production cutover:

- local and D1 project mappings must be diffed
- local and D1 employee external IDs must be diffed
- connection health and workspace IDs must be verified
- at least one staging workspace migration must complete cleanly

## Rollback Triggers

Rollback is required if:

- mapping drift is detected during cutover
- startup bootstrap prevents app use
- offline fallback fails
- OTA canary installs fail materially
- server-managed connections break vendor sync

## Rollback Actions

### Backend cutover rollback

- disable cloud feature flags
- return app to local-cache-first behavior
- stop new shared mapping writes until reconciliation is complete

### OTA rollback

- set rollout percentage to `0` for the bad release
- point manifest selection back to the previous stable release
- preserve install telemetry for failure analysis

## Required Runbooks

Production cutover should not proceed without:

- staging migration runbook
- production rollback runbook
- OTA canary validation checklist
- reconciliation report template

## Contract Change Rule

If a migration step requires removing local fallback earlier than planned, update this contract before implementation proceeds.
