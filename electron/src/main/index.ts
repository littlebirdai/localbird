import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { config as dotenvConfig } from 'dotenv'
import { nativeBridge } from './native-bridge'
import type { ServiceStatus } from './native-bridge'
import { createServer } from './server'
import { qdrantClient } from './qdrant'
import { llmService } from './llm'
import { frameProcessor } from './frame-processor'

// Load .env file for local development
dotenvConfig()

let qdrantProcess: ChildProcess | null = null

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

function getQdrantPath(): string | null {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const binaryName = `qdrant-${arch}`

  // Production: bundled in app Resources
  const resourcesPath = process.resourcesPath || ''
  const bundledPath = join(resourcesPath, 'bin', binaryName)
  if (existsSync(bundledPath)) {
    return bundledPath
  }

  // Development: in electron/bin
  const devPath = join(__dirname, '../../..', 'bin', binaryName)
  if (existsSync(devPath)) {
    return devPath
  }

  console.log('[Main] Qdrant binary not found at:', bundledPath, 'or', devPath)
  return null
}

async function startQdrant(): Promise<void> {
  // Check if Qdrant is already running
  const isRunning = await qdrantClient.healthCheck()
  if (isRunning) {
    console.log('[Main] Qdrant already running')
    return
  }

  const qdrantPath = getQdrantPath()
  if (!qdrantPath) {
    console.log('[Main] Qdrant binary not found, skipping auto-start')
    return
  }

  // Set up storage directory
  const appDataPath = app.getPath('userData')
  const storagePath = join(appDataPath, 'qdrant-storage')
  if (!existsSync(storagePath)) {
    mkdirSync(storagePath, { recursive: true })
  }

  // Create config file with storage path
  const configPath = join(appDataPath, 'qdrant-config.yaml')
  const configContent = `storage:
  storage_path: ${storagePath}

service:
  http_port: 6333
  host: 127.0.0.1

telemetry_disabled: true
`
  writeFileSync(configPath, configContent)

  console.log('[Main] Starting Qdrant from:', qdrantPath)
  console.log('[Main] Storage path:', storagePath)

  // Spawn Qdrant process
  qdrantProcess = spawn(qdrantPath, ['--config-path', configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })

  qdrantProcess.stdout?.on('data', (data) => {
    console.log('[Qdrant]', data.toString().trim())
  })

  qdrantProcess.stderr?.on('data', (data) => {
    console.error('[Qdrant]', data.toString().trim())
  })

  qdrantProcess.on('error', (err) => {
    console.error('[Main] Failed to start Qdrant:', err)
    qdrantProcess = null
  })

  qdrantProcess.on('exit', (code) => {
    console.log('[Main] Qdrant exited with code:', code)
    qdrantProcess = null
  })

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
  if (qdrantProcess) {
    console.log('[Main] Stopping Qdrant...')
    qdrantProcess.kill('SIGTERM')
    qdrantProcess = null
  }
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let expressServer: ReturnType<typeof createServer> | null = null
let serverInstance: ReturnType<typeof expressServer['listen']> | null = null
let framePollingInterval: ReturnType<typeof setInterval> | null = null

const SERVER_PORT = 3001
const FRAME_POLL_INTERVAL = 500 // Poll for new frames every 500ms

// Start polling for frames from native service
function startFramePolling(): void {
  if (framePollingInterval) return

  console.log('[Main] Starting frame polling')
  framePollingInterval = setInterval(async () => {
    try {
      const frame = await nativeBridge.getLatestFrame()
      if (frame) {
        await frameProcessor.processFrame(frame)
      }
    } catch (error) {
      // Silently ignore polling errors (service might not be ready)
    }
  }, FRAME_POLL_INTERVAL)
}

function stopFramePolling(): void {
  if (framePollingInterval) {
    console.log('[Main] Stopping frame polling')
    clearInterval(framePollingInterval)
    framePollingInterval = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
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
  const status = await nativeBridge.getStatus()

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
          await nativeBridge.stopCapture()
          stopFramePolling()
        } else {
          await nativeBridge.startCapture()
          startFramePolling()
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

  // Initialize frame processor
  try {
    await frameProcessor.initialize()
    console.log('[Main] Frame processor initialized')
  } catch (error) {
    console.error('[Main] Failed to initialize frame processor:', error)
  }

  // Start Express server for chat API
  expressServer = createServer()
  serverInstance = expressServer.listen(SERVER_PORT, () => {
    console.log(`[Main] API server running on port ${SERVER_PORT}`)
  })

  // Get API keys (env vars take precedence for local dev)
  const geminiAPIKey = getApiKey('geminiAPIKey', 'GEMINI_API_KEY')
  const claudeAPIKey = getApiKey('claudeAPIKey', 'ANTHROPIC_API_KEY')
  const openaiAPIKey = getApiKey('openaiAPIKey', 'OPENAI_API_KEY')
  const activeVisionProvider = (store.get('activeVisionProvider') as string) || 'gemini'

  // Configure LLM service for frame processing
  llmService.configure({
    geminiAPIKey,
    claudeAPIKey,
    openaiAPIKey,
    activeVisionProvider: activeVisionProvider as 'gemini' | 'claude' | 'openai'
  })
  console.log('[Main] LLM service configured:', llmService.getActiveProviders())

  // Start native service
  try {
    await nativeBridge.start()

    // Configure native service with capture settings only (no LLM keys)
    const config = {
      captureInterval: (store.get('captureInterval') as number) || 5,
      enableFullScreenCaptures: store.get('enableFullScreenCaptures', true) as boolean,
      fullScreenCaptureInterval: (store.get('fullScreenCaptureInterval') as number) || 1
    }

    await nativeBridge.configure(config)

    // Auto-start capture if enabled
    if (store.get('autoStartCapture', true)) {
      await nativeBridge.startCapture()
      startFramePolling()
    }

    // Update tray menu with status
    updateTrayMenu()

    // Periodically update tray menu
    setInterval(() => updateTrayMenu(), 5000)
  } catch (error) {
    console.error('[Main] Failed to start native service:', error)
  }
}

async function stopServices(): Promise<void> {
  console.log('[Main] Stopping services...')

  stopFramePolling()

  if (serverInstance) {
    serverInstance.close()
    serverInstance = null
  }

  await nativeBridge.stop()
  stopQdrant()
}

// IPC handlers
function setupIPC(): void {
  ipcMain.handle('get-status', async () => {
    return await nativeBridge.getStatus()
  })

  ipcMain.handle('start-capture', async () => {
    await nativeBridge.startCapture()
    startFramePolling()
    updateTrayMenu()
    return { success: true }
  })

  ipcMain.handle('stop-capture', async () => {
    await nativeBridge.stopCapture()
    stopFramePolling()
    updateTrayMenu()
    return { success: true }
  })

  ipcMain.handle('get-settings', () => {
    return {
      geminiAPIKey: store.get('geminiAPIKey', ''),
      claudeAPIKey: store.get('claudeAPIKey', ''),
      openaiAPIKey: store.get('openaiAPIKey', ''),
      captureInterval: store.get('captureInterval', 5),
      enableFullScreenCaptures: store.get('enableFullScreenCaptures', true),
      fullScreenCaptureInterval: store.get('fullScreenCaptureInterval', 1),
      activeVisionProvider: store.get('activeVisionProvider', 'gemini'),
      chatProvider: store.get('chatProvider', 'anthropic'),
      autoStartCapture: store.get('autoStartCapture', true)
    }
  })

  ipcMain.handle('save-settings', async (_event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
      store.set(key, value)
    }

    // Reconfigure LLM service
    llmService.configure({
      geminiAPIKey: settings.geminiAPIKey,
      claudeAPIKey: settings.claudeAPIKey,
      openaiAPIKey: settings.openaiAPIKey,
      activeVisionProvider: settings.activeVisionProvider
    })

    // Reconfigure native service (capture settings only)
    await nativeBridge.configure({
      captureInterval: settings.captureInterval,
      enableFullScreenCaptures: settings.enableFullScreenCaptures,
      fullScreenCaptureInterval: settings.fullScreenCaptureInterval
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

function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow?.show()
            mainWindow?.focus()
            mainWindow?.webContents.send('navigate', '/settings')
          }
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.show()
            mainWindow?.focus()
            mainWindow?.webContents.send('new-chat')
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Chat',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            mainWindow?.webContents.send('navigate', '/chat')
          }
        },
        {
          label: 'Timeline',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            mainWindow?.webContents.send('navigate', '/timeline')
          }
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            mainWindow?.webContents.send('navigate', '/settings')
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
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
  createApplicationMenu()
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
