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

async function elementExists(driver, css) {
  const elements = await driver.findElements(By.css(css))
  return elements.length > 0
}

let driver
let tauriDriver
let exitExpected = false

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
    application: resolveApplicationPath(),
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
})

describe('Aurora Chat desktop shell', function () {
  it('opens the desktop window with the expected title', async function () {
    const title = await driver.getTitle()
    expect(title).to.equal('Aurora Chat')
  })

  it('reaches a visible startup state and then the app shell', async function () {
    await driver.wait(async () => {
      return (await elementExists(driver, '[data-testid="connection-interstitial"]')) ||
        (await elementExists(driver, '[data-testid="app-shell"]'))
    }, 15000, 'expected startup UI to appear')

    if (await elementExists(driver, '[data-testid="connection-interstitial"]')) {
      const interstitial = await driver.findElement(By.css('[data-testid="connection-interstitial"]'))
      const text = await interstitial.getText()
      expect(text).to.match(/Connecting to Hermes|Restoring workspace|Loading remembered thread|Starting a fresh session/i)
    }

    await driver.wait(until.elementLocated(By.css('[data-testid="app-shell"]')), 60000)
    const shell = await driver.findElement(By.css('[data-testid="app-shell"]'))
    expect(await shell.isDisplayed()).to.equal(true)
  })
})
