# Command Cortex Visual Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Team Forge from an LCARS/SaaS-style dashboard into a Tauri/macOS-first Command Cortex interface centered on the Mission Cortex neural command field.

**Architecture:** Keep the first implementation buildable with React 19, Vite 6, Tauri 2, SVG, and CSS. The MVP uses a reusable neural field renderer, node/path glyph system, lens rail, command ring, and contextual tactical membranes before migrating every old page into a lens.

**Tech Stack:** React 19, TypeScript, React Router 7, Zustand 5, Tauri 2, Vite 6, SVG/CSS animations, existing Tauri invoke APIs.

---

## 1. Discovery Summary

- **Planning depth:** Deep visual implementation plan.
- **Delivery mode:** Prototype-to-production phased rollout.
- **Release model:** Phased rollout behind an app-shell switch until Mission Cortex is stable.
- **Quality bar:** No dashboard grammar, no left drawer, no KPI card wall, no generic rectangular cards; macOS/Tauri feel; buildable with normal web primitives.
- **Team/agent topology:** Planner/orchestrator, UI/app agent, design systems agent, data/integration agent, motion agent, validation agent.
- **Constraints:** Preserve existing integrations and API calls; do not widen Tauri capabilities without explicit security review; no WebGL required for MVP; honor reduced motion; maintain keyboard accessibility.

## 2. Assumptions and Constraints

- **Assumption A:** `design/assets/v3-command-cortex/*.png` is the source visual reference set.
- **Assumption B:** The first shipped surface is the Mission Cortex home screen, replacing or wrapping the current `Overview` experience.
- **Assumption C:** Existing pages remain available during migration through a fallback/classic route or lens fallback.
- **Constraint A:** `src/App.tsx`, `src/styles/globals.css`, `package.json`, and route topology are lock zones.
- **Constraint B:** Tauri security remains default-deny; frontend visuals must not require new privileged Rust commands in Wave 1.
- **Constraint C:** Motion must use compositor-friendly CSS/SVG patterns and reduced-motion fallbacks.

## 3. Agent Ownership Model

| Concern | Primary owner | Secondary reviewer | Lock zone notes |
|---|---|---|---|
| Planning / orchestration | Planner / orchestrator agent | Human lead | Owns issue graph, wave gates, integration branches |
| Visual system / tokens | Design systems agent | UI/app agent | Touches `src/styles/globals.css` under serialized lock |
| UI / app integration | UI/app implementation agent | Planner / orchestrator agent | Owns React components and route integration |
| Data / adapters | Data/integration agent | UI/app agent | Owns graph adapter and invoke mapping |
| Motion / interaction | Motion agent | Validation agent | Owns SVG/CSS animations and reduced-motion behavior |
| Testing / QA | Validation agent | Planner / orchestrator agent | Owns verification evidence and screenshots |

**Branch pattern:** `swarm/command-cortex/{phase}-{wave}/{swarm}/{task-id}-{agent}`  
**Worktree pattern:** `.worktrees/{task-id}-{agent}`  
**Merge cadence:** merge at wave boundaries only.

## 4. Phase Map

### Phase 1 - Contracts and Foundations

- **Goal:** Freeze the visual, data, route, and implementation contracts before parallel build.
- **Exit criteria:** Tokens, entity schema, route plan, component boundaries, and verification gates are explicit.
- **Waves:** W1 contract freeze, W2 scaffolding, W3 validation baseline.

### Phase 2 - Mission Cortex MVP

- **Goal:** Build the first neural home screen with shell, field, nodes, paths, command layer, and macOS feel.
- **Exit criteria:** The Mission Cortex screen is navigable, responsive, accessible, and visually aligned to V3 assets.
- **Waves:** W1 shell/field, W2 interactions, W3 motion/materials.

### Phase 3 - Data, Lenses, and Agentic Semantics

- **Goal:** Connect real Team Forge data into the neural model and expose primary lenses.
- **Exit criteria:** Mission, Agents, Work, Clients, Risk, Signals, and Memory lenses are defined and render meaningful graph emphasis.
- **Waves:** W1 graph adapter, W2 lenses, W3 command semantics.

### Phase 4 - Page Migration and Legacy Containment

