import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'

interface StartSessionOptions {
  projectPath?: string | null
  resetChat?: boolean
  markConnecting?: boolean
}

export async function resolveSessionCwd(projectPath?: string | null): Promise<string | null> {
  if (projectPath) return projectPath
  return await invoke<string>('get_home_dir').catch(() => null)
}

export async function startFreshSession(options: StartSessionOptions = {}): Promise<void> {
  const { projectPath = null, resetChat = false, markConnecting = false } = options
  if (resetChat) {
    useChatStore.getState().reset()
  }
  if (markConnecting) {
    useChatStore.setState({ connectionStatus: 'connecting' })
  }
  const cwd = await resolveSessionCwd(projectPath)
  await invoke('acp_new_session', { cwd })
}
