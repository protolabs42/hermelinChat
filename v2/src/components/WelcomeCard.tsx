import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'
import { useProjectStore, SCRATCHPAD_ID } from '../stores/projects'
import { useTheme } from '../theme'

interface VersionInfo {
  current: string | null
  latest: string | null
  update_available: boolean
  commits_behind: number | null
  install_type: string
  hermes_dir: string | null
}

interface Toolsets {
  enabled: string[]
  model: string | null
}

interface Skills {
  total: number
  categories: string[]
}

interface McpServer {
  name: string
  enabled: boolean
}

interface BannerHero {
  art: string
  color: string | null
  skin: string | null
}

const INITIAL_CATEGORIES = 8

const Chip = ({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) => (
  <span
    style={{
      fontSize: 10,
      fontFamily: 'var(--font-mono, monospace)',
      padding: '2px 8px',
      borderRadius: 99,
      background: dim ? 'transparent' : 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      color: dim ? 'var(--color-muted)' : 'var(--color-text-bright)',
    }}
  >
    {children}
  </span>
)

export default function WelcomeCard() {
  const { theme } = useTheme()
  const model = useChatStore((s) => s.model)
  const sessionId = useChatStore((s) => s.sessionId)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const getActiveProject = useProjectStore((s) => s.getActiveProject)

  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [toolsets, setToolsets] = useState<Toolsets>({ enabled: [], model: null })
  const [skills, setSkills] = useState<Skills>({ total: 0, categories: [] })
  const [mcps, setMcps] = useState<McpServer[]>([])
  const [hero, setHero] = useState<BannerHero>({ art: '', color: null, skin: null })
  const [showAllSkills, setShowAllSkills] = useState(false)

  useEffect(() => {
    invoke<VersionInfo>('check_hermes_update').then(setVersion).catch(() => {})
    invoke<Toolsets>('get_hermes_toolsets').then(setToolsets).catch(() => {})
    invoke<Skills>('get_hermes_skills').then(setSkills).catch(() => {})
    invoke<McpServer[]>('list_mcp_servers').then(setMcps).catch(() => {})
    invoke<BannerHero>('get_hermes_banner_hero').then(setHero).catch(() => {})
  }, [])

  const activeProject = getActiveProject()
  const isScratchpad = !activeProjectId || activeProjectId === SCRATCHPAD_ID
  const projectLabel = isScratchpad ? 'Scratchpad' : activeProject?.name ?? '—'
  const projectPath = !isScratchpad ? activeProject?.path : null

  const shownModel = model ?? toolsets.model ?? '—'
  const shownVersion = version?.current ?? '—'

  const heroColor = hero.color ?? 'var(--color-accent)'

  const visibleCategories = showAllSkills
    ? skills.categories
    : skills.categories.slice(0, INITIAL_CATEGORIES)
  const extraCategories = Math.max(0, skills.categories.length - INITIAL_CATEGORIES)

  const enabledMcps = mcps.filter((m) => m.enabled)

  return (
    <div style={{
      display: 'flex',
      gap: 28,
      padding: '28px 32px',
      background: 'var(--color-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      maxWidth: 760,
      margin: '0 auto',
      alignItems: 'flex-start',
    }}>
      {/* Left — ASCII fox from the active hermes skin */}
      <pre
        title={theme.identity.mascotTitle}
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 10,
          lineHeight: 1,
          color: heroColor,
          flexShrink: 0,
          userSelect: 'none',
          whiteSpace: 'pre',
          textShadow: `0 0 8px ${heroColor}`,
        }}
      >
        {hero.art || ''}
      </pre>

      {/* Right — info */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--color-text-bright)',
            letterSpacing: '0.02em',
          }}>
            {theme.identity.mascotTitle}
          </span>
          <span style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--color-muted)',
          }}>
            hermes {shownVersion}
          </span>
        </div>

        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: 12 }}>
          <dt style={{ color: 'var(--color-muted)' }}>Model</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-accent)' }}>
            {shownModel}
          </dd>

          <dt style={{ color: 'var(--color-muted)' }}>Project</dt>
          <dd style={{ margin: 0, color: 'var(--color-text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectLabel}
            {projectPath && (
              <span style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, marginLeft: 6 }}>
                {projectPath}
              </span>
            )}
          </dd>

          {sessionId && (
            <>
              <dt style={{ color: 'var(--color-muted)' }}>Session</dt>
              <dd style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-muted)', fontSize: 11 }}>
                {sessionId.slice(0, 16)}
              </dd>
            </>
          )}

          {toolsets.enabled.length > 0 && (
            <>
              <dt style={{ color: 'var(--color-muted)' }}>Toolsets</dt>
              <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {toolsets.enabled.map((t) => <Chip key={t}>{t}</Chip>)}
              </dd>
            </>
          )}

          {enabledMcps.length > 0 && (
            <>
              <dt style={{ color: 'var(--color-muted)' }}>MCPs</dt>
              <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {enabledMcps.map((m) => <Chip key={m.name}>{m.name}</Chip>)}
              </dd>
            </>
          )}

          {skills.total > 0 && (
            <>
              <dt style={{ color: 'var(--color-muted)' }}>
                Skills <span style={{ opacity: 0.7 }}>({skills.total})</span>
              </dt>
              <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {visibleCategories.map((c) => <Chip key={c} dim>{c}</Chip>)}
                {!showAllSkills && extraCategories > 0 && (
                  <button
                    onClick={() => setShowAllSkills(true)}
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono, monospace)',
                      padding: '2px 8px',
                      borderRadius: 99,
                      background: 'transparent',
                      border: '1px dashed var(--color-border)',
                      color: 'var(--color-accent)',
                      cursor: 'pointer',
                    }}
                  >
                    + {extraCategories} more
                  </button>
                )}
                {showAllSkills && skills.categories.length > INITIAL_CATEGORIES && (
                  <button
                    onClick={() => setShowAllSkills(false)}
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono, monospace)',
                      padding: '2px 8px',
                      borderRadius: 99,
                      background: 'transparent',
                      border: '1px dashed var(--color-border)',
                      color: 'var(--color-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    show less
                  </button>
                )}
              </dd>
            </>
          )}
        </dl>
      </div>
    </div>
  )
}
