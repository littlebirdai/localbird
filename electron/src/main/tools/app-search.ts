import { tool } from 'ai'
import { z } from 'zod/v4'
import type { ToolContext } from './types'

export function createAppSearchTool(context: ToolContext) {
  return tool({
    description:
      'Search screen captures filtered by application name. Optionally combine with semantic search. Use when user asks about specific apps like "Chrome", "VSCode", "Slack", etc.',
    parameters: z.object({
      appName: z.string().describe('Application name to filter by (partial match, case-insensitive). Examples: "chrome", "vscode", "slack", "xcode"'),
      query: z.string().optional().describe('Optional: semantic search query to further filter results'),
      limit: z.number().optional().describe('Maximum number of results (default 10)')
    }),
    execute: async ({ appName, query, limit = 10 }) => {
      try {
        // Get recent frames and filter by app
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        let results = await context.qdrantClient.searchByTimeRange(weekAgo, now, 500)

        // Filter by application name (case-insensitive partial match)
        const appNameLower = appName.toLowerCase()
        results = results.filter((r) => {
          const app = (r.activeApplication || '').toLowerCase()
          return app.includes(appNameLower)
        })

        // If query provided, do semantic search on filtered results
        if (query && results.length > 0) {
          const embedding = await context.generateEmbedding(query)
          const semanticResults = await context.qdrantClient.search(embedding, limit * 2)

          // Keep only results that match both app filter and semantic search
          const filteredIds = new Set(results.map((r) => r.id))
          results = semanticResults.filter((r) => filteredIds.has(r.id))
        }

        // Limit results
        results = results.slice(0, limit)

        if (results.length === 0) {
          return {
            found: false,
            message: `No screen captures found for application "${appName}"${query ? ` matching "${query}"` : ''}.`,
            suggestion: `Try a partial app name or check if "${appName}" was used in the last week.`
          }
        }

        return {
          found: true,
          count: results.length,
          application: appName,
          results: results.map((r) => ({
            timestamp: new Date(r.timestamp * 1000).toISOString(),
            timeAgo: getTimeAgo(r.timestamp),
            application: r.activeApplication || 'Unknown',
            summary: r.summary,
            activity: r.userActivity
          }))
        }
      } catch (error) {
        return {
          found: false,
          error: error instanceof Error ? error.message : 'App search failed'
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
