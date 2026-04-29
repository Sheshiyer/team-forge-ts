# TeamForge Founder Dashboard Realignment

**Goal:** Re-baseline TeamForge around the founder command-center model that
already exists in the vault, instead of continuing the older Huly-first
dashboard backlog as if it were still the product target.

**Status:** Review and implementation alignment plan.

---

## 1. Why This Exists

TeamForge is no longer missing generic pages. It is missing cohesion.

The adjacent vault now defines a clearer operating model than the current app:

- `thoughtseed-labs/00-meta/founder-command-center.md`
- `thoughtseed-labs/00-meta/system-of-records.md`
- `thoughtseed-labs/00-meta/mocs/command-center-architecture.md`
- `thoughtseed-labs/20-operations/project-management/portfolio-source-of-truth-review.md`
- `thoughtseed-labs/20-operations/project-management/vault-next-20-improvements.md`

Those notes define TeamForge as:

- founder command center
- control plane across systems of record
- canonical client/project registry
- bridge into vault-derived active work, portfolio state, onboarding, and
  reusable IP

The current app still exposes several routes as if TeamForge were mainly a
Huly telemetry shell.

---

## 2. Current Product Mismatch

### Boards

`src/pages/Boards.tsx` is still a thin board-card table. It only shows:

- card title
- board
- assignee
- status
- days in status

If Huly board data is sparse, the page goes empty. That is not a dashboard
failure caused by missing UI polish. It is a surface-authority failure:
`Boards` is using a narrow source that is not the founder command center.

### Navigation

`src/App.tsx` still groups the product around:

- `CORE SYSTEMS`
- `HULY OPS`
- `OPS MODULES`
- `MONITORING`

That grouping still treats TeamForge as a collection of operational pages,
instead of one canonical overview with secondary drill-downs.

### Overview

`src/pages/Overview.tsx` is still mostly quota/utilization telemetry. It is
useful, but it is not yet the founder command center described in the vault.

---

## 3. Open GitHub Issue Triage

The remaining open backlog is partially stale. Some issues should be closed,
some rewritten, and only a few should survive as direct implementation tracks.

| Issue | Current state | Recommendation |
|---|---|---|
| `#4` Data Foundation: relation types | old Huly graph design | Rewrite around current canonical TeamForge project/client/onboarding graph; do not keep device/training relations as first-class priorities |
| `#5` Client dashboard | mostly superseded by current canonical-first `Clients` page | Close and replace with a narrower enhancement issue for portfolio status, white-labelable inventory, and founder signals |
| `#6` Device registry | page was intentionally removed | Close as obsolete unless Thoughtseed explicitly returns to smart-home device ops as a live product need |
| `#7` Knowledge base | old Huly custom-class concept | Close in current form; replace only when a real vault/Worker knowledge contract exists |
| `#8` Sprint enhancements | partially relevant | Rewrite around live ceremony signal, burndown, and capacity only after Huly data quality is proven |
| `#9` Team enhancements | partially relevant | Rewrite around leave visibility, actual-vs-planned capacity, and timezone overlap; keep quota editing on Team, not Settings |
| `#11` Training dashboard | page was intentionally removed | Close as obsolete |
| `#12` Role-based dashboards | still relevant, but misframed | Rewrite as founder-command-center first, then optional role-tailored Overview variants |
| `#14` Client onboarding flow tracking | partially implemented already | Rewrite around canonical onboarding flows, completion drift, and resource-creation checkpoints |
| `#15` Huly planner integration | still open research | Keep, but lower priority behind founder dashboard cohesion |
| `#16` top-level rollout tracker | stale master tracker | Close and replace with a new vault-first dashboard roadmap issue |
| `#17` add Huly system design to repo docs | already done | Close; `docs/huly-system-design.md` exists and is linked from `README.md` |

---

## 4. Existing Plans: Keep vs Demote

### Keep as active guidance

- `docs/plans/2026-04-22-teamforge-founder-console.md`
  - still the clearest product framing for TeamForge as a founder and agent
    control plane
- `docs/plans/2026-04-20-teamforge-vault-population-phase-2.md`
  - still the best concrete bridge plan for live vault-backed client profile,
    onboarding, and artifact data
- `docs/plans/2026-04-17-teamforge-project-registry.md`
  - still relevant for canonical project authority

### Demote to historical context

- `docs/plans/2026-04-06-huly-rollout.md`
  - useful as audit history, but no longer the right primary roadmap

---

## 5. Vault Signals TeamForge Still Is Not Surfacing Well

These already exist in the vault and should inform the next dashboard slices:

### Founder command surfaces

- founder command center
- active work
- stale / needs review
- founder review cadence

### Portfolio intelligence

- canonical project/client lifecycle states
- white-labelable inventory
- product lineage and reusable asset packs
- public portfolio reconciliation

### Research intake control

- research inbox
- capture registry
- promotion workflow
- source connectors
- founder research review

### Team and onboarding context

- employee KPI notes
- live employee onboarding flows
- client onboarding flows
- team handbook/policies context where useful for ops status

---

## 6. Recommended Product Realignment

### Phase 1: Fix the shell

- make `Overview` the actual founder command center
- demote `Boards` from a primary nav surface until it has real authority
- keep `Projects`, `Clients`, `Onboarding`, `Issues`, and `Team` as drill-down
  surfaces

### Phase 2: Add founder dashboard rails

Add founder-first sections to `Overview`:

- active delivery streams
- at-risk clients / contracts
- blocked or stale execution
- portfolio state by lifecycle
- white-labelable opportunities
- onboarding flows needing attention
- research intake needing founder review

### Phase 3: Surface vault-backed control queues

Build explicit queues from vault + TeamForge data:

- `Active Work`
- `Needs Review`
- `White-Labelable`
- `Research Intake`

These should be canonical overview rails, not buried note concepts.

### Phase 4: Reintroduce advanced Huly-only views selectively

Only after data quality is real:

- sprint burndown
- planner/time-block visibility
- richer board analytics
- role-tailored overview variants

---

## 7. Immediate Next Implementation Slice

The highest-leverage next slice is not another standalone page.

It is:

1. replace the current Overview with a founder command center layout
2. remove or demote Boards from primary navigation
3. add portfolio lifecycle + white-labelable summary cards from vault-backed
   data
4. add a `Needs Review` rail sourced from stale/orphaned/onboarding-risk states
5. add a `Research Intake` placeholder rail that points at the now-real
   `30-research-hub` control notes instead of pretending knowledge work is in
   Huly

That turns TeamForge from a one-off operations shell into a true dashboard.

---

## 8. Decision

Do not continue the remaining open GitHub backlog as written.

The next roadmap should be:

- close obsolete Huly-first page issues
- rewrite the still-relevant ones in founder-dashboard terms
- implement the founder command-center slice before any more niche module work
