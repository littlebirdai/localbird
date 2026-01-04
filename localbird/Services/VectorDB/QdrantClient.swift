//
//  QdrantClient.swift
//  localbird
//

import Foundation
import CoreGraphics

/// Client for interacting with local Qdrant vector database
class QdrantClient {
    private let baseURL: String
    private let collectionName: String

    init(host: String = "localhost", port: Int = 6333, collection: String = "localbird_frames") {
        self.baseURL = "http://\(host):\(port)"
        self.collectionName = collection
    }

    // MARK: - Collection Management

    /// Check if Qdrant is running and accessible
    func healthCheck() async -> Bool {
        guard let url = URL(string: "\(baseURL)/healthz") else { return false }

        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    /// Create collection if it doesn't exist
    func ensureCollection(vectorSize: Int = 768) async throws {
        // Check if collection exists
        let checkURL = URL(string: "\(baseURL)/collections/\(collectionName)")!
        let (_, checkResponse) = try await URLSession.shared.data(from: checkURL)

        if (checkResponse as? HTTPURLResponse)?.statusCode == 200 {
            return // Collection exists
        }

        // Create collection
        let createURL = URL(string: "\(baseURL)/collections/\(collectionName)")!
        let body: [String: Any] = [
            "vectors": [
                "size": vectorSize,
                "distance": "Cosine"
            ]
        ]

        var request = URLRequest(url: createURL)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw VectorDBError.collectionCreationFailed
        }
    }

