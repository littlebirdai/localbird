import { app } from 'electron'
import path from 'path'
import os from 'os'

export function getFramesDirectory(): string {
  // ~/Library/Application Support/Localbird/frames
  const appSupport = path.join(os.homedir(), 'Library', 'Application Support', 'Localbird', 'frames')
  return appSupport
}

export function getAppDataPath(): string {
  return app.getPath('userData')
}
