import Anthropic from '@anthropic-ai/sdk'

// Tool definitions in Anthropic's native format
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'semantic_search',
    description:
      'Search screen captures by semantic similarity. Use when looking for activities, content, or topics from screen history.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query describing what to find'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 5)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'time_range_search',
    description:
      'Search screen captures within a specific time range. Use for queries like "yesterday", "this morning", "last hour", or specific date ranges.',
    input_schema: {
      type: 'object',
      properties: {
        startTime: {
          type: 'string',
          description: 'Start of time range (ISO 8601 format, e.g., "2024-01-15T09:00:00Z")'
        },
        endTime: {
          type: 'string',
          description: 'End of time range (ISO 8601 format, e.g., "2024-01-15T17:00:00Z")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 20)'
        }
      },
      required: ['startTime', 'endTime']
    }
  },
  {
    name: 'app_search',
    description:
      'Search screen captures filtered by application name. Optionally combine with semantic search. Use when user asks about specific apps like "Chrome", "VSCode", "Slack", etc.',
    input_schema: {
      type: 'object',
      properties: {
        appName: {
          type: 'string',
          description:
            'Application name to filter by (partial match, case-insensitive). Examples: "chrome", "vscode", "slack", "xcode"'
        },
        query: {
          type: 'string',
          description: 'Optional: semantic search query to further filter results'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 10)'
        }
      },
      required: ['appName']
    }
  },
  {
    name: 'get_recent',
    description:
      'Get the most recent screen captures. Use when user asks "what was I just doing?", "show recent activity", or needs context about their latest work.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent captures to return (default 10)'
        }
      },
      required: []
    }
  },
  {
    name: 'get_stats',
    description:
      'Get usage statistics and activity summary for a time period. Use when user asks about productivity, time spent on apps, or daily/weekly summaries.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'week', 'month'],
          description: 'Time period for statistics'
        }
      },
      required: ['period']
    }
  }
]
