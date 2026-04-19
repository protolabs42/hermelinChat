import { useMemo } from 'react'

import { buildChatPaneHeaderModel } from '../../app/pane-header'
import { PaneHeaderMetaRow } from '../PaneHeaderMetaRow'
import { useChatStore } from '../../stores/chat'
import { useProjectStore, SCRATCHPAD_ID } from '../../stores/projects'

export default function ChatPaneHeader() {
  const messages = useChatStore((s) => s.messages)
  const usage = useChatStore((s) => s.usage)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const gitInfo = useProjectStore((s) => s.gitInfo)
  const getActiveProject = useProjectStore((s) => s.getActiveProject)

  const activeProject = getActiveProject()
  const isScratchpad = !activeProjectId || activeProjectId === SCRATCHPAD_ID
  const currentGitInfo = activeProjectId ? gitInfo[activeProjectId] : null

  const model = useMemo(() => buildChatPaneHeaderModel({
    cwd: isScratchpad ? null : activeProject?.path ?? null,
    branch: currentGitInfo?.branch ?? null,
    dirty: currentGitInfo?.dirty ?? false,
    usage,
    messages,
  }), [activeProject?.path, currentGitInfo?.branch, currentGitInfo?.dirty, isScratchpad, messages, usage])

  const hasContent = model.cwdLabel || model.branchLabel || model.tokenBudgetLabel || model.activityLabel
  if (!hasContent) return null

  return (
    <div
      style={{
        borderBottom: '1px solid color-mix(in srgb, var(--color-border) 82%, transparent)',
        background: 'color-mix(in srgb, var(--color-bg) 72%, var(--color-surface) 28%)',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <PaneHeaderMetaRow model={model} />
    </div>
  )
}
