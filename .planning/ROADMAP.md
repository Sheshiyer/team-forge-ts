# Roadmap: TeamForge

## Milestones

- ✅ **v0.1 Foundation** — Phases 0.1–0.28 (shipped continuously v0.1.0 → v0.1.28, 2026-03-23 → 2026-05-01). 38 GitHub issues closed. See [CHANGELOG.md](../CHANGELOG.md) for the per-release history.
- 🚧 **v0.2 Foundation Closeout** — Phases 1–8 (in progress). Closes the 8 remaining open issues from v0.1.

## Overview

v0.2 is a **closeout milestone** — it does not add new core integrations. It (1) productizes the founder-sync runtime so OTA-shipped builds run on clean Macs (Phase 1), (2) closes the data quality gap exposed by founder-sync (Phase 2), (3) finishes the Huly schema (Phase 3), and (4) ships the four UI / module surfaces blocked on phases 1–3 (Phases 4–8).

## Phases

**Phase Numbering:** Integer phases for planned work. Decimal phases (e.g. `2.1`) reserved for inserted urgent work via `/gsd:insert-phase`.

### v0.2 Foundation Closeout (in progress)

- [ ] **Phase 1: Founder Sync Hardening** — Productize the Settings-based founder sync so it runs without an external Node runtime ([closes #45](https://github.com/Sheshiyer/team-forge-ts/issues/45))
- [ ] **Phase 2: Vault Parity Data Completion** — Backfill missing canonical vault metadata so parity warnings drop materially ([closes #46](https://github.com/Sheshiyer/team-forge-ts/issues/46))
- [ ] **Phase 3: Huly Relation Types** — Implement the 8 entity-relation types and surface them in Insights, Sprints, and Clients ([closes #4](https://github.com/Sheshiyer/team-forge-ts/issues/4))
- [ ] **Phase 4: Client Onboarding Flow** — Ship Client Onboarding Template & Flow Tracking ([closes #14](https://github.com/Sheshiyer/team-forge-ts/issues/14))
- [ ] **Phase 5: Role-Based Dashboards** — Executive, PM, Developer dashboards reusing existing data fetches ([closes #12](https://github.com/Sheshiyer/team-forge-ts/issues/12))
- [ ] **Phase 6: Team Page Enhancements** — HR Time-Off, Monthly Hours, Remote Visibility ([closes #9](https://github.com/Sheshiyer/team-forge-ts/issues/9))
- [ ] **Phase 7: Sprints Page Ceremonies & Burndown** — Sprint ceremony schedule + burndown chart ([closes #8](https://github.com/Sheshiyer/team-forge-ts/issues/8))
- [ ] **Phase 8: Huly Planner Time-Blocking** — Personal time-blocking visibility from Huly Planner API ([closes #15](https://github.com/Sheshiyer/team-forge-ts/issues/15))

## Phase Details

### Phase 1: Founder Sync Hardening
**Goal:** TeamForge runs vault sync end-to-end on a clean macOS install with no user-installed Node on PATH; Settings-based UX preserved; OTA-shipped builds work without repo-checkout assumptions.
**Issue:** [#45](https://github.com/Sheshiyer/team-forge-ts/issues/45)
**Depends on:** Nothing (foundation prerequisite for all later phases that read founder-sync data)
**Requirements:** SYNC-01
**Success Criteria** (what must be TRUE):
  1. Fresh Mac with no `node` on PATH can run founder sync from the Settings UI to completion.
  2. The Local Workspace status model still reports `founder_sync_ready` correctly.
  3. Canonical parity is preserved for project briefs, client profiles, onboarding flows, and employee KPI notes (verified by report counts matching v0.1.28 baseline minus the warnings TF-46 will close).
  4. The OTA-shipped `.app` bundle does not reference any `../scripts/...` repo-checkout fallback path at runtime.
  5. The Cloudflare Worker / D1 wire format is unchanged (out-of-scope per the issue).
**Plans:** 3 plans
**Discussion gray areas:** native Rust importer vs packaged Node sidecar (the architectural fork — calls for `gsd:plan-phase 1 --reviews` cross-AI peer review).

Plans:
- [x] 01-01-PLAN.md — Wave 1: vault module rename, gray_matter dep, vault_sync_runtime dual-path setting, parity.rs skeleton, fixture vault skeleton
- [ ] 01-02-PLAN.md — Wave 2: native importer implementation (parsers, Worker writes, KPI SQLite, ParityReport, 10 inline tests)
- [ ] 01-03-PLAN.md — Wave 3: verification + release (Tier 2 clean-PATH .app run, Tier 3 Node-vs-Rust diff, CHANGELOG v0.2.0, version bumps to 0.2.0)

### Phase 2: Vault Parity Data Completion
**Goal:** Founder-sync proof completes with measurably fewer parity warnings; missing client metadata, technical specs, design/research/closeout docs, onboarding notes, and Clockify project IDs are backfilled in vault frontmatter; TeamForge UI shows the newly imported canonical records.
**Issue:** [#46](https://github.com/Sheshiyer/team-forge-ts/issues/46)
**Depends on:** Phase 1 (so the runtime that exposes the warnings is the production runtime, not the Node fallback)
**Requirements:** SYNC-02
**Success Criteria:**
  1. Vault parity warning count drops materially vs v0.1.28 baseline (specific delta to be agreed in discuss-phase).
  2. Each affected client root has a client-profile note where expected.
  3. Each active project has the canonical `clockifyProjectId` in frontmatter.
  4. TeamForge project / client / onboarding surfaces show the newly imported records.
  5. TeamForge canonical identity stays on IDs (not names).
**Plans:** TBD (likely 1-2 — data audit + backfill)
**Approach hint:** `gsd:debug` first since the warnings *are* the diagnostic input.

Plans:
- [ ] 02-01: TBD (warnings audit + backfill plan)
- [ ] 02-02: TBD (apply + verify)

### Phase 3: Huly Relation Types
**Goal:** All 8 Huly relation types (Blocks, Relates To, Duplicates, Creates Resource, Documents In, Involves Device, Part of Sprint, Client Assignment) are implemented and surfaced.
**Issue:** [#4](https://github.com/Sheshiyer/team-forge-ts/issues/4)
**Depends on:** Phase 1 (vault sync stability; not a hard dep)
**Requirements:** DATA-01
**Success Criteria:**
  1. All 8 relations creatable / queryable via the Huly client (`src-tauri/src/huly/`).
  2. Insights page shows dependency chains (blocked tasks view).
  3. Task detail hover shows related issues.
  4. Sprint→Issue relation powers Phase 7 burndown (data layer ready).
  5. Client→Project relation enables revenue-by-client reporting.
**Plans:** TBD (1 plan likely; schema work is bounded)
**Approach hint:** discuss-phase locks Huly-side naming/conventions before code lands.

Plans:
- [ ] 03-01: TBD (relation schema + adapter)

### Phase 4: Client Onboarding Flow
**Goal:** Client Onboarding Template & Flow Tracking is a first-class TeamForge surface; templates editable; flow steps trackable; wired to existing `onboarding_flows` worker data.
**Issue:** [#14](https://github.com/Sheshiyer/team-forge-ts/issues/14)
**Depends on:** Phase 1 (founder-sync brings onboarding data in), Phase 2 (data is complete)
**Requirements:** CLIENT-01
**Success Criteria:**
  1. New `/onboarding-template` UI (or extension of `/onboarding`) lets the founder create / edit templates.
  2. Per-client flow shows step states (not started / in progress / done).
  3. State persists via the Cloudflare Worker (no new local-only data).
**Plans:** TBD (likely 2 — UI + wiring)
**Approach hint:** `gsd:ui-phase` produces UI-SPEC.md before plan-phase.

Plans:
- [ ] 04-01: TBD (UI-SPEC)
- [ ] 04-02: TBD (implementation)

### Phase 5: Role-Based Dashboards
**Goal:** Executive, PM, Developer dashboards each surface the right slice of existing data without duplicating fetches.
**Issue:** [#12](https://github.com/Sheshiyer/team-forge-ts/issues/12)
**Depends on:** Phases 1, 2, 3 (data must be complete and well-related); Phase 6 (team data slices); Phase 7 (sprint data slices).
**Requirements:** DASH-01
**Success Criteria:**
  1. Three dashboard layouts selectable based on role.
  2. Executive view shows cross-client revenue, monthly hours, alerts.
  3. PM view shows sprint health, blockers, team availability.
  4. Developer view shows my issues, my time, my standups.
  5. No duplicate fetches vs Insights / Team / Timesheet.
**Plans:** TBD (likely 2-3 — UI-SPEC, wiring, polish)

Plans:
- [ ] 05-01: TBD (UI-SPEC for 3 layouts)
- [ ] 05-02: TBD (implementation + wiring)
- [ ] 05-03: TBD (`gsd:ui-review`)

### Phase 6: Team Page Enhancements
**Goal:** Team page exposes HR Time-Off, Monthly Hours, Remote Visibility.
**Issue:** [#9](https://github.com/Sheshiyer/team-forge-ts/issues/9)
**Depends on:** Phases 1, 3
**Requirements:** TEAM-01
**Success Criteria:**
  1. HR Time-Off panel: who's out today / this week.
  2. Monthly Hours panel: per-person quota progress.
  3. Remote Visibility: presence + last-activity recency.
**Plans:** TBD (1-2 plans).

Plans:
- [ ] 06-01: TBD (full-stack: backend slices + UI)

### Phase 7: Sprints Page Ceremonies & Burndown
**Goal:** Sprint ceremonies and burndown chart on the Sprints page.
**Issue:** [#8](https://github.com/Sheshiyer/team-forge-ts/issues/8)
**Depends on:** Phase 3 (Part-of-Sprint relation must exist for burndown).
**Requirements:** SPRINT-01
**Success Criteria:**
  1. Ceremony schedule (planning, daily, retro) with calendar links.
  2. Burndown chart driven by Part-of-Sprint relation.
**Plans:** TBD (1-2 plans).

Plans:
- [ ] 07-01: TBD (UI-SPEC + implementation)

### Phase 8: Huly Planner Time-Blocking
**Goal:** Per-person time-block view sourced from Huly Planner API; cross-referenced with Clockify time entries for compliance.
**Issue:** [#15](https://github.com/Sheshiyer/team-forge-ts/issues/15)
**Depends on:** Phase 3 (Huly client surface stable).
**Requirements:** PLAN-01
**Success Criteria:**
  1. Huly Planner data fetchable from Rust client.
  2. UI shows per-person time blocks alongside Clockify entries.
  3. Discrepancies flagged.
**Plans:** TBD (likely 1-2 plans — research Huly Planner API first).

Plans:
- [ ] 08-01: TBD (research-phase + implementation)

## Progress

**Execution Order:** 1 → 2 → 3 → (4, 6, 7 in parallel where data deps allow) → 5 → 8

| Phase | Issue | Plans Complete | Status | Completed |
|-------|-------|----------------|--------|-----------|
| 1. Founder Sync Hardening | #45 | 1/3 | In Progress | - |
| 2. Vault Parity Data Completion | #46 | 0/TBD | Not started | - |
| 3. Huly Relation Types | #4 | 0/TBD | Not started | - |
| 4. Client Onboarding Flow | #14 | 0/TBD | Not started | - |
| 5. Role-Based Dashboards | #12 | 0/TBD | Not started | - |
| 6. Team Page Enhancements | #9 | 0/TBD | Not started | - |
| 7. Sprints Ceremonies & Burndown | #8 | 0/TBD | Not started | - |
| 8. Huly Planner Time-Blocking | #15 | 0/TBD | Not started | - |
