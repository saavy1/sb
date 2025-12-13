# The Machine - Design Specification

**Version:** 1.0  
**Last Updated:** December 2024  
**Design Philosophy:** Technical precision meets refined aesthetics. Inspired by Tailscale, Vercel, and Railway.

---

## Design Principles

1. **Information First** - Show what matters, hide what doesn't
2. **Status at a Glance** - Color-coded indicators for instant comprehension
3. **Respect Attention** - No unnecessary animations or visual noise
4. **Technical Confidence** - Embrace monospace, IPs, and technical details
5. **Fast Feeling** - Interface should feel responsive and lightweight

---

## Color System

### Foundation
```css
--background: hsl(240 10% 3.9%)      /* Deep blue-gray, main bg */
--surface: hsl(240 10% 8%)           /* Card backgrounds */
--surface-elevated: hsl(240 10% 12%) /* Hover states, elevated cards */
--border: hsl(240 6% 16%)            /* Subtle borders, dividers */
--border-strong: hsl(240 6% 22%)     /* Emphasized borders */
```

### Text
```css
--text-primary: hsl(0 0% 95%)        /* Main text */
--text-secondary: hsl(240 5% 65%)    /* Muted text, labels */
--text-tertiary: hsl(240 5% 45%)     /* Disabled, very muted */
```

### Semantic Colors
```css
--accent: hsl(215 100% 50%)          /* Primary blue, links */
--accent-hover: hsl(215 100% 60%)    /* Hover state */

--success: hsl(142 76% 36%)          /* Green - running, healthy */
--success-bg: hsl(142 76% 36% / 0.1) /* Success background tint */

--warning: hsl(48 96% 53%)           /* Yellow - starting, caution */
--warning-bg: hsl(48 96% 53% / 0.1)  /* Warning background tint */

--error: hsl(0 84% 60%)              /* Red - stopped, error */
--error-bg: hsl(0 84% 60% / 0.1)     /* Error background tint */

--info: hsl(215 100% 50%)            /* Blue - info states */
--info-bg: hsl(215 100% 50% / 0.1)   /* Info background tint */
```

### Status Indicators
```css
--status-running: hsl(142 76% 36%)   /* 🟢 Green */
--status-starting: hsl(48 96% 53%)   /* 🟡 Yellow */
--status-stopping: hsl(25 95% 53%)   /* 🟠 Orange */
--status-stopped: hsl(0 84% 60%)     /* 🔴 Red */
--status-error: hsl(0 84% 60%)       /* 🔴 Red */
--status-unknown: hsl(240 5% 45%)    /* ⚪ Gray */
```

---

## Typography

### Font Families
```css
--font-sans: 'Inter', system-ui, sans-serif
--font-mono: 'JetBrains Mono', 'Fira Code', monospace
```

### Font Sizes
```css
--text-xs: 0.75rem     /* 12px - labels, timestamps */
--text-sm: 0.875rem    /* 14px - body text, secondary */
--text-base: 1rem      /* 16px - primary body */
--text-lg: 1.125rem    /* 18px - card titles */
--text-xl: 1.25rem     /* 20px - section headers */
--text-2xl: 1.5rem     /* 24px - page titles */
--text-3xl: 1.875rem   /* 30px - dashboard hero */
```

### Font Weights
```css
--font-normal: 400
--font-medium: 500
--font-semibold: 600
--font-bold: 700
```

### Line Heights
```css
--leading-tight: 1.25
--leading-normal: 1.5
--leading-relaxed: 1.75
```

### Usage Guidelines
- **Page titles**: text-2xl, font-semibold
- **Section headers**: text-xl, font-medium
- **Card titles**: text-lg, font-medium
- **Body text**: text-base, font-normal
- **Labels**: text-sm, font-medium, text-secondary
- **Metadata**: text-xs, font-normal, text-tertiary
- **Monospace usage**: IPs, ports, resource names, code, logs

---

## Spacing System

### Scale
```css
--space-1: 0.25rem    /* 4px */
--space-2: 0.5rem     /* 8px */
--space-3: 0.75rem    /* 12px */
--space-4: 1rem       /* 16px */
--space-6: 1.5rem     /* 24px */
--space-8: 2rem       /* 32px */
--space-12: 3rem      /* 48px */
--space-16: 4rem      /* 64px */
```

### Common Patterns
- **Card padding**: space-6
- **Section spacing**: space-8
- **Element gaps**: space-4
- **Tight spacing**: space-2
- **Page margins**: space-8 to space-12

---

## Layout

