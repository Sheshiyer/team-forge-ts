# TeamForge Cloudflare Project Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move TeamForge project identity, GitHub/Huly linkage, artifact registry, and sync policy ownership to the Cloudflare Worker + D1 backend so TeamForge becomes the canonical cross-system control plane.

**Architecture:** Extend the existing Worker `projects`, `project-mappings`, and `sync_jobs` surfaces into a canonical project graph API backed by D1. Keep asynchronous propagation behind `SYNC_QUEUE` and `WORKSPACE_LOCKS`, but do not ship live GitHub/Huly issue or milestone writeback until journal and lock semantics exist. The desktop app becomes a Worker client for project graph operations and mirrors remote state into local SQLite only as cache/offline projection.

**Tech Stack:** Cloudflare Workers, D1, Queues, Durable Objects, Wrangler, Rust/Tauri, React/TypeScript

---

## Scope Lock

### In scope for this slice

- canonical TeamForge project metadata in D1
- explicit GitHub repo links
- explicit Huly project links
- artifact registry records for PRDs/contracts/process/docs
- project-level sync policy and issue ownership policy
- Worker CRUD routes for project graph reads/writes
- desktop Worker-first read/write path with local cache fallback for reads
- sync job and lock scaffolding for later issue/milestone propagation

### Explicitly out of scope for this slice

- live GitHub issue writeback
- live Huly issue writeback
- milestone propagation jobs
- conflict inbox UI
- issue promotion/conversion workflows
- Huly components/templates sync
- generic “sync anything to anything” framework

### Architectural rules that must hold

- Cloudflare Worker + D1 is canonical
- local SQLite is projection/cache only
- GitHub engineering issues remain GitHub-owned
- Huly execution/admin issues remain Huly-owned
- milestones remain GitHub-authoritative by default
- no direct GitHub <-> Huly sync path is allowed outside TeamForge

---

### Task 1: Freeze contracts for the Cloudflare control-plane shape

**Files:**
- Modify: `docs/architecture/contracts/d1-schema-contract.md`
- Modify: `docs/architecture/contracts/worker-route-contract.md`
- Modify: `cloudflare/worker/README.md`
- Modify: `cloudflare/worker/fixtures/v1/projects.json`
- Modify: `cloudflare/worker/fixtures/v1/project-mappings.json`

**Step 1: Update the D1 schema contract before code**

Add the new canonical project-control-plane area:

- `projects` gains:
  - `slug`
  - `portfolio_name`
  - `client_name`
  - `visibility`
  - `sync_mode`
- new tables:
  - `project_github_links`
  - `project_huly_links`
  - `project_artifacts`
  - `project_sync_policies`

**Step 2: Clarify route semantics**

Freeze these route responsibilities:

- `GET /v1/projects`
  - project summary rows only
  - counts, health, ownership summary, sync status
- `GET /v1/project-mappings`
  - full graph payload for operator-facing editing
- `PUT /v1/projects/:projectId`
  - metadata-only updates
- `PUT /v1/project-mappings/:projectId`
  - graph + links + artifacts + policy upsert

**Step 3: Update fixture payloads**

`cloudflare/worker/fixtures/v1/projects.json` should model summary rows like:

```json
{
  "ok": true,
  "data": {
    "projects": [
      {
        "id": "proj_parkarea",
        "workspaceId": "ws_thoughtseed",
        "slug": "parkarea-phase-2",
        "name": "ParkArea Phase 2 - Germany Launch",
        "portfolioName": "Thoughtseed Client Delivery",
        "clientName": "ParkArea",
        "status": "active",
        "syncMode": "hybrid",
        "visibility": "workspace",
        "githubRepoCount": 1,
        "hulyLinkCount": 1,
        "artifactCount": 3,
        "issueOwnershipMode": "split",
        "milestoneAuthority": "github",
        "syncHealth": "healthy"
      }
    ]
  }
}
```

`cloudflare/worker/fixtures/v1/project-mappings.json` should model a full graph payload like:

