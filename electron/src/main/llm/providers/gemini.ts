import { LLMProvider, buildAnalysisPrompt, parseFrameAnalysis } from './base'
import { FrameAnalysis, ChatMessage, LLMError } from '../types'

export class GeminiProvider implements LLMProvider {
  name = 'Gemini'
  supportsVision = true
  supportsEmbeddings = true

  private apiKey: string
  private visionModel: string
  private embeddingModel: string
  private baseURL = 'https://generativelanguage.googleapis.com/v1beta'

  constructor(
    apiKey: string,
    visionModel: string = 'gemini-2.5-flash',
    embeddingModel: string = 'text-embedding-004'
  ) {
    this.apiKey = apiKey
    this.visionModel = visionModel
    this.embeddingModel = embeddingModel
  }

  async analyzeImage(imageBuffer: Buffer, prompt: string): Promise<FrameAnalysis> {
    const base64Image = imageBuffer.toString('base64')

    const requestBody = {
      contents: [
        {
          parts: [
            { text: buildAnalysisPrompt(prompt) },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }

    const url = `${this.baseURL}/models/${this.visionModel}:generateContent?key=${this.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new LLMError(`Gemini API error: ${errorBody}`, 'API_ERROR', response.status)
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new LLMError('Invalid response from Gemini API', 'INVALID_RESPONSE')
    }

    return parseFrameAnalysis(text)
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const requestBody = {
      model: `models/${this.embeddingModel}`,
      content: {
        parts: [{ text }]
      }
    }

    const url = `${this.baseURL}/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new LLMError(`Gemini embedding error: ${errorBody}`, 'API_ERROR', response.status)
    }

    const data = await response.json()
    const values = data?.embedding?.values

    if (!Array.isArray(values)) {
      throw new LLMError('Invalid embedding response', 'INVALID_RESPONSE')
    }

    return values
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const contents = messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }))

    const requestBody = { contents }

    const url = `${this.baseURL}/models/${this.visionModel}:generateContent?key=${this.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new LLMError('Gemini chat request failed', 'API_ERROR', response.status)
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new LLMError('Invalid chat response', 'INVALID_RESPONSE')
    }

    return text
  }
}
