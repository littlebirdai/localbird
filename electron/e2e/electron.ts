import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

type ElectronFixtures = {
  electronApp: ElectronApplication
  window: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const appPath = path.join(__dirname, '../out/main/index.mjs')

    console.log('[Test] Launching Electron app from:', appPath)

    const electronApp = await electron.launch({
      args: [appPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Skip service startup in tests
        LOCALBIRD_SKIP_SERVICES: '1'
      },
      timeout: 30000
    })

    // Log main process console output for debugging
    electronApp.on('console', (msg) => {
      console.log('[Main]', msg.text())
    })

    await use(electronApp)
    await electronApp.close()
  },

  window: async ({ electronApp }, use) => {
    console.log('[Test] Waiting for window...')

    // Wait for the first window to open with timeout
    const window = await electronApp.firstWindow()
    console.log('[Test] Window opened')

    // Wait for the app to be ready
    await window.waitForLoadState('domcontentloaded')
    console.log('[Test] DOM content loaded')

    // Additional wait for React to hydrate
    await window.waitForTimeout(1000)

    await use(window)
  }
})

export { expect } from '@playwright/test'
