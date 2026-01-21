import { spawn, ChildProcess } from 'child_process'
import { app, net } from 'electron'
import path from 'path'
import os from 'os'

function httpRequest(
  url: string,
  method: string = 'GET',
  body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method })
    let responseBody = ''

    if (body) {
      request.setHeader('Content-Type', 'application/json')
    }

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseBody += chunk.toString()
      })
      response.on('end', () => {
        resolve({ status: response.statusCode, body: responseBody })
      })
    })

    request.on('error', (error) => {
      reject(error)
    })

    if (body) {
      request.write(body)
    }
    request.end()
  })
}

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return httpRequest(url, 'GET')
}

function httpPost(url: string, body?: object): Promise<{ status: number; body: string }> {
  return httpRequest(url, 'POST', body ? JSON.stringify(body) : undefined)
}

export interface ServiceStatus {
  isRunning: boolean
  frameCount: number
  lastCaptureTime: number | null
  lastError: string | null
}

// Config sent to native service (no LLM keys - those stay in Electron now)
export interface NativeServiceConfig {
  captureInterval?: number
  enableFullScreenCaptures?: boolean
  fullScreenCaptureInterval?: number
}

// Legacy config for backward compatibility during migration
export interface ServiceConfig extends NativeServiceConfig {
  geminiAPIKey?: string
  claudeAPIKey?: string
  openaiAPIKey?: string
  activeVisionProvider?: string
  qdrantHost?: string
  qdrantPort?: number
}

export interface AccessibilityElement {
  role: string
  title: string | null
  value: string | null
  frame: { x: number; y: number; width: number; height: number } | null
  children: AccessibilityElement[] | null
}

export interface CapturedFrameData {
  id: string
  timestamp: number
  imageBase64: string
  windowTitle: string | null
  appName: string | null
  appBundleId: string | null
  trigger: string | null
  windowBounds: { x: number; y: number; width: number; height: number } | null
  accessibilityData: {
    focusedApp: string | null
    focusedWindow: string | null
    elements: AccessibilityElement[]
  } | null
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

type Platform = 'macos' | 'windows' | 'linux'

function getPlatform(): Platform {
  const p = os.platform()
  if (p === 'darwin') return 'macos'
  if (p === 'win32') return 'windows'
  return 'linux'
}

class NativeBridge {
  private process: ChildProcess | null = null
  private port = 9111
  private baseUrl = `http://localhost:${this.port}`
  private isReady = false
  private restartAttempts = 0
  private maxRestartAttempts = 3
  private usingExternalService = false
  private platform: Platform

  constructor() {
    this.platform = getPlatform()
    console.log(`[NativeBridge] Platform detected: ${this.platform}`)
  }

  async start(): Promise<void> {
    if (this.process || this.usingExternalService) {
      console.log('[NativeBridge] Already running')
      return
    }

    // Check if standalone service is already running
    if (await this.checkExistingService()) {
      console.log('[NativeBridge] Using existing standalone service')
      this.usingExternalService = true
      this.isReady = true
      return
    }

    const servicePath = this.getServicePath()
    console.log(`[NativeBridge] Starting service from: ${servicePath}`)

    this.process = spawn(servicePath, ['--port', this.port.toString()], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data) => {
      console.log(`[Native] ${data.toString().trim()}`)
    })

    this.process.stderr?.on('data', (data) => {
      console.error(`[Native Error] ${data.toString().trim()}`)
    })

    this.process.on('exit', (code) => {
      console.log(`[NativeBridge] Process exited with code ${code}`)
      this.process = null
      this.isReady = false

      // Attempt restart if unexpected exit
      if (code !== 0 && this.restartAttempts < this.maxRestartAttempts) {
        this.restartAttempts++
        console.log(`[NativeBridge] Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})`)
        setTimeout(() => this.start(), 1000)
      }
    })

    // Wait for service to be ready
    await this.waitForReady()
    this.restartAttempts = 0
  }

