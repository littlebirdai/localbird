import express from 'express'
import { streamText, convertToModelMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json())

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.post('/api/chat', async (req, res) => {
  try {
    console.log('[Server] Chat request received')
    const { messages } = req.body

    const systemContext = `You are Localbird, an AI assistant that helps users search and understand their screen capture history.
You have access to screenshots and can help users find what they were working on, remember context, and answer questions about their activities.
Be concise and helpful.`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set')
    }

    console.log('[Server] Using Claude API')
    const model = anthropic('claude-sonnet-4-20250514')

    const result = streamText({
      model,
      system: systemContext,
      messages: convertToModelMessages(messages)
    })

    // Stream the response using fullStream
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', text: part.textDelta })}\n\n`)
      } else if (part.type === 'finish') {
        res.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`)
      }
    }
    res.end()
  } catch (error) {
    console.error('[Server] Chat error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`[Server] API running on http://localhost:${PORT}`)
  console.log(`[Server] ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET'}`)
})