- **Goal:** Reframe old pages as lenses or tactical membranes while keeping legacy fallbacks available.
- **Exit criteria:** Core old surfaces have mapped lens destinations and no primary UI depends on the old sidebar/card grammar.
- **Waves:** W1 core page migration, W2 secondary surfaces.

### Phase 5 - Hardening, Polish, and Release Gate

- **Goal:** Verify desktop usability, accessibility, performance, and fallback behavior.
- **Exit criteria:** Build passes, visual QA evidence exists, reduced-motion works, and release risks are documented.
- **Waves:** W1 QA hardening, W2 release readiness.

## 5. Detailed Phase 1 Wave Layout

### Wave 1 - Contract Freeze

#### Swarm A - Visual Contract

- **Goal:** Convert V3 moodboard decisions into enforceable tokens and UI rules.
- **Owner:** Design systems agent.
- **Inputs:** `design/MOODBOARD-V3.md`, `design/assets/v3-command-cortex/*.png`.
- **Outputs:** Visual contract and token map.
- **Validation:** Human review confirms no SaaS/sidebar/card grammar remains in the target spec.

#### Swarm B - Data Contract

- **Goal:** Define the graph entity model before UI agents build components.
- **Owner:** Data/integration agent.
- **Inputs:** `src/pages/Overview.tsx`, `src/pages/Agents.tsx`, `src/pages/Projects.tsx`, `src/pages/Clients.tsx`, `src/pages/Issues.tsx`, `src/pages/Activity.tsx`, `src/hooks/useInvoke.ts`.
- **Outputs:** Typed node/path/lens schema.
- **Validation:** TypeScript compile confirms schema imports are valid.

#### Swarm C - App Shell Contract

- **Goal:** Define how the Command Cortex shell coexists with current routing.
- **Owner:** UI/app implementation agent.
- **Inputs:** `src/App.tsx`, `src/components/ui/CommandPalette.tsx`, `src/components/ui/DateRangePicker.tsx`, `src/stores/appStore.ts`.
- **Outputs:** Route and shell integration contract.
- **Validation:** Contract identifies lock zones and avoids overlapping parallel edits.

### Wave 2 - Delivery Scaffolding

#### Swarm A - Component Scaffolds

- **Goal:** Create empty component/module boundaries for the neural field system.
- **Owner:** UI/app implementation agent.
- **Outputs:** `src/components/cortex/*`, `src/lib/commandCortex/*` structure.
- **Validation:** App still builds after empty exports are introduced.

#### Swarm B - CSS/Material Scaffolds

- **Goal:** Create Command Cortex material CSS without deleting LCARS yet.
- **Owner:** Design systems agent.
- **Outputs:** `src/styles/command-cortex.css` imported by `src/styles/globals.css`.
- **Validation:** No existing page visually breaks before route integration.

### Wave 3 - Verification Baseline

#### Swarm A - Static Validation

- **Goal:** Define build, type, and route smoke checks.
- **Owner:** Validation agent.
- **Validation:** `pnpm build` and manual Tauri/Vite smoke path documented.

#### Swarm B - Visual QA Baseline

- **Goal:** Define screenshot states for desktop, compact desktop, and reduced motion.
- **Owner:** Validation agent.
- **Validation:** Screenshot checklist is reusable for every future wave.

## 6. Full Task List

Each task uses the Swarm Architect schema fields: ID, title, area, owner, estimate, dependencies, deliverable, acceptance, validation, branch/worktree, and lock-zone status.

