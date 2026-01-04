import { tool } from 'ai'
import { z } from 'zod/v4'
import type { ToolContext } from './types'

export function createTimeRangeSearchTool(context: ToolContext) {
  return tool({
    description:
      'Search screen captures within a specific time range. Use for queries like "yesterday", "this morning", "last hour", or specific date ranges.',
    parameters: z.object({
      startTime: z.string().describe('Start of time range (ISO 8601 format, e.g., "2024-01-15T09:00:00Z")'),
      endTime: z.string().describe('End of time range (ISO 8601 format, e.g., "2024-01-15T17:00:00Z")'),
      limit: z.number().optional().describe('Maximum number of results (default 20)')
    }),
    execute: async ({ startTime, endTime, limit = 20 }) => {
      try {
        const start = new Date(startTime)
        const end = new Date(endTime)

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return {
            found: false,
            error: 'Invalid date format. Use ISO 8601 format.'
          }
        }

        const results = await context.qdrantClient.searchByTimeRange(start, end, limit)

        if (results.length === 0) {
          return {
            found: false,
            message: `No screen captures found between ${start.toLocaleString()} and ${end.toLocaleString()}.`
          }
        }

        // Group by application for summary
        const appCounts: Record<string, number> = {}
        results.forEach((r) => {
          const app = r.activeApplication || 'Unknown'
          appCounts[app] = (appCounts[app] || 0) + 1
        })

        return {
          found: true,
          count: results.length,
          timeRange: {
            start: start.toLocaleString(),
            end: end.toLocaleString()
          },
          applicationSummary: Object.entries(appCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([app, count]) => ({ application: app, captures: count })),
          results: results.map((r) => ({
            timestamp: new Date(r.timestamp * 1000).toISOString(),
            time: new Date(r.timestamp * 1000).toLocaleTimeString(),
            application: r.activeApplication || 'Unknown',
            summary: r.summary,
            activity: r.userActivity
          }))
        }
      } catch (error) {
        return {
          found: false,
          error: error instanceof Error ? error.message : 'Time range search failed'
        }
      }
    }
  })
}
