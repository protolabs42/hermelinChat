import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { expect } from 'chai'
import { Builder, By, Capabilities, until } from 'selenium-webdriver'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

function resolveApplicationPath() {
  const candidates = [
    path.join(repoRoot, 'target', 'debug', 'aurora-chat'),
    path.join(repoRoot, 'src-tauri', 'target', 'debug', 'aurora-chat'),
    path.join(repoRoot, 'target', 'debug', 'aurora-chat.exe'),
    path.join(repoRoot, 'src-tauri', 'target', 'debug', 'aurora-chat.exe'),
  ]
  const hit = candidates.find((candidate) => spawnSync('bash', ['-lc', `test -x ${JSON.stringify(candidate)}`]).status === 0)
  return hit ?? candidates[0]
}

function resolveTauriDriverPath() {
  return process.env.TAURI_DRIVER_PATH || path.join(os.homedir(), '.cargo', 'bin', 'tauri-driver')
}

function resolveNativeDriverPath() {
  if (process.env.TAURI_NATIVE_DRIVER_PATH) return process.env.TAURI_NATIVE_DRIVER_PATH
  const result = spawnSync('bash', ['-lc', 'command -v WebKitWebDriver'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

function buildIsolatedRuntime(binaryPath) {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-chat-e2e-'))
  const homeDir = path.join(runtimeRoot, 'home')
  const xdgConfigHome = path.join(runtimeRoot, 'xdg-config')
  const xdgDataHome = path.join(runtimeRoot, 'xdg-data')
  const xdgStateHome = path.join(runtimeRoot, 'xdg-state')
  const xdgCacheHome = path.join(runtimeRoot, 'xdg-cache')
  const xdgRuntimeDir = path.join(runtimeRoot, 'xdg-runtime')

  for (const dir of [homeDir, xdgConfigHome, xdgDataHome, xdgStateHome, xdgCacheHome, xdgRuntimeDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const hermesHome = path.join(homeDir, '.hermes')
  fs.mkdirSync(hermesHome, { recursive: true })

  const fakeHermesSource = path.join(repoRoot, 'e2e-tests', 'fixtures', 'fake-hermes-acp.mjs')
  const fakeHermesPath = path.join(runtimeRoot, 'fake-hermes-acp.mjs')
  fs.copyFileSync(fakeHermesSource, fakeHermesPath)
  fs.chmodSync(fakeHermesPath, 0o755)

  const wrapperPath = path.join(runtimeRoot, 'launch-app.sh')
  fs.writeFileSync(wrapperPath, `#!/usr/bin/env bash
set -euo pipefail
export HOME=${JSON.stringify(homeDir)}
export HERMES_HOME=${JSON.stringify(hermesHome)}
export XDG_CONFIG_HOME=${JSON.stringify(xdgConfigHome)}
export XDG_DATA_HOME=${JSON.stringify(xdgDataHome)}
export XDG_STATE_HOME=${JSON.stringify(xdgStateHome)}
export XDG_CACHE_HOME=${JSON.stringify(xdgCacheHome)}
export XDG_RUNTIME_DIR=${JSON.stringify(xdgRuntimeDir)}
export HERMES_BIN=${JSON.stringify(fakeHermesPath)}
exec ${JSON.stringify(binaryPath)} "$@"
`)
  fs.chmodSync(wrapperPath, 0o755)

  return { runtimeRoot, wrapperPath, fakeHermesPath }
}

async function elementExists(driver, css) {
  const elements = await driver.findElements(By.css(css))
  return elements.length > 0
}

async function clickCss(driver, css) {
  const element = await driver.findElement(By.css(css))
  await driver.executeScript('arguments[0].scrollIntoView({block: "center", inline: "center"});', element)
  await driver.executeScript('arguments[0].click();', element)
}

async function waitForStartupUi(driver) {
  await driver.wait(async () => {
    return (await elementExists(driver, '[data-testid="connection-interstitial"]')) ||
      (await elementExists(driver, '[data-testid="app-shell"]'))
  }, 15000, 'expected startup UI to appear')
}

async function waitForShell(driver) {
  await waitForStartupUi(driver)
  if (await elementExists(driver, '[data-testid="connection-interstitial"]')) {
    try {
      const interstitial = await driver.findElement(By.css('[data-testid="connection-interstitial"]'))
      const text = await interstitial.getText()
      expect(text).to.match(/Connecting to Hermes|Restoring workspace|Loading remembered thread|Starting a fresh session/i)
    } catch (error) {
      if (!String(error).includes('StaleElementReferenceError')) throw error
    }
  }
  await driver.wait(until.elementLocated(By.css('[data-testid="app-shell"]')), 90000)
  const shell = await driver.findElement(By.css('[data-testid="app-shell"]'))
  expect(await shell.isDisplayed()).to.equal(true)
}

async function openWorkspaceSwitcher(driver) {
  await driver.wait(until.elementLocated(By.css('[data-testid="app-shell"]')), 10000)
  await clickCss(driver, '[data-testid="workspace-switcher-trigger"]')
  await driver.wait(until.elementLocated(By.css('[data-testid="workspace-switcher"]')), 10000)
}

async function submitPrompt(driver, value) {
  const alert = await driver.switchTo().alert()
  await alert.sendKeys(value)
  await alert.accept()
}

let driver
let tauriDriver
let exitExpected = false
let runtimeRoot

before(async function () {
  this.timeout(180000)

  const nativeDriver = resolveNativeDriverPath()
  if (!nativeDriver) {
    throw new Error('WebKitWebDriver is required for Linux Tauri E2E. Install webkit2gtk-driver or set TAURI_NATIVE_DRIVER_PATH.')
  }

  const build = spawnSync('cargo', ['tauri', 'build', '--debug', '--no-bundle'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, RUST_BACKTRACE: process.env.RUST_BACKTRACE || '1' },
  })

  if (build.status !== 0) {
    throw new Error(`cargo tauri build failed with status ${build.status}`)
  }

  const binaryPath = resolveApplicationPath()
  const isolatedRuntime = buildIsolatedRuntime(binaryPath)
  runtimeRoot = isolatedRuntime.runtimeRoot

  tauriDriver = spawn(resolveTauriDriverPath(), ['--native-driver', nativeDriver], {
    cwd: repoRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  tauriDriver.on('error', (error) => {
    console.error('tauri-driver error:', error)
    process.exit(1)
  })

  tauriDriver.on('exit', (code) => {
    if (!exitExpected) {
      console.error('tauri-driver exited unexpectedly with code:', code)
      process.exit(1)
    }
  })

  const capabilities = new Capabilities()
  capabilities.setBrowserName('wry')
  capabilities.set('tauri:options', {
    application: isolatedRuntime.wrapperPath,
  })

  driver = await new Builder()
    .withCapabilities(capabilities)
    .usingServer('http://127.0.0.1:4444/')
    .build()
})

after(async function () {
  exitExpected = true
  if (driver) {
    await driver.quit()
  }
  if (tauriDriver) {
    tauriDriver.kill('SIGTERM')
  }
  if (runtimeRoot) {
    fs.rmSync(runtimeRoot, { recursive: true, force: true })
  }
})

describe('Aurora Chat desktop shell', function () {
  it('opens the desktop window with the expected title', async function () {
    const title = await driver.getTitle()
    expect(title).to.equal('Aurora Chat')
  })

  it('reaches a visible startup state and then the app shell without auto-healing through recovery actions', async function () {
    await waitForShell(driver)
    expect(await elementExists(driver, '[data-testid="start-fresh"]')).to.equal(false)
  })

  it('opens settings from the desktop shell', async function () {
    await waitForShell(driver)
    await clickCss(driver, '[data-testid="settings-toggle"]')
    await driver.wait(until.elementLocated(By.css('[data-testid="settings-panel"]')), 10000)
    const panel = await driver.findElement(By.css('[data-testid="settings-panel"]'))
    expect(await panel.getText()).to.match(/Settings/)
    await clickCss(driver, '[data-testid="settings-close"]')
    await driver.wait(async () => !(await elementExists(driver, '[data-testid="settings-panel"]')), 10000)
  })

  it('opens plan and tasks panes from the shell chrome', async function () {
    await waitForShell(driver)
    await clickCss(driver, '[data-testid="plan-toggle"]')
    await driver.wait(until.elementLocated(By.css('[data-testid="pane-plan"]')), 10000)
    await clickCss(driver, '[data-testid="tasks-toggle"]')
    await driver.wait(until.elementLocated(By.css('[data-testid="pane-tasks"]')), 10000)

    const planPane = await driver.findElement(By.css('[data-testid="pane-plan"]'))
    const tasksPane = await driver.findElement(By.css('[data-testid="pane-tasks"]'))
    expect(await planPane.getText()).to.match(/Plan/)
    expect(await tasksPane.getText()).to.match(/Tasks/)
  })

  it('creates a blank workspace through an honest fresh-session startup', async function () {
    await waitForShell(driver)
    await openWorkspaceSwitcher(driver)
    await clickCss(driver, '[data-testid="workspace-create-blank"]')
    await submitPrompt(driver, 'e2e-blank')
    await driver.wait(async () => !(await elementExists(driver, '[data-testid="workspace-switcher"]')), 15000)

    await waitForStartupUi(driver)
    if (await elementExists(driver, '[data-testid="connection-interstitial"]')) {
      const interstitial = await driver.findElement(By.css('[data-testid="connection-interstitial"]'))
      const text = await interstitial.getText()
      expect(text).to.match(/Starting a fresh session|Restoring workspace/i)
      expect(text).to.not.match(/Loading remembered thread/i)
    }
    await waitForShell(driver)

    await openWorkspaceSwitcher(driver)
    await driver.wait(until.elementLocated(By.css('[data-testid="workspace-row-e2e-blank"]')), 10000)
    await clickCss(driver, '[data-testid="workspace-row-default"]')
    await driver.wait(async () => !(await elementExists(driver, '[data-testid="workspace-switcher"]')), 15000)

    await waitForStartupUi(driver)
    if (await elementExists(driver, '[data-testid="connection-interstitial"]')) {
      const interstitial = await driver.findElement(By.css('[data-testid="connection-interstitial"]'))
      const text = await interstitial.getText()
      expect(text).to.match(/Loading remembered thread|Restoring workspace/i)
      expect(text).to.not.match(/Starting a fresh session/i)
      expect(await elementExists(driver, '[data-testid="start-fresh"]')).to.equal(false)
    }

    await waitForShell(driver)
    expect(await elementExists(driver, '[data-testid="start-fresh"]')).to.equal(false)
  })
})
