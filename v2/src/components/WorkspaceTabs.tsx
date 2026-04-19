import type { CSSProperties } from 'react'

import { getTopActionIntents } from '../app/top-action-intents'
import type { WorkspaceStripTab, WorkspaceStripTone } from '../app/workspace-strip'

export interface WorkspaceTabsProps {
  tabs: WorkspaceStripTab[]
  overflowCount: number
  onCreateWorkspace: () => void
  onOpenOverflow: () => void
  onSelectWorkspace: (workspaceId: string) => void
}

function toneColor(tone: WorkspaceStripTone, isActive: boolean): string {
  if (tone === 'active') return 'var(--color-accent)'
  if (tone === 'ready') return isActive ? 'var(--color-text-bright)' : 'var(--color-warning, #f9e2af)'
  return 'var(--color-muted)'
}

function tabStyle(isActive: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    maxWidth: 220,
    padding: '6px 10px',
    borderRadius: 999,
    border: isActive ? '1px solid color-mix(in srgb, var(--color-accent) 55%, var(--color-border))' : '1px solid var(--color-border)',
    background: isActive
      ? 'color-mix(in srgb, var(--color-accent) 10%, var(--color-elevated))'
      : 'var(--color-elevated)',
    color: 'var(--color-text-bright)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

export default function WorkspaceTabs({
  tabs,
  overflowCount,
  onCreateWorkspace,
  onOpenOverflow,
  onSelectWorkspace,
}: WorkspaceTabsProps) {
  const intents = getTopActionIntents()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        {tabs.map((tab) => {
          const accent = toneColor(tab.tone, tab.isActive)
          return (
            <button
              key={tab.workspaceId}
              aria-label={`Switch to workspace ${tab.workspaceId}`}
              onClick={() => onSelectWorkspace(tab.workspaceId)}
              style={tabStyle(tab.isActive)}
              title={`${tab.label} — ${tab.hint}`}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: accent,
                  boxShadow: tab.isActive ? `0 0 0 3px color-mix(in srgb, ${accent} 18%, transparent)` : 'none',
                }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12,
                    fontWeight: tab.isActive ? 700 : 600,
                    lineHeight: 1.2,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </span>
                <span
                  style={{
                    color: accent,
                    fontSize: 10,
                    lineHeight: 1.2,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {overflowCount > 0 && (
        <button
          aria-label={`Open workspace overflow (${overflowCount} more)`}
          onClick={onOpenOverflow}
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-muted)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
          title={intents.workspace.overflowTitle}
        >
          +{overflowCount} more
        </button>
      )}

      <button
        aria-label="Create or switch workspace"
        onClick={onCreateWorkspace}
        style={{
          padding: '6px 11px',
          borderRadius: 999,
          border: '1px solid color-mix(in srgb, var(--color-accent) 45%, var(--color-border))',
          background: 'transparent',
          color: 'var(--color-accent)',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
        title={intents.workspace.title}
      >
        {intents.workspace.label}
      </button>
    </div>
  )
}
