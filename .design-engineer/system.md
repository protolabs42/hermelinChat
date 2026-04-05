# Aurora Chat Design System

## Direction
Refined Terminal — glass-like depth over ambient particle backgrounds. Warp meets Linear.

## Depth
Layered glass — `backdrop-filter: blur(12px)` + `color-mix` semi-transparent surfaces.
Panels: glass-surface. Cards: surface bg. Inputs: elevated bg. No drop shadows except overlays.

## Spacing
Base: 4px. Grid: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64.
Tailwind: gap-1(4) gap-2(8) gap-3(12) p-4(16) p-5(20) p-6(24) p-8(32).

## Border Radius
- Small elements (badges, status dots): `rounded` (4px)
- Cards, inputs, buttons: `rounded-lg` (8px)
- Panels, overlays, dropdowns: `rounded-xl` (12px)
- Pills, full-round: `rounded-full` (9999px)

## Typography
Font: `'FiraCode Nerd Font Mono', 'Fira Code', 'JetBrains Mono', monospace`
Scale: 9px (badges) / 10px (labels) / 11px (secondary) / 12px (body) / 13px (primary) / 14px (section heads) / 16px (titles)
Weights: 400 (body), 600 (semibold), 700 (bold)

## Colors
All via CSS custom properties: --color-bg, --color-surface, --color-elevated, --color-border, --color-muted, --color-text, --color-text-bright, --color-accent, --color-danger, --color-success, --color-info, --color-purple, --color-cyan.
No hardcoded hex values in components.

## Touch Targets
Minimum 28px (w-7 h-7) for all interactive elements.

## Messages
- User: accent-tinted card, 2px left accent border, rounded-lg, px-4 py-3, mb-4
- Assistant: surface card, rounded-lg, px-4 py-3, mb-4
- Thinking: glass-surface card, rounded-lg, collapsible
- Tool: surface card, rounded-lg, expandable
- System error: danger left border, elevated bg
- Role labels: 9px uppercase tracking-wide

## Content Width
Chat and input: max-w-3xl mx-auto (centered, readable width)

## Motion
Panel slides: 200ms ease-out. Dropdowns: 120ms ease. Pulse: 2s ease. No bounce/spring.

## Patterns
- Buttons: rounded-lg, font-bold, text-xs, px-4 py-2, accent/danger/elevated variants
- Inputs: bg-elevated, border-border, rounded-lg, px-3 py-2, focus ring
- Panels: glass-surface, border-l or border-r, slide animation
- Section labels: 9px uppercase tracking-widest, accent color, mb-3
- Dropdowns: elevated bg, rounded-xl, shadow, animate-dropdown
