//
//  LLMService.swift
//  localbird
//

import Foundation
import Combine

/// Service managing LLM providers with hot-swap capability
@MainActor
class LLMService: ObservableObject {
    @Published var activeVisionProvider: LLMProviderType = .gemini
    @Published var activeEmbeddingProvider: LLMProviderType = .gemini
    @Published var activeChatProvider: LLMProviderType = .gemini

    private var providers: [LLMProviderType: LLMProvider] = [:]

    init() {}

    /// Configure a provider with API key
    func configure(provider: LLMProviderType, apiKey: String) {
        switch provider {
        case .gemini:
            providers[.gemini] = GeminiProvider(apiKey: apiKey)
        case .claude:
            providers[.claude] = ClaudeProvider(apiKey: apiKey)
        case .openai:
            providers[.openai] = OpenAIProvider(apiKey: apiKey)
        }
    }

    /// Check if a provider is configured
    func isConfigured(_ provider: LLMProviderType) -> Bool {
        providers[provider] != nil
    }

    /// Analyze image using active vision provider
    func analyzeImage(imageData: Data, prompt: String = "") async throws -> FrameAnalysis {
        guard let provider = providers[activeVisionProvider] else {
            throw LLMError.missingAPIKey
        }

        guard provider.supportsVision else {
            throw LLMError.unsupportedOperation("Vision not supported")
        }

        return try await provider.analyzeImage(imageData: imageData, prompt: prompt)
    }

    /// Generate embedding using active embedding provider
    func generateEmbedding(text: String) async throws -> [Float] {
        guard let provider = providers[activeEmbeddingProvider] else {
            throw LLMError.missingAPIKey
        }

        guard provider.supportsEmbeddings else {
            // Fallback to another provider that supports embeddings
            for (type, p) in providers where p.supportsEmbeddings {
                return try await p.generateEmbedding(text: text)
            }
            throw LLMError.unsupportedOperation("No embedding provider available")
        }

        return try await provider.generateEmbedding(text: text)
    }

    /// Chat using active chat provider
    func chat(messages: [ChatMessage]) async throws -> String {
        guard let provider = providers[activeChatProvider] else {
            throw LLMError.missingAPIKey
        }

        return try await provider.chat(messages: messages)
    }

    /// Get available providers that support vision
    func visionProviders() -> [LLMProviderType] {
        providers.filter { $0.value.supportsVision }.map { $0.key }
    }

    /// Get available providers that support embeddings
    func embeddingProviders() -> [LLMProviderType] {
        providers.filter { $0.value.supportsEmbeddings }.map { $0.key }
    }

    /// Check if any embedding provider is configured and available
    func hasEmbeddingSupport() -> Bool {
        return providers.values.contains { $0.supportsEmbeddings }
    }

    /// Check if any chat provider is configured and available
    func hasChatSupport() -> Bool {
        return !providers.isEmpty  // All providers support chat
    }
}