```json
{
  "ok": true,
  "data": {
    "projects": [
      {
        "project": {
          "id": "proj_parkarea",
          "workspaceId": "ws_thoughtseed",
          "slug": "parkarea-phase-2",
          "name": "ParkArea Phase 2 - Germany Launch",
          "portfolioName": "Thoughtseed Client Delivery",
          "clientName": "ParkArea",
          "projectType": "client_delivery",
          "status": "active",
          "syncMode": "hybrid",
          "visibility": "workspace"
        },
        "githubLinks": [
          {
            "repo": "Sheshiyer/parkarea-aleph",
            "repoRole": "primary",
            "syncIssues": true,
            "syncMilestones": true,
            "syncLabels": true
          }
        ],
        "hulyLinks": [
          {
            "hulyProjectId": "PARKAREA_PHASE_2",
            "syncIssues": true,
            "syncMilestones": true,
            "syncComponents": false,
            "syncTemplates": false
          }
        ],
        "artifacts": [
          {
            "artifactType": "prd",
            "title": "Germany launch PRD",
            "url": "https://example.com/prd",
            "source": "notion",
            "isPrimary": true
          }
        ],
        "policy": {
          "issueOwnershipMode": "split",
          "engineeringSource": "github",
          "executionSource": "huly",
          "milestoneAuthority": "github",
          "issueClassificationMode": "hybrid",
          "directionMode": "review_gate",
          "ruleConfig": {}
        }
      }
    ]
  }
}
```

**Step 4: Verify the docs are internally consistent**

Run:

```bash
rg -n "project_github_links|project_huly_links|project_sync_policies|/v1/project-mappings" docs/architecture/contracts cloudflare/worker/README.md cloudflare/worker/fixtures/v1
```

Expected:

- every new table and route meaning appears in exactly one contract-oriented description
- fixture names and route names match the contract wording

---

### Task 2: Add the D1 migration for canonical project graph storage

**Files:**
- Create: `cloudflare/worker/migrations/0002_project_control_plane.sql`
- Modify: `cloudflare/worker/migrations/0001_initial.sql` only if a bootstrap comment needs cross-reference notes

**Step 1: Write the additive migration**

Use additive SQL only. The migration should:

```sql
ALTER TABLE projects ADD COLUMN slug TEXT;
ALTER TABLE projects ADD COLUMN portfolio_name TEXT;
ALTER TABLE projects ADD COLUMN client_name TEXT;
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE projects ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'manual';
```

Add specific link/policy tables:

```sql
CREATE TABLE project_github_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  repo_role TEXT NOT NULL DEFAULT 'primary',
  display_name TEXT,
  sync_issues INTEGER NOT NULL DEFAULT 1,
  sync_milestones INTEGER NOT NULL DEFAULT 1,
  sync_labels INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (project_id, repo_owner, repo_name)
);
```

```sql
CREATE TABLE project_huly_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  huly_project_id TEXT NOT NULL,
  sync_issues INTEGER NOT NULL DEFAULT 1,
  sync_milestones INTEGER NOT NULL DEFAULT 1,
  sync_components INTEGER NOT NULL DEFAULT 0,
  sync_templates INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (project_id, huly_project_id)
);
```

```sql
CREATE TABLE project_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

```sql
CREATE TABLE project_sync_policies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  issues_enabled INTEGER NOT NULL DEFAULT 1,
  milestones_enabled INTEGER NOT NULL DEFAULT 1,
  components_enabled INTEGER NOT NULL DEFAULT 0,
  templates_enabled INTEGER NOT NULL DEFAULT 0,
  issue_ownership_mode TEXT NOT NULL DEFAULT 'split',
  engineering_source TEXT NOT NULL DEFAULT 'github',
  execution_source TEXT NOT NULL DEFAULT 'huly',
  milestone_authority TEXT NOT NULL DEFAULT 'github',
  issue_classification_mode TEXT NOT NULL DEFAULT 'hybrid',
  direction_mode TEXT NOT NULL DEFAULT 'review_gate',
  rule_config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

**Step 2: Add indexes that match the expected query shapes**

At minimum:

- `idx_projects_workspace_slug`
- `idx_project_github_links_project_id`
- `idx_project_huly_links_project_id`
- `idx_project_artifacts_project_id`
- `idx_project_sync_policies_workspace_id`

**Step 3: Apply the migration locally**

Run:

```bash
pnpm --dir cloudflare/worker run d1:migrate:local
```

Expected:

- Wrangler applies `0002_project_control_plane.sql` without destructive warnings

**Step 4: Re-run type verification after migration work**

Run:

```bash
pnpm --dir cloudflare/worker run check
```

Expected:

- TypeScript still type-checks after introducing the new schema-oriented code references

---

### Task 3: Introduce a Worker repository layer for the project graph

**Files:**
- Create: `cloudflare/worker/src/lib/project-registry.ts`
- Modify: `cloudflare/worker/src/lib/db.ts`
- Modify: `cloudflare/worker/src/routes/projects.ts`

**Step 1: Stop keeping project-graph SQL inside route handlers**

