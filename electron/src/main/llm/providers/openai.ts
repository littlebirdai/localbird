import { LLMProvider, buildAnalysisPrompt, parseFrameAnalysis } from './base'
import { FrameAnalysis, ChatMessage, LLMError } from '../types'

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI'
  supportsVision = true
  supportsEmbeddings = true

  private apiKey: string
  private visionModel: string
  private embeddingModel: string
  private baseURL = 'https://api.openai.com/v1'

  constructor(
    apiKey: string,
    visionModel: string = 'gpt-4o',
    embeddingModel: string = 'text-embedding-3-small'
  ) {
    this.apiKey = apiKey
    this.visionModel = visionModel
    this.embeddingModel = embeddingModel
  }

  async analyzeImage(imageBuffer: Buffer, prompt: string): Promise<FrameAnalysis> {
    const base64Image = imageBuffer.toString('base64')

    const requestBody = {
      model: this.visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildAnalysisPrompt(prompt) },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      response_format: { type: 'json_object' }
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new LLMError(`OpenAI API error: ${errorBody}`, 'API_ERROR', response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content

    if (!text) {
      throw new LLMError('Invalid response from OpenAI API', 'INVALID_RESPONSE')
    }

    return parseFrameAnalysis(text)
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const requestBody = {
      model: this.embeddingModel,
      input: text
    }

    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new LLMError(`OpenAI embedding error: ${errorBody}`, 'API_ERROR', response.status)
    }

    const data = await response.json()
    const values = data?.data?.[0]?.embedding

    if (!Array.isArray(values)) {
      throw new LLMError('Invalid embedding response', 'INVALID_RESPONSE')
    }

    return values
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const requestBody = {
      model: this.visionModel,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      }))
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new LLMError('OpenAI chat request failed', 'API_ERROR', response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content

    if (!text) {
      throw new LLMError('Invalid chat response', 'INVALID_RESPONSE')
    }

    return text
  }
}
