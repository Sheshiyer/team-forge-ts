# Vault Ingestion Contract

## Purpose

This document freezes the phase-1 contract for importing structured Thoughtseed
vault metadata into TeamForge.

Phase 1 scope is intentionally narrow:

- `Projects`
- `Clients`
- `Onboarding`

Out of scope for this contract:

- `Training`
- `Devices` registry redesign
- general knowledge-base import
- bidirectional GitHub/Huly sync behavior changes

## Canonical Architecture

- The Thoughtseed vault is the authoring surface for structured metadata notes.
- Cloudflare Worker + D1 is the canonical TeamForge store for imported vault
  records.
- Desktop SQLite is a projection/cache only.
- Clockify, Huly, and GitHub remain the system of record for operational
  telemetry.

## Supported Note Families

### `project-brief`

Primary source for canonical project identity and high-level context.

Expected storage impact:

- upsert canonical project graph
- attach one primary `vault-project-brief` artifact to the project

### `client-profile`

Primary source for structured client metadata.

Expected storage impact:

- upsert one canonical client profile per `client_id`
- merge onto TeamForge `Clients` and `Projects` read surfaces

### `client-onboarding-flow`

Primary source for client onboarding.

Expected storage impact:

- upsert one onboarding flow per `flow_id`
- persist ordered task rows under the same flow
- render under the `Client Onboarding` tab

### `employee-onboarding-flow`

Primary source for employee onboarding.

Expected storage impact:

- upsert one onboarding flow per `flow_id`
- persist ordered task rows under the same flow
- render under the `Employee Onboarding` tab

## `client-profile` Contract

### Required frontmatter

```yaml
client_id: string
client_name: string
engagement_model: project | retainer | consultation | research
active: boolean
```

### Optional frontmatter

```yaml
industry: string
primary_contact: string
onboarded: YYYY-MM-DD
project_ids: [string]
stakeholders: [string]
strategic_fit: [string]
risks: [string]
resource_links: [string]
tags: [string]
```

### Body expectations

The markdown body may contain richer narrative sections, but phase 1 should not
depend on prose parsing for required UI fields. Required TeamForge rendering
must come from frontmatter-backed structured fields first.

## Onboarding Flow Contract

### Shared rules

Both onboarding note families must expose these top-level fields:

```yaml
flow_id: string
status: draft | in_progress | completed | stalled
owner: string
starts_on: YYYY-MM-DD
audience: client | employee
workspace_id: string
```

Each flow must also expose an ordered task list with:

```yaml
tasks:
  - task_id: string
    title: string
    completed: boolean
    completed_at: YYYY-MM-DD
    resource_created: string
    notes: string
```

### `client-onboarding-flow` required fields

```yaml
flow_id: string
audience: client
client_id: string
project_ids: [string]
primary_contact: string
workspace_ready: boolean
```

### `employee-onboarding-flow` required fields

```yaml
flow_id: string
audience: employee
member_id: string
manager: string
department: string
joined_on: YYYY-MM-DD
```

## Project Artifact Contract

Phase 1 keeps using the existing `project_artifacts` store and expands only the
allowed imported artifact types:

- `vault-project-brief`
- `vault-technical-spec`
- `vault-design-doc`
- `vault-research-doc`
- `vault-closeout-doc`

Each imported artifact must preserve:

- `project_id`
- `workspace_id`
- `artifact_type`
- `title`
- `url`
- `source`
- `external_id` when available
- `is_primary`
- vault-relative provenance in the import layer

## TeamForge Surface Mapping

### Projects

Vault-backed inputs:

- `project-brief`
- `technical-spec`
- `design` docs
- `research` docs
- `closeout` docs
- related `client-profile`

UI expectations:

- artifact grouping by type
- read-only client context excerpt
- no change to sync policy / conflict / journal behavior

### Clients

Vault-backed inputs:

- `client-profile`
- related project artifact counts/links

Operational fields that remain live:

- billable hours
- active projects
- GitHub issue counts
- recent activity
- linked devices

### Onboarding

Vault-backed inputs:

- `client-onboarding-flow`
- `employee-onboarding-flow`

UI expectations:

- explicit `Client Onboarding` and `Employee Onboarding` tabs
- ordered task rendering from imported tasks
- no synthesized employee onboarding from telemetry
- client fallback heuristics allowed only when no imported client flow exists

## Validation Rules

- Missing required IDs fail closed and do not import.
- `audience` must match the note family.
- `project_ids`, `client_id`, and `member_id` must use TeamForge slugs/handles
  already accepted by the canonical registry.
- Required UI fields must not rely on best-effort prose extraction when a
  structured frontmatter field exists in the contract.
