//
//  ClaudeProvider.swift
//  localbird
//

import Foundation

/// Anthropic Claude API provider
class ClaudeProvider: LLMProvider {
    let name = "Claude"
    let supportsVision = true
    let supportsEmbeddings = false

    private let apiKey: String
    private let model: String
    private let baseURL = "https://api.anthropic.com/v1"

    init(apiKey: String, model: String = "claude-sonnet-4-20250514") {
        self.apiKey = apiKey
        self.model = model
    }

    func analyzeImage(imageData: Data, prompt: String) async throws -> FrameAnalysis {
        let base64Image = imageData.base64EncodedString()

        let requestBody: [String: Any] = [
            "model": model,
            "max_tokens": 1024,
            "messages": [
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "image",
                            "source": [
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": base64Image
                            ]
                        ],
                        [
                            "type": "text",
                            "text": buildAnalysisPrompt(prompt)
                        ]
                    ]
                ]
            ]
        ]

        let url = URL(string: "\(baseURL)/messages")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw LLMError.apiError(errorBody)
        }

        return try parseAnalysisResponse(data)
    }

    func chat(messages: [ChatMessage]) async throws -> String {
        let apiMessages = messages.filter { $0.role != .system }.map { message -> [String: Any] in
            return [
                "role": message.role.rawValue,
                "content": message.content
            ]
        }

        let systemMessage = messages.first { $0.role == .system }?.content

        var requestBody: [String: Any] = [
            "model": model,
            "max_tokens": 2048,
            "messages": apiMessages
        ]

        if let system = systemMessage {
            requestBody["system"] = system
        }

        let url = URL(string: "\(baseURL)/messages")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LLMError.apiError("Chat request failed")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let first = content.first,
              let text = first["text"] as? String else {
            throw LLMError.invalidResponse
        }

        return text
    }

    // MARK: - Private Helpers

    private func buildAnalysisPrompt(_ userPrompt: String) -> String {
        """
        Analyze this screenshot and provide structured information.

        \(userPrompt)

        Respond with ONLY a JSON object (no markdown, no explanation) matching this schema:
        {
            "summary": "Brief description of what's shown",
            "activeApplication": "Name of the main application visible",
            "userActivity": "What the user appears to be doing",
            "visibleText": ["Array of significant text visible on screen"],
            "uiElements": ["Array of notable UI elements"],
            "metadata": {"key": "value pairs for additional context"}
        }
        """
    }

    private func parseAnalysisResponse(_ data: Data) throws -> FrameAnalysis {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let first = content.first,
              let text = first["text"] as? String else {
            throw LLMError.invalidResponse
        }

        guard let analysisData = text.data(using: .utf8) else {
            throw LLMError.invalidResponse
        }

        do {
            return try JSONDecoder().decode(FrameAnalysis.self, from: analysisData)
        } catch {
            return FrameAnalysis(
                summary: text,
                activeApplication: nil,
                userActivity: nil,
                visibleText: [],
                uiElements: [],
                metadata: [:]
            )
        }
    }
}
