// v2/src/components/ProjectSwitcher.tsx
//
// Universal project switcher dropdown — a floating overlay that lets users
// search, switch, and add projects. Rendered as a React portal at document.body.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import {
  useProjectStore,
  SCRATCHPAD,
  SCRATCHPAD_ID,
  type Project,
  type DetectedProject,
} from '../stores/projects'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ProjectSwitcherProps {
  anchor: DOMRect | 'center'
  onClose: () => void
}

// ── Positioning ────────────────────────────────────────────────────────────────

function getDropdownStyle(anchor: DOMRect | 'center'): React.CSSProperties {
  const width = 280
  const gap = 4

  if (anchor === 'center') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width,
    }
  }

  // Position below and left-aligned to the anchor rect
  return {
    position: 'fixed',
    top: anchor.bottom + gap,
    left: anchor.left,
    width,
  }
}

// ── Row ────────────────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: Project
  isActive: boolean
  isScratchpad?: boolean
  onClick: () => void
}

function ProjectRow({ project, isActive, isScratchpad, onClick }: ProjectRowProps) {
  const [hovered, setHovered] = useState(false)

  const label = isScratchpad
    ? project.name
    : project.path.split(/[\\/]/).filter(Boolean).slice(-2).join('/')

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        width: '100%',
        padding: '8px 12px',
        background: hovered
          ? 'var(--color-elevated)'
          : isActive
          ? 'var(--color-accent-900)'
          : 'transparent',
        border: 'none',
        borderLeft: isActive
          ? '3px solid var(--color-accent)'
          : '3px solid transparent',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.1s',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          fontSize: 13,
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-bright)',
          fontStyle: isScratchpad ? 'italic' : 'normal',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
      >
        {project.name}
      </span>
      {!isScratchpad && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {label}
        </span>
      )}
    </button>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-muted)',
        padding: '8px 12px 4px',
      }}
    >
      {label}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProjectSwitcher({ anchor, onClose }: ProjectSwitcherProps) {
  const { projects, activeProjectId, addProject, setActiveProject } = useProjectStore()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Auto-focus the search input on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      searchRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // Escape key closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Filter + sort projects
  const allProjects = Object.values(projects)
  const q = query.trim().toLowerCase()

  const filtered = q
    ? allProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
      )
    : allProjects

  const pinned = filtered.filter((p) => p.pinned)
  const recent = filtered
    .filter((p) => !p.pinned)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)

  const showScratchpad = !q || 'scratchpad'.includes(q)

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelect = (id: string) => {
    setActiveProject(id).catch((e: unknown) =>
      console.error('[ProjectSwitcher] setActiveProject failed:', e)
    )
    onClose()
  }

  const handleOpenFolder = async () => {
    if (adding) return
    setAdding(true)
    try {
      const selected = await open({
        directory: true,
        title: 'Open project folder',
      })
      if (!selected) return

      const path = selected as string

      let detected: DetectedProject | null = null
      try {
        detected = await invoke<DetectedProject>('detect_project', { path })
      } catch {
        // detect_project might not exist yet — treat as null
        detected = null
      }

      if (detected) {
        const existingProject = Object.values(projects).find(
          (p) => p.path === detected!.git_root
        )
        let projectId: string
        if (existingProject) {
          projectId = existingProject.id
        } else {
          const newProject = await addProject(
            detected.git_root,
            detected.suggested_name
          )
          projectId = newProject.id
        }
        await setActiveProject(projectId)
      } else {
        // No git repo detected — warn and switch to Scratchpad
        // Use a simple alert-style toast by temporarily showing a message.
        // We still close and fall back to Scratchpad.
        console.warn('[ProjectSwitcher] No git repo found at', path)
        // Optionally switch to scratchpad so UX doesn't hang
        await setActiveProject(SCRATCHPAD_ID)
        alert(
          'No git repository found in that folder.\n\nAurora Chat currently supports git repositories only. The Scratchpad is active.'
        )
      }

      onClose()
    } catch (e) {
      console.error('[ProjectSwitcher] handleOpenFolder failed:', e)
      onClose()
    } finally {
      setAdding(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const dropdownStyle = getDropdownStyle(anchor)

  const isEmpty = pinned.length === 0 && recent.length === 0 && !showScratchpad

  return createPortal(
    <>
      {/* Backdrop — transparent, full-viewport, click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
        }}
      />

      {/* Dropdown panel */}
      <div
        className="animate-dropdown"
        // Stop backdrop click from propagating through the panel
        onClick={(e) => e.stopPropagation()}
        style={{
          ...dropdownStyle,
          zIndex: 1001,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: 400,
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: '12px 12px 8px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            style={{
              width: '100%',
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '8px',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {/* Scrollable list */}
        <div
          style={{
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {isEmpty && (
            <div
              style={{
                padding: '16px 12px',
                color: 'var(--color-muted)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                textAlign: 'center',
              }}
            >
              No projects found
            </div>
          )}

          {/* Pinned section */}
          {pinned.length > 0 && (
            <>
              <SectionLabel label="Pinned" />
              {pinned.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  isActive={activeProjectId === p.id}
                  onClick={() => handleSelect(p.id)}
                />
              ))}
            </>
          )}

          {/* Recent section */}
          {recent.length > 0 && (
            <>
              <SectionLabel label="Recent" />
              {recent.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  isActive={activeProjectId === p.id}
                  onClick={() => handleSelect(p.id)}
                />
              ))}
            </>
          )}

          {/* Scratchpad — always last */}
          {showScratchpad && (
            <>
              {(pinned.length > 0 || recent.length > 0) && (
                <div
                  style={{
                    height: 1,
                    background: 'var(--color-border)',
                    margin: '4px 0',
                  }}
                />
              )}
              <ProjectRow
                project={SCRATCHPAD}
                isActive={
                  activeProjectId === SCRATCHPAD_ID || activeProjectId === null
                }
                isScratchpad
                onClick={() => handleSelect(SCRATCHPAD_ID)}
              />
            </>
          )}
        </div>

        {/* Footer: open folder action */}
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <button
            onClick={handleOpenFolder}
            disabled={adding}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              color: adding ? 'var(--color-muted)' : 'var(--color-text)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              cursor: adding ? 'wait' : 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!adding)
                (e.currentTarget as HTMLButtonElement).style.background =
                  'var(--color-elevated)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background =
                'transparent'
            }}
          >
            <span
              style={{
                fontSize: 16,
                lineHeight: 1,
                color: 'var(--color-accent)',
              }}
            >
              +
            </span>
            {adding ? 'Opening...' : 'Open folder...'}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
