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

// Meeting types
export type MeetingRecordingState = 'idle' | 'recording' | 'processing' | 'error'

export interface MeetingStatus {
  state: MeetingRecordingState
  currentMeetingId: string | null
  duration: number
  liveTranscript: string
  error: string | null
}

export interface TranscriptSegment {
  startTime: number
  endTime: number
  text: string
}

export interface MeetingNote {
  id: string
  title: string
  startTime: number
  endTime: number | null
  duration: number
  transcript: string
  segments: TranscriptSegment[]
  audioPath: string | null
}

export interface MeetingListItem {
  id: string
  title: string
  startTime: number
  endTime: number | null
  duration: number
  transcriptPreview: string
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

  // New chat event from main process (Cmd+N)
  onNewChat: (callback: () => void) => {
    ipcRenderer.on('new-chat', () => callback())
    return () => {
      ipcRenderer.removeAllListeners('new-chat')
    }
  },

  // Chat persistence
  listChats: (): Promise<ChatMetadata[]> => ipcRenderer.invoke('chats:list'),
  getChat: (id: string): Promise<Chat | null> => ipcRenderer.invoke('chats:get', id),
  saveChat: (chat: Chat): Promise<{ success: boolean }> => ipcRenderer.invoke('chats:save', chat),
  deleteChat: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('chats:delete', id),

  // Meeting recording
  startMeeting: (title?: string): Promise<{ success: boolean; meetingId?: string; title?: string; startTime?: number; error?: string }> =>
    ipcRenderer.invoke('meetings:start', title),
  stopMeeting: (): Promise<{ success: boolean; meeting?: MeetingNote; error?: string }> =>
    ipcRenderer.invoke('meetings:stop'),
  cancelMeeting: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('meetings:cancel'),
  getMeetingStatus: (): Promise<MeetingStatus> =>
    ipcRenderer.invoke('meetings:status'),
  listMeetings: (): Promise<MeetingListItem[]> =>
    ipcRenderer.invoke('meetings:list'),
  getMeeting: (id: string): Promise<MeetingNote | null> =>
    ipcRenderer.invoke('meetings:get', id),
  deleteMeeting: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('meetings:delete', id)
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}
