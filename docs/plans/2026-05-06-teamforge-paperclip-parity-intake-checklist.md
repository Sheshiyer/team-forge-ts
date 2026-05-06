# TeamForge Paperclip Parity and Structured Intake Checklist

**Goal:** turn TeamForge into the primary operating console for Paperclip by
closing the highest-value parity gaps and by creating a single structured
intake flow for new work, whether it starts in TeamForge, Hermes, or another
connected system.

## 1. Discovery Summary

- **Planning depth:** standard
- **Delivery mode:** production
- **Release model:** phased rollout
- **CI/CD expectation:** basic now, production-grade gate before release
- **Quality bar:** route contract tests, Tauri command tests, UI smoke checks,
  intake replay tests, and end-to-end proof of issue propagation
- **Human team shape:** solo founder using TeamForge as the main control plane
- **Default execution split:**
  - planner/orchestrator: backlog shaping, contract freeze, wave control
  - UI/app: TeamForge views, routing surfaces, issue composer, overview rails
  - cloud/backend: TeamForge Worker/D1, Paperclip bridge, Hermes bridge,
    canonical intake contract
  - validation: replay harnesses, regression checks, screenshot and workflow proof
- **Primary risk area:** scattered work intake across TeamForge, Hermes, and
  Paperclip without one canonical envelope or one canonical queue model

## 2. Assumptions and Constraints

- TeamForge should own the operator-facing workflow.
- Paperclip should remain the runtime/agent engine, not the primary daily UI.
- TeamForge Worker + D1 remains the canonical shared system of record.
- Local Paperclip repo files remain valid source material for agent identity,
  routines, and context until a richer API contract exists.
- The current repo does not contain the exact native Paperclip web app shown in
  the screenshot, so parity planning must target the stable runtime/local
  contracts we do have, plus the behaviors visible from the native UI.
- New issue intake must be idempotent and source-aware so the same work item is
  not duplicated when it travels through Hermes, TeamForge, and Paperclip.

## 3. Agent Ownership Model

- **Planner / orchestrator:** owns phase map, issue graph, dependency control,
  lock-zone review, and wave closeout.
- **UI / app implementation:** owns TeamForge Overview, Agents, Issues, Org,
  Goals, Routines, Inbox, and cross-route intake UX.
- **Cloud / backend:** owns canonical intake schema, TeamForge Worker routes,
  projections, sync rules, fan-out, and Paperclip/Hermes bridges.
- **Validation:** owns replay fixtures, route contract checks, failure-path
  tests, screenshot validation, and release gate proof.

## 4. Phase Map

- **Phase 1: Contracts and Intake Backbone**
  - unify intake shape, routing shape, queue shape, and audit shape
- **Phase 2: Overview, Company, Org, and Inbox Convergence**
  - make Overview the founder intake console and build unified queue surfaces
- **Phase 3: Issues, Sub-Issues, Activity, and Property Parity**
  - absorb the native issue-management workflow into TeamForge
- **Phase 4: Goals, Routines, and Agent Operating Control**
  - expose native agent operating surfaces as TeamForge-first workflows
- **Phase 5: Hardening, Release Gate, and GitHub Execution Tracking**
  - prove the model end-to-end and convert the checklist into tracked execution work

## 5. Detailed Phase 1 Wave / Swarm Layout

### Wave 1: Contract Freeze

- **Swarm 1A: Intake Envelope**
  - define the canonical work-intake object
  - freeze required fields, source taxonomy, and state model
- **Swarm 1B: Routing and Fan-Out**
  - define how one intake item flows into Paperclip, Overview, Inbox, and audit logs
  - freeze ownership hints and idempotency rules

### Wave 2: Queue and Entry Surfaces

- **Swarm 2A: Overview Entry**
  - define the founder-facing create/triage surface on Overview
  - define the minimum queue counters and failure signals
- **Swarm 2B: Inbox Projection**
  - define founder inbox, agent inbox, and unified activity projections
  - freeze projection refresh and dead-letter behavior

### Wave 3: Validation and Rollout Readiness

- **Swarm 3A: Replay and Recovery**
  - define replay tests for duplicate, failed, and delayed intake items
  - prove retry/dead-letter rules
- **Swarm 3B: Backlog and Handoff**
  - map the frozen Phase 1 contracts into execution issues/checklists
  - prepare the next parity waves without reopening the contracts casually

## 6. 36-Item Checklist

### Phase 1: Contracts and Intake Backbone