| ID | Phase/Wave/Swarm | Owner | Visual ref | Deps | Lock | Deliverable and edit surface | Acceptance | Validation |
|---|---|---|---|---|---|---|---|---|
| T-001 | P1/W1/Visual | Design systems agent | V3 all | none | no | Create `docs/design/command-cortex-visual-contract.md` from `design/MOODBOARD-V3.md`. | Contract states banned patterns and approved primitives. | Human read-through confirms no SaaS dashboard language. |
| T-002 | P1/W1/Visual | Design systems agent | 07 | T-001 | no | Create `docs/design/command-cortex-token-map.md`. | Palette, typography, spacing, membranes, glows, and motion roles are listed. | Compare against `07-material-color-system.png`. |
| T-003 | P1/W1/Data | Data/integration agent | 03 | none | no | Create `src/lib/commandCortex/types.ts`. | Types cover node, path, lens, signal, command, risk, source system. | `pnpm build` reaches typecheck after export. |
| T-004 | P1/W1/Data | Data/integration agent | 03 | T-003 | no | Create `src/lib/commandCortex/lensTypes.ts`. | Lenses map old pages to Mission, Agents, Work, Clients, Risk, Signals, Memory. | Typecheck verifies exhaustive lens IDs. |
| T-005 | P1/W1/Data | Data/integration agent | 03 | T-003 | no | Create `src/lib/commandCortex/sampleGraph.ts`. | Sample graph includes mission nucleus, clients, projects, issues, agents, humans. | Graph renders in fixture inspection without undefined IDs. |
| T-006 | P1/W1/Shell | UI/app agent | 01 | none | yes | Document `src/App.tsx` route lock contract in plan notes. | Contract names classic routes, new Mission Cortex route, and fallback path. | Planner approves lock-zone sequencing. |
| T-007 | P1/W1/Shell | UI/app agent | 06 | T-006 | yes | Define command palette coexistence strategy for `CommandPalette.tsx`. | Existing `⌘K` behavior has a migration path to command intent mode. | Manual review against current `src/components/ui/CommandPalette.tsx`. |
| T-008 | P1/W1/Shell | UI/app agent | 01 | T-006 | yes | Define macOS safe-zone/titlebar strategy for Tauri window chrome. | Plan keeps traffic-light area clear and does not require new permissions. | Tauri-core security review notes no new capability needed. |
| T-009 | P1/W2/Scaffold | UI/app agent | 08 | T-003 | no | Create `src/components/cortex/index.ts`. | Barrel exports planned cortex components. | `pnpm build` succeeds. |
| T-010 | P1/W2/Scaffold | UI/app agent | 08 | T-009 | no | Create placeholder `src/components/cortex/MissionCortex.tsx`. | Component accepts graph/lens props and renders empty shell text only. | Route-independent render smoke succeeds. |
| T-011 | P1/W2/Scaffold | UI/app agent | 08 | T-009 | no | Create placeholder `src/components/cortex/NeuralField.tsx`. | Component accepts nodes and paths props. | Typecheck verifies prop contract. |
| T-012 | P1/W2/Scaffold | UI/app agent | 08 | T-009 | no | Create placeholder `src/components/cortex/TacticalMembrane.tsx`. | Component accepts selected node and command list. | Typecheck verifies nullable selected state. |
| T-013 | P1/W2/Scaffold | UI/app agent | 08 | T-009 | no | Create placeholder `src/components/cortex/CommandRing.tsx`. | Component accepts selected node and command callbacks. | Keyboard/focus TODOs are documented in file comments. |
| T-014 | P1/W2/Scaffold | UI/app agent | 06 | T-009 | no | Create placeholder `src/components/cortex/LensRail.tsx`. | Component lists 7 lenses from the lens contract. | Typecheck verifies lens ID reuse. |
| T-015 | P1/W2/Scaffold | Design systems agent | 07 | T-002 | yes | Create `src/styles/command-cortex.css`. | File contains tokens only, no visual override of existing app yet. | Build succeeds and current app appearance remains stable. |
| T-016 | P1/W2/Scaffold | Design systems agent | 07 | T-015 | yes | Import `command-cortex.css` from `src/styles/globals.css`. | Command Cortex variables are globally available. | Inspect computed CSS variables in browser devtools. |
| T-017 | P1/W3/QA | Validation agent | 08 | T-010-T-016 | no | Create `docs/qa/command-cortex-verification.md`. | Document build, smoke, screenshot, reduced-motion, keyboard checks. | Planner approves evidence checklist. |
| T-018 | P1/W3/QA | Validation agent | 01 | T-017 | no | Capture baseline screenshots of current app before redesign. | Baseline includes overview, agents, compact width. | Screenshot files linked in QA doc. |
| T-019 | P1/W3/QA | Validation agent | 08 | T-017 | no | Run first foundation build gate. | `pnpm build` exits 0. | Paste command output into QA doc. |
| T-020 | P2/W1/Shell | UI/app agent | 01 | T-010,T-016 | yes | Create `src/pages/MissionCortexPage.tsx`. | Page renders `MissionCortex` without old sidebar/card layout. | Route smoke shows standalone page. |
| T-021 | P2/W1/Shell | UI/app agent | 01 | T-020,T-006 | yes | Add temporary `/mission-cortex` route in `src/App.tsx`. | Route is reachable without removing classic pages. | Manual route navigation succeeds. |
| T-022 | P2/W1/Shell | UI/app agent | 01 | T-021 | yes | Add optional launch redirect or nav hook for Mission Cortex preview. | Existing default route remains recoverable. | Manual test confirms no route dead-end. |
| T-023 | P2/W1/Field | UI/app agent | 02 | T-011,T-005 | no | Implement SVG viewport in `NeuralField.tsx`. | SVG fills available space and supports viewBox scaling. | Resize browser verifies no clipping. |
| T-024 | P2/W1/Field | UI/app agent | 03 | T-023 | no | Render path curves from graph data. | Healthy/active/pending/blocked paths have distinct class names. | Inspect DOM for path classes per state. |
| T-025 | P2/W1/Field | UI/app agent | 03 | T-023 | no | Render node glyphs from graph data. | Mission, client, project, issue, agent, human, memory glyphs differ visually. | Screenshot compare against `03-node-path-language.png`. |
| T-026 | P2/W1/Field | Design systems agent | 07 | T-024,T-025 | no | Style neural field background and glyph glow states. | Field reads as abstract tactical neural map, not dashboard. | Human visual review against `02-mission-cortex-field.png`. |
| T-027 | P2/W1/Field | UI/app agent | 02 | T-025 | no | Implement node labels and tactical annotations. | Labels remain legible without overwhelming the field. | Desktop screenshot review at 1440px and 1024px. |
| T-028 | P2/W2/Interaction | UI/app agent | 04 | T-025 | no | Add selected-node state to `MissionCortex.tsx`. | Clicking a node selects it and exposes node details. | Manual click smoke verifies state transition. |
| T-029 | P2/W2/Interaction | UI/app agent | 04 | T-028,T-013 | no | Implement `CommandRing.tsx` radial layout. | Ring shows contextual commands around selected node. | Keyboard tab order reaches every command. |
| T-030 | P2/W2/Interaction | UI/app agent | 04 | T-028,T-012 | no | Implement `TacticalMembrane.tsx` clipped polygon panel. | Membrane attaches near selected node and avoids normal card look. | Screenshot compare against `04-command-ring-membrane.png`. |
| T-031 | P2/W2/Interaction | UI/app agent | 06 | T-014,T-004 | no | Implement `LensRail.tsx` floating rail. | Seven lenses render without sidebar or drawer. | Keyboard and click selection both work. |
| T-032 | P2/W2/Interaction | UI/app agent | 06 | T-031 | no | Add command intent input to Mission Cortex. | Placeholder uses tactical verbs like Trace, Summon, Stabilize. | Manual typing and focus smoke succeeds. |
| T-033 | P2/W2/Interaction | UI/app agent | 06 | T-032,T-007 | yes | Wire `⌘K` behavior to open command intent in Mission Cortex only. | Existing command palette still works outside Mission Cortex. | Manual shortcut test on both routes. |
| T-034 | P2/W2/Interaction | Validation agent | 04 | T-029-T-033 | no | Verify keyboard focus and escape behavior. | Escape closes command ring/membrane before route changes. | Manual QA checklist completed. |
| T-035 | P2/W3/Motion | Motion agent | 05 | T-024 | no | Add CSS/SVG agent pulse animation. | Pulses move along active paths without layout animation. | DevTools confirms transform/opacity or SVG offset pattern. |
| T-036 | P2/W3/Motion | Motion agent | 05 | T-035 | no | Add handoff trail visual state. | Agent handoffs leave subtle temporary trails. | Reduced-motion disables trail movement. |
| T-037 | P2/W3/Motion | Motion agent | 05 | T-024 | no | Add blocked-path constriction visual. | Blocked paths pulse/inflame without heavy animation. | Screenshot shows risk state clearly. |
| T-038 | P2/W3/Motion | Motion agent | 05 | T-035-T-037 | no | Implement `prefers-reduced-motion` fallback. | Motion stops while final state remains understandable. | OS/browser reduced-motion test passes. |
| T-039 | P2/W3/Material | Design systems agent | 07 | T-026,T-030 | no | Polish membrane glass, command focus ring, and path materials. | Visual language matches material board without SaaS cards. | Human visual review accepts direction. |
| T-040 | P2/W3/QA | Validation agent | 01-07 | T-020-T-039 | no | Run Mission Cortex MVP gate. | Build passes and screenshots cover shell, field, selected node, reduced motion. | `pnpm build` plus screenshot evidence. |
| T-041 | P3/W1/Data | Data/integration agent | 02 | T-003,T-005 | no | Create `src/lib/commandCortex/buildMissionGraph.ts`. | Adapter maps real overview/agent/project/client issue inputs into graph entities. | Unit-like fixture test or TypeScript sample verifies IDs. |
| T-042 | P3/W1/Data | Data/integration agent | 02 | T-041 | no | Map Paperclip agent runtime to agent pulse nodes. | Healthy/stale/uninitialized map to signal states. | Fixture review with sample agent data. |
| T-043 | P3/W1/Data | Data/integration agent | 02 | T-041 | no | Map active projects and clients to clusters/branches. | Each project belongs to a client or fallback mission cluster. | Fixture review confirms no orphan paths. |
| T-044 | P3/W1/Data | Data/integration agent | 02 | T-041 | no | Map issues and review queues to inflammation nodes. | Open/blocking/review items produce amber/red risk nodes. | Fixture review confirms severity color assignment. |
| T-045 | P3/W1/Data | Data/integration agent | 05 | T-041 | no | Map activity/timesheet signals to signal trails. | Recent Clockify/Huly/GitHub/Slack activity appears as path metadata. | Fixture review confirms source labels. |
| T-046 | P3/W2/Lenses | UI/app agent | 06 | T-031,T-041 | no | Implement Mission lens emphasis. | Mission nucleus, urgent branches, and founder actions are emphasized. | Visual QA confirms non-selected data recedes. |
| T-047 | P3/W2/Lenses | UI/app agent | 06 | T-046 | no | Implement Agents lens emphasis. | Agent nodes, paths, handoffs, and queues become primary. | Compare against `08-agents-detail.png` concept where applicable. |
| T-048 | P3/W2/Lenses | UI/app agent | 06 | T-046 | no | Implement Work lens emphasis. | Projects, issues, progress, and ownership branches become primary. | Manual lens switch smoke succeeds. |
| T-049 | P3/W2/Lenses | UI/app agent | 06 | T-046 | no | Implement Clients lens emphasis. | Client clusters, contracts, and strategic risk become primary. | Manual lens switch smoke succeeds. |
| T-050 | P3/W2/Lenses | UI/app agent | 06 | T-046 | no | Implement Risk, Signals, and Memory lens emphasis. | Each lens changes graph classes without route reload. | Manual lens switch and screenshot evidence. |
| T-051 | P3/W3/Commands | UI/app agent | 04 | T-029,T-041 | no | Define command availability rules per node type. | Agents, projects, clients, issues, memory nodes expose correct verbs. | Typecheck confirms exhaustive node type handling. |
| T-052 | P3/W3/Commands | UI/app agent | 04 | T-051 | no | Stub command handlers for Trace, Summon, Stabilize, Approve, Escalate, Brief. | Commands produce safe UI feedback without backend mutation. | Manual click smoke verifies each stub response. |
| T-053 | P3/W3/Commands | Data/integration agent | 04 | T-052 | yes | Identify backend/Tauri commands required for real mutations. | Security-impacting commands are documented before implementation. | Tauri-core review confirms no silent permission widening. |
| T-054 | P4/W1/Migration | UI/app agent | 02,08 | T-040,T-046-T-053 | yes | Make Mission Cortex the primary home route behind a reversible fallback and reframe Overview, Agents, Projects, Clients, Issues, and Activity as lens/membrane destinations. | Core legacy surfaces remain reachable, but primary experience uses graph, lenses, command field, and membranes only. | Manual route fallback and one drilldown smoke per migrated core surface. |
| T-055 | P4/W2/Migration | UI/app agent | 06,09 | T-054 | yes | Map Team, Timesheet, Sprints, Calendar, Routines, Goals, Knowledge, Boards, Comms, Insights, Inbox, Onboarding, and Settings to secondary lens destinations or classic fallbacks. | Every existing page has an explicit Command Cortex destination and no unmapped navigation item remains. | Route inventory checklist plus screenshot showing no left drawer/sidebar in Command Cortex. |
| T-056 | P5/W1/Hardening | Validation agent | all | T-055 | no | Run final build, desktop visual QA, reduced-motion QA, keyboard/focus QA, performance profile, anti-SaaS design gate, and release/fallback notes. | `pnpm build` passes; screenshots cover shell/field/selected node/lenses/compact width; release notes document fallback and remaining gaps. | QA document contains command output, screenshots, reduced-motion evidence, keyboard checklist, perf notes, and human design signoff. |

