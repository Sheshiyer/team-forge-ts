# D1 Schema Contract

## Purpose

This document freezes the canonical shared schema TeamForge will own in D1.

## Schema Principles

- D1 stores canonical shared team state.
- local SQLite remains a cache and fallback read model.
- source-specific IDs are not stored inline as the only identifier when a stable TeamForge record can exist.
- all cross-system mappings must be explicit.

## Canonical Tables

### Organization and workspace

- `organizations`
- `workspaces`
- `devices`

### People and projects

- `employees`
- `employee_external_ids`
- `projects`
- `project_external_ids`
- `project_github_links`
- `project_huly_links`
- `project_artifacts`
- `project_sync_policies`

### Integrations and sync

- `integration_connections`
- `integration_credentials`
- `sync_cursors`
- `sync_jobs`
- `sync_runs`
- `workspace_normalization_actions`

### Transitional operational tables

- `manual_leave_entries`
- `manual_holidays`

### Release and control plane

- `remote_config`
- `ota_channels`
- `ota_releases`
- `ota_install_events`
- `audit_events`

## Source Of Truth Rules

### D1 is canonical for

- shared project metadata
- canonical TeamForge project identity and project graph state
- GitHub repo linkage and Huly project linkage
- project artifact registry records
- project-level sync policy and ownership policy
- shared employee identity mapping
- shared upstream connection metadata
- sync history
- rollout metadata
- audit events

### local SQLite remains canonical temporarily for

- existing cache-first page rendering during migration
- old machine-local data not yet imported

### D1 must become canonical first for

- project mapping state
- project sync policy state
- employee external ID mapping
- connection health metadata

## ID Rules

- primary keys are opaque TeamForge IDs
- source-specific IDs belong in mapping tables
- uniqueness must be enforced on `(source, external_id)` where applicable

## Migration Rules

- migrations must be additive first
- destructive schema changes require explicit migration docs and rollback notes
- D1 migrations must support empty bootstrap and staged import of current local data

## Query Rules

- Worker handlers should use a repository or service layer
- raw SQL should not be duplicated across route handlers
- route handlers should not contain schema-shaping logic
- project graph read/write logic should be assembled in one repository boundary, not spread across `/v1/projects` and `/v1/project-mappings`

## Project Control Plane Rules

### `projects` table role

`projects` is the canonical TeamForge project identity table.

It may include:

- `slug`
- `portfolio_name`
- `client_name`
- `visibility`
- `sync_mode`

It should not inline all linked GitHub or Huly state.

### Link table roles

- `project_github_links` stores explicit repo mappings and repo-level sync flags
- `project_huly_links` stores explicit Huly project mappings and Huly-side sync flags
- `project_artifacts` stores PRD, contract, process, design, legal, and implementation links
- `project_sync_policies` stores per-project sync rules and issue/milestone authority settings

### Ownership policy rules

Project sync policy must be able to express:

- issue ownership mode
- engineering source
- execution source
- milestone authority
- issue classification mode
- direction mode

The canonical defaults for this architecture are:

- issue ownership mode: `split`
- engineering source: `github`
- execution source: `huly`
- milestone authority: `github`
- issue classification mode: `hybrid`

## Transitional Data Rules

`manual_leave_entries` and `manual_holidays` exist to support the current TeamForge operational gap while Huly write ownership remains unsettled.

They should be treated as:

- transitional writeback-owned state
- auditable and exportable
- replaceable later by Huly-owned or Worker-owned canonical workflows

## Explicit Non-Goals

This schema contract does not require:

- moving every analytical cache table to D1 immediately
- deleting local SQLite tables during the first migration
- replicating every vendor object one-to-one

## Contract Change Rule

If implementation needs a new canonical area, add it here before introducing migrations.