Create `cloudflare/worker/src/lib/project-registry.ts` with:

- DTOs:
  - `ProjectSummary`
  - `ProjectGraph`
  - `ProjectGraphInput`
  - `ProjectSyncPolicy`
- repository functions:
  - `listProjectSummaries(db, workspaceId, status?)`
  - `listProjectGraphs(db, workspaceId, status?)`
  - `getProjectGraph(db, projectId)`
  - `upsertProjectMetadata(db, projectId, input)`
  - `replaceProjectGithubLinks(db, projectId, workspaceId, links)`
  - `replaceProjectHulyLinks(db, projectId, workspaceId, links)`
  - `replaceProjectArtifacts(db, projectId, workspaceId, artifacts)`
  - `upsertProjectSyncPolicy(db, projectId, workspaceId, policy)`

**Step 2: Add one transactional graph write path**

The repository must expose one graph mutation boundary:

```ts
await upsertProjectGraph(db, projectId, input)
```

That function should:

- upsert `projects`
- replace GitHub links
- replace Huly links
- replace artifacts
- upsert sync policy
- return the assembled graph

**Step 3: Extend DB helpers only where needed**

If the repository needs batched placeholder handling or transaction helpers, add small generic helpers to `cloudflare/worker/src/lib/db.ts` instead of reimplementing statement plumbing in each repository function.

**Step 4: Verify repository extraction**

Run:

```bash
pnpm --dir cloudflare/worker run check
```

Expected:

- `routes/projects.ts` no longer owns raw graph-assembly SQL
- route code compiles against the repository DTOs

---

### Task 4: Expand the public project routes without changing the URL contract

**Files:**
- Modify: `cloudflare/worker/src/routes/projects.ts`
- Modify: `cloudflare/worker/src/routes/v1.ts`
- Modify: `cloudflare/worker/fixtures/v1/projects.json`
- Modify: `cloudflare/worker/fixtures/v1/project-mappings.json`

**Step 1: Make `/v1/projects` a summary endpoint**

`GET /v1/projects` should return:

- project identity fields
- repo/Huly/artifact counts
- policy summary fields
- sync health summary

`PUT /v1/projects/:projectId` should accept metadata-only changes:

- `name`
- `slug`
- `portfolioName`
- `clientName`
- `projectType`
- `status`
- `syncMode`
- `visibility`

**Step 2: Make `/v1/project-mappings` the full graph endpoint**

`GET /v1/project-mappings` should return:

- full project graph rows
- links
- artifacts
- policy

`PUT /v1/project-mappings/:projectId` should accept one request body like:

```json
{
  "workspaceId": "ws_thoughtseed",
  "project": {
    "name": "ParkArea Phase 2 - Germany Launch",
    "slug": "parkarea-phase-2",
    "portfolioName": "Thoughtseed Client Delivery",
    "clientName": "ParkArea",
    "projectType": "client_delivery",
    "status": "active",
    "syncMode": "hybrid",
    "visibility": "workspace"
  },
  "githubLinks": [],
  "hulyLinks": [],
  "artifacts": [],
  "policy": {}
}
```

**Step 3: Preserve backward compatibility for the existing desktop bridge**

Until the desktop UI is updated, the route layer may continue to tolerate legacy shapes:

- repo lists without split owner/name fields
- missing `policy`
- missing `artifacts`

But the response should always normalize into the new canonical graph shape.

**Step 4: Verify the route layer**

Run:

```bash
pnpm --dir cloudflare/worker run check
```

Expected:

- `handleGetProjects` and `handlePutProject` compile cleanly
- `handleV1Request` still exposes the same public paths
- fixtures describe the actual new response shape

---

### Task 5: Prepare sync orchestration for GitHub/Huly project control-plane work

**Files:**
- Modify: `cloudflare/worker/src/lib/env.ts`
- Modify: `cloudflare/worker/src/routes/sync.ts`
- Modify: `cloudflare/worker/src/index.ts`

**Step 1: Extend sync source/job typing**

`SyncJobMessage` and `handlePostSyncJob()` must recognize `github` in addition to:

- `clockify`
- `huly`
- `slack`

Allowed job types for this slice should include at least:

- `project_graph.reconcile`
- `project_graph.pull.github`
- `project_graph.pull.huly`

**Step 2: Turn the lock Durable Object from placeholder into a minimal mutex API**

`WorkspaceLock` should support internal requests like:

- `POST /acquire`
- `POST /release`

Body shape:

```json
{
  "key": "workspace:ws_thoughtseed:project:proj_parkarea",
  "owner": "sync_job_123",
  "ttlMs": 30000
}
```

