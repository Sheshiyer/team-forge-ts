# Team Forge Design System v2.0
## "The Foundry" — Command. Orchestrate. Ship.

**Design Intelligence Source:** Cambium taste-cortex, MotionSites prompt corpus, Magic UI patterns
**Stack:** React 19 + TypeScript + Tailwind CSS v4 + Framer Motion 12 + Tauri v2

---

## Design Philosophy

Team Forge is a **founder mission control** — it orchestrates human teams and AI agents across Paperclip, Clockify, Huly, and Slack. The design must convey:

1. **Authority** — You are in command of complex operations
2. **Clarity** — Dense information rendered digestible
3. **Warmth** — Industrial precision tempered by human heat (the forge metaphor)
4. **Motion** — Living system, not static dashboard

**Anti-patterns to avoid:**
- Generic SaaS blandness
- Over-animated distraction
- AI-slop gradients with no purpose
- Cramped LCARS density without breathing room

---

## Color System

### Foundation Palette (Nakul: Desert Sand × Dark Blue)

```css
:root {
  /* === SEMANTIC BACKGROUNDS === */
  --bg-void: #080B10;           /* Deepest layer - app chrome */
  --bg-base: #0A1628;           /* Primary surface */
  --bg-raised: #102542;         /* Cards, panels */
  --bg-elevated: #1A3A5C;       /* Modals, popovers */
  --bg-hover: rgba(248, 112, 96, 0.08);  /* Interactive hover state */
  
  /* === FORGE HEAT SPECTRUM === */
  --ember: #F87060;             /* Primary accent - Desert Sand */
  --ember-soft: rgba(248, 112, 96, 0.7);
  --ember-glow: rgba(248, 112, 96, 0.15);
  --gold: #E1BB80;              /* Secondary accent - Ecru */
  --gold-soft: rgba(225, 187, 128, 0.7);
  --iron: #352208;              /* Bistre - grounding accent */
  
  /* === TEXT HIERARCHY === */
  --text-primary: #F0F4F8;      /* High emphasis */
  --text-secondary: #94A3B8;    /* Medium emphasis */
  --text-muted: #64748B;        /* Low emphasis */
  --text-ghost: #475569;        /* Disabled, hints */
  
  /* === STATUS COLORS === */
  --status-success: #10B981;
  --status-warning: #F59E0B;
  --status-error: #EF4444;
  --status-info: #3B82F6;
  --status-ai: #A855F7;         /* AI agent activities */
  
  /* === BORDERS & DIVIDERS === */
  --border-subtle: rgba(148, 163, 184, 0.12);
  --border-default: rgba(148, 163, 184, 0.2);
  --border-strong: rgba(248, 112, 96, 0.4);
  --border-focus: var(--ember);
  
  /* === GRADIENTS (MotionSites pattern) === */
  --gradient-forge: linear-gradient(180deg, var(--bg-base) 0%, var(--bg-raised) 100%);
  --gradient-ember: linear-gradient(135deg, var(--ember) 0%, var(--gold) 100%);
  --gradient-text-ember: linear-gradient(180deg, #F87060 0%, #E1BB80 100%);
  --gradient-glow: radial-gradient(ellipse at center, var(--ember-glow) 0%, transparent 70%);
}
```

### Dark Mode Adjustments

```css
[data-theme="light"] {
  --bg-void: #F8FAFC;
  --bg-base: #FFFFFF;
  --bg-raised: #F1F5F9;
  --bg-elevated: #E2E8F0;
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-muted: #94A3B8;
  --border-subtle: rgba(15, 23, 42, 0.08);
  --border-default: rgba(15, 23, 42, 0.15);
}
```

---

## Typography System

### Font Stack

```css
:root {
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
  --font-display: "Inter", var(--font-sans); /* Same family, different weight */
}
```

### Type Scale (Fluid with clamp)

Following MotionSites pattern for responsive typography:

```css
:root {
  /* === DISPLAY (Headlines) === */
  --text-display-xl: clamp(2.5rem, 6vw, 4.5rem);    /* 40px → 72px */
  --text-display-lg: clamp(2rem, 4.5vw, 3.5rem);    /* 32px → 56px */
  --text-display-md: clamp(1.75rem, 3.5vw, 2.5rem); /* 28px → 40px */
  
  /* === HEADINGS === */
  --text-h1: clamp(1.5rem, 2.5vw, 2rem);            /* 24px → 32px */
  --text-h2: clamp(1.25rem, 2vw, 1.5rem);           /* 20px → 24px */
  --text-h3: clamp(1.125rem, 1.5vw, 1.25rem);       /* 18px → 20px */
  --text-h4: clamp(1rem, 1.2vw, 1.125rem);          /* 16px → 18px */
  
  /* === BODY === */
  --text-body-lg: clamp(1rem, 1.1vw, 1.125rem);     /* 16px → 18px */
  --text-body: clamp(0.875rem, 1vw, 1rem);          /* 14px → 16px */
  --text-body-sm: clamp(0.8125rem, 0.9vw, 0.875rem);/* 13px → 14px */
  
  /* === UI === */
  --text-label: 0.75rem;                             /* 12px fixed */
  --text-caption: 0.6875rem;                         /* 11px fixed */
  
  /* === LINE HEIGHTS === */
  --leading-tight: 1.15;
  --leading-snug: 1.3;
  --leading-normal: 1.5;
  --leading-relaxed: 1.65;
  
  /* === LETTER SPACING === */
  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.02em;
  --tracking-wider: 0.05em;
  --tracking-widest: 0.1em;
}
```