## 7. Dependency Rationale

- Tasks T-001 through T-008 freeze contracts before parallel implementation.
- Tasks touching `src/App.tsx`, `src/styles/globals.css`, route topology, or Tauri capabilities are serialized lock-zone tasks.
- Component scaffolds can run in parallel after the type and visual contracts are frozen.
- Data adapter tasks can run independently of visual polishing once `types.ts` is stable.
- Lens implementation depends on the graph adapter because each lens changes semantic emphasis, not merely route state.
- Legacy page migration is intentionally bundled into wave-close tasks T-054 and T-055 so the plan stays within the requested 50-60 task range.

## 8. Verification Strategy

- **Write gate:** TypeScript compile catches contract drift via `pnpm build`.
- **Interaction gate:** Manual keyboard/focus checks for lens rail, command bar, command ring, and membranes.
- **Visual gate:** Screenshots compare against V3 assets, especially `02`, `04`, `06`, and `07`.
- **Motion gate:** Reduced-motion test plus performance profile for signal pulse animations.
- **Desktop gate:** Tauri/macOS screenshot verifies titlebar safe zone, resizing, and native density.
- **Design gate:** Anti-SaaS checklist blocks sidebar/card/KPI-dashboard regression.

## 9. GitHub Sync and Dispatch Strategy

