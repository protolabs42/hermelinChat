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

console.log(`\nSummary: ${totalFiles} file(s), ${totalComponents} components, ${totalErrors} error(s)\n`)

if (totalErrors > 0) {
  process.exit(1)
}
