import { useState } from 'react'
import { useSettingsStore } from '../stores/settings'
import { useFontSizeStore } from '../stores/font-size'
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
  const fontSizeStore = useFontSizeStore()

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        className="fixed inset-0 bg-black/40 z-[900] animate-settings-overlay"
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[300px] bg-(--color-surface) border-l border-(--color-border) z-[910] flex flex-col animate-settings-slide overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-(--color-border)">
          <span className="text-[13px] font-semibold text-(--color-text-bright)">
            Settings
          </span>
          <button
            onClick={close}
            className="bg-transparent border-none text-(--color-muted) cursor-pointer text-[16px] leading-none px-1.5 py-0.5 rounded-[4px] hover:bg-(--color-elevated)"
          >
            &#x2715;
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* Section: Appearance */}
          <SectionLabel>Appearance</SectionLabel>
          <div className="grid grid-cols-4 gap-2 mb-6">
            {themeList.map((t) => {
              const isActive = t.id === themeId
              return (
                <button
                  key={t.id}
                  onClick={() => setThemeId(t.id)}
                  title={t.label}
                  className="bg-transparent border-none p-0 cursor-pointer flex flex-col items-center gap-1"
                >
                  <div
                    className="w-[60px] h-[40px] rounded-[6px] overflow-hidden relative transition-[border-color] duration-150"
                    style={{
                      background: t.colors.bg,
                      border: isActive
                        ? `2px solid ${t.colors.accent}`
                        : `1px solid ${t.colors.border}`,
                    }}
                  >
                    {/* Accent strip at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-1.5" style={{ background: t.colors.accent }} />
                    {/* Surface hint */}
                    <div className="absolute top-1.5 left-1.5 right-1.5 h-2.5 rounded-sm" style={{ background: t.colors.surface }} />
                  </div>
                  <span className={`text-[9px] max-w-[60px] overflow-hidden text-ellipsis whitespace-nowrap ${
                    isActive ? 'text-(--color-accent) font-semibold' : 'text-(--color-muted) font-normal'
                  }`}>
                    {t.label.split(' (')[0]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Font size control */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] text-(--color-muted)">
              Font size
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fontSizeStore.decrease()}
                className="w-6 h-6 rounded bg-(--color-elevated) border border-(--color-border) text-(--color-text-bright) text-xs cursor-pointer flex items-center justify-center hover:bg-(--color-border)"
              >
                −
              </button>
              <span className="text-[11px] text-(--color-text-bright) w-8 text-center">
                {fontSizeStore.size}
              </span>
              <button
                onClick={() => fontSizeStore.increase()}
                className="w-6 h-6 rounded bg-(--color-elevated) border border-(--color-border) text-(--color-text-bright) text-xs cursor-pointer flex items-center justify-center hover:bg-(--color-border)"
              >
                +
              </button>
              <button
                onClick={() => fontSizeStore.reset()}
                className="text-[9px] text-(--color-muted) hover:text-(--color-text) cursor-pointer bg-transparent border-none"
              >
                reset
              </button>
            </div>
          </div>

          {/* Section: Agent */}
          <SectionLabel>Agent</SectionLabel>

          {/* Approval mode pills */}
          <div className="mb-3">
            <span className="text-[10px] text-(--color-muted) block mb-1.5">
              Approval mode
            </span>
            <div className="flex gap-1.5">
              {(['yolo', 'smart', 'manual'] as ApprovalMode[]).map((mode) => {
                const isActive = mode === approvalMode
                return (
                  <button
                    key={mode}
                    onClick={() => setApprovalMode(mode)}
                    className="flex-1 py-1.5 text-[11px] font-mono rounded-[6px] cursor-pointer transition-all duration-150"
                    style={{
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
          <div className="mb-6">
            <span className="text-[10px] text-(--color-muted) block mb-1">
              Model
            </span>
            <span className="text-[11px] text-(--color-text)">
              via Hermes (ACP)
            </span>
          </div>

          {/* Section: About */}
          <SectionLabel>About</SectionLabel>
          <div className="text-[11px] text-(--color-text) leading-relaxed">
            <div className="font-semibold text-(--color-text-bright)">
              Aurora Chat v2
            </div>
            <div className="text-(--color-muted) text-[10px]">
              version 0.1.0
            </div>
            <div className="mt-2 text-(--color-muted) text-[10px]">
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
    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-(--color-muted) mb-2.5">
      {children}
    </div>
  )
}
