# ThoughtSeed Engagement Playbook v1.0

> **The repeatable process from signed contract to race-free parallel delivery.**
> Distilled from the ParkArea Phase 2 engagement (2026-04-15 → present). Maps to Huly data model + GitHub + spec-kit + Substrate (.context) + swarm-architect topology.

## Use this when

You sign a new client engagement and need to go from PDF in your inbox to 8–10 parallel coding agents shipping code, without race conditions or scope drift, in days not weeks.

---

## The 9-phase engagement lifecycle

```
Phase 0  PRE-ENGAGEMENT      (sales → contract signature)
Phase 1  DISCOVERY           (contract → context map)             ~2 hrs
Phase 2  FOUNDATION          (constitution + governance docs)     ~3 hrs
Phase 3  DECOMPOSITION       (specs + GitHub milestone + issues)  ~3 hrs
Phase 4  AUDIT (Pass 1)      (drift detection vs contract)        ~1 hr
Phase 5  AMBIENT MEMORY      (.context Substrate methodology)     ~3 hrs
Phase 6  PARALLEL TOPOLOGY   (LCD code + worktrees + tracks)      ~5 hrs
Phase 7  EXECUTION           (waves of parallel agent work)       weeks
Phase 8  ACCEPTANCE          (staging → client sign-off)          1–2 days
Phase 9  CUTOVER + WARRANTY  (production + IP transfer)           1 day + 4 weeks
```

Total time-to-parallel-execution: **~17 hrs** (one focused day) for the orchestrator. Every phase produces canonical artifacts.

---

## Phase-by-phase canonical recipe

### Phase 0 — Pre-Engagement
**Skills**: `anthropic-skills:thoughtseed-proposal-generator`, `anthropic-skills:thoughtseed-contract-generator`
**Outputs**: signed PDF contract, signed technical scope (Tech §1–§N)
**Huly artifacts**: `Client` class entry created (tier, industry, monthly_value, primary_contact, status=Active)
**Gate**: Both PDFs received and stored in vault under `01-Projects/<client>/`

### Phase 1 — Discovery
**Skills**: `anthropic-skills:pdf` (read PDFs), `Explore` agent (map repo if Phase 1 demo exists)
**Inputs**: signed PDFs + any reference deliverables (demo, brand assets, prior code)
**Outputs**:
- Plain-text contract digest (`docs/contract-summary.md`)
- Plain-text tech-scope digest (`docs/tech-spec-summary.md`)
- Reference inventory (pages, components, brand tokens if demo provided)
- Locked decisions table (PSP, hosting, repo, sprint window, key defaults)
**Gate**: Decisions table signed off by Developer; client questions queued for Day-1 email
**Huly artifacts**: `Project` entry (project_type, client, contract_start, status=Active, sprint_length)

### Phase 2 — Foundation
**Skills**: spec-kit (`uvx --from git+https://github.com/github/spec-kit.git specify init --here --ai claude`)
**Outputs** (committed to new private GitHub repo):
- `.specify/memory/constitution.md` — 12 invariants (3 marked NON-NEGOTIABLE; e.g. fixed-scope, append-only ledger, tenant isolation)
- `README.md` — project overview + reading order
- `docs/contract-summary.md`, `docs/tech-spec-summary.md`
- `docs/traceability-matrix.md` — every contract clause → spec/wave/label
- `docs/out-of-scope.md` — explicit fence (constitutional)
- `docs/warranty.md` (§11), `docs/strategic-context.md`, `docs/change-requests.md`, `docs/risk-register.md`, `docs/ops-handoff.md`, `docs/contract/README.md`
**Gate**: spec-kit init succeeds; constitution committed; private repo created
**Huly artifacts**: link Project to GitHub repo URL; create initial `Issue` for Wave 0 bootstrap

