export interface FrameAnalysis {
  summary: string
  activeApplication: string | null
  userActivity: string | null
  visibleText: string[]
  uiElements: string[]
  metadata: Record<string, string>
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type LLMProviderType = 'gemini' | 'claude' | 'openai'

export interface LLMProviderConfig {
  geminiAPIKey?: string
  claudeAPIKey?: string
  openaiAPIKey?: string
  activeVisionProvider?: LLMProviderType
  activeEmbeddingProvider?: LLMProviderType
  activeChatProvider?: LLMProviderType
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'LLMError'
  }
}
