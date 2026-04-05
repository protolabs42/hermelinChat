import { useState } from 'react'
import { useSettingsStore } from '../stores/settings'
import { useTheme, THEMES } from '../theme'

type ApprovalMode = 'yolo' | 'smart' | 'manual'

const MODE_COLORS: Record<ApprovalMode, string> = {
  yolo: 'var(--color-success)',
  smart: 'var(--color-accent-400)',
  manual: 'var(--color-danger)',
}

const themeList = Object.values(THEMES)

export default function SettingsPanel() {
  const isOpen = useSettingsStore((s) => s.isOpen)
  const close = useSettingsStore((s) => s.close)
  const { themeId, setThemeId } = useTheme()
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('yolo')

  if (!isOpen) return null

  return (
    <>
      <style>{`
        @keyframes settings-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes settings-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Overlay */}
      <div
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 900,
          animation: 'settings-overlay-in 200ms ease-out',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 300,
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
          zIndex: 910,
          display: 'flex',
          flexDirection: 'column',
          animation: 'settings-slide-in 200ms ease-out',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-bright)' }}>
            Settings
          </span>
          <button
            onClick={close}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-muted)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            &#x2715;
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {/* Section: Appearance */}
          <SectionLabel>Appearance</SectionLabel>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            marginBottom: 24,
          }}>
            {themeList.map((t) => {
              const isActive = t.id === themeId
              return (
                <button
                  key={t.id}
                  onClick={() => setThemeId(t.id)}
                  title={t.label}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <div style={{
                    width: 60,
                    height: 40,
                    borderRadius: 6,
                    background: t.colors.bg,
                    border: isActive
                      ? `2px solid ${t.colors.accent}`
                      : `1px solid ${t.colors.border}`,
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'border-color 150ms ease',
                  }}>
                    {/* Accent strip at bottom */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 6,
                      background: t.colors.accent,
                    }} />
                    {/* Surface hint */}
                    <div style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      right: 6,
                      height: 10,
                      borderRadius: 2,
                      background: t.colors.surface,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 9,
                    color: isActive ? 'var(--color-accent)' : 'var(--color-muted)',
                    fontWeight: isActive ? 600 : 400,
                    maxWidth: 60,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {t.label.split(' (')[0]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Section: Agent */}
          <SectionLabel>Agent</SectionLabel>

          {/* Approval mode pills */}
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: 'var(--color-muted)', display: 'block', marginBottom: 6 }}>
              Approval mode
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['yolo', 'smart', 'manual'] as ApprovalMode[]).map((mode) => {
                const isActive = mode === approvalMode
                return (
                  <button
                    key={mode}
                    onClick={() => setApprovalMode(mode)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 400,
                      fontFamily: 'inherit',
                      border: isActive
                        ? `1px solid ${MODE_COLORS[mode]}`
                        : '1px solid var(--color-border)',
                      borderRadius: 6,
                      background: isActive ? 'var(--color-elevated)' : 'transparent',
                      color: isActive ? MODE_COLORS[mode] : 'var(--color-muted)',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                  >
                    {mode}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Model display */}
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 10, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>
              Model
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text)' }}>
              via Hermes (ACP)
            </span>
          </div>

          {/* Section: About */}
          <SectionLabel>About</SectionLabel>
          <div style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: 'var(--color-text-bright)' }}>
              Aurora Chat v2
            </div>
            <div style={{ color: 'var(--color-muted)', fontSize: 10 }}>
              version 0.1.0
            </div>
            <div style={{ marginTop: 8, color: 'var(--color-muted)', fontSize: 10 }}>
              Powered by Hermes Agent (ACP)
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--color-muted)',
      marginBottom: 10,
    }}>
      {children}
    </div>
  )
}
