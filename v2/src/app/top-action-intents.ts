export interface TopActionIntent {
  label: string
  title: string
  shortcutLabel?: string
  overflowTitle?: string
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
      title: 'Create or switch workspaces',
      overflowTitle: 'Show more workspaces',
    },
  }
}
