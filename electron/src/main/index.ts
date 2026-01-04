import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess, execSync } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { config as dotenvConfig } from 'dotenv'
import { swiftBridge, ServiceStatus } from './swift-bridge'
import { createServer } from './server'
import { qdrantClient } from './qdrant'

// Load .env file for local development
dotenvConfig()

const store = new Store()

// Chat storage types
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

interface Chat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

interface ChatsStore {
  [id: string]: Chat
}

// Load API keys from environment variables for local dev
function getApiKey(key: string, envVar: string): string {
  // Environment variable takes precedence for local dev
  const envValue = process.env[envVar]
  if (envValue) {
    // Also save to store so Swift service can use it
    store.set(key, envValue)
    return envValue
  }
  return (store.get(key) as string) || ''
}

async function startQdrant(): Promise<void> {
  // Check if Qdrant is already running
  const isRunning = await qdrantClient.healthCheck()
  if (isRunning) {
    console.log('[Main] Qdrant already running')
    return
  }

  // Check if Docker is available
  try {
    execSync('docker info', { stdio: 'ignore' })
  } catch {
    console.log('[Main] Docker not available, skipping Qdrant auto-start')
    return
  }

  console.log('[Main] Starting Qdrant container...')

  // Check if container exists but stopped
  try {
    execSync('docker start localbird-qdrant', { stdio: 'ignore' })
    console.log('[Main] Started existing Qdrant container')
    return
  } catch {
    // Container doesn't exist, create it
  }

  // Start new Qdrant container
  try {
    execSync('docker run --name localbird-qdrant -p 6333:6333 -d qdrant/qdrant', { stdio: 'pipe' })
    console.log('[Main] Started new Qdrant container')
  } catch (err) {
    console.error('[Main] Failed to start Qdrant container:', err instanceof Error ? err.message : err)
    return
  }

  // Wait for Qdrant to be ready
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    if (await qdrantClient.healthCheck()) {
      console.log('[Main] Qdrant is ready')
      return
    }
  }
  console.log('[Main] Qdrant may not be fully ready')
}

function stopQdrant(): void {
  try {
    execSync('docker stop localbird-qdrant', { stdio: 'ignore' })
    console.log('[Main] Stopped Qdrant container')
  } catch {
    // Container may not be running
  }
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let expressServer: ReturnType<typeof createServer> | null = null
let serverInstance: ReturnType<typeof expressServer['listen']> | null = null

const SERVER_PORT = 3001

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    // Hide instead of close when clicking X
    event.preventDefault()
    mainWindow?.hide()
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  // Create a simple tray icon (you'd replace this with a proper icon)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEBSURBVDiNpZMxTsNAEEV/dhIJCuqUNNQU9Fzi/D1FGi6ARSRF4ASuCaXdWHbWw2Y3Dgix0krj3f/nz+zKMZm1tVoNnZoHANi2bQMgImIA3N3TOM5a63kYhrXWepEkT/b9/Xbxr7+EEE5SSk9JkjwqpUYAHpZlOfd9f+fc3dYvPEVRnLq+L4Zh2CS5cSFEW/BjCABIKWOt9YlzLhRFcZrn+S3Jq67rBgCH/wZorUcppUdEJONxDCGETkrpHBHZe+9vQggXAPaIaG+MCRKRz6SUMcZ4nOf5bZ7nV4jo0hgz9H1/kef5rdb6OMuyqwA49n1/GWO8stZeTxfY2MZyuTxK0/TYGHMEANwBU5lYy+IAAAAABJRU5ErkJggg=='
  )

  tray = new Tray(icon)
  tray.setToolTip('Localbird')

  updateTrayMenu()

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

