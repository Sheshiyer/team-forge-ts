# TeamForge Cloudflare Project Sync Design

**Goal:** Make TeamForge the canonical Cloudflare-backed control plane for projects that span GitHub and Huly, with bidirectional sync, explicit manual controls, and safe fallback behavior.

**Status:** Architecture/design plan

---

## 1. What This Needs To Solve

The current system is too repo-centric. The real operational need is:

- one TeamForge project may map to one or more GitHub repos
- one TeamForge project may map to one Huly project
- GitHub already contains issue and milestone planning for many projects
- Huly already contains execution structure such as issues, milestones, components, and templates
- users need some manual control over what syncs, how conflicts are handled, and when propagation happens
- some projects may live outside the personal `Sheshiyer/*` namespace
- TeamForge must represent the whole Thoughtseed portfolio, not just one GitHub account

The system of record should therefore be TeamForge itself, not GitHub and not Huly.

---

## 2. Canonical Ownership Model

### Source of truth

TeamForge on Cloudflare Worker + D1 is the canonical owner of:

- project identity
- project-to-GitHub mappings
- project-to-Huly mappings
- project artifacts such as PRDs, contracts, process docs, legal docs, and templates
- sync state
- conflict state
- retry state
- manual overrides

### Connected systems

- GitHub remains the engineering planning and code system
- Huly remains the project execution and workspace system
- Local desktop SQLite becomes a cache/offline projection only

### Core principle

Changes do not sync directly GitHub -> Huly or Huly -> GitHub.

All sync passes through TeamForge:

- GitHub -> TeamForge -> Huly
- Huly -> TeamForge -> GitHub

This prevents sync loops and allows TeamForge to enforce rules, locks, and conflict handling.

---

## 3. Project Model

Each TeamForge project should contain:

- `id`
- `workspace_id`
- `slug`
- `name`
- `portfolio_name`
- `client_name`
- `project_type`
- `status`
- `sync_mode`
- `visibility`

### Linked GitHub records

- many `github_repos`
- optional repo role:
  - `primary`
  - `supporting`
  - `legal`
  - `ops`
- sync flags per repo:
  - `sync_issues`
  - `sync_milestones`
  - `sync_labels`

### Linked Huly records

- one or more `huly_project_links`
- sync flags:
  - `sync_issues`
  - `sync_milestones`
  - `sync_components`
  - `sync_templates`

### Linked artifacts

- `artifact_type`
  - `prd`
  - `contract`
  - `process`
  - `legal`
  - `implementation`
  - `design`
- `title`
- `url`
- `source`
- `external_id`
- `is_primary`

---

## 4. Syncable Entities

Not every entity should be treated the same.

### Phase 1 sync targets

- Issues
- Milestones

These are the safest high-value shared planning artifacts.

### Issue ownership rule

Issues use a **split ownership model**:

- GitHub owns **engineering issues**
- Huly owns **execution/admin issues**

This means TeamForge must classify or map issue domains explicitly instead of treating all issues as one shared bucket.

### Issue classification policy

Issue classification uses a **hybrid model**:

- rule-based default classification
- explicit manual override in TeamForge

This avoids forcing operators to classify every issue by hand while still allowing correction when repo conventions or labels are imperfect.

### Rule-based default signals

TeamForge should support classification rules based on:

- linked repo role
- labels
- milestone membership
- project-level sync policy
- issue templates or prefixes

Examples:

- issues in engineering repos default to `engineering`
- issues labeled `engineering`, `backend`, `frontend`, `infra`, or similar default to GitHub-owned engineering scope
- issues labeled `ops`, `admin`, `client`, `delivery`, `legal`, or similar default to Huly-owned execution/admin scope

### Manual override behavior

Operators must be able to:

- mark an issue as `engineering`
- mark an issue as `execution_admin`
- convert an issue from one domain to the other
- see why TeamForge chose the default classification

Overrides should be durable and must win over rule evaluation until explicitly cleared.

### Engineering issue flow

- GitHub -> TeamForge -> Huly

GitHub is the canonical authoring surface for:

- engineering backlog
- technical implementation tasks
- code-linked work
- developer-facing issue decomposition

Huly can receive these issues for visibility or execution context, but GitHub remains the upstream authority for the issue record.

