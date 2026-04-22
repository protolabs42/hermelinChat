import { useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAcpEvents } from './hooks/useAcpEvents'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ThemeProvider } from './theme'
import { BackgroundRenderer } from './components/backgrounds/BackgroundRenderer'
import StatusBar from './components/StatusBar'
import ChatView from './components/ChatView'
import MessageInput from './components/MessageInput'
import SettingsPanel from './components/SettingsPanel'
import SessionSidebar from './components/SessionSidebar'
import RightPaneStack from './components/RightPaneStack'
import { AlignmentMascot } from './components/AlignmentMascot'
import ErrorBoundary from './components/ErrorBoundary'
import { useArtifactStore } from './stores/artifacts'
import { useChatStore } from './stores/chat'
import { useSidebarStore } from './stores/sidebar'
import ProjectSwitcher from './components/ProjectSwitcher'
import ConnectionInterstitial from './components/ConnectionInterstitial'
import { useWorkspaceStore } from './stores/workspaces'
import { usePaneStore } from './stores/panes'
import { buildConnectionInterstitialModel } from './app/connection-interstitial'
import { resolveRightPaneLayout } from './app/right-pane-state'

export default function App() {
  useAcpEvents()
  useKeyboardShortcuts()

  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)
  const panelOpen = useArtifactStore((s) => s.panelOpen)
  const pinnedSurfaceId = useArtifactStore((s) => s.pinnedSurfaceId)
  const rightPaneLayout = usePaneStore((s) => s.layout)
  const projectSwitcherOpen = useSidebarStore((s) => s.projectSwitcherOpen)
  const closeProjectSwitcher = useSidebarStore((s) => s.closeProjectSwitcher)
  const workspaceHydrated = useWorkspaceStore((s) => s.hydrated)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const startupStartedAt = useMemo(() => Date.now(), [])

  const interstitialModel = useMemo(() => {
    const rememberedSessionId = activeWorkspace?.continuity.activeThreadId
      ?? activeWorkspace?.resident.sessionId
      ?? null
    return buildConnectionInterstitialModel({
      connectionStatus,
      elapsedMs: Date.now() - startupStartedAt,
      rememberedSessionId,
      sessionId,
      workspaceHydrated,
      workspaceId: activeWorkspace?.workspaceId ?? null,
    })
  }, [activeWorkspace, connectionStatus, sessionId, startupStartedAt, workspaceHydrated])

  const effectiveRightPaneLayout = useMemo(() => resolveRightPaneLayout({
    panelOpen,
    pinnedSurfaceId,
    storedLayout: rightPaneLayout,
  }), [panelOpen, pinnedSurfaceId, rightPaneLayout])

  // Set initial window title
  useEffect(() => {
    invoke('set_window_title', { title: 'Aurora Chat' }).catch(() => {})
  }, [])

  // Reset window title when session is cleared
  useEffect(() => {
    const unsub = useChatStore.subscribe((state, prev) => {
      if (prev.sessionId && !state.sessionId) {
        invoke('set_window_title', { title: 'Aurora Chat' }).catch(() => {})
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (effectiveRightPaneLayout === rightPaneLayout) return
    usePaneStore.getState().setLayout(effectiveRightPaneLayout)
  }, [effectiveRightPaneLayout, rightPaneLayout])

  if (interstitialModel) {
    return (
      <ThemeProvider>
        <div data-testid="connection-interstitial">
          <ConnectionInterstitial
            model={interstitialModel}
            startupStartedAt={startupStartedAt}
          />
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <ErrorBoundary label="App root">
        <div className="flex h-screen" data-testid="app-shell">
          {/* Session sidebar (left, collapsible) */}
          <ErrorBoundary label="Sidebar">
            <SessionSidebar />
          </ErrorBoundary>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col bg-(--color-bg) relative">
            <ErrorBoundary label="Background">
              <BackgroundRenderer />
            </ErrorBoundary>
            <ErrorBoundary label="StatusBar" compact>
              <StatusBar />
            </ErrorBoundary>
            <ErrorBoundary label="ChatView">
              <ChatView />
            </ErrorBoundary>
            <ErrorBoundary label="MessageInput" compact>
              <MessageInput />
            </ErrorBoundary>
          </div>

          {effectiveRightPaneLayout.mode !== 'hidden' && (
            <ErrorBoundary label="RightPaneStack">
              <RightPaneStack layoutOverride={effectiveRightPaneLayout} />
            </ErrorBoundary>
          )}
        </div>

        {/* Settings panel (right overlay) */}
        <ErrorBoundary label="Settings">
          <SettingsPanel />
        </ErrorBoundary>

        {/* Easter egg mascot */}
        <ErrorBoundary label="Mascot" compact>
          <AlignmentMascot />
        </ErrorBoundary>

        {/* Project switcher — opened via Ctrl+Shift+P */}
        {projectSwitcherOpen && (
          <ProjectSwitcher anchor="center" onClose={closeProjectSwitcher} />
        )}
      </ErrorBoundary>
    </ThemeProvider>
  )
}