### Grid System
- **Max width**: 1400px (centered)
- **Columns**: 12-column grid with gap-6
- **Breakpoints**:
  - `sm`: 640px
  - `md`: 768px
  - `lg`: 1024px
  - `xl`: 1280px

### Sidebar Navigation
```
Width: 240px (fixed)
Background: --background
Border-right: 1px solid --border
Padding: space-6
```

**Structure:**
```
┌─────────────────┐
│                 │
│  Logo/Title     │
│                 │
│  Navigation     │
│  • Overview     │
│  • Servers      │
│  • Storage      │
│  • Logs         │
│  • Settings     │
│                 │
│  [spacer]       │
│                 │
│  User Menu      │
│                 │
└─────────────────┘
```

### Main Content Area
```
Padding: space-8
Max-width: 1200px
Margin: 0 auto
```

### Page Layout
```html
<div class="dashboard-layout">
  <aside class="sidebar">...</aside>
  <main class="content">
    <header class="page-header">
      <h1>Page Title</h1>
      <div class="actions">...</div>
    </header>
    <div class="page-content">
      <!-- Cards, tables, etc -->
    </div>
  </main>
</div>
```

---

## Components

### Cards

**Default Card**
```css
Background: --surface
Border: 1px solid --border
Border-radius: 8px
Padding: space-6
Box-shadow: none
```

**Hover State** (for interactive cards)
```css
Border-color: --border-strong
Background: --surface-elevated
Transition: all 150ms ease
```

**Card Variants:**

1. **Status Card** (game servers, services)
```
┌──────────────────────────────────┐
│ 🟢 Server Name      100.66.91.56 │
│ Minecraft • ATM10 • 3/20 players │
│ Running • 2d 4h uptime           │
└──────────────────────────────────┘

- Status dot (8px circle) in top-left
- Title (text-lg, font-medium)
- IP in monospace, text-secondary, right-aligned
- Metadata row (text-sm, text-secondary)
- Status text (text-sm, color-coded)
```

2. **Metric Card** (storage, health)
```
┌──────────────────────────────────┐
│ Storage Usage                    │
│                                  │
│ 2.1 TB / 20 TB                   │
│ ▓▓▓░░░░░░░ 10.5%                │
│                                  │
│ Last snapshot: 2h ago            │
└──────────────────────────────────┘

- Title (text-base, font-medium)
- Large number (text-3xl, font-semibold)
- Progress bar (height: 6px, rounded)
- Footer metadata (text-xs, text-tertiary)
```

3. **Info Card** (system status)
```
┌──────────────────────────────────┐
│ K3s Cluster                      │
│ 🟢 Healthy                       │
│                                  │
│ Nodes:     1 / 1                 │
│ Pods:      12 running            │
│ Services:  8 active              │
└──────────────────────────────────┘

- Header with status
- Key-value pairs (label in text-secondary)
- Aligned colons for readability
```

### Buttons

**Primary Button**
```css
Background: --accent
Color: white
Padding: space-2 space-4
Border-radius: 6px
Font-size: text-sm
Font-weight: font-medium
Border: none
Transition: background 150ms ease

Hover: --accent-hover
Active: --accent (darker)
```

**Secondary Button**
```css
Background: transparent
Color: --text-primary
Border: 1px solid --border
/* Other properties same as primary */

Hover: background --surface-elevated
```

**Danger Button**
```css
Background: --error
Color: white
/* Other properties same as primary */

Hover: --error (lighter)
```

**Ghost Button** (icon buttons, subtle actions)
```css
Background: transparent
Color: --text-secondary
Padding: space-2
Border: none

Hover: background --surface-elevated, color --text-primary
```

**Button Sizes:**
- Small: py-1 px-3, text-sm
- Default: py-2 px-4, text-sm
- Large: py-3 px-6, text-base

### Badges

**Status Badge**
```css
Display: inline-flex
Align-items: center
Gap: space-2
Padding: 2px 8px
Border-radius: 9999px (full)
Font-size: text-xs
Font-weight: font-medium
```

**Variants:**
```css
.badge-success {
  background: --success-bg;
  color: --success;
}

.badge-warning {
  background: --warning-bg;
  color: --warning;
}

.badge-error {
  background: --error-bg;
  color: --error;
}

.badge-info {
  background: --info-bg;
  color: --info;
}
```

**With Dot Indicator:**
```html
<span class="badge badge-success">
  <span class="dot"></span>
  Running
</span>

/* Dot styling */
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
```

### Tables

**Default Table**
```css
Width: 100%
Border-collapse: separate
Border-spacing: 0
```

**Table Header**
```css
Background: --surface
Border-bottom: 1px solid --border
Position: sticky
Top: 0
Z-index: 10
```