- [ ] `TFP-001` Freeze a canonical **intake item schema** with IDs, source,
      source reference, company/client/project context, title, body, status,
      priority, routing hint, tags, created-by, timestamps, and sync key.
- [ ] `TFP-002` Freeze a **source taxonomy** for `teamforge_manual`,
      `hermes_message`, `paperclip_escalation`, `worker_event`, `slack_signal`,
      and future connectors.
- [ ] `TFP-003` Define one **status/state mapping** across TeamForge,
      Paperclip, and Hermes for `new`, `triage`, `assigned`, `blocked`,
      `in_progress`, `approval`, `done`, and `archived`.
- [ ] `TFP-004` Define one **priority mapping** across systems so `critical`,
      `high`, `medium`, and `low` do not drift by source.
- [ ] `TFP-005` Freeze **routing hint fields**: target agent, target
      department, target queue, project code, client ID, and founder review flag.
- [ ] `TFP-006` Define **idempotency and dedupe rules** so the same issue sent
      through TeamForge and Hermes does not create multiple live work items.
- [ ] `TFP-007` Define **fan-out rules** for when intake becomes:
      Paperclip task, TeamForge issue row, founder inbox item, agent inbox item,
      overview counter, and external notification.
- [ ] `TFP-008` Add a canonical **audit/event log contract** for intake create,
      route, bounce, retry, approve, fail, and resolve actions.

### Phase 1: Queue and Delivery Contracts

- [ ] `TFP-009` Define **dead-letter and retry semantics** for failed intake
      routing so nothing silently disappears.
- [ ] `TFP-010` Define **manual versus automatic routing rules** for when a new
      issue goes straight to an agent versus founder triage.
- [ ] `TFP-011` Define **approval gates** for Hermes-originated requests that
      should be reviewed before routing.
- [ ] `TFP-012` Define **source-of-record rules** for which fields TeamForge,
      Paperclip, or Hermes may mutate after the intake item is created.

### Phase 2: Overview, Company, Org, and Inbox Convergence

- [ ] `TFP-013` Add an **Overview intake command strip** so a founder can open
      a new issue/request from the main dashboard without leaving TeamForge.
- [ ] `TFP-014` Add an **Overview intake rail** for `awaiting triage`,
      `routing failures`, `needs approval`, and `stuck intake`.
- [ ] `TFP-015` Add an **Overview operational percolation rail** showing which
      new issues have successfully reached Paperclip and which have not.
- [ ] `TFP-016` Add a **company/workspace summary surface** showing active
      company context, source systems, and the current command-center status.
- [ ] `TFP-017` Add a unified **org view** that merges the human team hierarchy
      with the Paperclip agent hierarchy on one route.
- [ ] `TFP-018` Add a **founder inbox** route inside TeamForge that becomes the
      canonical triage surface for inbound work needing routing or approval.
- [ ] `TFP-019` Add **agent inbox** views inside TeamForge so the founder can
      inspect what an agent has waiting without opening Paperclip native.
- [ ] `TFP-020` Add a normalized **activity feed row model** that can mix
      intake actions, routing actions, approvals, and issue lifecycle events.

### Phase 3: Issues, Sub-Issues, Activity, and Property Parity

- [ ] `TFP-021` Build a richer **issue list model** that supports native
      Paperclip-like workflow grouping, not only the current project issue table.
- [ ] `TFP-022` Build a dedicated **issue detail model** with title, body,
      origin, handoff, queue state, assignee, project, and audit metadata.
- [ ] `TFP-023` Add **sub-issue relationship support** so parent/child work can
      be represented and navigated in TeamForge.
- [ ] `TFP-024` Add a normalized **comments and activity timeline** on issue
      detail so updates do not require the Paperclip native view.
- [ ] `TFP-025` Add an editable **properties panel** for status, priority,
      labels, assignee, project, and routing state.
- [ ] `TFP-026` Add **attachments and linked document surfaces** so issue
      context can hold source notes, artifacts, and relevant vault/TeamForge links.
- [ ] `TFP-027` Add a **new issue composer** in TeamForge that writes the
      canonical intake envelope instead of creating isolated local UI state.
- [ ] `TFP-028` Allow **issue creation from multiple surfaces**:
      Overview, Company, Org, Agent, Project, Client, and Inbox.

### Phase 4: Goals, Routines, and Agent Operating Control

- [ ] `TFP-029` Build a **goals read model** for agent goals, company goals,
      project goals, and founder priorities.
- [ ] `TFP-030` Add a dedicated **Goals route** in TeamForge with filters by
      owner, company, project, agent, and state, and link those goals to live
      work items so issues and inbox tasks can roll up into them.