### Execution/admin issue flow

- Huly -> TeamForge

Huly is the canonical authoring surface for:

- project coordination
- operational follow-ups
- client/account/admin work
- non-code execution tasks

These should not be auto-created back into GitHub unless an operator explicitly promotes them into engineering scope.

### Milestone authority rule

Milestones are **GitHub-preferred** and should propagate:

- GitHub -> TeamForge
- TeamForge -> Huly

They should **not** be treated as fully bidirectional by default.

This means:

- GitHub is the canonical authoring surface for milestone identity and milestone updates
- TeamForge stores the canonical mapped state and propagation status
- Huly receives milestone updates as a downstream execution view
- Huly milestone edits should not silently push back into GitHub
- if a milestone is edited in Huly, TeamForge should mark it as drift or review-needed instead of allowing ambiguous two-way overwrite

### Phase 2 sync targets

- Components
- Templates

These are useful, but more opinionated and more likely to need one-side ownership rules.

### Read-only GitHub signals

These should sync into TeamForge but not become editable mirrored entities in Huly:

- Pull requests
- Branches
- Check runs

These are status signals, not project-management records.

---

## 5. Required Manual Controls

The user explicitly wants manual control. That means sync cannot be fully automatic and opaque.

### Project-level controls

- link/unlink GitHub repos
- link/unlink Huly projects
- enable/disable bidirectional sync
- set project sync mode:
  - `manual`
  - `scheduled`
  - `event-driven`
  - `hybrid`

### Entity-level controls

- sync issues: on/off
- sync milestones: on/off
- sync components: on/off
- sync templates: on/off

### Direction controls

- GitHub -> Huly only
- Huly -> GitHub only
- bidirectional
- TeamForge review gate required

### Conflict controls

- auto-merge safe fields only
- pause and require review on conflicting edits
- choose preferred side:
  - GitHub-preferred
  - Huly-preferred
  - TeamForge review required

### Operational controls

- sync now
- retry failed sync
- pause project sync
- re-link a broken mapping
- inspect sync history
- inspect last propagated payload

---

## 6. Entity Mapping Model

Bidirectional sync is only safe if TeamForge owns explicit mappings.

Each syncable record needs:

- `teamforge_entity_id`
- `project_id`
- `entity_type`
- `github_repo`
- `github_external_id`
- `huly_project_id`
- `huly_external_id`
- `mapping_status`
- `created_from`
- `last_synced_at`
- `last_source`
- `last_source_version`
- `last_github_hash`
- `last_huly_hash`

### Why this matters

This is what prevents:

- duplicate issue creation
- milestone drift
- looped writes
- last-write corruption

---

## 7. Conflict and Race Strategy

True bidirectional sync without coordination will corrupt data.

### Locking

Use Cloudflare Durable Objects or another lock coordinator for:

- per-project sync lock
- optionally per-entity sync lock for issue/milestone updates

### Change journal

Store every sync attempt with:

- source system
- destination system
- payload hash
- result
- conflict state
- retry count

### Conflict detection

A conflict exists when:

- GitHub changed since last sync
- Huly changed since last sync
- neither change originated from the currently propagating TeamForge write

### Default conflict behavior

Recommended default:

- safe fields auto-merge
- semantic conflicts become `needs_review`
- no silent last-write-wins for title/body/state/milestone target dates

### Issue-specific conflict policy

For issues, conflict behavior depends on issue ownership:

- engineering issues:
  - GitHub is canonical
  - Huly-side edits that affect canonical fields should surface as drift/review-needed
- execution/admin issues:
  - Huly is canonical
  - GitHub should not receive these issues by default

TeamForge should preserve a clear ownership flag on every mapped issue so conflict resolution is deterministic.

### Classification storage

For each mapped issue, TeamForge should store:

- `ownership_domain`
- `classification_source`
  - `rule`
  - `manual_override`
  - `promotion`
- `classification_reason`
- `override_actor`
- `override_at`

### Milestone-specific conflict policy

For milestones, the default policy is stricter:

- GitHub wins as the canonical source
- TeamForge records Huly-side drift/conflict
- Huly-side conflicting edits are not auto-pushed back to GitHub
- operator may choose:
  - accept GitHub version
  - preserve Huly notes in TeamForge metadata
  - manually reconcile before re-propagation