**Table Header Cell**
```css
Padding: space-3 space-4
Text-align: left
Font-size: text-xs
Font-weight: font-medium
Color: --text-secondary
Text-transform: uppercase
Letter-spacing: 0.05em
```

**Table Row**
```css
Border-bottom: 1px solid --border

Hover: background --surface-elevated
```

**Table Cell**
```css
Padding: space-4
Font-size: text-sm
Vertical-align: middle
```

**Monospace Cells** (IPs, ports)
```css
Font-family: --font-mono
Font-size: text-xs
Color: --text-secondary
```

### Forms

**Input Field**
```css
Background: --background
Border: 1px solid --border
Border-radius: 6px
Padding: space-2 space-3
Font-size: text-sm
Color: --text-primary
Transition: border-color 150ms ease

Focus: 
  border-color: --accent
  outline: 2px solid --accent with 20% opacity
  outline-offset: 2px

Disabled:
  opacity: 0.5
  cursor: not-allowed
```

**Label**
```css
Font-size: text-sm
Font-weight: font-medium
Color: --text-primary
Margin-bottom: space-2
Display: block
```

**Help Text**
```css
Font-size: text-xs
Color: --text-secondary
Margin-top: space-1
```

**Select Dropdown**
```css
/* Same as input, plus: */
Appearance: none
Padding-right: space-8 /* room for arrow icon */
Background-image: chevron-down icon
Background-position: right space-3 center
Background-repeat: no-repeat
```

**Toggle Switch**
```css
Width: 44px
Height: 24px
Border-radius: 9999px
Background: --border (off), --accent (on)
Position: relative
Transition: background 150ms ease

/* Thumb */
Width: 20px
Height: 20px
Border-radius: 50%
Background: white
Position: absolute
Left: 2px (off), 22px (on)
Top: 2px
Transition: left 150ms ease
```

### Icons

**Size Scale:**
- xs: 12px
- sm: 16px
- base: 20px
- lg: 24px
- xl: 32px

**Usage:**
- Use Lucide React or Heroicons
- Default size: 20px
- Color: inherit from parent or --text-secondary
- Stroke-width: 2

**Common Icons:**
- Status: Circle (filled for dot indicators)
- Server: Server
- Storage: HardDrive
- Logs: FileText
- Settings: Settings
- Start: Play
- Stop: Square
- Restart: RotateCw
- Delete: Trash2
- Edit: Edit2
- Info: Info
- Warning: AlertTriangle
- Error: AlertCircle
- Success: CheckCircle

### Status Dots

**Size:** 8px diameter
**Usage:** Inline with text or in card corners

```html
<span class="status-dot status-running"></span>

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-running { background: --status-running; }
.status-starting { background: --status-starting; }
.status-stopping { background: --status-stopping; }
.status-stopped { background: --status-stopped; }
.status-error { background: --status-error; }
```

**With Pulse Animation** (optional, for active states):
```css
.status-dot.pulse::before {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: inherit;
  animation: pulse 2s ease-out infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(2); opacity: 0; }
}
```

### Loading States

**Skeleton**
```css
Background: linear-gradient(
  90deg,
  --surface 0%,
  --surface-elevated 50%,
  --surface 100%
)
Background-size: 200% 100%
Animation: skeleton 1.5s ease-in-out infinite
Border-radius: 4px
```

**Spinner** (for buttons, inline loading)
```html
<!-- Use a simple animated SVG circle -->
<svg class="spinner" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" 
    stroke="currentColor" 
    stroke-width="3"
    fill="none"
    stroke-dasharray="60"
    stroke-dashoffset="60">
    <animate attributeName="stroke-dashoffset" 
      from="60" to="0" 
      dur="1s" 
      repeatCount="indefinite"/>
  </circle>
</svg>

.spinner {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## Page Templates

### Overview / Dashboard

```
┌─────────────────────────────────────────────────────┐
│ Dashboard                                           │
│                                                     │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│ │ K3s Status │ │  Storage   │ │  Services  │      │
│ │ 🟢 Healthy │ │ 2.1TB/20TB │ │ 12 Running │      │
│ └────────────┘ └────────────┘ └────────────┘      │
│                                                     │
│ Game Servers                          [+ Create]   │
│ ┌───────────────────────────────────────────────┐  │
│ │ 🟢 atm10          • 3/20 players • Running   │  │
│ │ 🔴 necesse        • Stopped                  │  │
│ │ 🟢 vanilla        • 1/10 players • Running   │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Recent Activity                                     │
│ ┌───────────────────────────────────────────────┐  │
│ │ • Flux reconciled apps (2m ago)              │  │
│ │ • atm10 started (15m ago)                    │  │
│ │ • Storage snapshot created (1h ago)          │  │
│ └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Layout:**
- Metrics in 3-column grid (gap-6)
- Section spacing: space-8
- Cards with consistent padding (space-6)
- Quick actions in header (right-aligned)

