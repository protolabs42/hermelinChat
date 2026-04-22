import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { activateWorkspace } from '../app/workspace-lifecycle'
import { useChatStore } from '../stores/chat'
import { useProjectStore } from '../stores/projects'
import { useWorkspaceStore } from '../stores/workspaces'

export function useProjectBootstrap() {
  useEffect(() => {
    let bootstrapped = false

    async function bootstrapProject() {
      if (bootstrapped) return
      if (useChatStore.getState().sessionId) return
      bootstrapped = true
      try {
        const launchCwd = await invoke<string>('get_launch_cwd')
        const homeDir = await invoke<string>('get_home_dir').catch(() => '')
        await useProjectStore.getState().refresh()

        const restoredWorkspace = await useWorkspaceStore.getState().loadActiveWorkspace()

        if (restoredWorkspace) {
          await activateWorkspace(restoredWorkspace)
          return
        }

        if (launchCwd === homeDir) {
          const active = useProjectStore.getState().activeProjectId
          const projects = useProjectStore.getState().projects
          if (active && active !== 'scratchpad' && projects[active]) {
            await useProjectStore.getState().setActiveProject(active)
          } else {
            await useProjectStore.getState().setActiveProject('scratchpad')
          }
          return
        }

        const detected = await invoke<{ git_root: string; suggested_name: string } | null>(
          'detect_project',
          { path: launchCwd }
        ).catch(() => null)
        const projectPath = detected?.git_root ?? launchCwd
        const projectName = detected?.suggested_name
          ?? launchCwd.split(/[\\/]/).filter(Boolean).pop()
          ?? 'unnamed'

        const findByPath = () =>
          Object.values(useProjectStore.getState().projects).find((p) => p.path === projectPath)

        const known = findByPath()
        if (known) {
          await useProjectStore.getState().setActiveProject(known.id)
          return
        }

        try {
          const newProject = await useProjectStore.getState().addProject(projectPath, projectName)
          await useProjectStore.getState().setActiveProject(newProject.id)
        } catch (addErr) {
          console.warn('addProject failed, retrying after refresh:', addErr)
          await useProjectStore.getState().refresh()
          const retry = findByPath()
          if (retry) {
            await useProjectStore.getState().setActiveProject(retry.id)
          } else {
            throw addErr
          }
        }
      } catch (e) {
        console.error('Project startup failed:', e)
        bootstrapped = false
        const cwd = await invoke<string>('get_launch_cwd').catch(() => null)
        invoke('acp_new_session', { cwd }).catch(() => {})
      }
    }

    invoke<string>('acp_status').then((status) => {
      useChatStore.setState({ connectionStatus: status })
      if (status === 'connected') {
        bootstrapProject()
      }
    }).catch(() => {})

    const handleAcpReady = () => {
      void bootstrapProject()
    }

    window.addEventListener('aurora:acp-ready', handleAcpReady)
    return () => {
      window.removeEventListener('aurora:acp-ready', handleAcpReady)
    }
  }, [])
}
