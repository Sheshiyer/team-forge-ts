# TeamForge

## What This Is

TeamForge is a native macOS desktop app (Tauri 2 + React 19 + Rust) that unifies Clockify time tracking, Huly execution workflows, GitHub engineering issues, Slack activity, and a Cloudflare Worker + D1 backed project registry into a single LCARS-styled mission-control surface — for a small founder-led team (Thoughtseed) running multiple client engagements.

## Core Value

**One app where the founder can see the team's actual state — time, work, presence, and project health — without context-switching across six SaaS tools.** If everything else fails, the founder must still be able to glance at TeamForge and know: who's working, on what, against which client, and whether the data is fresh.

## Requirements

### Validated

<!-- Shipped through v0.1.28 and confirmed working in production use. -->

- ✓ Clockify + Huly + Slack + GitHub integrations with background scheduler — v0.1.0–v0.1.20
- ✓ Cloudflare Worker + D1 project control plane (registry, conflict inbox, classification overrides) — v0.1.21–v0.1.25 (closes #42, #43, #44)
- ✓ Hybrid GitHub-authoritative engineering / Huly-authoritative execution issue propagation — v0.1.22–v0.1.25 (closes #40, #41, #44)
- ✓ Operational ops fabric: ops_event schema, dedup sync_keys, role-specific agent_feed slices, Paperclip enrichment, vault snapshot persistence — v0.1.20–v0.1.25 (closes #20–#39)
- ✓ Operator UI for project registry, conflict inbox, classification overrides — v0.1.25 (closes #43)
- ✓ Founder-sync vault parity from app contract (Settings-driven) — v0.1.26–v0.1.27 (Node sidecar shell-out)
- ✓ Paperclip runtime ops + founder approvals queue inside `/agents` shell — v0.1.27–v0.1.28
- ✓ OTA update channel (Tauri updater + Cloudflare Worker `/v1/ota/check`) — v0.1.x

### Active — v0.2 Foundation Closeout

<!-- Current scope. The 8 open GitHub issues. -->

- [ ] **TF-45**: Founder Sync Hardening — remove external Node runtime dependency from Settings vault sync ([#45](https://github.com/Sheshiyer/team-forge-ts/issues/45))
- [ ] **TF-46**: Vault Parity Data Completion — backfill missing client metadata, technical specs, design/research/closeout docs, onboarding notes, Clockify project IDs ([#46](https://github.com/Sheshiyer/team-forge-ts/issues/46))
- [ ] **TF-04**: Data Foundation — implement 8 Huly relation types between entities (Blocks, Relates To, Duplicates, Creates Resource, Documents In, Involves Device, Part of Sprint, Client Assignment) ([#4](https://github.com/Sheshiyer/team-forge-ts/issues/4))
- [ ] **TF-14**: Client Onboarding Template & Flow Tracking ([#14](https://github.com/Sheshiyer/team-forge-ts/issues/14))
- [ ] **TF-12**: Role-Based Dashboards (Executive, PM, Developer) ([#12](https://github.com/Sheshiyer/team-forge-ts/issues/12))
- [ ] **TF-09**: Team page enhancements — HR Time-Off, Monthly Hours, Remote Visibility ([#9](https://github.com/Sheshiyer/team-forge-ts/issues/9))
- [ ] **TF-08**: Sprints page — Sprint Ceremonies & Burndown ([#8](https://github.com/Sheshiyer/team-forge-ts/issues/8))
- [ ] **TF-15**: Huly Planner integration for personal time-blocking ([#15](https://github.com/Sheshiyer/team-forge-ts/issues/15))

### Out of Scope

- **iOS / Android / Windows / Linux clients** — macOS-first; mobile or other desktop platforms are not v0.2 scope (build pipeline + signing infrastructure are mac-only today).
- **Multi-tenant SaaS** — TeamForge is single-team / founder-installed today; the Worker is shared infra but the app is not multi-tenant in the auth sense.
- **Replacing GitHub or Huly as systems of record** — TeamForge is a read/aggregate plane plus a thin write/control plane; the underlying source-of-truth assignment per issue type stays as defined in v0.1.
- **Real-time chat / video / presence beyond 30 s polling** — out of scope for v0.2.
- **Custom AI inference inside the app** — Paperclip runtime owns agent runtime; TeamForge is the operator surface, not an LLM host.

## Context

**Codebase shape:** ~12 KLOC Rust (`src-tauri/src/commands/mod.rs` is the IPC surface), ~3 KLOC SQL access (`src-tauri/src/db/queries.rs`), ~700 LOC React shell (`src/App.tsx` + 16 page components), Cloudflare Worker (~5 routes, 5 D1 migrations), plus ~3 KLOC Node in `scripts/teamforge-vault-parity.mjs` — the script TF-45 will partially or fully retire.

**Release cadence:** v0.1.0 → v0.1.28 in ~6 weeks; Tauri-signed OTA via Cloudflare Worker. CHANGELOG.md keeps human-readable history; tags drive the release pipeline.

**Working pattern:** every shipped slice is a `# Task Plan / Goal / Plan / Review / Verification` block in `tasks/todo.md` plus a CHANGELOG entry. v0.2 transitions this same vocabulary into `.planning/phases/N-{slug}/{N}-PLAN.md` files with the same fields.

**Testing posture:** light. ~46 inline `#[cfg(test)] mod tests` Rust blocks in `db/queries.rs` and integration `client.rs` files; one Vitest file for the updater wrapper; manual `pnpm build`, `cargo check`, `cargo fmt`, plus `scripts/forge-aura-adapter/test-contract.sh` for Paperclip adapter contracts. CI in `.github/workflows/` covers builds and notarization, not test gates. Verification is mostly manual + each release entry's "Verification" section.

**Known traps (from `tasks/lessons.md` and recent CHANGELOG):**
- Migrations are bolted on via `ensure_*_columns` ALTER patterns — only one numbered migration file exists (`src-tauri/migrations/001_initial.sql`).
- `commands/mod.rs` is one ~12 KLOC file; resist splitting until naming patterns stabilize.
- The "sidecar" directory is **not** a Tauri sidecar; bundled Node helpers are declared as `bundle.resources` in `tauri.conf.json:53-57` and launched via `tauri-plugin-shell`.
- `scripts/teamforge-vault-parity.mjs` is the spec for any Rust port of vault parity (TF-45 territory) — do not delete it before parity is reached.

## Constraints

- **Tech stack**: Tauri 2 + React 19 + Rust 2021 (sqlx 0.8 + reqwest 0.12 + tokio 1) on the client; Cloudflare Worker (TypeScript) + D1 + R2 + Queues + Durable Objects on the server. No new languages.
- **Distribution**: macOS .app via Tauri; signed + notarized; OTA through `tauri-plugin-updater` against the Cloudflare Worker. Windows / Linux not in v0.2.
- **Founder-installable**: app must run on a clean founder Mac without requiring a separate Node runtime on PATH (this is exactly what TF-45 closes — currently violated).
- **GitHub-authoritative engineering issues, Huly-authoritative execution issues, GitHub-authoritative milestones** — locked by v0.1 contracts in `docs/architecture/contracts/`.
- **No new core integrations in v0.2** — scope is closeout of foundation gaps, not net-new SaaS connectors.
- **Single founder + small team**: workflow choices favor founder velocity over enterprise controls (no review gates, no formal QA team, no time estimates).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tauri 2 over Electron | Native binary, smaller footprint, Rust core for the integration-heavy backend | ✓ Good |
| Cloudflare Worker + D1 as control plane | Edge latency, free tier covers founder scale, one runtime for OTA + project graph + agent feed | ✓ Good |
| GitHub-authoritative engineering / Huly-authoritative execution split | Engineering wants version-controlled issue history; PM wants planning canvas | ✓ Good (v0.1.25) |
| ops_event schema with deterministic sync_key for dedup | Multiple producers (Clockify/Huly/Slack/GitHub) needed idempotent fan-in | ✓ Good (v0.1.21) |
| Vault parity as Node script (not Rust) — temporary | Faster to ship; Node already had vault-walking utilities | ⚠️ Revisit (TF-45) |
| `commands/mod.rs` as single 12 KLOC file | Avoid premature module splits until patterns stabilize | — Pending (revisit at v0.3) |
| Adopt GSD workflow for v0.2 milestone | The 8 open issues are foundation-closeout work; structured discuss → plan → execute → verify → ship loop fits the heterogeneous mix (1 architectural fork, 1 data backfill, 1 schema, 5 UI/full-stack) | — Pending |

---
*Last updated: 2026-05-04 after initial GSD bootstrap*

## Evolution

PROJECT.md updates after each phase transition:
1. Requirements invalidated → move to Out of Scope with reason
2. Requirements validated → mark ✓ in Validated with phase/version reference
3. New requirements emerged → add to Active
4. Decisions to log → append to Key Decisions table
5. "What This Is" still accurate → update if drifted
