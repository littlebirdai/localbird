import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { llmService, FrameAnalysis } from './llm'
import { qdrantClient, ProcessedFrame } from './qdrant'
import { CapturedFrameData, AccessibilityElement } from './native-bridge'

// Get the frames directory based on platform
function getFramesDirectory(): string {
  if (os.platform() === 'darwin') {
    return path.join(app.getPath('userData'), 'frames')
  } else {
    // Windows: use %LOCALAPPDATA%\Localbird\frames
    return path.join(app.getPath('userData'), 'frames')
  }
}

// Build searchable text from analysis and accessibility data
function buildSearchableText(
  analysis: FrameAnalysis,
  accessibilityData: CapturedFrameData['accessibilityData']
): string {
  const parts: string[] = []

  parts.push(analysis.summary)

  if (analysis.activeApplication) {
    parts.push(`Application: ${analysis.activeApplication}`)
  }

  if (analysis.userActivity) {
    parts.push(`Activity: ${analysis.userActivity}`)
  }

  parts.push(...analysis.visibleText)

  if (accessibilityData) {
    if (accessibilityData.focusedApp) {
      parts.push(`Focused app: ${accessibilityData.focusedApp}`)
    }
    if (accessibilityData.focusedWindow) {
      parts.push(`Window: ${accessibilityData.focusedWindow}`)
    }
  }

  return parts.join(' | ')
}

// Extract text from accessibility elements recursively
function extractAccessibilityText(elements: AccessibilityElement[]): string[] {
  const texts: string[] = []

  function traverse(el: AccessibilityElement) {
    if (el.title) texts.push(el.title)
    if (el.value) texts.push(el.value)
    if (el.children) {
      el.children.forEach(traverse)
    }
  }

  elements.forEach(traverse)
  return texts.filter((t) => t.length > 0)
}

export class FrameProcessor {
  private framesDir: string
  private lastProcessedTimestamp = 0
  private isProcessing = false
  private processingQueue: CapturedFrameData[] = []

  constructor() {
    this.framesDir = getFramesDirectory()
  }

  async initialize(): Promise<void> {
    // Ensure frames directory exists
    await fs.mkdir(this.framesDir, { recursive: true })

    // Ensure Qdrant collection exists
    try {
      await qdrantClient.ensureCollection(768)
    } catch (error) {
      console.error('[FrameProcessor] Failed to ensure collection:', error)
    }

    console.log(`[FrameProcessor] Initialized. Frames dir: ${this.framesDir}`)
  }

  async processFrame(frameData: CapturedFrameData): Promise<void> {
    // Skip if already processed
    if (frameData.timestamp <= this.lastProcessedTimestamp) {
      return
    }

    // Add to queue if already processing
    if (this.isProcessing) {
      this.processingQueue.push(frameData)
      return
    }

    this.isProcessing = true

    try {
      await this.doProcessFrame(frameData)
      this.lastProcessedTimestamp = frameData.timestamp

      // Process any queued frames
      while (this.processingQueue.length > 0) {
        const nextFrame = this.processingQueue.shift()!
        if (nextFrame.timestamp > this.lastProcessedTimestamp) {
          await this.doProcessFrame(nextFrame)
          this.lastProcessedTimestamp = nextFrame.timestamp
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async doProcessFrame(frameData: CapturedFrameData): Promise<void> {
    console.log(`[FrameProcessor] Processing frame ${frameData.id} from ${frameData.appName}`)

    try {
      // 1. Decode base64 image
      const imageBuffer = Buffer.from(frameData.imageBase64, 'base64')

      // 2. Build context prompt from accessibility data
      let contextPrompt = ''
      if (frameData.appName) {
        contextPrompt += `The active application is ${frameData.appName}.`
      }
      if (frameData.windowTitle) {
        contextPrompt += ` The window title is '${frameData.windowTitle}'.`
      }

      // 3. Analyze image with LLM
      let analysis: FrameAnalysis
      if (llmService.hasVisionProvider()) {
        analysis = await llmService.analyzeImage(imageBuffer, contextPrompt)
      } else {
        // Fallback: use accessibility data only
        const accessibilityTexts = frameData.accessibilityData
          ? extractAccessibilityText(frameData.accessibilityData.elements)
          : []

        analysis = {
          summary: `Screen capture from ${frameData.appName || 'unknown app'}`,
          activeApplication: frameData.appName,
          userActivity: null,
          visibleText: accessibilityTexts.slice(0, 50),
          uiElements: [],
          metadata: {}
        }
      }

      // 4. Build searchable text
      const searchableText = buildSearchableText(analysis, frameData.accessibilityData)

      // 5. Generate embedding
      let embedding: number[]
      if (llmService.hasEmbeddingProvider()) {
        embedding = await llmService.generateEmbedding(searchableText)
      } else {
        console.warn('[FrameProcessor] No embedding provider, skipping Qdrant storage')
        // Save image only
        await this.saveImage(frameData.id, imageBuffer)
        return
      }

      // 6. Save image to disk
      await this.saveImage(frameData.id, imageBuffer)

      // 7. Store in Qdrant
      const processedFrame: ProcessedFrame = {
        id: frameData.id,
        timestamp: frameData.timestamp,
        embedding,
        summary: analysis.summary,
        activeApplication: analysis.activeApplication,
        userActivity: analysis.userActivity,
        visibleText: analysis.visibleText,
        focusedApp: frameData.accessibilityData?.focusedApp ?? null,
        focusedWindow: frameData.accessibilityData?.focusedWindow ?? null,
        captureTrigger: frameData.trigger || 'timer',
        appBundleId: frameData.appBundleId,
        appName: frameData.appName,
        windowTitle: frameData.windowTitle,
        windowBounds: frameData.windowBounds
      }

      await qdrantClient.upsertFrame(processedFrame)

      console.log(
        `[FrameProcessor] Frame ${frameData.id} processed and stored. ` +
          `Summary: ${analysis.summary.substring(0, 50)}...`
      )
    } catch (error) {
      console.error(`[FrameProcessor] Failed to process frame ${frameData.id}:`, error)
    }
  }

  private async saveImage(frameId: string, imageBuffer: Buffer): Promise<string> {
    const imagePath = path.join(this.framesDir, `${frameId}.jpg`)
    await fs.writeFile(imagePath, imageBuffer)
    return imagePath
  }

  getImagePath(frameId: string): string {
    return path.join(this.framesDir, `${frameId}.jpg`)
  }

  getLastProcessedTimestamp(): number {
    return this.lastProcessedTimestamp
  }
}

// Singleton instance
export const frameProcessor = new FrameProcessor()