### Server List

```
┌─────────────────────────────────────────────────────┐
│ Game Servers                          [+ Create]    │
│                                                     │
│ ┌─────┬──────────┬────────┬─────────┬──────────┐  │
│ │ •   │ Name     │ Type   │ Players │ Status   │  │
│ ├─────┼──────────┼────────┼─────────┼──────────┤  │
│ │ 🟢  │ atm10    │ MC     │ 3/20    │ Running  │  │
│ │ 🔴  │ necesse  │ Game   │ -       │ Stopped  │  │
│ │ 🟢  │ vanilla  │ MC     │ 1/10    │ Running  │  │
│ └─────┴──────────┴────────┴─────────┴──────────┘  │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Sortable columns
- Click row to view detail
- Hover actions (start/stop/view)
- Sticky header on scroll

### Server Detail

```
┌─────────────────────────────────────────────────────┐
│ ← Back to Servers            [Stop] [Restart] [⋮]  │
│                                                     │
│ atm10                                          🟢   │
│ Minecraft • All The Mods 10                        │
│                                                     │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│ │ Players    │ │  Memory    │ │  Uptime    │      │
│ │   3 / 20   │ │ 8GB / 16GB │ │ 2d 4h 32m  │      │
│ └────────────┘ └────────────┘ └────────────┘      │
│                                                     │
│ Details                                             │
│ ┌───────────────────────────────────────────────┐  │
│ │ Port:         25565                           │  │
│ │ Modpack:      all-the-mods-10                 │  │
│ │ Created:      2024-12-10                      │  │
│ │ Created by:   @saavy                          │  │
│ │ Pod:          atm10-xyz-abc                   │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Logs                                    [View Full] │
│ ┌───────────────────────────────────────────────┐  │
│ │ [12:34:56] Server started                     │  │
│ │ [12:35:02] Player joined: Steve               │  │
│ │ [12:36:14] Chunk loaded: [x,y,z]              │  │
│ └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Layout:**
- Breadcrumb navigation
- Hero section with title and status
- Metrics in 3-column grid
- Tabbed or sectioned content below
- Logs in monospace with timestamps

### Storage

```
┌─────────────────────────────────────────────────────┐
│ Storage                                             │
│                                                     │
│ ┌────────────────────────────────────────────────┐ │
│ │ ZFS Pool: tank                            🟢   │ │
│ │                                                │ │
│ │ 2.1 TB / 20 TB used                            │ │
│ │ ▓▓▓░░░░░░░░░░░░░░░░ 10.5%                     │ │
│ │                                                │ │
│ │ Health: ONLINE                                 │ │
│ │ Scrub: Last run 7d ago                         │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
│ Snapshots                          [Create Snapshot]│
│ ┌─────┬──────────────┬────────┬──────────────┐    │
│ │ Name│ Created      │ Size   │ Actions      │    │
│ ├─────┼──────────────┼────────┼──────────────┤    │
│ │ auto│ 2h ago       │ 12GB   │ [Restore][×] │    │
│ │ pre │ 1d ago       │ 8GB    │ [Restore][×] │    │
│ └─────┴──────────────┴────────┴──────────────┘    │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Visual usage indicator
- Pool health status
- Snapshot table with actions
- Quick create snapshot action

### Logs Viewer

```
┌─────────────────────────────────────────────────────┐
│ Logs                                                │
│                                                     │
│ [Select Service ▾]  [Select Pod ▾]  [⟲ Auto-refresh]│
│                                                     │
│ ┌───────────────────────────────────────────────┐  │
│ │ 1  [2024-12-12 12:34:56] INFO: Server started │  │
│ │ 2  [2024-12-12 12:35:02] INFO: Player joined  │  │
│ │ 3  [2024-12-12 12:36:14] DEBUG: Chunk loaded  │  │
│ │ 4  [2024-12-12 12:37:01] WARN: High memory    │  │
│ │ 5  [2024-12-12 12:38:22] INFO: Autosave       │  │
│ │ ...                                            │  │
│ │                                                │  │
│ │ ▼ Following logs (live tail)                  │  │
│ └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Monospace font (JetBrains Mono)
- Line numbers
- Log level color coding (INFO/WARN/ERROR)
- Auto-scroll toggle
- Filter/search
- Download logs option

---

## Interactions & Animations

