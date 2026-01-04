import type { QdrantClient, SearchResult } from '../qdrant'

export interface ToolContext {
  qdrantClient: QdrantClient
  generateEmbedding: (text: string) => Promise<number[]>
}

// Execute a tool and return the result as a string
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  try {
    let result: unknown

    switch (name) {
      case 'semantic_search':
        result = await semanticSearch(input as SemanticSearchInput, context)
        break
      case 'time_range_search':
        result = await timeRangeSearch(input as TimeRangeSearchInput, context)
        break
      case 'app_search':
        result = await appSearch(input as AppSearchInput, context)
        break
      case 'get_recent':
        result = await getRecent(input as GetRecentInput, context)
        break
      case 'get_stats':
        result = await getStats(input as GetStatsInput, context)
        break
      default:
        result = { error: `Unknown tool: ${name}` }
    }

    return JSON.stringify(result, null, 2)
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : 'Tool execution failed'
    })
  }
}

// Tool input types
interface SemanticSearchInput {
  query: string
  limit?: number
}

interface TimeRangeSearchInput {
  startTime: string
  endTime: string
  limit?: number
}

interface AppSearchInput {
  appName: string
  query?: string
  limit?: number
}

interface GetRecentInput {
  limit?: number
}

interface GetStatsInput {
  period: 'today' | 'yesterday' | 'week' | 'month'
}

// Tool implementations
async function semanticSearch(
  input: SemanticSearchInput,
  context: ToolContext
): Promise<unknown> {
  const { query, limit = 5 } = input
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
}

async function timeRangeSearch(
  input: TimeRangeSearchInput,
  context: ToolContext
): Promise<unknown> {
  const { startTime, endTime, limit = 20 } = input
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
}

async function appSearch(input: AppSearchInput, context: ToolContext): Promise<unknown> {
  const { appName, query, limit = 10 } = input

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
}

async function getRecent(input: GetRecentInput, context: ToolContext): Promise<unknown> {
  const { limit = 10 } = input
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
}

async function getStats(input: GetStatsInput, context: ToolContext): Promise<unknown> {
  const { period } = input
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
      estimatedMinutes: Math.round((data.count * 5) / 60),
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
}

// Helper functions
function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`
  return new Date(timestamp * 1000).toLocaleDateString()
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