### Typography Classes

```css
.text-display { 
  font-size: var(--text-display-lg);
  font-weight: 800;
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
}

.text-gradient {
  background: var(--gradient-text-ember);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.text-label {
  font-size: var(--text-label);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--text-muted);
}
```

---

## Spacing System

8px base unit with Tailwind defaults:

```css
:root {
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
}
```

---

## Motion System

### Timing Functions (MotionSites standard)

```css
:root {
  --ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
```

### Duration Scale

```css
:root {
  --duration-instant: 75ms;
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --duration-slower: 500ms;
  --duration-glacial: 700ms;
}
```

### Framer Motion Variants

```typescript
// Standard fade-in (MotionSites FadeIn pattern)
export const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }
  }
};

// Staggered children
export const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.1, delayChildren: 0.2 }
  }
};

// Scale on hover (cards)
export const cardHover = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.02,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }
  }
};

// Magnetic hover effect (MotionSites Magnet pattern)
export const magneticHover = {
  padding: 100,      // Activation distance in px
  strength: 4,       // Divisor for translate (higher = subtler)
  activeTransition: "transform 0.3s ease-out",
  inactiveTransition: "transform 0.6s ease-in-out"
};
```

---

## Component Patterns

### 1. Custom Titlebar (Tauri)

```tsx
// Frameless window with custom drag region
<div className="titlebar h-10 bg-bg-void fixed inset-x-0 top-0 z-50 flex items-center px-4">
  <div className="titlebar-drag flex-1" data-tauri-drag-region>
    <div className="flex items-center gap-3">
      <ForgeIcon className="w-5 h-5 text-ember" />
      <span className="text-body-sm font-medium text-text-secondary">
        Team Forge
      </span>
    </div>
  </div>
  <div className="titlebar-controls flex">
    <TitlebarButton icon="minus" onClick={minimize} />
    <TitlebarButton icon="square" onClick={toggleMaximize} />
    <TitlebarButton icon="x" onClick={close} variant="close" />
  </div>
</div>
```

### 2. Sidebar Navigation

```tsx
<nav className="w-16 hover:w-64 transition-all duration-slow ease-default 
                bg-bg-base border-r border-border-subtle flex flex-col">
  <NavGroup label="Operations">
    <NavItem icon={<Layers />} label="Dashboard" href="/" />
    <NavItem icon={<Users />} label="Team" href="/team" />
    <NavItem icon={<Bot />} label="Agents" href="/agents" />
  </NavGroup>
  <NavGroup label="Integrations">
    <NavItem icon={<Paperclip />} label="Paperclip" status="connected" />
    <NavItem icon={<Clock />} label="Clockify" status="syncing" />
  </NavGroup>
</nav>
```

### 3. Status Cards (Magic UI inspired)

```tsx
<motion.div 
  className="rounded-2xl border border-border-subtle bg-bg-raised p-6
             hover:border-border-strong transition-colors"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  whileHover={{ scale: 1.02 }}
  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
>
  <div className="flex items-start justify-between mb-4">
    <div className="p-2 rounded-lg bg-ember-glow">
      <Activity className="w-5 h-5 text-ember" />
    </div>
    <StatusBadge status="active" />
  </div>
  <h3 className="text-h3 font-semibold text-text-primary mb-1">
    Active Tasks
  </h3>
  <p className="text-display-md font-bold text-gradient">
    24
  </p>
  <p className="text-body-sm text-text-muted mt-2">
    +3 from yesterday
  </p>
</motion.div>
```

### 4. Activity Feed (Notification Stream)

```tsx
<div className="space-y-3">
  <AnimatePresence mode="popLayout">
    {activities.map((activity, i) => (
      <motion.div
        key={activity.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ delay: i * 0.05, duration: 0.3 }}
        className="flex items-start gap-3 p-3 rounded-lg bg-bg-raised/50
                   border border-border-subtle hover:border-border-default"
      >
        <AgentAvatar agent={activity.agent} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-body-sm text-text-primary truncate">
            {activity.message}
          </p>
          <p className="text-caption text-text-muted">
            {formatRelativeTime(activity.timestamp)}
          </p>
        </div>
        <StatusDot status={activity.status} />
      </motion.div>
    ))}
  </AnimatePresence>
</div>
```

