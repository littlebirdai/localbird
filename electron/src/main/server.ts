import express, { Request, Response } from 'express'
import { streamText, convertToModelMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import Store from 'electron-store'
import { qdrantClient } from './qdrant'
import { getFramesDirectory } from './utils'
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

async function searchRelevantFrames(query: string, limit = 5) {
  try {
    const embedding = await generateEmbedding(query)
    const results = await qdrantClient.search(embedding, limit)
    return results
  } catch (error) {
    console.error('[Server] Search error:', error)
    return []
  }
}

function buildContextFromFrames(frames: any[]): string {
  if (frames.length === 0) return ''

  const context = frames
    .map((frame, i) => {
      const time = new Date(frame.timestamp * 1000).toLocaleString()
      const app = frame.activeApplication || 'Unknown app'
      return `[${i + 1}] ${time} - ${app}: ${frame.summary}`
    })
    .join('\n')

  return `\nRelevant screen captures from your history:\n${context}\n`
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
      console.log('[Server] Received chat request:', JSON.stringify(req.body, null, 2))
      const { messages } = req.body as { messages: ChatMessage[] }

      // Helper to extract text from message
      const getMessageText = (msg: ChatMessage): string => {
        if (msg.content) return msg.content
        if (msg.parts) {
          return msg.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('')
        }
        return ''
      }

      // Get the last user message for RAG
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
      let systemContext = `You are Localbird, an AI assistant that helps users search and understand their screen capture history.
You have access to screenshots and can help users find what they were working on, remember context, and answer questions about their activities.
Be concise and helpful. When referencing screen captures, mention the time and application.`

      // Search for relevant frames if there's a user message
      if (lastUserMessage) {
        const lastUserText = getMessageText(lastUserMessage)
        const relevantFrames = await searchRelevantFrames(lastUserText)
        if (relevantFrames.length > 0) {
          systemContext += buildContextFromFrames(relevantFrames)
        }
      }

      // Get the configured provider
      const provider = (store.get('chatProvider') as string) || 'anthropic'
      const claudeKey = store.get('claudeAPIKey') as string
      const geminiKey = store.get('geminiAPIKey') as string

      let model
      if (provider === 'anthropic' && claudeKey) {
        model = anthropic('claude-sonnet-4-20250514')
      } else if (geminiKey) {
        model = google('gemini-3-flash-preview')
      } else {
        throw new Error('No API key configured')
      }

      const modelMessages = await convertToModelMessages(messages)
      const result = streamText({
        model,
        system: systemContext,
        messages: modelMessages
      })

      // Stream plain text
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')

      for await (const chunk of result.textStream) {
        res.write(chunk)
      }
      res.end()
    } catch (error) {
      console.error('[Server] Chat error:', error)
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
