//
//  GeminiProvider.swift
//  localbird
//

import Foundation

/// Google Gemini API provider - primary choice for vision tasks
class GeminiProvider: LLMProvider {
    let name = "Gemini"
    let supportsVision = true
    let supportsEmbeddings = true

    private let apiKey: String
    private let visionModel: String
    private let embeddingModel: String
    private let baseURL = "https://generativelanguage.googleapis.com/v1beta"

    init(apiKey: String, visionModel: String = "gemini-3-flash-preview", embeddingModel: String = "text-embedding-004") {
        self.apiKey = apiKey
        self.visionModel = visionModel
        self.embeddingModel = embeddingModel
    }

    func analyzeImage(imageData: Data, prompt: String) async throws -> FrameAnalysis {
        let base64Image = imageData.base64EncodedString()

        let requestBody: [String: Any] = [
            "contents": [
                [
                    "parts": [
                        ["text": buildAnalysisPrompt(prompt)],
                        [
                            "inline_data": [
                                "mime_type": "image/jpeg",
                                "data": base64Image
                            ]
                        ]
                    ]
                ]
            ],
            "generationConfig": [
                "responseMimeType": "application/json"
            ]
        ]

        let url = URL(string: "\(baseURL)/models/\(visionModel):generateContent?key=\(apiKey)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw LLMError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw LLMError.apiError("Status \(httpResponse.statusCode): \(errorBody)")
        }

        return try parseAnalysisResponse(data)
    }

    func generateEmbedding(text: String) async throws -> [Float] {
        let requestBody: [String: Any] = [
            "model": "models/\(embeddingModel)",
            "content": [
                "parts": [
                    ["text": text]
                ]
            ]
        ]

        let url = URL(string: "\(baseURL)/models/\(embeddingModel):embedContent?key=\(apiKey)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LLMError.apiError("Failed to generate embedding")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let embedding = json["embedding"] as? [String: Any],
              let values = embedding["values"] as? [Double] else {
            throw LLMError.invalidResponse
        }

        return values.map { Float($0) }
    }

    func chat(messages: [ChatMessage]) async throws -> String {
        let contents = messages.map { message -> [String: Any] in
            let role = message.role == .assistant ? "model" : "user"
            return [
                "role": role,
                "parts": [["text": message.content]]
            ]
        }

        let requestBody: [String: Any] = [
            "contents": contents
        ]

        let url = URL(string: "\(baseURL)/models/\(visionModel):generateContent?key=\(apiKey)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw LLMError.apiError("Chat request failed")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let candidates = json["candidates"] as? [[String: Any]],
              let first = candidates.first,
              let content = first["content"] as? [String: Any],
              let parts = content["parts"] as? [[String: Any]],
              let text = parts.first?["text"] as? String else {
            throw LLMError.invalidResponse
        }

        return text
    }

    // MARK: - Private Helpers

    private func buildAnalysisPrompt(_ userPrompt: String) -> String {
        """
        Analyze this screenshot and provide structured information.

        \(userPrompt)

        Respond with a JSON object matching this schema:
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
              let candidates = json["candidates"] as? [[String: Any]],
              let first = candidates.first,
              let content = first["content"] as? [String: Any],
              let parts = content["parts"] as? [[String: Any]],
              let text = parts.first?["text"] as? String else {
            throw LLMError.invalidResponse
        }

        // Parse the JSON response from the model
        guard let analysisData = text.data(using: .utf8) else {
            throw LLMError.invalidResponse
        }

        do {
            return try JSONDecoder().decode(FrameAnalysis.self, from: analysisData)
        } catch {
            // If JSON parsing fails, create a basic analysis from the text
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