### 5. Data Table

```tsx
<div className="rounded-xl border border-border-subtle overflow-hidden">
  <table className="w-full">
    <thead className="bg-bg-raised">
      <tr>
        <th className="text-label text-left px-4 py-3 text-text-muted">
          Name
        </th>
        <th className="text-label text-left px-4 py-3 text-text-muted">
          Status
        </th>
        <th className="text-label text-right px-4 py-3 text-text-muted">
          Actions
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border-subtle">
      {rows.map(row => (
        <tr key={row.id} className="hover:bg-bg-hover transition-colors">
          <td className="px-4 py-3 text-body text-text-primary">
            {row.name}
          </td>
          <td className="px-4 py-3">
            <StatusBadge status={row.status} />
          </td>
          <td className="px-4 py-3 text-right">
            <ActionMenu items={row.actions} />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

---

## Iconography

**Primary:** Lucide React (consistent stroke width, MIT license)
**Secondary:** Phosphor Icons for decorative elements

```tsx
import { 
  Layers, Users, Bot, Activity, Clock, 
  ChevronRight, Settings, Bell, Search 
} from 'lucide-react';

// Standard sizes
const iconSizes = {
  xs: 'w-3.5 h-3.5',  // 14px - inline with small text
  sm: 'w-4 h-4',      // 16px - buttons, list items
  md: 'w-5 h-5',      // 20px - cards, navigation
  lg: 'w-6 h-6',      // 24px - headers
  xl: 'w-8 h-8',      // 32px - empty states
};
```

---

## Shadows & Elevation

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 
               0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 
               0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 
               0 10px 10px -5px rgba(0, 0, 0, 0.04);
  
  /* Glow effects for accent elements */
  --shadow-ember: 0 0 20px var(--ember-glow);
  --shadow-ember-strong: 0 4px 20px rgba(248, 112, 96, 0.35);
}
```

---

## Border Radius Scale

```css
:root {
  --radius-sm: 0.25rem;   /* 4px - small chips, badges */
  --radius-md: 0.5rem;    /* 8px - buttons, inputs */
  --radius-lg: 0.75rem;   /* 12px - cards */
  --radius-xl: 1rem;      /* 16px - modals, large cards */
  --radius-2xl: 1.5rem;   /* 24px - hero sections */
  --radius-full: 9999px;  /* Pills */
}
```

---

## Responsive Breakpoints

```css
/* Tailwind defaults, mobile-first */
--breakpoint-sm: 640px;   /* Tablet portrait */
--breakpoint-md: 768px;   /* Tablet landscape */
--breakpoint-lg: 1024px;  /* Desktop */
--breakpoint-xl: 1280px;  /* Large desktop */
--breakpoint-2xl: 1536px; /* Ultra-wide */
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Configure Tailwind CSS v4 with custom theme
- [ ] Set up Inter + JetBrains Mono fonts
- [ ] Create CSS custom properties file
- [ ] Build Tauri window config (frameless + custom titlebar)

### Phase 2: Core Components
- [ ] CustomTitlebar with drag region
- [ ] Sidebar navigation (collapsible)
- [ ] Button variants (primary, secondary, ghost, destructive)
- [ ] Input components (text, select, checkbox)
- [ ] Card component with hover states
- [ ] StatusBadge component
- [ ] Avatar component (user + agent variants)

### Phase 3: Layout Templates
- [ ] Dashboard layout (sidebar + header + content)
- [ ] Settings layout (tabs + form)
- [ ] Detail view layout (split pane)

### Phase 4: Motion & Polish
- [ ] Implement FadeIn wrapper component
- [ ] Add page transitions with AnimatePresence
- [ ] Stagger animations for lists
- [ ] Loading skeletons
- [ ] Empty state illustrations

### Phase 5: Data Visualization
- [ ] Activity sparklines
- [ ] Progress indicators
- [ ] Status timeline

---

## File Structure

```
src/
├── styles/
│   ├── tokens.css          # CSS custom properties
│   ├── typography.css      # Type system utilities
│   └── globals.css         # Base styles, resets
├── components/
│   ├── ui/                 # Primitives (Button, Input, Card)
│   ├── layout/             # Titlebar, Sidebar, Page shells
│   ├── data/               # Tables, Lists, Charts
│   └── motion/             # FadeIn, Stagger, Magnetic
├── lib/
│   └── motion.ts           # Framer Motion variants
└── app/
    ├── dashboard/
    ├── team/
    ├── agents/
    └── settings/
```

---

## References

- MotionSites prompt corpus: `/cambium/motionsites-export/prompts/`
- Magic UI: https://magicui.design
- Tauri Window Customization: `~/.agents/skill-clusters/skills/customizing-tauri-windows/`
- Nakul Color Combos: `/03-Resources/Design/Color-Combos/Nakul-Color-Combos.md`
