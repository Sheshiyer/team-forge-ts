# Command Cortex Shell Contract

## Lock-Zone Files

- `src/App.tsx`
- `src/styles/globals.css`
- `src/components/ui/CommandPalette.tsx`
- Tauri capability/config files under `src-tauri/`

Phase 1 does not change route topology or Tauri permissions. Future work must serialize changes to these lock zones.

## Route Strategy

- Keep the existing classic routes intact during foundation work.
- Add the Mission Cortex route only in Phase 2.
- The planned preview route is `/mission-cortex`.
- The current overview route remains the fallback until Command Cortex passes the MVP gate.
- Classic pages should remain reachable until their data has a Command Cortex lens/membrane destination.

## Command Palette Coexistence

Current `CommandPalette.tsx` owns global command search and classic page navigation. The Command Cortex intent field must not replace it globally during Phase 1.

Future behavior:

- Outside Mission Cortex, `⌘K` opens the existing command palette.
- Inside Mission Cortex, `⌘K` focuses the intent command field first.
- `Escape` closes the command ring or tactical membrane before closing the shell-level command layer.
- Existing command items remain available through a fallback palette action.

## macOS/Tauri Titlebar Strategy

- Reserve the top-left safe zone for macOS traffic lights.
- Use an edge-to-edge dark shell behind the neural field.
- Keep desktop window controls visually separate from neural field nodes.
- Do not add new Tauri capabilities for visual-only shell work.
- Any future custom titlebar or drag-region behavior must be reviewed as a Tauri shell change.

## Integration Boundary

Command Cortex consumes existing frontend data via adapters. It should not call Tauri invoke commands directly from low-level visual components.

Allowed boundary:

- Pages/hooks gather data.
- `src/lib/commandCortex/*` maps data into graph contracts.
- `src/components/cortex/*` renders graph contracts.

This keeps the visual layer deterministic and testable.