async function updateTrayMenu(): Promise<void> {
  const status = await swiftBridge.getStatus()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: status.isRunning ? `Capturing (${status.frameCount} frames)` : 'Stopped',
      enabled: false
    },
    { type: 'separator' },
    {
      label: status.isRunning ? 'Stop Capture' : 'Start Capture',
      click: async () => {
        if (status.isRunning) {
          await swiftBridge.stopCapture()
        } else {
          await swiftBridge.startCapture()
        }
        updateTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: 'Open Window',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('navigate', '/settings')
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray?.setContextMenu(contextMenu)
}

async function startServices(): Promise<void> {
  console.log('[Main] Starting services...')

  // Start Qdrant first
  await startQdrant()

  // Start Express server for chat API
  expressServer = createServer()
  serverInstance = expressServer.listen(SERVER_PORT, () => {
    console.log(`[Main] API server running on port ${SERVER_PORT}`)
  })

  // Start Swift service
  try {
    await swiftBridge.start()

    // Configure with stored settings (env vars take precedence for local dev)
    const config = {
      geminiAPIKey: getApiKey('geminiAPIKey', 'GEMINI_API_KEY'),
      claudeAPIKey: getApiKey('claudeAPIKey', 'ANTHROPIC_API_KEY'),
      openaiAPIKey: getApiKey('openaiAPIKey', 'OPENAI_API_KEY'),
      captureInterval: (store.get('captureInterval') as number) || 5,
      activeVisionProvider: (store.get('activeVisionProvider') as string) || 'gemini'
    }

    await swiftBridge.configure(config)

    // Auto-start capture if enabled
    if (store.get('autoStartCapture', true)) {
      await swiftBridge.startCapture()
    }

    // Update tray menu with status
    updateTrayMenu()

    // Periodically update tray menu
    setInterval(() => updateTrayMenu(), 5000)
  } catch (error) {
    console.error('[Main] Failed to start Swift service:', error)
  }
}

async function stopServices(): Promise<void> {
  console.log('[Main] Stopping services...')

  if (serverInstance) {
    serverInstance.close()
    serverInstance = null
  }

  await swiftBridge.stop()
}

// IPC handlers
function setupIPC(): void {
  ipcMain.handle('get-status', async () => {
    return await swiftBridge.getStatus()
  })

  ipcMain.handle('start-capture', async () => {
    await swiftBridge.startCapture()
    updateTrayMenu()
    return { success: true }
  })

  ipcMain.handle('stop-capture', async () => {
    await swiftBridge.stopCapture()
    updateTrayMenu()
    return { success: true }
  })

  ipcMain.handle('get-settings', () => {
    return {
      geminiAPIKey: store.get('geminiAPIKey', ''),
      claudeAPIKey: store.get('claudeAPIKey', ''),
      openaiAPIKey: store.get('openaiAPIKey', ''),
      captureInterval: store.get('captureInterval', 5),
      activeVisionProvider: store.get('activeVisionProvider', 'gemini'),
      chatProvider: store.get('chatProvider', 'anthropic'),
      autoStartCapture: store.get('autoStartCapture', true)
    }
  })

  ipcMain.handle('save-settings', async (_event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
      store.set(key, value)
    }

    // Reconfigure Swift service
    await swiftBridge.configure({
      geminiAPIKey: settings.geminiAPIKey,
      claudeAPIKey: settings.claudeAPIKey,
      openaiAPIKey: settings.openaiAPIKey,
      captureInterval: settings.captureInterval,
      activeVisionProvider: settings.activeVisionProvider
    })

    return { success: true }
  })

  ipcMain.handle('check-qdrant', async () => {
    return await qdrantClient.healthCheck()
  })

  // Chat CRUD handlers
  ipcMain.handle('chats:list', () => {
    const chats = (store.get('chats') as ChatsStore) || {}
    // Return metadata only (without messages) sorted by updatedAt desc
    return Object.values(chats)
      .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  })

  ipcMain.handle('chats:get', (_event, id: string) => {
    const chats = (store.get('chats') as ChatsStore) || {}
    return chats[id] || null
  })

  ipcMain.handle('chats:save', (_event, chat: Chat) => {
    const chats = (store.get('chats') as ChatsStore) || {}
    chats[chat.id] = {
      ...chat,
      updatedAt: Date.now()
    }
    store.set('chats', chats)
    return { success: true }
  })

  ipcMain.handle('chats:delete', (_event, id: string) => {
    const chats = (store.get('chats') as ChatsStore) || {}
    delete chats[id]
    store.set('chats', chats)
    return { success: true }
  })
}

// App lifecycle
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.localbird.app')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupIPC()
  createWindow()
  createTray()

  // Skip services in test mode
  if (!process.env.LOCALBIRD_SKIP_SERVICES) {
    await startServices()
  } else {
    console.log('[Main] Skipping services (test mode)')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('window-all-closed', () => {
  // Don't quit when all windows are closed (tray app behavior)
})

let isQuitting = false

app.on('before-quit', async (event) => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  await stopServices()
  app.exit(0)
})
