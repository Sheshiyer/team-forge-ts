# Requirements: TeamForge — v0.2 Foundation Closeout

**Defined:** 2026-05-04
**Core Value:** One app where the founder can see the team's actual state — time, work, presence, and project health — without context-switching across six SaaS tools.

## v0.2 Requirements

The 8 open GitHub issues, grouped by category. Each requirement maps to one roadmap phase.

### Founder Sync (the local-vault → Cloudflare-Worker → app data path)

- [ ] **SYNC-01**: TeamForge.app runs founder vault sync end-to-end on a clean Mac without any user-installed Node on PATH. ([#45](https://github.com/Sheshiyer/team-forge-ts/issues/45))
  - Either a native Rust importer or a packaged Node sidecar; Settings-based UX preserved.
  - Canonical parity behavior preserved for: project briefs, client profiles, onboarding flows, employee KPI notes.
  - Local Workspace status model preserved.
  - OTA-shipped builds must work — no `../scripts/...` repo-checkout assumptions.
- [ ] **SYNC-02**: Vault parity warnings drop materially after backfill of client metadata, technical specs, design docs, research docs, closeout docs, onboarding notes, and canonical `clockifyProjectId` refs in vault frontmatter. ([#46](https://github.com/Sheshiyer/team-forge-ts/issues/46))
  - Verification: founder-sync proof completes with measurably fewer warnings than v0.1.28 baseline.
  - TeamForge project / client / onboarding surfaces show the newly imported canonical records.
  - TeamForge canonical identity stays on IDs (not names).

### Data Foundation (Huly schema completion)

- [ ] **DATA-01**: 8 Huly relation types implemented between entities, surfaced in TeamForge UI where relevant. ([#4](https://github.com/Sheshiyer/team-forge-ts/issues/4))
  - Relations: Blocks (Issue→Issue), Relates To (Issue→Issue), Duplicates (Issue→Issue), Creates Resource (Issue→Client_Resource), Documents In (Issue→Knowledge_Article), Involves Device (Issue→Smart_Home_Device), Part of Sprint (Issue→Sprint), Client Assignment (Project→Client).
  - Insights page shows dependency chains (blocked tasks view).
  - Task detail hover shows related issues.
  - Sprints page burndown uses Sprint→Issue relation.
  - Client→Project relation enables revenue-by-client reporting.

### Client & Onboarding Module

- [ ] **CLIENT-01**: Client Onboarding Template & Flow Tracking shipped as a first-class TeamForge surface. ([#14](https://github.com/Sheshiyer/team-forge-ts/issues/14))
  - Onboarding template editable per client.
  - Flow steps trackable with state (not started / in progress / done).
  - Wired to the Cloudflare Worker `onboarding_flows` data already populated by founder-sync.

### Dashboards (Role-Specific UI)

- [ ] **DASH-01**: Role-Based Dashboards for Executive, PM, and Developer roles. ([#12](https://github.com/Sheshiyer/team-forge-ts/issues/12))
  - Executive view: cross-client revenue, monthly hours, alerts.
  - PM view: sprint health, blockers, team availability.
  - Developer view: my issues, my time, my standups.
  - Reuse existing Insights / Team / Timesheet data — do not duplicate fetches.

### Module Enhancements

- [ ] **TEAM-01**: Team page enhancements — HR Time-Off, Monthly Hours, Remote Visibility. ([#9](https://github.com/Sheshiyer/team-forge-ts/issues/9))
  - HR Time-Off panel: who is out today / this week.
  - Monthly Hours panel: per-person quota progress.
  - Remote Visibility: presence + last-activity recency.
- [ ] **SPRINT-01**: Sprints page — Sprint Ceremonies & Burndown. ([#8](https://github.com/Sheshiyer/team-forge-ts/issues/8))
  - Ceremony schedule (planning, daily, retro) with calendar links.
  - Burndown chart driven by Part-of-Sprint relation (depends on DATA-01).
- [ ] **PLAN-01**: Huly Planner data integrated for personal time-blocking visibility. ([#15](https://github.com/Sheshiyer/team-forge-ts/issues/15))
  - Per-person time-block view sourced from Huly Planner API.
  - Cross-reference with Clockify time entries for compliance check.

## v0.3+ Requirements (Deferred)

### Cross-Platform & Mobile

- **PLATFORM-01**: Windows desktop build.
- **PLATFORM-02**: Linux desktop build.
- **PLATFORM-03**: iOS / Android companion (read-only first).

### Multi-Tenant

- **MULTI-01**: Multi-tenant auth on the Cloudflare Worker so a second team can install TeamForge.

### Advanced Analytics

- **ANALYTICS-01**: Predictive quota / burndown forecasting.
- **ANALYTICS-02**: Project profitability rollups.

## Out of Scope (v0.2)

| Feature | Reason |
|---------|--------|
| Replacing GitHub as engineering issue source-of-truth | Locked by v0.1 contract; engineering wants version-controlled issue history |
| Replacing Huly as execution / admin issue source-of-truth | Locked by v0.1 contract; PM wants planning canvas |
| Real-time chat or video | Not core; out of scope for v0.2 |
| Custom AI inference inside TeamForge | Paperclip runtime owns agent runtime; TeamForge is the operator surface |
| New core integrations beyond Clockify/Huly/Slack/GitHub | v0.2 is foundation closeout; new connectors land in v0.3+ |
| Splitting `commands/mod.rs` into modules | Premature; revisit at v0.3 once patterns stabilize |
| Test coverage push (formal QA, CI test gates) | Out of scope; v0.2 keeps existing manual + inline-test posture |

## Traceability

| Requirement | Issue | Phase | Status |
|-------------|-------|-------|--------|
| SYNC-01 | [#45](https://github.com/Sheshiyer/team-forge-ts/issues/45) | Phase 1 | Pending |
| SYNC-02 | [#46](https://github.com/Sheshiyer/team-forge-ts/issues/46) | Phase 2 | Pending |
| DATA-01 | [#4](https://github.com/Sheshiyer/team-forge-ts/issues/4) | Phase 3 | Pending |
| CLIENT-01 | [#14](https://github.com/Sheshiyer/team-forge-ts/issues/14) | Phase 4 | Pending |
| DASH-01 | [#12](https://github.com/Sheshiyer/team-forge-ts/issues/12) | Phase 5 | Pending |
| TEAM-01 | [#9](https://github.com/Sheshiyer/team-forge-ts/issues/9) | Phase 6 | Pending |
| SPRINT-01 | [#8](https://github.com/Sheshiyer/team-forge-ts/issues/8) | Phase 7 | Pending |
| PLAN-01 | [#15](https://github.com/Sheshiyer/team-forge-ts/issues/15) | Phase 8 | Pending |

**Coverage:**
- v0.2 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-04*
*Last updated: 2026-05-04 after v0.2 milestone bootstrap*