- Create one GitHub issue per task or per small swarm bundle when tasks are too small for independent PRs.
- Label issues with `command-cortex`, `phase:P#`, `wave:W#`, `swarm:<name>`, `lock-zone:true|false`.
- Use branch pattern `swarm/command-cortex/{phase}-{wave}/{swarm}/{task-id}-{agent}`.
- Require every PR to include task ID, visual reference, dependencies, validation evidence, and lock-zone files touched.
- Integrate at wave boundaries: P1W1, P1W2, P1W3, P2W1, P2W2, P2W3, P3W1, P3W2, P3W3, P4W1, P4W2, P5W1.

## 10. Worker Bootstrap Packet Strategy

Each worker receives:

- This plan file path.
- Relevant visual reference image path.
- Allowed edit surface.
- Dependencies and upstream task IDs.
- Branch/worktree name.
- Validation command and expected evidence.
- Lock-zone warning if applicable.

Example packet:

```md
Task: T-029 CommandRing radial layout
Visual reference: design/assets/v3-command-cortex/04-command-ring-membrane.png
Allowed files: src/components/cortex/CommandRing.tsx, src/styles/command-cortex.css
Branch: swarm/command-cortex/p2-w2/interaction/T-029-codex
Worktree: .worktrees/T-029-codex
Dependencies: T-028, T-013
Validation: pnpm build; keyboard tab order manual smoke
Do not touch: src/App.tsx, package.json, Tauri capabilities
```

## 11. Risks and Fallback Plan

| Risk | Trigger | Fallback |
|---|---|---|
| Neural map becomes confusing | Users cannot identify current priorities quickly | Increase label hierarchy and add Mission lens defaults |
| Visuals become too ambitious | SVG/CSS implementation misses concept quality | Reduce motion complexity; keep glyph/path system strong |
| Old integrations are obscured | Existing data cannot map cleanly to graph | Use tactical membranes as transitional detail views |
| Lock-zone collisions happen | Multiple agents need `App.tsx` or globals simultaneously | Stop parallel work and create integration swarm |
| Tauri security drifts | New command requires widened permission/scope | Create explicit security task before implementation |
| Performance degrades | Animated graph drops below acceptable frame rate | Limit animated pulses, virtualize labels, defer secondary layers |

---

Plan complete and saved to `docs/plans/2026-06-12-command-cortex-visual-implementation.md`.

Execution options:

1. **Subagent-driven in this session** - dispatch fresh agents per task/wave, review between tasks.
2. **Parallel session execution** - open new worker sessions with the bootstrap packet strategy above.
3. **GitHub issue sync first** - convert this plan into issues before coding starts.