### Phase 3 — Decomposition
**Skills**: `swarm-architect` (phase→wave→swarm idiom), `gh` CLI for milestones+labels+issues
**Outputs**:
- One feature spec ID per major contract clause (typically 8–12 specs)
- GitHub milestone (one per delivery cycle, e.g. "Phase 2 — German Launch")
- 41 standardized labels: `spec:NNN` · `wave:N` · `type:{spec,impl,test,infra,docs}` · `contract:§3.x` · `priority:p0/p1/p2` · `warranty` · `change-request` · `acceptance` · `track-anchor` · `type:integration`
- Epic issues — one per spec — bodies enumerate scope, contract clauses, endpoints, acceptance criteria, dependencies, target files
- Wave 0 retroactive tracking issue
**Gate**: All epics open; milestone has due date matching contract §7 (or accelerated sprint window)
**Huly artifacts**: Sync GitHub issues → Huly `Issue` entries with `task_complexity`, `priority_level`, `work_status=Backlog` enums populated

### Phase 4 — Drift Audit (Pass 1)
**Skills**: `autoresearch` (Karpathy-style 3-pass loop), parallel `Explore` agents
**Method**: 3 parallel passes (Contract / Tech-spec / Design ↔ Plan / Constitution / Issues)
**Outputs**:
- Drift heatmap (severity rollup: HIGH / MED / LOW)
- Per-issue addendum comments (each spec epic gets a "🔧 Drift Audit Fix" comment with corrections)
- Change requests filed for any client-required deviations (`docs/change-requests.md` CR-001, CR-002, …)
- Updated docs (e.g., bilingual amendment to Constitution; new ADRs)
**Gate**: 0 unresolved HIGH; all MED have target waves; LOW deferred to spec-kit `/specify` runs
**Huly artifacts**: `risk_register` entries created for HIGH items; `change_requests` for client-pending decisions

### Phase 5 — Ambient Memory (Substrate)
**Skills**: `andrefigueira/.context` methodology
**Outputs** (~28 files):
- `CLAUDE.md` (auto-loaded by Claude Code at session start)
- `agents.md` (manual load for Cursor/Copilot/Codex/Gemini)
- `.context/` tree:
  - `substrate.md` — index + reading order
  - `ai-rules.md` — 10 behavior rules
  - `glossary.md` — domain + tech vocabulary (~50 terms)
  - `anti-patterns.md` — 20 explicit "don't" with rationale
  - `workflows.md`, `errors.md`, `testing.md`
  - `architecture/overview.md` (system + data flow)
  - `database/{schema,migrations}.md`
  - `api/{conventions,mock-server}.md`
  - `auth/{rbac,sessions}.md`
  - `ui/{design-system,component-inventory,preview-strategy,visual-finesse,demo-mapping}.md`
  - `decisions/0001–000N.md` — ADRs (one per architectural choice)
  - `prompts/{add-feature-spec,add-migration,add-acceptance-test,add-locale-string,start-track,wave-merge,visual-fidelity-check,add-shared-contract}.md`
- `.context/parallel/` (worktree-topology, lcd-checklist, coordination, agent-roles, integration-tasks)
- `.context/contracts/README.md`
**Gate**: every new session that opens the repo auto-loads CLAUDE.md; vocabulary, anti-patterns, RBAC, design tokens immediately available
**Huly artifacts**: link to .context tree from Project entity; populate Project.knowledge_lineage with these doc paths