The first implementation can stay minimal:

- in-memory lock record
- one active owner per key
- expiry timestamp

This is not the final lock system, but it is enough to prevent building later propagation on a fake stub.

**Step 3: Do not yet implement live queue consumers**

The queue surface should be prepared, not overbuilt:

- accept jobs
- persist them to `sync_jobs`
- preserve `payload_json`
- keep later worker-consumer logic for the next slice

**Step 4: Verify the orchestration scaffolding**

Run:

```bash
pnpm --dir cloudflare/worker run check
```

Expected:

- `github` is now a valid sync source for control-plane work
- the Durable Object class is no longer “scaffolded only”

---

### Task 6: Switch the desktop project registry commands to Worker-first reads and writes

**Files:**
- Create: `src-tauri/src/sync/teamforge_worker.rs`
- Modify: `src-tauri/src/sync/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/db/queries.rs`
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useInvoke.ts`

**Step 1: Extract a dedicated Worker client for project graph endpoints**

Create `src-tauri/src/sync/teamforge_worker.rs` with functions like:

- `fetch_teamforge_project_graphs(pool) -> Result<Vec<TeamforgeProjectGraph>, String>`
- `save_teamforge_project_graph(pool, input) -> Result<TeamforgeProjectGraph, String>`

This client should reuse the existing worker config pattern already used by `sync_cloud_credentials_for_pool()`:

- `cloud_credentials_base_url`
- `cloud_credentials_access_token`

Prefer reusing the same base URL and bearer token contract instead of inventing a second auth path.

**Step 2: Make reads Worker-first and cache-backed**

`get_teamforge_projects` should:

1. fetch from Worker
2. write the returned graph into local SQLite cache tables
3. return the remote graph

If the Worker fetch fails:

1. load the last cached project graph from local SQLite
2. return cached data if present
3. otherwise surface a structured error

**Step 3: Make writes remote-canonical**

`save_teamforge_project` should:

1. send the graph to `PUT /v1/project-mappings/:projectId`
2. only update local SQLite after a successful Worker response
3. return the normalized remote graph

Important rule:

- do **not** silently persist a local-only “success” when the Worker write fails

If the Worker is unavailable, return a clear write failure and keep cached data untouched.

**Step 4: Keep the local SQLite tables but demote their role**

Reuse the existing local project-graph tables as:

- read-through cache
- offline snapshot
- projection for pages that still depend on local queries

Do not treat them as the source of truth anymore.

**Step 5: Verify the bridge**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml teamforge_project_graph
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Expected:

- targeted project-graph tests pass
- full Rust suite remains green
- frontend build still type-checks against the graph types

---

### Task 7: Add execution notes and post-slice verification evidence

**Files:**
- Modify: `tasks/todo.md`
- Modify: `cloudflare/worker/README.md`
- Optionally modify after implementation: `CHANGELOG.md`

**Step 1: Record what shipped in the slice review**

The review section should explicitly confirm:

- D1 owns canonical project graph state
- desktop reads from Worker and caches locally
- local cache no longer claims canonical ownership
- GitHub is prepared as a sync source
- lock scaffolding exists for future serialized sync

**Step 2: Record what still remains**

Call out remaining work as follow-up slices:

- sync journal rows for issue/milestone propagation attempts
- conflict detection records
- operator conflict inbox UI
- issue classification override UI
- actual GitHub/Huly propagation workers

**Step 3: Final verification checklist**

Run:

```bash
pnpm --dir cloudflare/worker run check
pnpm --dir cloudflare/worker run d1:migrate:local
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Expected:

- Worker code type-checks
- local D1 migration applies
- Rust suite is green
- frontend build is green

---

## References

- Cloudflare Workers best practices: `https://developers.cloudflare.com/workers/best-practices/workers-best-practices/`
- Cloudflare D1 overview: `https://developers.cloudflare.com/d1/`
- Cloudflare Queues overview: `https://developers.cloudflare.com/queues/`
- Cloudflare Durable Objects overview: `https://developers.cloudflare.com/durable-objects/`
- Cloudflare Durable Objects rules: `https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/`

## Execution Choice

Plan complete and saved to `docs/plans/2026-04-17-cloudflare-project-backend-implementation.md`.

Two execution options:

**1. Subagent-Driven (this session)** - implement the Worker/D1 slice task-by-task here, with review between tasks.

**2. Parallel Session (separate)** - execute the plan in a fresh session focused only on the Cloudflare backend slice.
