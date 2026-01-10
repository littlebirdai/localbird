import { LLMProvider } from './providers/base'
import { GeminiProvider } from './providers/gemini'
import { OpenAIProvider } from './providers/openai'
import { FrameAnalysis, ChatMessage, LLMProviderType, LLMProviderConfig, LLMError } from './types'

export * from './types'
export { LLMProvider } from './providers/base'

export class LLMService {
  private providers: Map<LLMProviderType, LLMProvider> = new Map()
  private activeVisionProvider: LLMProviderType = 'gemini'
  private activeEmbeddingProvider: LLMProviderType = 'gemini'
  private activeChatProvider: LLMProviderType = 'gemini'

  configure(config: LLMProviderConfig): void {
    this.providers.clear()

    if (config.geminiAPIKey) {
      this.providers.set('gemini', new GeminiProvider(config.geminiAPIKey))
    }

    if (config.openaiAPIKey) {
      this.providers.set('openai', new OpenAIProvider(config.openaiAPIKey))
    }

    // Claude doesn't support embeddings, so we don't add it as a provider here
    // Chat with Claude is handled by the existing server.ts

    if (config.activeVisionProvider && this.providers.has(config.activeVisionProvider)) {
      this.activeVisionProvider = config.activeVisionProvider
    } else if (this.providers.size > 0) {
      this.activeVisionProvider = this.providers.keys().next().value!
    }

    if (config.activeEmbeddingProvider && this.providers.has(config.activeEmbeddingProvider)) {
      this.activeEmbeddingProvider = config.activeEmbeddingProvider
    } else if (this.providers.size > 0) {
      // Find first provider that supports embeddings
      for (const [type, provider] of this.providers) {
        if (provider.supportsEmbeddings) {
          this.activeEmbeddingProvider = type
          break
        }
      }
    }

    if (config.activeChatProvider && this.providers.has(config.activeChatProvider)) {
      this.activeChatProvider = config.activeChatProvider
    } else if (this.providers.size > 0) {
      this.activeChatProvider = this.providers.keys().next().value!
    }

    console.log(
      `[LLMService] Configured with ${this.providers.size} providers. ` +
        `Vision: ${this.activeVisionProvider}, Embedding: ${this.activeEmbeddingProvider}`
    )
  }

  async analyzeImage(imageBuffer: Buffer, prompt: string): Promise<FrameAnalysis> {
    const provider = this.providers.get(this.activeVisionProvider)
    if (!provider) {
      throw new LLMError('No vision provider configured', 'NO_PROVIDER')
    }
    if (!provider.supportsVision) {
      throw new LLMError(`Provider ${provider.name} does not support vision`, 'UNSUPPORTED')
    }
    return provider.analyzeImage(imageBuffer, prompt)
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Try active embedding provider first
    let provider = this.providers.get(this.activeEmbeddingProvider)
    if (provider?.supportsEmbeddings) {
      return provider.generateEmbedding(text)
    }

    // Fall back to any provider that supports embeddings
    for (const [, p] of this.providers) {
      if (p.supportsEmbeddings) {
        return p.generateEmbedding(text)
      }
    }

    throw new LLMError('No embedding provider configured', 'NO_PROVIDER')
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const provider = this.providers.get(this.activeChatProvider)
    if (!provider) {
      throw new LLMError('No chat provider configured', 'NO_PROVIDER')
    }
    return provider.chat(messages)
  }

  hasVisionProvider(): boolean {
    const provider = this.providers.get(this.activeVisionProvider)
    return provider?.supportsVision ?? false
  }

  hasEmbeddingProvider(): boolean {
    for (const [, p] of this.providers) {
      if (p.supportsEmbeddings) return true
    }
    return false
  }

  getActiveProviders(): { vision: string | null; embedding: string | null; chat: string | null } {
    return {
      vision: this.providers.get(this.activeVisionProvider)?.name ?? null,
      embedding: this.providers.get(this.activeEmbeddingProvider)?.name ?? null,
      chat: this.providers.get(this.activeChatProvider)?.name ?? null
    }
  }
}

// Singleton instance
export const llmService = new LLMService()
