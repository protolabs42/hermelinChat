import { useState } from 'react'
import { useSettingsStore } from '../stores/settings'
import { useFontSizeStore } from '../stores/font-size'
import { useTheme, THEMES } from '../theme'
import McpServerSettings from './settings/McpServerSettings'

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
  const fontSizeStore = useFontSizeStore()

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        className="animate-settings-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 900,
        }}
      />

      {/* Panel */}
      <div
        className="animate-settings-slide"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
          zIndex: 910,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          height: 48,
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-bright)',
          }}>
            Settings
          </span>
          <button
            onClick={close}
            style={{
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-muted)',
              cursor: 'pointer',
              borderRadius: 8,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            &#x2715;
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
        }}>

          {/* Section: Appearance */}
          <SectionLabel>Appearance</SectionLabel>

          {/* Theme grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
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
                    gap: 6,
                  }}
                >
                  <div style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 8,
                    position: 'relative',
                    overflow: 'hidden',
                    background: t.colors.bg,
                    border: isActive
                      ? `2px solid ${t.colors.accent}`
                      : `1px solid ${t.colors.border}`,
                    transition: 'border-color 0.15s',
                  }}>
                    {/* Accent strip */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 4,
                      background: t.colors.accent,
                    }} />
                    {/* Surface hint */}
                    <div style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      right: 8,
                      height: 8,
                      borderRadius: 2,
                      background: t.colors.surface,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 10,
                    color: isActive ? 'var(--color-accent)' : 'var(--color-muted)',
                    fontWeight: isActive ? 600 : 400,
                    fontFamily: 'inherit',
                  }}>
                    {t.label.split(' (')[0]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Font size control */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}>
            <span style={{ fontSize: 12, color: 'var(--color-text)' }}>
              Font size
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => fontSizeStore.decrease()}
                style={{
                  width: 32,
                  height: 32,
                  background: 'var(--color-elevated)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-bright)',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'inherit',
                }}
              >
                −
              </button>
              <span style={{
                fontSize: 13,
                color: 'var(--color-text-bright)',
                width: 32,
                textAlign: 'center',
              }}>
                {fontSizeStore.size}
              </span>
              <button
                onClick={() => fontSizeStore.increase()}
                style={{
                  width: 32,
                  height: 32,
                  background: 'var(--color-elevated)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-bright)',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'inherit',
                }}
              >
                +
              </button>
              <button
                onClick={() => fontSizeStore.reset()}
                style={{
                  width: 'auto',
                  borderRadius: 6,
                  padding: '0 12px',
                  fontSize: 11,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                reset
              </button>
            </div>
          </div>

          {/* Section: Agent */}
          <SectionLabel style={{ marginTop: 28 }}>Agent</SectionLabel>

          {/* Approval mode pills */}
          <div style={{ marginBottom: 24 }}>
            <span style={{
              fontSize: 11,
              color: 'var(--color-muted)',
              display: 'block',
              marginBottom: 8,
            }}>
              Approval mode
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['yolo', 'smart', 'manual'] as ApprovalMode[]).map((mode) => {
                const isActive = mode === approvalMode
                return (
                  <button
                    key={mode}
                    onClick={() => setApprovalMode(mode)}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      fontWeight: isActive ? 600 : 400,
                      border: isActive
                        ? `1px solid ${MODE_COLORS[mode]}`
                        : '1px solid var(--color-border)',
                      background: isActive ? 'var(--color-elevated)' : 'transparent',
                      color: isActive ? MODE_COLORS[mode] : 'var(--color-muted)',
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
            <div style={{
              fontSize: 11,
              color: 'var(--color-muted)',
              marginBottom: 4,
            }}>
              Model
            </div>
            <div style={{
              fontSize: 13,
              color: 'var(--color-text)',
            }}>
              via Hermes (ACP)
            </div>
          </div>

          {/* Section: MCP Servers */}
          <SectionLabel style={{ marginTop: 28 }}>MCP Servers</SectionLabel>
          <McpServerSettings />

          {/* Section: About */}
          <SectionLabel style={{ marginTop: 28 }}>About</SectionLabel>

          <div style={{
            padding: 16,
            background: 'var(--color-elevated)',
            borderRadius: 8,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--color-text-bright)',
              marginBottom: 4,
            }}>
              Aurora Chat
            </div>
            <div style={{
              fontSize: 11,
              color: 'var(--color-muted)',
            }}>
              v0.1.0 &middot; Powered by Hermes Agent
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: 'var(--color-accent)',
      marginBottom: 12,
      ...style,
    }}>
      {children}
    </div>
  )
}