### Phase 6 — Parallel Topology (LCD + Worktrees)
**Skills**: `swarm-architect:worktree-strategy`, `swarm-architect:multi-agent-boundaries`, `superpowers:using-git-worktrees`
**LCD = Lowest Common Denominator** = the frozen contracts that ALL tracks consume:
1. `shared/contracts/*.ts` (Zod schemas per endpoint)
2. `shared/schema.ts` (Drizzle DB schema, all tables locked)
3. `shared/rbac/matrix.ts` (permission matrix)
4. `shared/design-tokens.ts` (brand tokens extracted from demo)
5. `client/src/locales/{de,en}.json` (i18n skeleton)
6. `openapi.json` (generated from Zod)
7. `server/mock/server.ts` (frontend dev server, port 3001)
8. `docker-compose.yml` + `.env.example`
9. `.github/workflows/ci.yml`
10. `.context/ui/demo-mapping.md` (page → endpoints → spec)
**Plus** scaffolding: `package.json`, `tsconfig.json`, `drizzle.config.ts`, `scripts/db-init.sql`, `scripts/lcd-verify.sh`, `scripts/check-locale-parity.sh`
**Gate**: `bash scripts/lcd-verify.sh` returns 0 (all 15 checks pass)
**Then create worktrees + branches** for each parallel track:
```
.worktrees/track-contracts          → swarm/<client>/wave-1/contracts/T-001-claude
.worktrees/track-backend-core       → swarm/<client>/wave-1/backend-core/T-002-claude
.worktrees/track-backend-domain     → swarm/<client>/wave-1/backend-domain/T-003-claude
.worktrees/track-backend-payments   → swarm/<client>/wave-1/backend-payments/T-004-claude
.worktrees/track-frontend-public    → swarm/<client>/wave-1/frontend-public/T-005-claude
.worktrees/track-frontend-provider  → swarm/<client>/wave-1/frontend-provider/T-006-claude
.worktrees/track-frontend-admin     → swarm/<client>/wave-1/frontend-admin/T-007-claude
.worktrees/track-infra              → swarm/<client>/wave-1/infra/T-008-claude
.worktrees/track-i18n               → swarm/<client>/wave-1/i18n/T-009-claude
.worktrees/track-qa                 → swarm/<client>/wave-1/qa/T-010-claude
```
**Open one track-anchor issue per track** (label: `track-anchor`). Each issue body links to `.context/prompts/start-track.md` for agent bootstrap.
**Huly artifacts**: each track → Huly `Tracker.Component`; each task issue → Huly `Issue` with assignee, priority, complexity

### Phase 7 — Execution
**Skills**: `superpowers:test-driven-development`, `superpowers:subagent-driven-development`, `superpowers:verification-before-completion`, `superpowers:requesting-code-review`
**Per agent on a track**:
1. `cd .worktrees/track-<NAME>` (CLAUDE.md auto-loads)
2. Read track-anchor issue → know tasks
3. TDD: red → green → refactor
4. Push, comment on track-anchor with progress
**Wave-close**: `superpowers:finishing-a-development-branch` → PR to main, squash-merge, drift audit re-run if drift surface widens
**Huly artifacts**: agent presence/availability synced from Clockify; task `work_status` updated as PRs land

### Phase 8 — Acceptance
**Skills**: `webapp-testing` / Playwright, `gsd:ui-review`, `superdesign`, `qa`
**Outputs**:
- Staging URL deployed (Hetzner / Railway / client-chosen)
- All `specs/*/acceptance.spec.ts` Playwright tests green
- Visual fidelity audit (`prompts/visual-fidelity-check.md`) — demo vs production diff zero
- Acceptance email to client with §5 acceptance checklist
**Gate (per contract)**: 10 working days silent-acceptance clock starts; explicit sign-off OR silent pass
**Huly artifacts**: client meeting/checkpoint scheduled; `meeting_type=Client Call` entries

### Phase 9 — Cutover + Warranty
**Skills**: `superpowers:finishing-a-development-branch`, `commit-commands:commit-push-pr`
**Outputs**:
- Production deploy
- Tag `v1.0.0`
- IP transfer per contract §13 (repo ownership transferred to client org)
- Warranty period begins (`docs/warranty.md` 4-week SLA active)
- Final invoice issued
**Huly artifacts**: Project status → `Maintenance` (tier dropped to Tier 3); `warranty_log` entries for any post-go-live tickets

---

## Skill-chain map (the canonical sequence)

