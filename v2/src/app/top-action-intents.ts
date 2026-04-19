export interface TopActionIntent {
  label: string
  title: string
  shortcutLabel?: string
  overflowTitle?: string
}

export interface ShortcutLike {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  key: string
}

export function isWorkspaceSwitcherShortcut(event: ShortcutLike): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o'
}

export function getTopActionIntents(): {
  newChat: TopActionIntent
  workspace: TopActionIntent
} {
  return {
    newChat: {
      label: '+ chat',
      shortcutLabel: 'Ctrl+N',
      title: 'Start a new chat in this workspace (Ctrl+N)',
    },
    workspace: {
      label: '+ workspace',
      shortcutLabel: 'Ctrl+Shift+O',
      title: 'Create or switch workspaces (Ctrl+Shift+O)',
      overflowTitle: 'Show more workspaces',
    },
  }
}