  private async checkExistingService(): Promise<boolean> {
    try {
      const response = await httpGet(`${this.baseUrl}/status`)
      return response.status === 200
    } catch {
      return false
    }
  }

  async stop(): Promise<void> {
    // Don't stop external standalone service
    if (this.usingExternalService) {
      console.log('[NativeBridge] Using external service, not stopping')
      this.isReady = false
      return
    }

    if (this.process) {
      console.log('[NativeBridge] Stopping service')
      if (this.platform === 'windows') {
        // Windows doesn't support SIGTERM well, use taskkill
        this.process.kill()
      } else {
        this.process.kill('SIGTERM')
      }
      this.process = null
      this.isReady = false
    }
  }

  private getServicePath(): string {
    if (this.platform === 'macos') {
      // macOS: Swift service
      if (!app.isPackaged) {
        return path.join(
          app.getAppPath(),
          '..',
          'DerivedData',
          'Build',
          'Products',
          'Debug',
          'localbird.app',
          'Contents',
          'MacOS',
          'localbird'
        )
      }
      return path.join(process.resourcesPath, 'bin', 'localbird-service')
    } else if (this.platform === 'windows') {
      // Windows: C# service
      if (!app.isPackaged) {
        return path.join(
          app.getAppPath(),
          '..',
          'LocalbirdCapture',
          'bin',
          'Debug',
          'net8.0-windows10.0.19041.0',
          'win-x64',
          'LocalbirdCapture.exe'
        )
      }
      return path.join(process.resourcesPath, 'bin', 'LocalbirdCapture.exe')
    } else {
      throw new Error(`Unsupported platform: ${this.platform}`)
    }
  }

  private async waitForReady(maxAttempts = 30, interval = 500): Promise<void> {
    console.log(`[NativeBridge] Waiting for service at ${this.baseUrl}/health`)
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await httpGet(`${this.baseUrl}/health`)
        console.log(`[NativeBridge] Health check attempt ${i + 1}: ${response.status}`)
        if (response.status === 200) {
          this.isReady = true
          console.log('[NativeBridge] Service is ready')
          return
        }
      } catch (error) {
        console.log(`[NativeBridge] Health check attempt ${i + 1} failed:`, error instanceof Error ? error.message : error)
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
    throw new Error('Native service failed to start')
  }

  async configure(config: ServiceConfig): Promise<void> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    // Send full config including API keys to native service
    const nativeConfig: ServiceConfig = {
      captureInterval: config.captureInterval,
      enableFullScreenCaptures: config.enableFullScreenCaptures,
      fullScreenCaptureInterval: config.fullScreenCaptureInterval,
      geminiAPIKey: config.geminiAPIKey,
      claudeAPIKey: config.claudeAPIKey,
      openaiAPIKey: config.openaiAPIKey,
      activeVisionProvider: config.activeVisionProvider
    }

    const response = await httpPost(`${this.baseUrl}/configure`, nativeConfig)

    if (response.status !== 200) {
      throw new Error(`Configure failed: ${response.status}`)
    }