---

## 8. Error Handling and Graceful Fallback

The user explicitly wants graceful fallback errors.

### Principles

- no sync failure should corrupt canonical state
- no failure should make the project disappear from the UI
- partial failure must be visible, not silent

### Failure states to support

- GitHub unavailable
- Huly unavailable
- auth expired
- entity mapping broken
- project no longer exists remotely
- schema mismatch
- validation failure

### UX state examples

- `healthy`
- `out_of_sync`
- `retry_pending`
- `paused`
- `needs_review`
- `mapping_broken`
- `remote_deleted`

### Fallback behavior

- TeamForge remains readable from D1
- desktop app can render cached project graph from local SQLite
- failed propagation stays queued until retry or operator action

---

## 9. Cloudflare-Centric Architecture

### Canonical backend

Cloudflare Worker + D1 owns:

- project registry
- link tables
- sync journal
- conflict records
- retry queue metadata

### Queue / orchestration

Use Cloudflare queues for async sync jobs:

- `project.sync.requested`
- `project.github.pull`
- `project.huly.pull`
- `project.github.push`
- `project.huly.push`
- `project.conflict.detected`

### Desktop role

The desktop app should:

- fetch project graph from Worker
- fetch sync status from Worker
- optionally request sync actions
- cache project graph locally for offline reads

It should not own canonical project mappings.

---

## 10. Proposed D1 Data Model

Build on top of existing `organizations`, `workspaces`, `projects`, and `project_external_ids`.

### Extend / add

- `projects`
  - promote to true TeamForge project identity
- `project_external_ids`
  - continue using for simple external mappings
- new `project_github_links`
- new `project_huly_links`
- new `project_artifacts`
- new `project_sync_policies`
- new `sync_entity_mappings`
- new `sync_journal`
- new `sync_conflicts`

### Keep the model simple

Do not start with a generic “sync anything to anything” engine.
Start with:

- project graph
- issues
- milestones

Then expand.

---

## 11. Delivery Phases

### Phase 0: Architecture correction

- TeamForge canonical ownership moved to Cloudflare design
- local SQLite demoted to cache/projection

### Phase 1: Canonical project registry in Cloudflare

- D1 schema for TeamForge project graph
- Worker routes for CRUD on projects, links, artifacts, policies
- desktop reads registry from Worker

### Phase 2: Sync journal + locks

- queue-backed sync jobs
- Durable Object locking
- retry and error states

### Phase 3: Bidirectional issue sync

- GitHub issue mapping
- Huly issue mapping
- conflict detection
- manual review states

Note:

- issue sync is not symmetric by default
- issue ownership is split by domain:
  - engineering issues are GitHub-owned
  - execution/admin issues are Huly-owned
- TeamForge should support explicit promotion or conversion workflows when an issue needs to cross from one ownership domain into the other
- issue classification should default from rules but always remain manually overrideable in TeamForge

### Phase 4: Bidirectional milestone sync

- GitHub milestone mapping
- Huly milestone mapping
- explicit policy and conflict review

Note:

- milestone data path is GitHub-authoritative by default
- TeamForge may still expose manual reconciliation controls, but baseline sync direction is GitHub -> TeamForge -> Huly

### Phase 5: Components/templates + operator UI

- controlled propagation of Huly components/templates
- advanced operator controls
- richer project control center UI in TeamForge

---

## 12. What TeamForge Must Expose In UI

At minimum, the operator needs:

- project registry view
- per-project linked systems view
- sync policy controls
- sync health status
- conflict inbox
- retry / pause / resume controls
- artifact registry

Without these, “bidirectional sync” becomes untrustworthy because operators cannot understand or steer it.

---

## 13. Recommended First Real Build Slice

The next implementation slice should be:

1. Move canonical project graph ownership to Cloudflare D1
2. Add Worker CRUD routes for project graph + sync policy
3. Change desktop app to read/write project graph through Worker
4. Keep local SQLite as cache only
5. Do not implement live issue/milestone propagation until the sync journal and locking layer exists

This keeps the system architecturally sound and avoids building bidirectional sync on the wrong ownership model.
