import { tool } from 'ai'
import type { QdrantClient, SearchResult } from '../qdrant'

export interface ToolContext {
  qdrantClient: QdrantClient
  generateEmbedding: (text: string) => Promise<number[]>
}

export type LocalbirdTool = ReturnType<typeof tool>

// Re-export for convenience
export type { SearchResult }
