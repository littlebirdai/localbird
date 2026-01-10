export interface SearchResult {
  id: string
  score: number
  timestamp: number
  summary: string
  activeApplication: string | null
  userActivity: string | null
  captureTrigger?: string | null
  appBundleId?: string | null
  appName?: string | null
  windowTitle?: string | null
}

export interface CollectionInfo {
  name: string
  pointsCount: number
  vectorsCount: number
}

export interface ProcessedFrame {
  id: string
  timestamp: number
  embedding: number[]
  summary: string
  activeApplication: string | null
  userActivity: string | null
  visibleText: string[]
  focusedApp: string | null
  focusedWindow: string | null
  captureTrigger: string
  appBundleId: string | null
  appName: string | null
  windowTitle: string | null
  windowBounds: { x: number; y: number; width: number; height: number } | null
}

class QdrantClient {
  private baseUrl: string
  private collectionName: string

  constructor(host = 'localhost', port = 6333, collection = 'localbird_frames') {
    this.baseUrl = `http://${host}:${port}`
    this.collectionName = collection
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`)
      return response.ok
    } catch {
      return false
    }
  }

  async ensureCollection(vectorSize = 768): Promise<void> {
    // Check if collection exists
    const checkResponse = await fetch(`${this.baseUrl}/collections/${this.collectionName}`)
    if (checkResponse.ok) {
      return // Collection exists
    }

    // Create collection
    const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: 'Cosine'
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to create collection: ${response.statusText}`)
    }

    console.log(`[Qdrant] Collection '${this.collectionName}' created`)
  }

  async upsertFrame(frame: ProcessedFrame): Promise<void> {
    const payload = {
      id: frame.id,
      timestamp: frame.timestamp,
      summary: frame.summary,
      activeApplication: frame.activeApplication || '',
      userActivity: frame.userActivity || '',
      visibleText: frame.visibleText,
      focusedApp: frame.focusedApp || '',
      focusedWindow: frame.focusedWindow || '',
      captureTrigger: frame.captureTrigger,
      appBundleId: frame.appBundleId || '',
      appName: frame.appName || '',
      windowTitle: frame.windowTitle || '',
      windowBoundsX: frame.windowBounds?.x ?? 0,
      windowBoundsY: frame.windowBounds?.y ?? 0,
      windowBoundsWidth: frame.windowBounds?.width ?? 0,
      windowBoundsHeight: frame.windowBounds?.height ?? 0
    }

    const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [
          {
            id: frame.id,
            vector: frame.embedding,
            payload
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to upsert frame: ${response.statusText}`)
    }
  }

  async search(embedding: number[], limit = 10, scoreThreshold = 0.3): Promise<SearchResult[]> {
    const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: embedding,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true
      })
    })

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`)
    }

    const data = await response.json()
    const results = data.result || []

    return results.map((result: any) => ({
      id: result.id,
      score: result.score,
      timestamp: result.payload?.timestamp || 0,
      summary: result.payload?.summary || '',
      activeApplication: result.payload?.activeApplication || null,
      userActivity: result.payload?.userActivity || null,
      captureTrigger: result.payload?.captureTrigger || null,
      appBundleId: result.payload?.appBundleId || null,
      appName: result.payload?.appName || null,
      windowTitle: result.payload?.windowTitle || null
    }))
  }

  async searchByTimeRange(start: Date, end: Date, limit = 100): Promise<SearchResult[]> {
    const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'timestamp',
              range: {
                gte: start.getTime() / 1000,
                lte: end.getTime() / 1000
              }
            }
          ]
        },
        limit,
        with_payload: true
      })
    })

    if (!response.ok) {
      throw new Error(`Search by time range failed: ${response.statusText}`)
    }

    const data = await response.json()
    const points = data.result?.points || []

    return points.map((point: any) => ({
      id: point.id,
      score: 1.0,
      timestamp: point.payload?.timestamp || 0,
      summary: point.payload?.summary || '',
      activeApplication: point.payload?.activeApplication || null,
      userActivity: point.payload?.userActivity || null,
      captureTrigger: point.payload?.captureTrigger || null,
      appBundleId: point.payload?.appBundleId || null,
      appName: point.payload?.appName || null,
      windowTitle: point.payload?.windowTitle || null
    }))
  }

  async getCollectionInfo(): Promise<CollectionInfo | null> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`)
      if (!response.ok) return null

      const data = await response.json()
      const result = data.result

      return {
        name: this.collectionName,
        pointsCount: result.points_count || 0,
        vectorsCount: result.vectors_count || 0
      }
    } catch {
      return null
    }
  }

  async getRecentFrames(limit = 50): Promise<SearchResult[]> {
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const results = await this.searchByTimeRange(dayAgo, now, limit)
    return results.sort((a, b) => b.timestamp - a.timestamp)
  }
}

export const qdrantClient = new QdrantClient()
export { QdrantClient }
