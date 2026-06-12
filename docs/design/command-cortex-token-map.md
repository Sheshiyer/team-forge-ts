# Command Cortex Token Map

## Color Tokens

| Token | Value | Role |
|---|---:|---|
| `--cortex-void` | `#030707` | Primary app void/background |
| `--cortex-black-green` | `#06110f` | Biological tactical base |
| `--cortex-blue-black` | `#07111f` | Neural depth gradient |
| `--cortex-membrane` | `rgba(7, 17, 31, 0.76)` | Tactical membrane fill |
| `--cortex-membrane-strong` | `rgba(10, 30, 34, 0.9)` | Focused membrane fill |
| `--cortex-cyan` | `#18d7ff` | Active intelligence, selected lens |
| `--cortex-emerald` | `#39ff88` | Healthy flow, online agent |
| `--cortex-amber` | `#ffb02e` | Pending judgment, attention |
| `--cortex-magenta` | `#ff2f7a` | Risk, inflammation, blocked path |
| `--cortex-bone` | `#f4f1e8` | Critical text, high-salience labels |
| `--cortex-graphite` | `#56615f` | Dormant/inactive structures |
| `--cortex-muted` | `#83918c` | Secondary labels |

## Type Tokens

| Token | Role |
|---|---|
| `--cortex-font-display` | Tactical headings and lens labels |
| `--cortex-font-body` | Body text inside membranes |
| `--cortex-font-mono` | Entity IDs, telemetry, source labels |
| `--cortex-letterspace-tight` | Compact tactical labels |
| `--cortex-letterspace-wide` | Uppercase system labels |

## Material Tokens

| Token | Role |
|---|---|
| `--cortex-glow-cyan` | Active selection glow |
| `--cortex-glow-emerald` | Healthy signal glow |
| `--cortex-glow-amber` | Pending judgment glow |
| `--cortex-glow-magenta` | Risk/inflammation glow |
| `--cortex-border-subtle` | Dormant path/membrane border |
| `--cortex-border-active` | Active membrane and focus border |
| `--cortex-backdrop-blur` | Desktop glass/membrane blur |

## Spacing Tokens

| Token | Value | Role |
|---|---:|---|
| `--cortex-space-1` | `4px` | Hairline offsets |
| `--cortex-space-2` | `8px` | Compact gaps |
| `--cortex-space-3` | `12px` | Control padding |
| `--cortex-space-4` | `16px` | Membrane internal rhythm |
| `--cortex-space-6` | `24px` | Desktop panel rhythm |
| `--cortex-space-8` | `32px` | Major field inset |

## State Mapping

| Entity State | Visual Treatment |
|---|---|
| `healthy` | Emerald glow, smooth pulse, low noise |
| `active` | Cyan glow, visible signal movement |
| `pending` | Amber oscillation, decision-gate glyph |
| `blocked` | Magenta inflammation, constricted path |
| `dormant` | Graphite path, reduced opacity |
| `archived` | Faint graphite, no pulse |

## Implementation Notes

- Tokens live in `src/styles/command-cortex.css` and are imported by `src/styles/globals.css`.
- LCARS tokens remain available for classic pages during migration.
- Command Cortex components must use `--cortex-*` tokens rather than `--lcars-*` tokens.
