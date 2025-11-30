//
//  LLMProvider.swift
//  localbird
//

import Foundation

/// Protocol defining capabilities of an LLM provider
protocol LLMProvider {
    var name: String { get }
    var supportsVision: Bool { get }
    var supportsEmbeddings: Bool { get }

    /// Analyze an image and return structured data
    func analyzeImage(imageData: Data, prompt: String) async throws -> FrameAnalysis

    /// Generate embeddings for text
    func generateEmbedding(text: String) async throws -> [Float]

    /// Chat completion (for agent queries)
    func chat(messages: [ChatMessage]) async throws -> String
}

/// Default implementations for optional capabilities
extension LLMProvider {
    var supportsVision: Bool { false }
    var supportsEmbeddings: Bool { false }

    func analyzeImage(imageData: Data, prompt: String) async throws -> FrameAnalysis {
        throw LLMError.unsupportedOperation("Vision not supported by \(name)")
    }

    func generateEmbedding(text: String) async throws -> [Float] {
        throw LLMError.unsupportedOperation("Embeddings not supported by \(name)")
    }
}

/// Chat message structure
struct ChatMessage: Codable {
    let role: ChatRole
    let content: String
}

enum ChatRole: String, Codable {
    case system
    case user
    case assistant
}

/// LLM-related errors
enum LLMError: Error, LocalizedError {
    case unsupportedOperation(String)
    case apiError(String)
    case invalidResponse
    case missingAPIKey
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .unsupportedOperation(let message): return message
        case .apiError(let message): return "API Error: \(message)"
        case .invalidResponse: return "Invalid response from LLM"
        case .missingAPIKey: return "API key not configured"
        case .networkError(let error): return "Network error: \(error.localizedDescription)"
        }
    }
}

/// Available LLM providers
enum LLMProviderType: String, CaseIterable, Identifiable, Codable {
    case gemini
    case claude
    case openai

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .gemini: return "Google Gemini"
        case .claude: return "Anthropic Claude"
        case .openai: return "OpenAI"
        }
    }
}
