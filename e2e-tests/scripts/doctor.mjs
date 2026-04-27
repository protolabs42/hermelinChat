#!/usr/bin/env node
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

function commandExists(command) {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function main() {
  const tauriDriver = process.env.TAURI_DRIVER_PATH || commandExists('tauri-driver') || path.join(os.homedir(), '.cargo', 'bin', 'tauri-driver')
  const nativeDriver = process.env.TAURI_NATIVE_DRIVER_PATH || commandExists('WebKitWebDriver')

  const problems = []

  if (!commandExists('cargo')) problems.push('cargo is not on PATH')
  if (!commandExists('node')) problems.push('node is not on PATH')
  if (!await fileExists(tauriDriver)) {
    problems.push(`tauri-driver not found. Install with: cargo install tauri-driver --locked`)
  }
  if (!nativeDriver) {
    problems.push('WebKitWebDriver not found on PATH. On Debian/Ubuntu install package: webkit2gtk-driver')
  }

  const requiredFixtures = [
    path.join(repoRoot, 'e2e-tests', 'fixtures', 'fake-hermes-acp.mjs'),
    path.join(repoRoot, 'e2e-tests', 'fixtures', 'hermetic-home', '.hermes', 'config.yaml'),
    path.join(repoRoot, 'e2e-tests', 'fixtures', 'hermetic-home', '.hermes', '.env'),
    path.join(repoRoot, 'e2e-tests', 'fixtures', 'hermetic-home', '.claude.json'),
  ]

  for (const fixturePath of requiredFixtures) {
    if (!await pathExists(fixturePath)) {
      problems.push(`missing hermetic E2E fixture: ${fixturePath}`)
    }
  }

  if (problems.length > 0) {
    console.error('Tauri E2E doctor failed:')
    for (const problem of problems) console.error(`- ${problem}`)
    process.exit(1)
  }

  console.log('Tauri E2E doctor OK')
  console.log(`- tauri-driver: ${tauriDriver}`)
  console.log(`- native driver: ${nativeDriver}`)
  console.log(`- hermetic home fixture: ${path.join(repoRoot, 'e2e-tests', 'fixtures', 'hermetic-home')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