| Phase | Skill | Tool/Service |
|---|---|---|
| 0 | `thoughtseed-contract-generator` | Word/Google Docs |
| 1 | `anthropic-skills:pdf`, `Explore` agent | PDF reader, Bash |
| 2 | spec-kit, `Write` tool | `uvx specify init --here --ai claude`, `gh repo create` |
| 3 | `swarm-architect`, `gh` CLI | GitHub milestones + labels + issues |
| 4 | `autoresearch`, parallel `Explore` agents | Bash, gh issue comment |
| 5 | Substrate methodology, `Write` × 28 | `.context/` tree |
| 6 | `swarm-architect:worktree-strategy`, `superpowers:using-git-worktrees` | `git worktree add`, `gh issue create` |
| 7 | `superpowers:test-driven-development`, `subagent-driven-development`, `verification-before-completion`, `requesting-code-review` | `pnpm test`, `gh pr create` |
| 8 | `webapp-testing`, `gsd:ui-review` | Playwright, Browser tools |
| 9 | `superpowers:finishing-a-development-branch`, `ship` | `gh pr merge`, `git tag` |

---

## Universal anti-patterns (apply across all engagements)

1. ❌ Skip the constitution → drift on day 3
2. ❌ Author specs in markdown without spec-kit → no traceability, no `/analyze`
3. ❌ Start parallel work without LCD frozen → race conditions guaranteed
4. ❌ Let multiple tracks edit same shared file → integration hell
5. ❌ Silent contract changes (no CR doc) → contract dispute risk
6. ❌ Mock data that diverges from real backend shape → "works in mock, breaks in prod"
7. ❌ Hardcode user-facing strings (no i18n hooks) → blocks Phase 3 EU rollout
8. ❌ Skip drift audit between waves → small drifts compound to large rework
9. ❌ Commit demo code into production repo → poisoned git history
10. ❌ Apply taste-skill verbatim against client-locked brand → re-design fights

---

## Huly data model mapping (per `docs/huly-system-design.md`)

For every new engagement, populate Huly:

```yaml
Client:
  name: "<Client Legal Name>"
  tier: "<client_tier enum: Tier 1 / 2 / 3 / 4 / R&D>"
  industry: "<industry>"
  contract_start: "<ISO date>"
  contract_end: "<ISO date or null>"
  primary_contact: "<name>"
  contact_email: "<email>"
  revenue_model: "<Per-Project | Monthly Retainer | etc>"
  monthly_value: <EUR/USD>
  google_drive_folder: "<URL>"
  status: "Active"

Project:
  client: <Client.id>
  name: "<Project Name + Phase>"
  project_type: "<project_type enum>"
  status: "Active"
  github_repo: "<https://github.com/...>"
  contract_pdf_path: "<vault path, NOT committed>"
  knowledge_lineage:
    - .context/substrate.md
    - .specify/memory/constitution.md
    - docs/traceability-matrix.md
  sprint_length_weeks: <number>

Tracker.Component (one per parallel track):
  - contracts
  - backend-core
  - backend-domain
  - backend-payments
  - frontend-public
  - frontend-provider
  - frontend-admin
  - infra
  - i18n
  - qa

Issue (one per spec epic + one per task):
  title: "[Spec NNN] <name>"
  component: <Tracker.Component>
  priority: "<priority_level enum>"
  task_complexity: "<task_complexity enum>"
  work_status: "Backlog → Scheduled → In Progress → Review → Done"
  assignee: <Member>
  github_issue_url: "<URL>"  # Bidirectional sync
```

---

## Automation hooks (team-forge-ts integration)

