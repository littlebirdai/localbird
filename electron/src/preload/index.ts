import { contextBridge, ipcRenderer } from 'electron'

export interface ServiceStatus {
  isRunning: boolean
  frameCount: number
  lastCaptureTime: number | null
  lastError: string | null
}

export interface Settings {
  geminiAPIKey: string
  claudeAPIKey: string
  openaiAPIKey: string
  captureInterval: number
  activeVisionProvider: string
  chatProvider: string
  autoStartCapture: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface Chat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export interface ChatMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

const api = {
  // Capture control
  getStatus: (): Promise<ServiceStatus> => ipcRenderer.invoke('get-status'),
  startCapture: (): Promise<{ success: boolean }> => ipcRenderer.invoke('start-capture'),
  stopCapture: (): Promise<{ success: boolean }> => ipcRenderer.invoke('stop-capture'),

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Partial<Settings>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('save-settings', settings),

  // Health checks
  checkQdrant: (): Promise<boolean> => ipcRenderer.invoke('check-qdrant'),

  // Navigation events from main process
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on('navigate', (_event, path) => callback(path))
    return () => {
      ipcRenderer.removeAllListeners('navigate')
    }
  },

  // Chat persistence
  listChats: (): Promise<ChatMetadata[]> => ipcRenderer.invoke('chats:list'),
  getChat: (id: string): Promise<Chat | null> => ipcRenderer.invoke('chats:get', id),
  saveChat: (chat: Chat): Promise<{ success: boolean }> => ipcRenderer.invoke('chats:save', chat),
  deleteChat: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('chats:delete', id)
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}
