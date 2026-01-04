import { z } from 'zod'
import { tool } from 'ai'
import type { QdrantClient, SearchResult } from '../qdrant'

export interface ToolContext {
  qdrantClient: QdrantClient
  generateEmbedding: (text: string) => Promise<number[]>
}

export type LocalbirdTool = ReturnType<typeof tool>

export interface ToolDefinition {
  name: string
  description: string
  tool: (context: ToolContext) => LocalbirdTool
}

// Re-export for convenience
export type { SearchResult }
export { z }
