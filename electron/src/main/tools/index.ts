import type { ToolContext, LocalbirdTool } from './types'
import { createSemanticSearchTool } from './semantic-search'
import { createTimeRangeSearchTool } from './time-range-search'
import { createAppSearchTool } from './app-search'
import { createGetRecentTool } from './get-recent'
import { createGetStatsTool } from './get-stats'

export function createTools(context: ToolContext): Record<string, LocalbirdTool> {
  return {
    semantic_search: createSemanticSearchTool(context),
    time_range_search: createTimeRangeSearchTool(context),
    app_search: createAppSearchTool(context),
    get_recent: createGetRecentTool(context),
    get_stats: createGetStatsTool(context)
  }
}

export type { ToolContext } from './types'
