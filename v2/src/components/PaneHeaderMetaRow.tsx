import type { ChatPaneHeaderModel } from '../app/pane-header'

function HeaderChip({
  label,
  title,
  accent = 'var(--color-text)',
  dirty = false,
}: {
  label: string
  title?: string | null
  accent?: string
  dirty?: boolean
}) {
  return (
    <div
      title={title ?? label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        maxWidth: '100%',
        padding: '6px 10px',
        borderRadius: 999,
        border: '1px solid color-mix(in srgb, var(--color-border) 92%, transparent)',
        background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
        color: accent,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        lineHeight: 1,
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {dirty && (
        <span
          title="Uncommitted changes"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-warning)',
            flexShrink: 0,
          }}
        />
      )}
    </div>
  )
}

export function PaneHeaderMetaRow({
  model,
  padding = '10px 20px 8px',
}: {
  model: ChatPaneHeaderModel
  padding?: string
}) {
  const hasContent = model.cwdLabel || model.branchLabel || model.tokenBudgetLabel || model.activityLabel
  if (!hasContent) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          flexWrap: 'wrap',
          flex: 1,
        }}
      >
        {model.cwdLabel && (
          <HeaderChip label={model.cwdLabel} title={model.cwdTitle} accent="var(--color-accent)" />
        )}
        {model.branchLabel && (
          <HeaderChip label={model.branchLabel} dirty={model.branchDirty} accent="var(--color-success)" />
        )}
        {model.tokenBudgetLabel && (
          <HeaderChip label={model.tokenBudgetLabel} accent="var(--color-text-bright)" />
        )}
      </div>
      {model.activityLabel && (
        <div
          title={model.activityTitle ?? model.activityLabel}
          style={{
            flexShrink: 0,
            color: 'var(--color-muted)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
          }}
        >
          {model.activityLabel}
        </div>
      )}
    </div>
  )
}
