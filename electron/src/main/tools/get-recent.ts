import { tool, jsonSchema } from 'ai'
import type { ToolContext } from './types'

export function createGetRecentTool(context: ToolContext) {
  return tool({
    description:
      'Get the most recent screen captures. Use when user asks "what was I just doing?", "show recent activity", or needs context about their latest work.',
    parameters: jsonSchema<{ limit?: number }>({
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent captures to return (default 10)' }
      },
      required: []
    }),
    execute: async ({ limit = 10 }) => {
      try {
        const results = await context.qdrantClient.getRecentFrames(limit)

        if (results.length === 0) {
          return {
            found: false,
            message: 'No recent screen captures found in the last 24 hours.'
          }
        }

        // Group by application
        const appCounts: Record<string, number> = {}
        results.forEach((r) => {
          const app = r.activeApplication || 'Unknown'
          appCounts[app] = (appCounts[app] || 0) + 1
        })

        // Get time range
        const oldest = results[results.length - 1]
        const newest = results[0]

        return {
          found: true,
          count: results.length,
          timeRange: {
            from: new Date(oldest.timestamp * 1000).toLocaleString(),
            to: new Date(newest.timestamp * 1000).toLocaleString()
          },
          recentApplications: Object.entries(appCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([app, count]) => ({ application: app, captures: count })),
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
          error: error instanceof Error ? error.message : 'Failed to get recent frames'
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
  return `${Math.floor(seconds / 86400)} days ago`
}
