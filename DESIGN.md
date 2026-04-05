# Design System — Aurora Chat

## Product Context
- **What this is:** Tauri desktop client for AI agents via ACP (Agent Client Protocol)
- **Who it's for:** Developers, AI power users, terminal enthusiasts
- **Space/industry:** AI chat interfaces, dev tools
- **Project type:** Desktop app (Tauri + React)

## Aesthetic Direction
- **Direction:** Retro-Futuristic
- **Decoration level:** Intentional — ambient particle fields, matrix rain, CRT glow, scan-line overlays provide texture without competing with content
- **Mood:** A terminal that evolved. Alive, ambient, responsive. Not sterile, not noisy.
- **Peers:** Warp, Ghostty, Zed, Claude Code — but with personality

## Typography
- **Primary:** FiraCode Nerd Font Mono — ligatures for code, Nerd Font glyphs for file/git icons
- **Fallback chain:** `'FiraCode Nerd Font Mono', 'Fira Code', 'JetBrains Mono', monospace`
- **Single font family throughout** — monospace IS the identity. No serif or sans-serif.
- **Base size:** 13px (configurable 10-22px via Ctrl+=/Ctrl-/Ctrl+0)
- **Scale:** 9px (badges/meta) / 10px (labels/muted) / 11px (secondary) / 12px (body) / 13px (primary) / 14px (section heads) / 16px (page titles)
- **Weight:** 400 (body), 600 (emphasis), 700 (headings/buttons)

## Color
- **Approach:** Theme-driven + restrained per theme
- **System:** 8 themes, each with one accent scale (7 stops: 300-900) + neutral palette
- **Within each theme:** accent = interactive, success/danger/info = semantic, neutrals = everything else
- **Implemented via CSS custom properties:** `--color-bg`, `--color-surface`, `--color-elevated`, `--color-border`, `--color-muted`, `--color-text`, `--color-text-bright`, `--color-accent`, `--color-danger`, `--color-success`, `--color-info`, `--color-purple`, `--color-cyan`

### Themes
| Theme | Accent | Mode | Background Effect |
|-------|--------|------|-------------------|
| Hermelin | Amber (#f5b731) | Dark | Particles |
| Matrix | Green (#4dffa1) | Dark | Matrix Rain |
| Nous | Aqua (#5cc8e6) | Dark | CRT Glow |
| Samaritan | Red (#cc3333) | Light | Surveillance Grid |
| Catppuccin Mocha | Lavender (#b4befe) | Dark | Particles |
| Catppuccin Macchiato | Lavender (#b7bdf8) | Dark | Particles |
| Catppuccin Frappé | Lavender (#babbf1) | Dark | Particles |
| Catppuccin Latte | Lavender (#7287fd) | Light | Particles |

- **Default theme:** Catppuccin Mocha
- **Theme switching:** Instant via CSS custom properties, persisted to localStorage

## Spacing
- **Base unit:** 4px
- **Density:** Compact — power users want information density
- **Scale:** 1(4px) 2(8px) 3(12px) 4(16px) 6(24px) 8(32px) 12(48px) 16(64px)
- **Tailwind mapping:** `gap-1`=4px, `gap-2`=8px, `p-3`=12px, `p-4`=16px

## Layout
- **Approach:** Grid-disciplined
- **Structure:** Three-panel — session sidebar (260px, left) | chat (flex) | artifact panel (420px, right)
- **Status bar:** Top, full width — connection, controls, badges
- **Message input:** Bottom, full width — textarea with auto-grow
- **Border radius:** `rounded` (4px) for small elements, `rounded-lg` (8px) for cards/panels, `rounded-full` (9999px) for pills/badges
- **Borders:** 1px solid `--color-border` for panel separators

## Motion
- **Approach:** Minimal-functional
- **Panel slides:** 200ms ease-out (sidebar, settings)
- **Artifact panel:** 250ms cubic-bezier(0.16,1,0.3,1)
- **Dropdowns:** 120ms ease
- **Live indicators:** 2s ease pulse
- **Loading:** 2s ease-in-out pulse (aurora-pulse)
- **No bounce, no spring, no parallax** — terminal aesthetic

## Component Patterns
- **Chat messages:** Full-width blocks, role label + content. Thinking=collapsible+dimmed, Tools=expandable+status icon, Diffs=syntax-colored+accept/reject, System errors=red left border
- **Panels:** Slide-in from edge, backdrop overlay for settings, resize handle for artifacts
- **Buttons:** `bg-accent text-bg` for primary, `bg-elevated` for secondary, `bg-danger` for destructive
- **Inputs:** `bg-elevated border-border rounded-lg` with accent focus ring
- **Badges:** `text-[9px] rounded-full px-1.5` with border or filled background
- **Icons:** Inline SVG, 12-16px, `currentColor` for theme adaptation

## Identity
- **Per-theme mascot:** Bottom-right corner, 32px, opacity 0.3 → 0.7 on hover
- **Per-theme whisper:** Tooltip text on mascot hover (alignment easter egg)
- **Per-theme topbar mark:** 18px SVG in status bar, accent-colored
- **App icon:** "A" lettermark, lavender on dark circle

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-04 | Initial design system | Formalized from implementation — retro-futuristic terminal aesthetic |
| 2026-04-05 | FiraCode Nerd Font Mono | Ligatures + Nerd Font glyphs for file/git icons in tool calls |
| 2026-04-05 | Configurable font size | Power user essential — Ctrl+=/Ctrl-/Ctrl+0, persisted |
| 2026-04-05 | Tailwind CSS v4 migration | CSS-first, native hover/focus, eliminated inline styles |
| 2026-04-05 | Catppuccin Mocha default | Community favorite rice, signals aesthetic care |
