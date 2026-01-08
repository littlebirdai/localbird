import { spawn, ChildProcess } from 'child_process'
import { app, net } from 'electron'
import path from 'path'
import Store from 'electron-store'

const store = new Store()

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

interface ServiceStatus {
  isRunning: boolean
  frameCount: number
  lastCaptureTime: number | null
  lastError: string | null
}

interface ServiceConfig {
  geminiAPIKey?: string
  claudeAPIKey?: string
  openaiAPIKey?: string
  captureInterval?: number
  enableFullScreenCaptures?: boolean
  fullScreenCaptureInterval?: number
  activeVisionProvider?: string
  qdrantHost?: string
  qdrantPort?: number
}

class SwiftBridge {
  private process: ChildProcess | null = null
  private port = 9111
  private baseUrl = `http://localhost:${this.port}`
  private isReady = false
  private restartAttempts = 0
  private maxRestartAttempts = 3
  private usingExternalService = false

  async start(): Promise<void> {
    if (this.process || this.usingExternalService) {
      console.log('[SwiftBridge] Already running')
      return
    }

    // Check if standalone service is already running
    if (await this.checkExistingService()) {
      console.log('[SwiftBridge] Using existing standalone service')
      this.usingExternalService = true
      this.isReady = true
      return
    }

    const servicePath = this.getServicePath()
    console.log(`[SwiftBridge] Starting service from: ${servicePath}`)

    this.process = spawn(servicePath, ['--port', this.port.toString()], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data) => {
      console.log(`[Swift] ${data.toString().trim()}`)
    })

    this.process.stderr?.on('data', (data) => {
      console.error(`[Swift Error] ${data.toString().trim()}`)
    })

    this.process.on('exit', (code) => {
      console.log(`[SwiftBridge] Process exited with code ${code}`)
      this.process = null
      this.isReady = false

      // Attempt restart if unexpected exit
      if (code !== 0 && this.restartAttempts < this.maxRestartAttempts) {
        this.restartAttempts++
        console.log(`[SwiftBridge] Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})`)
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
      console.log('[SwiftBridge] Using external service, not stopping')
      this.isReady = false
      return
    }

    if (this.process) {
      console.log('[SwiftBridge] Stopping service')
      this.process.kill('SIGTERM')
      this.process = null
      this.isReady = false
    }
  }

  private getServicePath(): string {
    // In development, use the built app from xcodebuild
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

    // In production, use bundled binary
    return path.join(process.resourcesPath, 'bin', 'localbird-service')
  }

  private async waitForReady(maxAttempts = 30, interval = 500): Promise<void> {
    console.log(`[SwiftBridge] Waiting for service at ${this.baseUrl}/health`)
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await httpGet(`${this.baseUrl}/health`)
        console.log(`[SwiftBridge] Health check attempt ${i + 1}: ${response.status}`)
        if (response.status === 200) {
          this.isReady = true
          console.log('[SwiftBridge] Service is ready')
          return
        }
      } catch (error) {
        console.log(`[SwiftBridge] Health check attempt ${i + 1} failed:`, error instanceof Error ? error.message : error)
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
    throw new Error('Swift service failed to start')
  }

  async configure(config: ServiceConfig): Promise<void> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    const response = await httpPost(`${this.baseUrl}/configure`, config)

    if (response.status !== 200) {
      throw new Error(`Configure failed: ${response.status}`)
    }

    console.log('[SwiftBridge] Configuration sent')
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

    console.log('[SwiftBridge] Capture started')
  }

  async stopCapture(): Promise<void> {
    if (!this.isReady) {
      throw new Error('Service not ready')
    }

    const response = await httpPost(`${this.baseUrl}/capture/stop`)

    if (response.status !== 200) {
      throw new Error(`Stop capture failed: ${response.status}`)
    }

    console.log('[SwiftBridge] Capture stopped')
  }

  isServiceReady(): boolean {
    return this.isReady
  }
}

export const swiftBridge = new SwiftBridge()
export type { ServiceStatus, ServiceConfig }
