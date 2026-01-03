interface SearchResult {
  id: string
  score: number
  timestamp: number
  summary: string
  activeApplication: string | null
  userActivity: string | null
}

interface CollectionInfo {
  name: string
  pointsCount: number
  vectorsCount: number
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
      userActivity: result.payload?.userActivity || null
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
      userActivity: point.payload?.userActivity || null
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
export type { SearchResult, CollectionInfo }