Where `team-forge-ts` (Thoughtseed's delivery operating system) wires in:

### Bootstrap CLI sketch

```bash
team-forge engagement init \
  --client "ASIA INSIDE" \
  --project "ParkArea Phase 2" \
  --contract-pdf ~/Downloads/contract.pdf \
  --tech-spec-pdf ~/Downloads/tech-scope.pdf \
  --github-org sheshiyer \
  --repo-name parkarea-aleph \
  --sprint-weeks 3 \
  --tracks 10 \
  --huly-workspace <slug>
```

This single command should:
1. Read both PDFs → extract digests via `anthropic-skills:pdf`
2. Create GitHub repo (private)
3. Run `specify init`
4. Create Huly Client + Project entries (via API)
5. Sync GitHub milestone/labels/issues to Huly tracker
6. Generate `.context/` scaffold (templated from this playbook)
7. Output the LCD checklist + suggested specs

### Huly API integration

Auth header: `Authorization: Bearer $HULY_API_KEY` (env var, NEVER committed)

Endpoints exercised (per Huly's API docs in repo):
- `POST /api/v1/workspace/<slug>/class/Client` — create client
- `POST /api/v1/workspace/<slug>/tracker/project` — create tracker project linked to GitHub
- `POST /api/v1/workspace/<slug>/tracker/issue` — create issue per epic + task
- `POST /api/v1/workspace/<slug>/tracker/component` — create component per parallel track
- Webhook from GitHub → update Huly issue `work_status` on PR merge

### GitHub ↔ Huly sync (recommended pattern)

GitHub remains the agent-facing source of truth for code + commits + PRs. Huly is the human-facing source of truth for status, presence, and reporting. A small webhook bridge (`team-forge-ts/sidecar/`) syncs:
- GitHub issue created → Huly issue created
- GitHub issue closed → Huly status → `Done`
- GitHub PR merged → linked Huly issue → `Done`, Clockify time logged
- Huly priority change → GitHub label sync

---

## Reference engagement: ParkArea Phase 2

Concrete instantiation of this playbook (generated 2026-04-15 → 2026-04-16):

| Phase | Output | Link / Path |
|---|---|---|
| 1 Discovery | Contract + tech digests | `01-Projects/parkarea/parkarea-aleph/docs/{contract,tech-spec}-summary.md` |
| 2 Foundation | Repo + constitution | https://github.com/Sheshiyer/parkarea-aleph |
| 3 Decomposition | Milestone + 41 labels + 10 epics | https://github.com/Sheshiyer/parkarea-aleph/milestone/1 |
| 4 Audit Pass 1 | 22 drift items resolved, CR-001 logged | commit `50f58eb` |
| 5 Substrate | 28 .context files, CLAUDE.md auto-load | commit `098caec` |
| 6 Parallel | 10 worktrees + 11 ADRs + LCD verified 15/15 | commits `7d2e9d3`, `d21b497`, `9da1edf` |
| Track issues | #12–21 (10 track-anchor issues) | https://github.com/Sheshiyer/parkarea-aleph/issues |

**Cycle time for Phases 1–6**: ~17 hours of orchestrator effort (one Claude session). Result: 10 parallel agent worktrees ready to dispatch.

---

## Storage of secrets

This playbook references `HULY_API_KEY`. Storage rules:
- **NEVER** commit to any repo
- Keep in `~/.zshrc` or shell env: `export HULY_API_KEY="..."`
- Or in vault-level `.env` (vault root is gitignored)
- For team-forge CLI: read from `process.env.HULY_API_KEY` only
- For Huly webhook bridge: pass via Cloudflare Worker secret binding, not in code
- API key rotation: every 90 days; document rotation in `team-forge-ts/docs/secrets-rotation.md`

If the key is leaked (e.g. pasted in chat — as happened during this playbook's creation), rotate immediately via Huly settings.

---

## Versioning this playbook

- v1.0 (2026-04-16) — Initial extraction from ParkArea Phase 2 engagement
- Future engagements should fork this playbook and contribute back any new universal patterns discovered
- Engagement-specific deviations are CR'd, not playbook-amended

---

## Companion files

Also see:
- `docs/huly-system-design.md` — Huly data model authoritative
- `tasks/lessons.md` — running learnings log
- `tasks/todo.md` — team-forge-ts implementation backlog
