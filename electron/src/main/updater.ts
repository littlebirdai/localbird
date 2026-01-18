import { autoUpdater } from 'electron-updater'
import { app, dialog, BrowserWindow } from 'electron'

export function setupAutoUpdater(mainWindow: BrowserWindow | null): void {
  // Only check for updates in packaged app
  if (!app.isPackaged) {
    console.log('[Updater] Skipping auto-update in dev mode')
    return
  }

  // Configure logging
  autoUpdater.logger = {
    info: (msg: string) => console.log('[Updater]', msg),
    warn: (msg: string) => console.warn('[Updater]', msg),
    error: (msg: string) => console.error('[Updater]', msg),
    debug: (msg: string) => console.log('[Updater:debug]', msg),
  }

  // Check for updates silently on startup
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] App is up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Download progress: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version)

    // Show dialog to user
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'The update will be installed when you restart Localbird.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true)
      }
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message)
  })

  // Check for updates after a short delay to let app finish loading
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] Failed to check for updates:', err.message)
    })
  }, 5000)
}

// Manual check (can be called from menu or IPC)
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Development Mode',
      message: 'Auto-update is disabled in development mode.'
    })
    return
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo) {
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: 'You are running the latest version.'
      })
    }
  } catch (err) {
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Error',
      message: `Failed to check for updates: ${err instanceof Error ? err.message : 'Unknown error'}`
    })
  }
}
