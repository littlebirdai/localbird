import { tool, jsonSchema } from 'ai'
import type { ToolContext } from './types'

export function createGetStatsTool(context: ToolContext) {
  return tool({
    description:
      'Get usage statistics and activity summary for a time period. Use when user asks about productivity, time spent on apps, or daily/weekly summaries.',
    parameters: jsonSchema<{ period: 'today' | 'yesterday' | 'week' | 'month' }>({
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'week', 'month'],
          description: 'Time period for statistics'
        }
      },
      required: ['period']
    }),
    execute: async ({ period }) => {
      try {
        const { start, end } = getTimeRange(period)
        const results = await context.qdrantClient.searchByTimeRange(start, end, 1000)

        if (results.length === 0) {
          return {
            found: false,
            message: `No screen captures found for ${period}.`,
            period: {
              name: period,
              start: start.toLocaleString(),
              end: end.toLocaleString()
            }
          }
        }

        // Calculate app usage
        const appUsage: Record<string, { count: number; firstSeen: number; lastSeen: number }> = {}

        results.forEach((r) => {
          const app = r.activeApplication || 'Unknown'
          if (!appUsage[app]) {
            appUsage[app] = { count: 0, firstSeen: r.timestamp, lastSeen: r.timestamp }
          }
          appUsage[app].count++
          appUsage[app].firstSeen = Math.min(appUsage[app].firstSeen, r.timestamp)
          appUsage[app].lastSeen = Math.max(appUsage[app].lastSeen, r.timestamp)
        })

        // Sort by usage
        const sortedApps = Object.entries(appUsage)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([app, data]) => ({
            application: app,
            captures: data.count,
            estimatedMinutes: Math.round((data.count * 5) / 60), // Assuming 5-second intervals
            firstSeen: new Date(data.firstSeen * 1000).toLocaleTimeString(),
            lastSeen: new Date(data.lastSeen * 1000).toLocaleTimeString()
          }))

        // Calculate time distribution by hour (for today/yesterday)
        let hourlyDistribution: { hour: number; captures: number }[] | undefined
        if (period === 'today' || period === 'yesterday') {
          const hourCounts: Record<number, number> = {}
          results.forEach((r) => {
            const hour = new Date(r.timestamp * 1000).getHours()
            hourCounts[hour] = (hourCounts[hour] || 0) + 1
          })
          hourlyDistribution = Object.entries(hourCounts)
            .map(([hour, count]) => ({ hour: parseInt(hour), captures: count }))
            .sort((a, b) => a.hour - b.hour)
        }

        // Find peak activity
        const peakHour = hourlyDistribution
          ? hourlyDistribution.reduce((max, curr) => (curr.captures > max.captures ? curr : max))
          : undefined

        return {
          found: true,
          period: {
            name: period,
            start: start.toLocaleString(),
            end: end.toLocaleString()
          },
          summary: {
            totalCaptures: results.length,
            uniqueApplications: Object.keys(appUsage).length,
            estimatedActiveMinutes: Math.round((results.length * 5) / 60),
            mostUsedApp: sortedApps[0]?.application || 'Unknown',
            peakActivityHour: peakHour ? `${peakHour.hour}:00` : undefined
          },
          applicationBreakdown: sortedApps.slice(0, 10),
          hourlyDistribution
        }
      } catch (error) {
        return {
          found: false,
          error: error instanceof Error ? error.message : 'Failed to get statistics'
        }
      }
    }
  })
}

function getTimeRange(period: string): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now)

  let start: Date

  switch (period) {
    case 'today':
      start = new Date(now)
      start.setHours(0, 0, 0, 0)
      break
    case 'yesterday':
      start = new Date(now)
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)
      break
    case 'week':
      start = new Date(now)
      start.setDate(start.getDate() - 7)
      break
    case 'month':
      start = new Date(now)
      start.setMonth(start.getMonth() - 1)
      break
    default:
      start = new Date(now)
      start.setHours(0, 0, 0, 0)
  }

  return { start, end }
}
