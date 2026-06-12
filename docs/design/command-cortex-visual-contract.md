# Command Cortex Visual Contract

## Source References

- `design/MOODBOARD-V3.md`
- `design/assets/v3-command-cortex/01-macos-command-shell.png`
- `design/assets/v3-command-cortex/02-mission-cortex-field.png`
- `design/assets/v3-command-cortex/03-node-path-language.png`
- `design/assets/v3-command-cortex/04-command-ring-membrane.png`
- `design/assets/v3-command-cortex/05-agent-signal-motion.png`
- `design/assets/v3-command-cortex/06-lens-rail-command-bar.png`
- `design/assets/v3-command-cortex/07-material-color-system.png`
- `design/assets/v3-command-cortex/08-buildable-ui-spec.png`

## Product Metaphor

Team Forge becomes **Command Cortex**: a Tauri/macOS-first biological war-room for commanding AI agents through the living operational nervous system of the company.

The primary surface is not a dashboard. It is an abstract tactical neural field where company entities appear as nodes, relationships appear as synaptic paths, and agent work appears as signal movement.

## Mandatory Visual Rules

- No permanent left menu drawer in Command Cortex.
- No KPI card wall as the primary information hierarchy.
- No generic SaaS admin dashboard layout.
- No rectangular cards as the default content container.
- No LCARS orange-first visual language inside the new Command Cortex shell.
- Use neural branches, node glyphs, signal paths, command rings, tactical membranes, and lens overlays.
- Keep the look crisp, engineered, and command-grade rather than literal organic tissue.

## Approved Primitives

- **Neural field:** SVG surface with Bezier paths and node glyphs.
- **Mission nucleus:** central operational state node.
- **Synaptic paths:** relationships between clients, projects, issues, agents, humans, and memory.
- **Agent pulses:** animated signals moving across active paths.
- **Inflammation nodes:** amber/red risk points on branches.
- **Lens rail:** floating selector for Mission, Agents, Work, Clients, Risk, Signals, Memory.
- **Intent command field:** keyboard-first command surface.
- **Command ring:** radial action layer around a selected node.
- **Tactical membrane:** clipped translucent context surface attached to a node.
- **Runtime strip:** compact desktop status strip for sync/runtime health.

## macOS/Tauri Contract

- Preserve a safe top-left zone for macOS traffic lights and custom titlebar drag regions.
- Favor compact desktop density over web landing-page spacing.
- Keep primary controls keyboard reachable.
- Use `⌘K`, `⌘1` through `⌘7`, `Escape`, and `Space` as planned shortcuts.
- Do not require new Tauri permissions for Phase 1 visual scaffolding.

## Motion Rules

- Motion must communicate state: active flow, blocked flow, handoff, pending judgment, or focus.
- Animate compositor-friendly properties or SVG stroke/offset behavior only.
- Provide `prefers-reduced-motion` fallbacks for every nonessential animation.
- Never rely on motion alone to communicate state.

## Acceptance Gate

A Command Cortex surface passes the visual gate only if it reads as a tactical neural operating environment for an AI agentic company and not as an admin dashboard, CRM, project-management board, or generic SaaS control panel.
