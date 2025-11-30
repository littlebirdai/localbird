//
//  SearchService.swift
//  localbird
//

import Foundation
import Combine

/// Service for semantic search across captured frames
@MainActor
class SearchService: ObservableObject {
    @Published var isSearching = false
    @Published var results: [SearchResult] = []
    @Published var error: String?

    private let llmService: LLMService
    private let qdrantClient: QdrantClient

    init(llmService: LLMService, qdrantClient: QdrantClient) {
        self.llmService = llmService
        self.qdrantClient = qdrantClient
    }

    /// Search for frames matching the query
    func search(query: String, limit: Int = 10) async {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            results = []
            return
        }

        isSearching = true
        error = nil

        do {
            // Generate embedding for query
            let embedding = try await llmService.generateEmbedding(text: query)

            // Search Qdrant
            let searchResults = try await qdrantClient.search(
                embedding: embedding,
                limit: limit,
                scoreThreshold: 0.3 // Filter out low relevance results
            )

            results = searchResults
            NSLog("[Search] Found %d results for: %@", results.count, query)

        } catch {
            self.error = error.localizedDescription
            results = []
            NSLog("[Search] Error: %@", error.localizedDescription)
        }

        isSearching = false
    }

    /// Get recent frames (last N)
    func getRecent(limit: Int = 20) async {
        isSearching = true
        error = nil

        do {
            let now = Date()
            let dayAgo = now.addingTimeInterval(-24 * 60 * 60)

            results = try await qdrantClient.searchByTimeRange(
                start: dayAgo,
                end: now,
                limit: limit
            ).sorted { $0.timestamp > $1.timestamp }

        } catch {
            self.error = error.localizedDescription
            results = []
        }

        isSearching = false
    }

    /// Get the image path for a result
    func imagePath(for result: SearchResult) -> URL? {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let imagePath = appSupport
            .appendingPathComponent("Localbird/frames")
            .appendingPathComponent("\(result.id.uuidString).jpg")

        return fileManager.fileExists(atPath: imagePath.path) ? imagePath : nil
    }
}
