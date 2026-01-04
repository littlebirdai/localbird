import { tool, jsonSchema } from 'ai'
import type { ToolContext } from './types'

export function createSemanticSearchTool(context: ToolContext) {
  return tool({
    description:
      'Search screen captures by semantic similarity. Use when looking for activities, content, or topics from screen history.',
    parameters: jsonSchema<{ query: string; limit?: number }>({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query describing what to find' },
        limit: { type: 'number', description: 'Maximum number of results (default 5)' }
      },
      required: ['query']
    }),
    execute: async ({ query, limit = 5 }) => {
      try {
        const embedding = await context.generateEmbedding(query)
        const results = await context.qdrantClient.search(embedding, limit)

        if (results.length === 0) {
          return {
            found: false,
            message: 'No matching screen captures found for this query.'
          }
        }

        return {
          found: true,
          count: results.length,
          results: results.map((r) => ({
            timestamp: new Date(r.timestamp * 1000).toISOString(),
            timeAgo: getTimeAgo(r.timestamp),
            application: r.activeApplication || 'Unknown',
            summary: r.summary,
            activity: r.userActivity,
            relevanceScore: Math.round(r.score * 100)
          }))
        }
      } catch (error) {
        return {
          found: false,
          error: error instanceof Error ? error.message : 'Search failed',
          suggestion: 'Try a different search query or check if Qdrant is running'
        }
      }
    }
  })
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`
  return new Date(timestamp * 1000).toLocaleDateString()
}
