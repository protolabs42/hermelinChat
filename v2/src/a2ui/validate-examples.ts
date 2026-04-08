/**
 * Smoke test — validate every example surface in ./examples against the
 * catalog validator. Run with:
 *
 *   npx tsx v2/src/a2ui/validate-examples.ts
 *
 * Exits non-zero and prints errors if any example fails, so this can run
 * in CI. Not bundled into the app build.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateComponents } from './validate'
import type { Component, UpdateComponentsMessage } from './types'
import { resolveUiResource } from './mcp-app/resolver'

const HERE = dirname(fileURLToPath(import.meta.url))
const EXAMPLES_DIR = join(HERE, 'examples')

interface ExampleFile {
  _description?: string
  messages: Array<Record<string, unknown>>
}

function isUpdateComponentsMessage(msg: unknown): msg is UpdateComponentsMessage {
  return !!(msg && typeof msg === 'object' && 'updateComponents' in (msg as Record<string, unknown>))
}

let totalErrors = 0
let totalFiles = 0
let totalComponents = 0

const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.json'))

console.log(`\nValidating ${files.length} example surface(s) against the Aurora Chat A2UI catalog...\n`)

for (const file of files) {
  totalFiles++
  const path = join(EXAMPLES_DIR, file)
  const raw = readFileSync(path, 'utf8')
  let parsed: ExampleFile
  try {
    parsed = JSON.parse(raw) as ExampleFile
  } catch (e) {
    console.error(`❌ ${file}: failed to parse JSON — ${(e as Error).message}`)
    totalErrors++
    continue
  }

  if (!Array.isArray(parsed.messages)) {
    console.error(`❌ ${file}: missing or invalid "messages" array`)
    totalErrors++
    continue
  }

  // Collect all component lists from updateComponents messages
  const allComponents: Component[] = []
  let surfaceId = 'unknown'
  for (const msg of parsed.messages) {
    if (isUpdateComponentsMessage(msg)) {
      surfaceId = msg.updateComponents.surfaceId
      allComponents.push(...msg.updateComponents.components)
    }
  }

  if (allComponents.length === 0) {
    console.error(`❌ ${file}: no updateComponents messages found`)
    totalErrors++
    continue
  }

  totalComponents += allComponents.length
  const errors = validateComponents(allComponents, surfaceId)

  if (errors.length === 0) {
    console.log(`✓ ${file.padEnd(28)} ${String(allComponents.length).padStart(3)} components — valid${parsed._description ? `\n    ${parsed._description}` : ''}`)
  } else {
    totalErrors += errors.length
    console.log(`❌ ${file}: ${errors.length} error(s)`)
    for (const err of errors) {
      console.log(`    ${err.path}: ${err.message}`)
    }
  }
}

// MCP App resource integrity pass — for every McpApp component in every
// example, verify its resourceUri resolves cleanly. Only checks bundled
// (ui://aurora-bundled/*) URIs, since remote MCP fetches would require a
// live server (those are covered by Tasks 14-16 tier tests instead).
let mcpErrors = 0
for (const file of files) {
  const path = join(EXAMPLES_DIR, file)
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ExampleFile
  const mcpApps: Array<{ id: string; resourceUri: string; server: string }> = []
  for (const msg of parsed.messages) {
    if (isUpdateComponentsMessage(msg)) {
      for (const comp of msg.updateComponents.components) {
        const c = comp as { id?: string; component?: string; resourceUri?: string; server?: string }
        if (c.component === 'McpApp' && typeof c.resourceUri === 'string' && typeof c.server === 'string' && typeof c.id === 'string') {
          mcpApps.push({ id: c.id, resourceUri: c.resourceUri, server: c.server })
        }
      }
    }
  }
  for (const m of mcpApps) {
    // Only check bundled URIs — remote fetches need a running MCP server
    if (!m.resourceUri.startsWith('ui://aurora-bundled/')) continue
    try {
      await resolveUiResource(m.resourceUri)
    } catch (e) {
      console.error(`❌ ${file}: McpApp ${m.id} resourceUri ${m.resourceUri} — ${(e as Error).message}`)
      mcpErrors++
    }
  }
}

if (mcpErrors > 0) {
  totalErrors += mcpErrors
  console.error(`\n${mcpErrors} MCP App resource error(s)`)
}

console.log(`\nSummary: ${totalFiles} file(s), ${totalComponents} components, ${totalErrors} error(s)\n`)

if (totalErrors > 0) {
  process.exit(1)
}
