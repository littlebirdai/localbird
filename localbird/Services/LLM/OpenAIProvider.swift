//
//  OpenAIProvider.swift
//  localbird
//

import Foundation

/// OpenAI API provider
class OpenAIProvider: LLMProvider {
    let name = "OpenAI"
    let supportsVision = true
    let supportsEmbeddings = true

    private let apiKey: String
    private let visionModel: String
    private let embeddingModel: String
    private let baseURL = "https://api.openai.com/v1"

    init(apiKey: String, visionModel: String = "gpt-4o", embeddingModel: String = "text-embedding-3-small") {
        self.apiKey = apiKey
        self.visionModel = visionModel
        self.embeddingModel = embeddingModel
    }

    func analyzeImage(imageData: Data, prompt: String) async throws -> FrameAnalysis {
        let base64Image = imageData.base64EncodedString()

        let requestBody: [String: Any] = [
            "model": visionModel,
            "messages": [
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "text",
                            "text": buildAnalysisPrompt(prompt)
                        ],
                        [
                            "type": "image_url",
                            "image_url": [
                                "url": "data:image/jpeg;base64,\(base64Image)"
                            ]
                        ]
                    ]
                ]
            ],
            "response_format": ["type": "json_object"],
            "max_tokens": 1024
        ]

        let url = URL(string: "\(baseURL)/chat/completions")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw LLMError.apiError(errorBody)
        }

        return try parseAnalysisResponse(data)
    }

    func generateEmbedding(text: String) async throws -> [Float] {
        let requestBody: [String: Any] = [
            "model": embeddingModel,
            "input": text
        ]

        let url = URL(string: "\(baseURL)/embeddings")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LLMError.apiError("Failed to generate embedding")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dataArray = json["data"] as? [[String: Any]],
              let first = dataArray.first,
              let embedding = first["embedding"] as? [Double] else {
            throw LLMError.invalidResponse
        }

        return embedding.map { Float($0) }
    }

    func chat(messages: [ChatMessage]) async throws -> String {
        let apiMessages = messages.map { message -> [String: Any] in
            return [
                "role": message.role.rawValue,
                "content": message.content
            ]
        }

        let requestBody: [String: Any] = [
            "model": visionModel,
            "messages": apiMessages,
            "max_tokens": 2048
        ]

        let url = URL(string: "\(baseURL)/chat/completions")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LLMError.apiError("Chat request failed")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let first = choices.first,
              let message = first["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw LLMError.invalidResponse
        }

        return content
    }

    // MARK: - Private Helpers

    private func buildAnalysisPrompt(_ userPrompt: String) -> String {
        """
        Analyze this screenshot and extract data in a semantically meaningful way.

        \(userPrompt)

        IMPORTANT: Extract structured data where possible:
        - For messaging apps (iMessage, Slack, Discord, Teams, etc.): Extract messages with sender name, timestamp, and message content
        - For email clients: Extract sender, subject, date, and preview text
        - For social media: Extract posts with author, content, and engagement metrics
        - For documents/editors: Extract document title and key content
        - For terminals/code: Extract commands, output, or code snippets
        - For calendars: Extract event names, times, and participants
        - For browsers: Extract page title, URL if visible, and main content

        Structure the visibleText array to preserve semantic relationships (e.g., "John Doe (2:30 PM): Hello there" for messages).

        Respond with a JSON object matching this schema:
        {
            "summary": "Brief description of what's shown",
            "activeApplication": "Name of the main application visible",
            "userActivity": "What the user appears to be doing",
            "visibleText": ["Array of significant text, structured semantically where applicable"],
            "uiElements": ["Array of notable UI elements"],
            "metadata": {"key": "value pairs for additional context like conversation_participants, email_thread_subject, etc."}
        }
        """
    }

    private func parseAnalysisResponse(_ data: Data) throws -> FrameAnalysis {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let first = choices.first,
              let message = first["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw LLMError.invalidResponse
        }

        guard let analysisData = content.data(using: .utf8) else {
            throw LLMError.invalidResponse
        }

        do {
            return try JSONDecoder().decode(FrameAnalysis.self, from: analysisData)
        } catch {
            return FrameAnalysis(
                summary: content,
                activeApplication: nil,
                userActivity: nil,
                visibleText: [],
                uiElements: [],
                metadata: [:]
            )
        }
    }
}