- [ ] `TFP-031` Build a **routines read model** that exposes cadence, trigger,
      owner, last run, next due, and linked outputs.
- [ ] `TFP-032` Add a dedicated **Routines route** in TeamForge with visibility
      into routine health, execution context, and the downstream work each
      routine feeds.
- [ ] `TFP-033` Add **agent control actions** from TeamForge for reroute,
      escalate, approve, bounce, and assign without dropping into native Paperclip.
- [ ] `TFP-034` Link the new **operating profile** surfaces to live inbox,
      goals, routines, and issue queues so the agent page becomes a real work console.

### Phase 5: Hermes Intake and Hardening

- [ ] `TFP-035` Add a **Hermes intake parser pipeline**:
      raw message -> normalized intent -> canonical intake item -> queue disposition.
- [ ] `TFP-036` Add **Hermes approval, confidence, and percolation rules** so
      ambiguous requests stop in founder triage, clear ones auto-route safely,
      and both TeamForge-created and Hermes-created issues are proven to land in
      Overview, Inbox, Agent queues, and Paperclip tasks.

### Phase 5: Cross-Route Hardening and Release Gate

- [ ] `TFP-037` Add a **release gate** that blocks shipping unless the unified
      intake flow passes replay, duplicate, failure, and recovery checks.
- [ ] `TFP-038` Add **context-preserving deep links** from Overview and Inbox
      into Issues, Agents, Clients, Projects, and Onboarding.
- [ ] `TFP-039` Add **queue filters, source badges, and provenance** everywhere
      an intake item appears so the founder can understand origin and routing state.
- [ ] `TFP-040` Add a **failure banner and recovery action** whenever an item
      exists locally but did not percolate into the downstream queue correctly.

## 7. Dependency Rationale

- Intake contracts come first because every later surface depends on them.
- Overview and Inbox come before full issue parity because they are the founder
  command center and the main scattered-work problem.
- Issue-detail parity comes before editable goals/routines because the intake
  and issue model must be stable before higher-order workflow controls are layered on.
- Hermes hardening comes after the canonical TeamForge intake envelope exists,
  otherwise Hermes would encode another parallel contract.

## 8. Verification Strategy

- Every contract task must ship with explicit schema/command validation.
- Every queue or projection task must ship with manual proof and failure-path proof.
- Every UI parity task must ship with screenshots or route-level smoke checks.
- Intake flow must be replayable with duplicate, delayed, and partial-failure cases.
- Release gate must include at least one founder-visible end-to-end proof:
  `new issue in TeamForge -> canonical intake row -> queue route -> Paperclip/Overview visibility`.

## 9. GitHub Sync and Dispatch Strategy

- Convert each checklist item into one GitHub issue when execution starts.
- Use labels:
  - `phase:p1` .. `phase:p5`
  - `wave:w1` .. `wave:wN`
  - `swarm:intake`, `swarm:overview`, `swarm:issues`, `swarm:routines`, `swarm:qa`
  - `area:frontend`, `area:backend`, `area:product`, `area:qa`
  - `status:planned`, `status:ready`, `status:blocked`, `status:in-progress`, `status:done`
- Keep one owner per issue and serialize lock-zone files:
  `src/pages/Overview.tsx`, `src/pages/Agents.tsx`, `src/pages/Issues.tsx`,
  `src/hooks/useInvoke.ts`, `src/lib/types.ts`, `src-tauri/src/commands/mod.rs`,
  `src-tauri/src/paperclip.rs`, and shared route/app shell files.

## 10. Worker Bootstrap Packet Strategy

- This document is planning-only, so no fresh worker packets are generated yet.
- When execution starts, split work by:
  - UI/app surfaces
  - backend/contract/projection work
  - validation/replay work
- Freeze the intake envelope, route contract, and projection contract before
  dispatching parallel implementation.

## 11. Risks and Fallback Plan

- **Risk:** TeamForge and Paperclip may drift if mutable issue fields are not
  assigned one clear owner.
  - **Fallback:** keep write authority narrow until the contract stabilizes.
- **Risk:** Hermes can become a duplicate intake surface instead of a bridge.
  - **Fallback:** require Hermes to emit only the canonical intake envelope.
- **Risk:** Overview becomes another dashboard instead of the founder command center.
  - **Fallback:** require every intake and queue feature to show on Overview first.
- **Risk:** the repo lacks the native Paperclip UI implementation source.
  - **Fallback:** target stable runtime/local contracts and visible workflow
    behaviors instead of pixel-cloning the screenshot.