### General Rules
- **Keep animations subtle and purposeful**
- **Transitions: 150ms for most, 300ms for slides/fades**
- **Easing: ease or ease-out**
- **Avoid animations on data changes** (numbers, status updates)

### Hover States
```css
/* Cards */
transition: border-color 150ms ease, background 150ms ease;

/* Buttons */
transition: background 150ms ease, color 150ms ease;

/* Links */
transition: color 150ms ease;
```

### Focus States
```css
/* All interactive elements */
outline: 2px solid --accent;
outline-offset: 2px;
border-radius: inherit;
```

### Page Transitions
- **None** - instant page changes
- Or subtle fade: opacity 0 → 1, 150ms

### Loading States
- Show skeleton for initial loads
- Show spinner for actions (button clicks)
- Optimistic updates where possible (update UI immediately, rollback on error)

### Toast Notifications
```
Position: top-right
Width: 360px max
Padding: space-4
Border-radius: 8px
Box-shadow: 0 4px 12px rgba(0,0,0,0.3)
Animation: slide-in from right, 200ms ease-out

Success: border-left 4px solid --success
Error: border-left 4px solid --error
Info: border-left 4px solid --info
Warning: border-left 4px solid --warning

Auto-dismiss: 5s
Manual close: X button in top-right
```

---

## Responsive Behavior

### Breakpoint Strategy
```
Mobile: < 768px
Tablet: 768px - 1024px
Desktop: > 1024px
```

### Mobile (<768px)
- Sidebar collapses to hamburger menu
- Cards stack vertically (1 column)
- Tables become card-based list views
- Reduce padding (space-4 instead of space-6)
- Hide less critical columns in tables
- Bottom navigation for primary actions

### Tablet (768px - 1024px)
- Sidebar can overlay or remain visible
- Cards in 2-column grid
- Tables show most important columns
- Standard padding

### Desktop (>1024px)
- Full layout as designed
- Sidebar always visible
- 3-column card grids
- All table columns visible
- Generous spacing

### Touch Targets
- Minimum 44px × 44px for all interactive elements on mobile
- Increase spacing between interactive elements on touch devices

---

## Accessibility

### Color Contrast
- Text on background: minimum 4.5:1
- Large text (18px+): minimum 3:1
- Interactive elements: minimum 3:1 against background

### Focus Management
- All interactive elements must have visible focus state
- Tab order should follow visual order
- Focus trap in modals/dialogs
- Skip to main content link

### Screen Readers
- Semantic HTML (nav, main, article, aside, header, footer)
- ARIA labels for icon-only buttons
- ARIA live regions for status updates
- Alt text for all images (or empty alt if decorative)

### Keyboard Navigation
- All functionality accessible via keyboard
- Esc closes modals/dropdowns
- Enter/Space activates buttons
- Arrow keys for select menus and lists

### Motion
- Respect `prefers-reduced-motion`
- Disable all animations when set

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Implementation Notes

### Recommended Stack
- **Components**: shadcn/ui (Radix primitives + Tailwind)
- **Styling**: Tailwind CSS with custom theme
- **Icons**: Lucide React
- **Charts**: Tremor or Recharts
- **Tables**: TanStack Table
- **Forms**: React Hook Form + Zod

### CSS Variables Setup
```css
:root {
  /* Paste all color/spacing/typography vars here */
}

/* Tailwind config extends these */
```

### Component Library
Use shadcn/ui as base:
```bash
npx shadcn@latest init
npx shadcn@latest add button card table badge input select
```

Then customize the generated `globals.css` with The Machine's color palette.

### Dark Mode Only
- No light mode toggle
- System preference ignored (always dark)
- Design optimized for dark viewing

---

## Future Considerations

### Charts & Graphs
When adding metrics visualization:
- Use Tremor or Recharts
- Color palette: accent (blue), success (green), warning (yellow)
- Grid lines: --border with low opacity
- Tooltips: --surface background with --border

### Real-time Updates
- WebSocket connection indicator (small dot in header)
- Subtle highlight for updated rows/values (flash success color, fade out)
- Auto-refresh toggle for heavy data views

### Mobile App
This design system translates well to React Native:
- Same color palette
- Same spacing scale
- Native components styled to match

---

## Reference Screenshots

**Inspiration:**
- Tailscale: https://login.tailscale.com/admin/machines
- Vercel: https://vercel.com/dashboard
- Railway: https://railway.app/dashboard
- shadcn/ui dashboard: https://ui.shadcn.com/examples/dashboard

**Key Aesthetic:**
Clean, technical, confident. Information-dense without feeling cluttered. Professional tool for serious work.

---

**End of Specification**