    /// Delete collection
    func deleteCollection() async throws {
        let url = URL(string: "\(baseURL)/collections/\(collectionName)")!

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw VectorDBError.deletionFailed
        }
    }

    // MARK: - Point Operations

    /// Insert a captured frame into the vector database
    func upsertFrame(_ frame: CapturedFrame) async throws {
        guard let embedding = frame.embedding else {
            throw VectorDBError.missingEmbedding
        }

        let url = URL(string: "\(baseURL)/collections/\(collectionName)/points")!

        let payload: [String: Any] = [
            "id": frame.id.uuidString,
            "timestamp": frame.timestamp.timeIntervalSince1970,
            "summary": frame.llmAnalysis?.summary ?? "",
            "activeApplication": frame.llmAnalysis?.activeApplication ?? "",
            "userActivity": frame.llmAnalysis?.userActivity ?? "",
            "visibleText": frame.llmAnalysis?.visibleText ?? [],
            "focusedApp": frame.accessibilityData?.focusedApp ?? "",
            "focusedWindow": frame.accessibilityData?.focusedWindow ?? "",
            // Capture metadata
            "captureTrigger": frame.captureMetadata?.trigger.rawValue ?? "timer",
            "appBundleId": frame.captureMetadata?.appBundleId ?? "",
            "appName": frame.captureMetadata?.appName ?? "",
            "windowTitle": frame.captureMetadata?.windowTitle ?? "",
            "windowBoundsX": frame.captureMetadata?.windowBounds?.origin.x ?? 0,
            "windowBoundsY": frame.captureMetadata?.windowBounds?.origin.y ?? 0,
            "windowBoundsWidth": frame.captureMetadata?.windowBounds?.width ?? 0,
            "windowBoundsHeight": frame.captureMetadata?.windowBounds?.height ?? 0
        ]

        let body: [String: Any] = [
            "points": [
                [
                    "id": frame.id.uuidString,
                    "vector": embedding.map { Double($0) },
                    "payload": payload
                ]
            ]
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw VectorDBError.insertionFailed
        }
    }

    /// Search for similar frames
    func search(embedding: [Float], limit: Int = 10, scoreThreshold: Float? = nil) async throws -> [SearchResult] {
        let url = URL(string: "\(baseURL)/collections/\(collectionName)/points/search")!

        var body: [String: Any] = [
            "vector": embedding.map { Double($0) },
            "limit": limit,
            "with_payload": true
        ]

        if let threshold = scoreThreshold {
            body["score_threshold"] = Double(threshold)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw VectorDBError.searchFailed
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let results = json["result"] as? [[String: Any]] else {
            throw VectorDBError.invalidResponse
        }

        return results.compactMap { result -> SearchResult? in
            guard let idString = result["id"] as? String,
                  let id = UUID(uuidString: idString),
                  let score = result["score"] as? Double,
                  let payload = result["payload"] as? [String: Any] else {
                return nil
            }

            return SearchResult(
                id: id,
                score: Float(score),
                timestamp: Date(timeIntervalSince1970: payload["timestamp"] as? Double ?? 0),
                summary: payload["summary"] as? String ?? "",
                activeApplication: payload["activeApplication"] as? String,
                userActivity: payload["userActivity"] as? String,
                captureTrigger: payload["captureTrigger"] as? String,
                appBundleId: payload["appBundleId"] as? String,
                appName: payload["appName"] as? String,
                windowTitle: payload["windowTitle"] as? String
            )
        }
    }

    /// Search with text query (requires embedding generation first)
    func searchByTimeRange(start: Date, end: Date, limit: Int = 100) async throws -> [SearchResult] {
        let url = URL(string: "\(baseURL)/collections/\(collectionName)/points/scroll")!

        let body: [String: Any] = [
            "filter": [
                "must": [
                    [
                        "key": "timestamp",
                        "range": [
                            "gte": start.timeIntervalSince1970,
                            "lte": end.timeIntervalSince1970
                        ]
                    ]
                ]
            ],
            "limit": limit,
            "with_payload": true
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw VectorDBError.searchFailed
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? [String: Any],
              let points = result["points"] as? [[String: Any]] else {
            throw VectorDBError.invalidResponse
        }

        return points.compactMap { point -> SearchResult? in
            guard let idString = point["id"] as? String,
                  let id = UUID(uuidString: idString),
                  let payload = point["payload"] as? [String: Any] else {
                return nil
            }

            return SearchResult(
                id: id,
                score: 1.0,
                timestamp: Date(timeIntervalSince1970: payload["timestamp"] as? Double ?? 0),
                summary: payload["summary"] as? String ?? "",
                activeApplication: payload["activeApplication"] as? String,
                userActivity: payload["userActivity"] as? String,
                captureTrigger: payload["captureTrigger"] as? String,
                appBundleId: payload["appBundleId"] as? String,
                appName: payload["appName"] as? String,
                windowTitle: payload["windowTitle"] as? String
            )
        }
    }

    /// Get a specific point by ID
    func getPoint(id: UUID) async throws -> SearchResult? {
        let url = URL(string: "\(baseURL)/collections/\(collectionName)/points/\(id.uuidString)")!

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return nil
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? [String: Any],
              let payload = result["payload"] as? [String: Any] else {
            return nil
        }

        return SearchResult(
            id: id,
            score: 1.0,
            timestamp: Date(timeIntervalSince1970: payload["timestamp"] as? Double ?? 0),
            summary: payload["summary"] as? String ?? "",
            activeApplication: payload["activeApplication"] as? String,
            userActivity: payload["userActivity"] as? String,
            captureTrigger: payload["captureTrigger"] as? String,
            appBundleId: payload["appBundleId"] as? String,
            appName: payload["appName"] as? String,
            windowTitle: payload["windowTitle"] as? String
        )
    }

    /// Delete a point by ID
    func deletePoint(id: UUID) async throws {
        let url = URL(string: "\(baseURL)/collections/\(collectionName)/points/delete")!

        let body: [String: Any] = [
            "points": [id.uuidString]
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw VectorDBError.deletionFailed
        }
    }

    /// Get collection info
    func getCollectionInfo() async throws -> CollectionInfo {
        let url = URL(string: "\(baseURL)/collections/\(collectionName)")!

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw VectorDBError.collectionNotFound
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? [String: Any] else {
            throw VectorDBError.invalidResponse
        }

        let pointsCount = result["points_count"] as? Int ?? 0
        let vectorsCount = result["vectors_count"] as? Int ?? 0

        return CollectionInfo(
            name: collectionName,
            pointsCount: pointsCount,
            vectorsCount: vectorsCount
        )
    }
}

// MARK: - Supporting Types

struct SearchResult: Identifiable {
    let id: UUID
    let score: Float
    let timestamp: Date
    let summary: String
    let activeApplication: String?
    let userActivity: String?
    // Capture metadata
    let captureTrigger: String?
    let appBundleId: String?
    let appName: String?
    let windowTitle: String?
}

struct CollectionInfo {
    let name: String
    let pointsCount: Int
    let vectorsCount: Int
}

enum VectorDBError: Error, LocalizedError {
    case connectionFailed
    case collectionNotFound
    case collectionCreationFailed
    case insertionFailed
    case searchFailed
    case deletionFailed
    case missingEmbedding
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .connectionFailed: return "Failed to connect to Qdrant"
        case .collectionNotFound: return "Collection not found"
        case .collectionCreationFailed: return "Failed to create collection"
        case .insertionFailed: return "Failed to insert point"
        case .searchFailed: return "Search failed"
        case .deletionFailed: return "Failed to delete"
        case .missingEmbedding: return "Frame missing embedding vector"
        case .invalidResponse: return "Invalid response from Qdrant"
        }
    }
}