    console.log('[NativeBridge] Configuration sent')
  }

  async getStatus(): Promise<ServiceStatus> {
    if (!this.isReady) {
      return {
        isRunning: false,
        frameCount: 0,
        lastCaptureTime: null,
        lastError: 'Service not ready'
      }
    }

    try {
      const response = await httpGet(`${this.baseUrl}/status`)
      if (response.status !== 200) {
        throw new Error(`Status failed: ${response.status}`)
      }
      return JSON.parse(response.body)
    } catch (error) {
      return {
        isRunning: false,
        frameCount: 0,
        lastCaptureTime: null,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async startCapture(): Promise<void> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    const response = await httpPost(`${this.baseUrl}/capture/start`)

    if (response.status !== 200) {
      throw new Error(`Start capture failed: ${response.status}`)
    }

    console.log('[NativeBridge] Capture started')
  }

  async stopCapture(): Promise<void> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    const response = await httpPost(`${this.baseUrl}/capture/stop`)

    if (response.status !== 200) {
      throw new Error(`Stop capture failed: ${response.status}`)
    }

    console.log('[NativeBridge] Capture stopped')
  }

  async getLatestFrame(): Promise<CapturedFrameData | null> {
    if (!this.isReady) {
      return null
    }

    try {
      const response = await httpGet(`${this.baseUrl}/frame/latest`)
      if (response.status === 404) {
        return null
      }
      if (response.status !== 200) {
        throw new Error(`Get frame failed: ${response.status}`)
      }
      return JSON.parse(response.body)
    } catch (error) {
      console.error('[NativeBridge] Failed to get latest frame:', error)
      return null
    }
  }

  // Meeting methods

  async startMeeting(title?: string): Promise<{ meetingId: string; title: string; startTime: number }> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    const response = await httpPost(`${this.baseUrl}/meeting/start`, title ? { title } : {})

    if (response.status !== 200) {
      const errorBody = JSON.parse(response.body)
      throw new Error(errorBody.error || `Start meeting failed: ${response.status}`)
    }

    const result = JSON.parse(response.body)
    console.log('[NativeBridge] Meeting started:', result.meetingId)
    return result
  }

  async stopMeeting(): Promise<MeetingNote> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    const response = await httpPost(`${this.baseUrl}/meeting/stop`)

    if (response.status !== 200) {
      const errorBody = JSON.parse(response.body)
      throw new Error(errorBody.error || `Stop meeting failed: ${response.status}`)
    }

    const result = JSON.parse(response.body)
    console.log('[NativeBridge] Meeting stopped:', result.meetingId)
    return result
  }

  async cancelMeeting(): Promise<void> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    const response = await httpPost(`${this.baseUrl}/meeting/cancel`)

    if (response.status !== 200) {
      throw new Error(`Cancel meeting failed: ${response.status}`)
    }

    console.log('[NativeBridge] Meeting cancelled')
  }

  async getMeetingStatus(): Promise<MeetingStatus> {
    if (!this.isReady) {
      return {
        state: 'idle',
        currentMeetingId: null,
        duration: 0,
        liveTranscript: '',
        error: 'Service not ready'
      }
    }

    try {
      const response = await httpGet(`${this.baseUrl}/meeting/status`)
      if (response.status !== 200) {
        throw new Error(`Get meeting status failed: ${response.status}`)
      }
      return JSON.parse(response.body)
    } catch (error) {
      return {
        state: 'error',
        currentMeetingId: null,
        duration: 0,
        liveTranscript: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async getMeetings(): Promise<MeetingListItem[]> {
    if (!this.isReady) {
      return []
    }

    try {
      const response = await httpGet(`${this.baseUrl}/meetings`)
      if (response.status !== 200) {
        throw new Error(`Get meetings failed: ${response.status}`)
      }
      const result = JSON.parse(response.body)
      return result.meetings || []
    } catch (error) {
      console.error('[NativeBridge] Failed to get meetings:', error)
      return []
    }
  }

  async getMeeting(id: string): Promise<MeetingNote | null> {
    if (!this.isReady) {
      return null
    }

    try {
      const response = await httpGet(`${this.baseUrl}/meeting/${id}`)
      if (response.status === 404) {
        return null
      }
      if (response.status !== 200) {
        throw new Error(`Get meeting failed: ${response.status}`)
      }
      return JSON.parse(response.body)
    } catch (error) {
      console.error('[NativeBridge] Failed to get meeting:', error)
      return null
    }
  }

  async deleteMeeting(id: string): Promise<void> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    const response = await httpRequest(`${this.baseUrl}/meeting/${id}`, 'DELETE')

    if (response.status !== 200) {
      throw new Error(`Delete meeting failed: ${response.status}`)
    }

    console.log('[NativeBridge] Meeting deleted:', id)
  }

  isServiceReady(): boolean {
    return this.isReady
  }

  getPlatformName(): Platform {
    return this.platform
  }
}

export const nativeBridge = new NativeBridge()

// Re-export for backward compatibility
export const swiftBridge = nativeBridge
