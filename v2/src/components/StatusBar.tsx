import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { useSidebarStore } from '../stores/sidebar'
import { useArtifactStore } from '../stores/artifacts'
import { useProjectStore, SCRATCHPAD_ID } from '../stores/projects'
import { useWorkspaceStore } from '../stores/workspaces'
import { buildManualA2UIEmitRequest } from '../a2ui/manual-launch'
import { useTheme } from '../theme'
import ProjectSwitcher from './ProjectSwitcher'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import WorkspaceTabs from './WorkspaceTabs'
import HermesUpdateModal from './HermesUpdateModal'
import { getTopActionIntents } from '../app/top-action-intents'
import { buildWorkspaceStripModel } from '../app/workspace-strip'
import { activateWorkspaceSnapshot } from '../lane2/workspace-activation'
import { buildWorkspaceContinuityCard } from '../lane2/workspace-summary'
import coeditProofRaw from '../a2ui/examples/mcp-app-coedit-proof.json?raw'

interface VersionInfo {
  current: string | null
  latest: string | null
  update_available: boolean
  commits_behind: number | null
  install_type: string
  hermes_dir: string | null
}

interface ExampleFile {
  messages: Array<Record<string, unknown>>
}

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)
  const toggleSettings = useSettingsStore((s) => s.toggle)
  const toggleSidebar = useSidebarStore((s) => s.toggle)
  const artifactCount = useArtifactStore((s) => s.artifacts.length)
  const toggleArtifacts = useArtifactStore((s) => s.togglePanel)
  const { theme } = useTheme()

  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const gitInfo = useProjectStore((s) => s.gitInfo)
  const getActiveProject = useProjectStore((s) => s.getActiveProject)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)

  const activeProject = getActiveProject()
  const isScratchpad = !activeProjectId || activeProjectId === SCRATCHPAD_ID
  const currentGitInfo = activeProjectId ? gitInfo[activeProjectId] : null
  const continuityCard = activeWorkspace ? buildWorkspaceContinuityCard(activeWorkspace) : null
  const stripWorkspaces = workspaces.length > 0
    ? workspaces
    : activeWorkspace
    ? [activeWorkspace]
    : []
  const workspaceStrip = useMemo(() => buildWorkspaceStripModel({
    activeWorkspaceId: activeWorkspace?.workspaceId ?? null,
    maxVisibleCount: 4,
    workspaces: stripWorkspaces,
  }), [activeWorkspace?.workspaceId, stripWorkspaces])
  const topActionIntents = getTopActionIntents()

  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false)
  const projectNameRef = useRef<HTMLSpanElement>(null)
  const workspaceStripRef = useRef<HTMLDivElement>(null)

  const openSwitcher = () => setSwitcherOpen(true)
  const closeSwitcher = () => setSwitcherOpen(false)
  const openWorkspaceSwitcher = () => setWorkspaceSwitcherOpen(true)
  const closeWorkspaceSwitcher = () => setWorkspaceSwitcherOpen(false)

  const getSwitcherAnchor = (): DOMRect | 'center' => {
    if (projectNameRef.current) {
      return projectNameRef.current.getBoundingClientRect()
    }
    return 'center'
  }

  const getWorkspaceSwitcherAnchor = (): DOMRect | 'center' => {
    if (workspaceStripRef.current) {
      return workspaceStripRef.current.getBoundingClientRect()
    }
    return 'center'
  }

  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)

  const refreshUpdateInfo = () => {
    invoke<VersionInfo>('check_hermes_update').then((info) => {
      setUpdateInfo(info.update_available ? info : null)
    }).catch(() => {})
  }

  const launchCoeditProof = async () => {
    if (!sessionId) return
    try {
      const parsed = JSON.parse(coeditProofRaw) as ExampleFile
      const request = buildManualA2UIEmitRequest(sessionId, parsed.messages as never[])
      await invoke('emit_local_a2ui_batch', { request })
    } catch (e) {
      console.error('Failed to launch co-edit proof surface:', e)
    }
  }

  useEffect(() => {
    const handleOpenWorkspaceSwitcher = () => setWorkspaceSwitcherOpen(true)
    window.addEventListener('aurora:open-workspace-switcher', handleOpenWorkspaceSwitcher)
    return () => window.removeEventListener('aurora:open-workspace-switcher', handleOpenWorkspaceSwitcher)
  }, [])

  useEffect(() => {
    refreshUpdateInfo()
    void loadWorkspaces()
  }, [loadWorkspaces])

  const dotColor =
    status === 'connected' ? 'var(--color-success)' :
    status === 'connecting' ? 'var(--color-accent-400)' :
    'var(--color-danger)'

  const handleReconnect = async () => {
    try {
      useChatStore.setState({ connectionStatus: 'connecting' })
      await invoke('acp_reconnect')
    } catch (e) {
      console.error('Reconnect failed:', e)
    }
  }

  const handleResumeCurrentWorkspace = async () => {
    if (!activeWorkspace) return
    try {
      await activateWorkspaceSnapshot(activeWorkspace, {
        setActiveWorkspace: useWorkspaceStore.getState().setActiveWorkspace,
        hydrateActiveProject: useProjectStore.getState().hydrateActiveProject,
        resetChat: () => {
          useChatStore.getState().reset()
        },
        restoreSurfaceAnchors: (surfaceIds) => {
          useChatStore.getState().restoreSurfaceAnchors(surfaceIds)
        },
        foregroundFocusTarget: (target) => {
          if (!target) return
          const artifactStore = useArtifactStore.getState()
          if (target.kind === 'surface') {
            artifactStore.pinSurface(target.id)
            return
          }
          if (target.kind === 'artifact') {
            artifactStore.openPanel()
            artifactStore.setActiveId(target.id)
          }
        },
        loadSession: async (sessionId, cwd) => {
          await invoke('acp_load_session', { sessionId, cwd })
        },
        newSession: async (cwd) => {
          await invoke('acp_new_session', { cwd })
        },
        getHomeDir: async () => await invoke<string>('get_home_dir').catch(() => null),
        getProjectPath: (projectId) => useProjectStore.getState().projects[projectId]?.path ?? null,
        getCurrentProjectPath: () => useProjectStore.getState().getActiveProject()?.path ?? null,
      })
    } catch (e) {
      console.error('Failed to resume current workspace continuity:', e)
    }
  }

  const handleSelectWorkspace = async (workspaceId: string) => {
    const targetWorkspace = stripWorkspaces.find((workspace) => workspace.workspaceId === workspaceId)
    if (!targetWorkspace) {
      openWorkspaceSwitcher()
      return
    }

    try {
      await activateWorkspaceSnapshot(targetWorkspace, {
        setActiveWorkspace: useWorkspaceStore.getState().setActiveWorkspace,
        hydrateActiveProject: useProjectStore.getState().hydrateActiveProject,
        resetChat: () => {
          useChatStore.getState().reset()
        },
        restoreSurfaceAnchors: (surfaceIds) => {
          useChatStore.getState().restoreSurfaceAnchors(surfaceIds)
        },
        foregroundFocusTarget: (target) => {
          if (!target) return
          const artifactStore = useArtifactStore.getState()
          if (target.kind === 'surface') {
            artifactStore.pinSurface(target.id)
            return
          }
          if (target.kind === 'artifact') {
            artifactStore.openPanel()
            artifactStore.setActiveId(target.id)
          }
        },
        loadSession: async (sessionId, cwd) => {
          await invoke('acp_load_session', { sessionId, cwd })
        },
        newSession: async (cwd) => {
          await invoke('acp_new_session', { cwd })
        },
        getHomeDir: async () => await invoke<string>('get_home_dir').catch(() => null),
        getProjectPath: (projectId) => useProjectStore.getState().projects[projectId]?.path ?? null,
        getCurrentProjectPath: () => useProjectStore.getState().getActiveProject()?.path ?? null,
      })
    } catch (e) {
      console.error(`Failed to activate workspace ${workspaceId}:`, e)
    }
  }

  const btnStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-muted)',
    cursor: 'pointer',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
  }

  const pillButtonStyle: React.CSSProperties = {
    ...btnStyle,
    width: 'auto',
    padding: '0 12px',
    gap: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-elevated)',
    color: 'var(--color-text-bright)',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
  }

  return (
    <div style={{
      padding: '0 18px',
      height: 54,
      borderBottom: '1px solid var(--color-border)',
      background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
      color: 'var(--color-muted)',
    }}>
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={toggleSidebar} title="Sessions (Ctrl+B)" style={btnStyle}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        <button
          onClick={() => {
            useChatStore.getState().reset()
            invoke('set_window_title', { title: 'Aurora Chat' }).catch(() => {})
            const activeProject = useProjectStore.getState().getActiveProject()
            const cwd = activeProject?.path || null
            invoke('acp_new_session', { cwd }).catch((e: unknown) =>
              console.error('Failed to start new session:', e)
            )
          }}
          title={topActionIntents.newChat.title}
          style={pillButtonStyle}
        >
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, color: 'var(--color-accent)' }}>+</span>
          <span>{topActionIntents.newChat.label.slice(2)}</span>
          <span style={{ color: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono, monospace)' }}>
            {topActionIntents.newChat.shortcutLabel}
          </span>
        </button>

        <div
          style={{
            width: 20,
            height: 20,
            color: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.7,
            flexShrink: 0,
          }}
          title={theme.identity.mascotTitle}
          dangerouslySetInnerHTML={{ __html: theme.identity.topbarSvg }}
        />
      </div>

      {/* Center */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 10,
        overflow: 'hidden',
      }}>
        {/* Connection status dot */}
        <span
          style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }}
          title={status}
        />

        <div ref={workspaceStripRef} style={{ display: 'flex', alignItems: 'center', minWidth: 0, maxWidth: '100%', flex: 1 }}>
          <WorkspaceTabs
            tabs={workspaceStrip.visibleTabs}
            overflowCount={workspaceStrip.overflowCount}
            onCreateWorkspace={openWorkspaceSwitcher}
            onOpenOverflow={openWorkspaceSwitcher}
            onSelectWorkspace={(workspaceId) => {
              void handleSelectWorkspace(workspaceId)
            }}
          />
        </div>

        <span style={{ color: 'var(--color-muted)', opacity: 0.35 }}>•</span>

        {/* Project breadcrumb */}
        {activeProjectId === null ? (
          <span style={{ color: 'var(--color-muted)', opacity: 0.5 }}>...</span>
        ) : isScratchpad ? (
          <span
            ref={projectNameRef}
            onClick={openSwitcher}
            style={{
              fontStyle: 'italic',
              color: 'var(--color-muted)',
              cursor: 'pointer',
              textDecorationLine: 'underline',
              textDecorationStyle: 'dashed',
              textUnderlineOffset: 3,
              fontSize: 13,
            }}
          >
            Scratchpad
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              ref={projectNameRef}
              onClick={openSwitcher}
              style={{
                color: 'var(--color-accent)',
                cursor: 'pointer',
                textDecorationLine: 'underline',
                textDecorationStyle: 'dashed',
                textUnderlineOffset: 3,
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {activeProject?.name ?? '...'}
            </span>
            {currentGitInfo?.branch && (
              <>
                <span style={{ color: 'var(--color-muted)', opacity: 0.5 }}>/</span>
                <span
                  style={{
                    color: 'var(--color-success)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12,
                  }}
                >
                  {currentGitInfo.branch}
                </span>
                {currentGitInfo.dirty && (
                  <span
                    title="Uncommitted changes"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--color-warning, #f9e2af)',
                      flexShrink: 0,
                      display: 'inline-block',
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}

        {continuityCard && (
          <>
            <span style={{ color: 'var(--color-muted)', opacity: 0.35 }}>•</span>
            <button
              onClick={() => void handleResumeCurrentWorkspace()}
              title={continuityCard.actionLabel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 10px',
                borderRadius: 999,
                border: '1px solid var(--color-border)',
                background: continuityCard.tone === 'active'
                  ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                  : 'var(--color-elevated)',
                maxWidth: 360,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: continuityCard.tone === 'active'
                    ? 'var(--color-accent)'
                    : 'var(--color-warning, #f9e2af)',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: 'var(--color-text-bright)',
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {continuityCard.label}
              </span>
              <span
                style={{
                  color: 'var(--color-muted)',
                  fontSize: 11,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {continuityCard.detail}
              </span>
              <span
                style={{
                  color: continuityCard.tone === 'active' ? 'var(--color-accent)' : 'var(--color-text-bright)',
                  fontSize: 10,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {continuityCard.actionLabel}
              </span>
            </button>
          </>
        )}

        {status === 'disconnected' && (
          <button
            onClick={handleReconnect}
            style={{
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-text-bright)',
              fontSize: 13,
              padding: '6px 16px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {artifactCount > 0 && (
          <button
            onClick={toggleArtifacts}
            title={`Artifacts (${artifactCount})`}
            style={{ ...btnStyle, width: 'auto', padding: '0 12px', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span style={{
              fontSize: 10,
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
              borderRadius: 99,
              padding: '2px 8px',
              fontWeight: 700,
            }}>
              {artifactCount}
            </span>
          </button>
        )}

        {import.meta.env.DEV && (
          <button
            onClick={launchCoeditProof}
            disabled={!sessionId || status !== 'connected'}
            title={
              sessionId && status === 'connected'
                ? 'Launch co-edit proof surface in the current session'
                : 'Wait for Aurora to finish connecting and create a live session first'
            }
            style={{
              ...btnStyle,
              width: 'auto',
              padding: '0 12px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              color: sessionId && status === 'connected' ? 'var(--color-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
              opacity: sessionId && status === 'connected' ? 1 : 0.55,
            }}
          >
            coedit proof
          </button>
        )}

        {updateInfo?.update_available && (
          <button
            onClick={() => setUpdateModalOpen(true)}
            title={
              updateInfo.commits_behind
                ? `${updateInfo.commits_behind} commits behind origin/main`
                : 'Update available'
            }
            style={{
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 99,
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {updateInfo.latest ?? 'update'} available
          </button>
        )}

        <button onClick={toggleSettings} title="Settings (Ctrl+,)" style={{ ...btnStyle, fontSize: 20 }}>
          &#9881;
        </button>
      </div>

      {/* Project Switcher overlay */}
      {switcherOpen && (
        <ProjectSwitcher
          anchor={getSwitcherAnchor()}
          onClose={closeSwitcher}
        />
      )}

      {workspaceSwitcherOpen && (
        <WorkspaceSwitcher
          anchor={getWorkspaceSwitcherAnchor()}
          onClose={closeWorkspaceSwitcher}
        />
      )}

      {updateModalOpen && updateInfo && (
        <HermesUpdateModal
          info={updateInfo}
          onClose={() => setUpdateModalOpen(false)}
          onUpdateComplete={refreshUpdateInfo}
        />
      )}
    </div>
  )
}
