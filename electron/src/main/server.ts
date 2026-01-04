import express, { Request, Response } from 'express'
import { streamText, convertToModelMessages } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import Store from 'electron-store'
import { qdrantClient } from './qdrant'
import { getFramesDirectory } from './utils'
import { createTools, ToolContext } from './tools'
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
  // Use Google's embedding model
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

// Create tool context for the agentic loop
function createToolContext(): ToolContext {
  return {
    qdrantClient,
    generateEmbedding
  }
}

// Search for relevant frames using semantic search
async function searchRelevantFrames(query: string, limit = 20) {
  const embedding = await generateEmbedding(query)
  return qdrantClient.search(embedding, limit)
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
${new Date().toISOString()}

Use this to interpret relative time references like "today", "yesterday", "this morning".`

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

      // Get the configured provider and API keys
      const provider = (store.get('chatProvider') as string) || 'anthropic'
      const claudeKey = (store.get('claudeAPIKey') as string) || process.env.ANTHROPIC_API_KEY
      const geminiKey = (store.get('geminiAPIKey') as string) || process.env.GEMINI_API_KEY

      let model
      // Prefer Claude for chat (tools disabled due to AI SDK v6 schema bug)
      if (provider === 'anthropic' && claudeKey) {
        const anthropic = createAnthropic({ apiKey: claudeKey })
        model = anthropic('claude-sonnet-4-20250514')
      } else if (geminiKey) {
        const google = createGoogleGenerativeAI({ apiKey: geminiKey })
        model = google('gemini-2.0-flash')
      } else {
        throw new Error('No API key configured')
      }

      // TODO: Re-enable tools when AI SDK v6 fixes Anthropic schema bug
      // See: https://github.com/vercel/ai/issues/8784
      // const toolContext = createToolContext()
      // const tools = createTools(toolContext)

      // Dynamic system prompt with current time
      const systemPrompt = AGENT_SYSTEM_PROMPT.replace(
        '${new Date().toISOString()}',
        new Date().toISOString()
      )

      // Convert messages to model format
      // Handle both assistant-ui format (with parts) and simple format (with content)
      let modelMessages
      try {
        // Try assistant-ui format first
        modelMessages = await convertToModelMessages(messages)
      } catch {
        // Fall back to simple format - just pass through
        modelMessages = messages.map((m: ChatMessage) => ({
          role: m.role,
          content: m.content || (m.parts?.map((p) => p.text).join('') ?? '')
        }))
      }

      // Track if client disconnected
      let clientDisconnected = false
      res.on('close', () => {
        clientDisconnected = true
      })

      // Basic chat without tools (tools disabled due to AI SDK v6 bug)
      const result = streamText({
        model,
        system: systemPrompt,
        messages: modelMessages
        // TODO: Re-enable when AI SDK v6 fixes the Anthropic tools schema bug
        // tools,
        // maxSteps: 5,
        // toolChoice: 'auto'
      })

      // Stream the response with tool call information
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')

      try {
        for await (const chunk of result.textStream) {
          if (clientDisconnected) break
          res.write(chunk)
        }
        if (!clientDisconnected) {
          res.end()
        }
      } catch (streamError) {
        // Ignore EPIPE errors from client disconnect
        if ((streamError as NodeJS.ErrnoException).code !== 'EPIPE') {
          throw streamError
        }
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
      const frames = await searchRelevantFrames(query, limit)
      res.json({ frames })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  return app
}
