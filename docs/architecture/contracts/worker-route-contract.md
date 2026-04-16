# Worker Route Contract

## Purpose

This document freezes the public and internal HTTP contract for the TeamForge Worker.

## General Rules

- all public routes are versioned under `/v1`
- all public routes require app auth
- all internal routes require service authentication or queue/workflow origin validation
- heavy vendor sync work runs asynchronously unless an operator-scoped project control-plane action intentionally runs one project sync pass inline under a project lock

## Response Envelope

### Success

```json
{
  "ok": true,
  "data": {}
}
```

### Error

```json
{
  "ok": false,
  "error": {
    "code": "string_code",
    "message": "Human-readable message",
    "retryable": false
  }
}
```

## Public App Routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/v1/bootstrap` | app bootstrap payload |
| `GET` | `/v1/remote-config` | feature flags and rollout config |
| `GET` | `/v1/projects` | canonical projects |
| `PUT` | `/v1/projects/:projectId` | update project metadata |
| `GET` | `/v1/project-mappings` | read mapping state |
| `PUT` | `/v1/project-mappings/:projectId` | upsert mapping |
| `GET` | `/v1/project-mappings/:projectId/control-plane` | read operator control-plane detail |
| `POST` | `/v1/project-mappings/:projectId/actions` | run operator control-plane action |
| `POST` | `/v1/connections/:source/test` | server-side connection test |
| `GET` | `/v1/connections` | connection health |
| `POST` | `/v1/sync/jobs` | enqueue sync |
| `GET` | `/v1/sync/jobs/:jobId` | read job status |
| `GET` | `/v1/sync/runs` | recent sync runs |
| `GET` | `/v1/team/snapshot` | cached team snapshot |
| `POST` | `/v1/team/refresh` | enqueue snapshot refresh |
| `POST` | `/v1/huly/normalization/preview` | preview normalization |
| `POST` | `/v1/huly/normalization/apply` | apply normalization |
| `GET` | `/v1/ota/check` | Tauri updater manifest route |
| `POST` | `/v1/ota/install-events` | update install telemetry |

## Internal Routes

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/internal/sync/clockify` | queue or workflow callback |
| `POST` | `/internal/sync/huly` | queue or workflow callback |
| `POST` | `/internal/sync/slack` | queue or workflow callback |
| `POST` | `/internal/reconcile/projects` | reconciliation job entrypoint |
| `POST` | `/internal/releases/publish` | release publication callback |

## Async Rules

### Enqueue routes

Routes that start heavy work should:

- write a `sync_jobs` row
- enqueue queue or workflow work
- return a `job_id`

### Status routes

Status routes should report:

- current state
- last error
- stats when available
- timestamps

## Project Route Rules

### `GET /v1/projects`

This route returns project summary rows, not the full editable graph.

Each row should be shaped for list and health views and may include:

- canonical project identity
- `githubRepoCount`
- `hulyLinkCount`
- `artifactCount`
- `issueOwnershipMode`
- `milestoneAuthority`
- `syncHealth`

### `PUT /v1/projects/:projectId`

This route updates metadata only.

Expected metadata fields:

- `name`
- `slug`
- `portfolioName`
- `clientName`
- `projectType`
- `status`
- `syncMode`
- `visibility`

It should not be the primary route for replacing link records or artifact graphs.

### `GET /v1/project-mappings`

This route returns the full canonical project graph for operator-facing editing.

Each graph payload should include:

- `project`
- `githubLinks`
- `hulyLinks`
- `artifacts`
- `policy`

### `PUT /v1/project-mappings/:projectId`

This route is the graph upsert boundary.

It should accept and normalize:

- project metadata
- GitHub links
- Huly links
- project artifacts
- project sync policy

### `GET /v1/project-mappings/:projectId/control-plane`

This route returns the operator-facing control-plane detail for one project.

The payload should include:

- `project`
- `policy`
- `policyState`
- `entityMappings`
- `conflicts`
- `journal`
- `summary`

### `POST /v1/project-mappings/:projectId/actions`

This route accepts explicit operator actions for one project control plane.

Supported actions must cover:

- `pause`
- `resume`
- `retry`
- `sync_now`
- `set_classification`
- `resolve_conflict`

The route should return the refreshed control-plane detail after the action completes.

## Project Policy Rules

The canonical project policy payload must be able to express:

- `issueOwnershipMode`
- `engineeringSource`
- `executionSource`
- `milestoneAuthority`
- `issueClassificationMode`
- `directionMode`
- `ruleConfig`

Runtime project policy state must also be able to express:

- `syncState`
- `lastSyncAt`
- `lastSyncStatus`
- `lastSyncJobId`
- `pausedAt`
- `pausedBy`
- `lastErrorCode`
- `lastErrorMessage`

The default architecture contract is:

- engineering issues are GitHub-owned
- execution/admin issues are Huly-owned
- milestones are GitHub-authoritative
- issue classification is hybrid rule-based plus manual override

## Sync Mapping Rules

Canonical sync state must persist:

- entity mappings between TeamForge, GitHub, and Huly records
- durable manual classification overrides
- conflict rows for drift or review-needed propagation failures
- journal rows for sync actions, failures, retries, and operator interventions

## Huly Normalization Rules

- preview is always dry-run
- apply is always serialized per workspace
- apply requires audit logging
- apply requires an operator-level permission boundary when auth matures

## Connection Test Rules

### Required behavior

- Clockify test validates API access and workspace discovery
- Slack test validates bot token and required scopes
- Huly test validates not just authentication but capability surfaces used by TeamForge

### Huly capability checks must cover

- account access
- tracker access
- calendar access
- chat/message access
- HR class availability or an explicit degraded-mode result

## Payload Fixture Rule

Before implementation drifts, sample payload fixtures should be captured for:

- bootstrap
- remote config
- projects
- mappings
- sync job status
- OTA manifest

## Contract Change Rule

If any public route path or response shape changes, update this contract before implementation continues.
