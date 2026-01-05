import express, { Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import Store from 'electron-store'
import { qdrantClient } from './qdrant'
import { getFramesDirectory } from './utils'
import { toolDefinitions } from './tools/definitions'
import { executeTool, ToolContext } from './tools/executor'
import fs from 'fs'
import path from 'path'

const store = new Store()

interface ChatMessagePart {
  type: 'text'
  text: string
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  parts?: ChatMessagePart[]
  content?: string
  id?: string
}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = store.get('geminiAPIKey') as string
  if (!apiKey) {
    throw new Error('Gemini API key not configured')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] }
      })
    }
  )

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`)
  }

  const data = await response.json()
  return data.embedding?.values || []
}

// Create tool context
function createToolContext(): ToolContext {
  return {
    qdrantClient,
    generateEmbedding
  }
}

// Agent system prompt
const AGENT_SYSTEM_PROMPT = `You are Localbird, a personal AI assistant with access to the user's screen capture history.

## Your Capabilities
You have tools to search across screen captures. Use them to find relevant information before answering.

## Available Tools
- semantic_search: Search by meaning/topic (use for "what was I working on", "find emails", etc.)
- time_range_search: Search by time window (use for "yesterday", "this morning", "last hour")
- app_search: Search by application (use for "in Chrome", "in VSCode", "in Slack")
- get_recent: Get latest captures (use for "what was I just doing")
- get_stats: Get usage statistics (use for "how much time", "productivity summary")

## Guidelines
1. **Search before answering**: When users ask about their activities, search first.
2. **Use multiple searches**: If initial results aren't sufficient, try different queries or time ranges.
3. **Be specific with time**: Convert relative times ("yesterday", "this morning") to actual date ranges.
4. **Synthesize results**: After searching, provide a helpful summary of what you found.
5. **Acknowledge limitations**: If searches return nothing, say so and suggest alternatives.

## Current Time
{CURRENT_TIME}

Use this to interpret relative time references like "today", "yesterday", "this morning".`

// Convert assistant-ui message format to Anthropic format
function convertMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const content = m.content || m.parts?.map((p) => p.text).join('') || ''
      return {
        role: m.role as 'user' | 'assistant',
        content
      }
    })
}

export function createServer() {
  const app = express()
  app.use(express.json({ limit: '50mb' }))

  // CORS for renderer
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    next()
  })

  app.options('/api/chat', (_req, res) => {
    res.sendStatus(200)
  })

  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      console.log('[Server] Received chat request')
      const { messages } = req.body as { messages: ChatMessage[] }

      const claudeKey = (store.get('claudeAPIKey') as string) || process.env.ANTHROPIC_API_KEY
      if (!claudeKey) {
        throw new Error('Claude API key not configured')
      }

      const client = new Anthropic({ apiKey: claudeKey })
      const toolContext = createToolContext()

      // Dynamic system prompt with current time
      const systemPrompt = AGENT_SYSTEM_PROMPT.replace('{CURRENT_TIME}', new Date().toISOString())

      // Convert messages to Anthropic format
      let anthropicMessages = convertMessages(messages)

      // Track if client disconnected
      let clientDisconnected = false
      res.on('close', () => {
        clientDisconnected = true
      })

      res.setHeader('Content-Type', 'text/plain; charset=utf-8')

      // Agent loop - continue until no more tool calls or max iterations
      const MAX_ITERATIONS = 10
      let iteration = 0

      while (iteration < MAX_ITERATIONS && !clientDisconnected) {
        iteration++
        console.log(`[Server] Agent iteration ${iteration}`)

        // Create streaming message with extended thinking
        const stream = client.messages.stream({
          model: 'claude-opus-4-5',
          max_tokens: 16000,
          thinking: {
            type: 'enabled',
            budget_tokens: 10000
          },
          system: systemPrompt,
          messages: anthropicMessages,
          tools: toolDefinitions
        })

        // Collect the response
        let textContent = ''
        let thinkingContent = ''
        let thinkingStarted = false
        const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

        // Stream thinking to client with start/end markers
        stream.on('thinking', (thinking) => {
          if (!clientDisconnected) {
            if (!thinkingStarted) {
              res.write('<thinking>')
              thinkingStarted = true
            }
            thinkingContent += thinking
            res.write(thinking)
          }
        })

        // Stream text to client as it comes
        stream.on('text', (text) => {
          if (!clientDisconnected) {
            // Close thinking tag if we were thinking
            if (thinkingStarted) {
              res.write('</thinking>')
              thinkingStarted = false
            }
            textContent += text
            res.write(text)
          }
        })

        // Wait for the stream to complete
        const response = await stream.finalMessage()

        // Close thinking tag if still open
        if (thinkingStarted && !clientDisconnected) {
          res.write('</thinking>')
          thinkingStarted = false
        }

        // Check for tool use
        const hasToolUse = response.content.some((block) => block.type === 'tool_use')

        if (!hasToolUse) {
          // No tool calls, we're done
          break
        }

        // Collect all tool uses
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            toolUses.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>
            })
          }
        }

        if (toolUses.length === 0) {
          break
        }

        // Build assistant message with all content blocks
        const assistantContent: Anthropic.ContentBlock[] = response.content

        // Add assistant message
        anthropicMessages.push({
          role: 'assistant',
          content: assistantContent
        })

        // Execute tools and build tool results
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const toolUse of toolUses) {
          console.log(`[Server] Executing tool: ${toolUse.name}`)

          // Notify user that we're using a tool
          if (!clientDisconnected) {
            res.write(`\n\n[Using ${toolUse.name}...]\n\n`)
          }

          const result = await executeTool(toolUse.name, toolUse.input, toolContext)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result
          })
        }

        // Add tool results as user message
        anthropicMessages.push({
          role: 'user',
          content: toolResults
        })
      }

      if (!clientDisconnected) {
        res.end()
      }
    } catch (error) {
      console.error('[Server] Chat error:', error)
      if (!res.headersSent) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }
  })

  // Get recent frames
  app.get('/api/frames', async (_req: Request, res: Response) => {
    try {
      const frames = await qdrantClient.getRecentFrames(50)
      res.json({ frames })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  // Get frame image
  app.get('/api/frames/:id/image', (req: Request, res: Response) => {
    const { id } = req.params
    const framesDir = getFramesDirectory()
    const imagePath = path.join(framesDir, `${id}.jpg`)

    if (fs.existsSync(imagePath)) {
      res.sendFile(imagePath)
    } else {
      res.status(404).json({ error: 'Image not found' })
    }
  })

  // Search frames
  app.post('/api/frames/search', async (req: Request, res: Response) => {
    try {
      const { query, limit = 20 } = req.body
      const embedding = await generateEmbedding(query)
      const frames = await qdrantClient.search(embedding, limit)
      res.json({ frames })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  // Get latest frame path (for Claude Code to read directly)
  app.get('/api/frames/latest', (_req: Request, res: Response) => {
    try {
      const framesDir = getFramesDirectory()
      const files = fs.readdirSync(framesDir)
        .filter(f => f.endsWith('.jpg'))
        .map(f => ({
          name: f,
          path: path.join(framesDir, f),
          mtime: fs.statSync(path.join(framesDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime)

      if (files.length === 0) {
        res.status(404).json({ error: 'No frames found' })
        return
      }

      const latest = files[0]
      res.json({
        path: latest.path,
        id: latest.name.replace('.jpg', ''),
        timestamp: new Date(latest.mtime).toISOString()
      })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  return app
}
