# Command Cortex Visual Gap Register

## Current State

Phase 2 establishes the Mission Cortex route and a higher-fidelity buildable neural command surface. It is a working implementation milestone, not the final visual language.

The current implementation proves:

- A standalone `/mission-cortex` route can bypass the LCARS shell.
- Local non-Tauri web preview can default to Command Cortex.
- SVG node glyphs, path sheaths, labels, lens rail, command ring, tactical membrane traces, intent bar, and runtime strip can render with React/CSS.
- The surface builds with the existing Vite/React/Tauri stack.

## Reference Target

Reference assets remain:

- `design/assets/v3-command-cortex/01-macos-command-shell.png`
- `design/assets/v3-command-cortex/02-mission-cortex-field.png`
- `design/assets/v3-command-cortex/03-node-path-language.png`
- `design/assets/v3-command-cortex/04-command-ring-membrane.png`
- `design/assets/v3-command-cortex/05-agent-signal-motion.png`
- `design/assets/v3-command-cortex/06-lens-rail-command-bar.png`
- `design/assets/v3-command-cortex/07-material-color-system.png`
- `design/assets/v3-command-cortex/08-buildable-ui-spec.png`

## Visual Gaps

| Gap | Current MVP | Reference Expectation | Follow-up Work |
|---|---|---|---|
| Composition depth | Mostly flat field with simple nodes | Layered tactical neural tissue with foreground, midground, and background signal depth | Add field strata, contour fields, and atmospheric overlays |
| Node language | Generic circles with labels | Distinct mission/client/project/agent/issue glyph identities | Build actual glyph primitives per node kind |
| Path language | Simple Bezier lines | Branching synaptic pathways with tension, state, handoff, and inflammation semantics | Add multi-segment branches, path textures, and state-specific geometry |
| Command ring | Functional radial buttons, visually rough | Surgical command halo attached cleanly to selected node | Redesign ring geometry and collision-aware placement |
| Tactical membrane | Basic clipped panel | Rich inspection membrane with traces, decisions, risk, and command affordances | Add trace rows, source badges, recent activity, and stronger material layering |
| Lens rail | Functional top rail | Native macOS command layer with stronger lens identity | Add lens icons, active field transformations, and keyboard hint system |
| Agent motion | Static pulse approximation | Meaningful signal travel, handoff trails, blocked flow, pending oscillation | Add path-following animation and reduced-motion snapshots |
| macOS feel | Browser shell still visible in web preview | Desktop command environment ready for Tauri window chrome | Add Tauri-safe chrome rules and later test in native shell |
| Data realism | Sample graph only | Real Paperclip/Huly/GitHub/Clockify/Slack signals mapped to graph | Phase 3 adapter work |
| Typographic polish | Basic mono labels | Crisp engineered hierarchy with legible tactical annotation | Refine scale, line lengths, contrast, and label collision rules |

## Quality Bar Before Visual Approval

The next visual approval should require:

- No LCARS shell visible on the Command Cortex route.
- No SaaS dashboard/card/sidebar grammar.
- Node kinds are visually distinguishable without reading labels.
- Selected node interaction feels intentional, not randomly placed.
- Risk, pending, healthy, active, and dormant states are visible without motion.
- Motion adds semantic meaning, not decoration.
- The screen feels like a powerful biological war-room for commanding agents.

## Recommended Later Polish Wave

Before final brand approval, run a **Visual Fidelity Polish Wave**:

1. Redesign node glyph primitives.
2. Redesign path geometry and signal layering.
3. Rebuild command ring placement and visual hierarchy.
4. Upgrade tactical membrane content and material treatment.
5. Add collision-aware labels or label priority rules.
6. Capture screenshot comparisons against V3 assets.

This prevents Phase 3 data work from hardening a low-fidelity visual scaffold.
