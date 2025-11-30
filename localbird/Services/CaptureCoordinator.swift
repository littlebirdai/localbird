//
//  CaptureCoordinator.swift
//  localbird
//

import Foundation
import Combine
import SwiftUI

/// Orchestrates the capture pipeline: screenshot -> accessibility -> LLM -> vector DB
@MainActor
class CaptureCoordinator: ObservableObject {
    @Published var isRunning = false
    @Published var processedFrames = 0
    @Published var lastError: String?
    @Published var lastProcessedTime: Date?

    private let screenCaptureService: ScreenCaptureService
    private let accessibilityService: AccessibilityService
    private let llmService: LLMService
    private let qdrantClient: QdrantClient

    private var imageStorageURL: URL?

    init() {
        self.screenCaptureService = ScreenCaptureService()
        self.accessibilityService = AccessibilityService()
        self.llmService = LLMService()
        self.qdrantClient = QdrantClient()

        setupImageStorage()
        setupCallbacks()
    }

    // MARK: - Configuration

    func configure(settings: AppSettings) {
        // Configure LLM providers
        if !settings.geminiAPIKey.isEmpty {
            llmService.configure(provider: .gemini, apiKey: settings.geminiAPIKey)
        }
        if !settings.claudeAPIKey.isEmpty {
            llmService.configure(provider: .claude, apiKey: settings.claudeAPIKey)
        }
        if !settings.openaiAPIKey.isEmpty {
            llmService.configure(provider: .openai, apiKey: settings.openaiAPIKey)
        }

        // Set active providers
        if let visionProvider = LLMProviderType(rawValue: settings.activeVisionProvider) {
            llmService.activeVisionProvider = visionProvider
        }

        // Configure capture interval
        screenCaptureService.setCaptureInterval(settings.captureInterval)
    }

    // MARK: - Capture Control

    func startCapture() async {
        guard !isRunning else { return }

        // Ensure Qdrant collection exists
        do {
            try await qdrantClient.ensureCollection()
        } catch {
            lastError = "Failed to initialize vector DB: \(error.localizedDescription)"
            return
        }

        await screenCaptureService.startCapture()
        isRunning = true
        lastError = nil
    }

    func stopCapture() {
        screenCaptureService.stopCapture()
        isRunning = false
    }

    // MARK: - Private Methods

    private func setupImageStorage() {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let storageURL = appSupport.appendingPathComponent("Localbird/frames", isDirectory: true)

        try? fileManager.createDirectory(at: storageURL, withIntermediateDirectories: true)
        imageStorageURL = storageURL
    }

    private func setupCallbacks() {
        screenCaptureService.onFrameCaptured = { [weak self] imageData, timestamp in
            Task { @MainActor in
                await self?.processFrame(imageData: imageData, timestamp: timestamp)
            }
        }
    }

    private func processFrame(imageData: Data, timestamp: Date) async {
        do {
            // 1. Capture accessibility snapshot
            let accessibilitySnapshot = accessibilityService.captureSnapshot()

            // 2. Analyze with LLM
            let analysis = try await llmService.analyzeImage(
                imageData: imageData,
                prompt: buildAnalysisPrompt(accessibility: accessibilitySnapshot)
            )

            // 3. Create searchable text for embedding
            let searchableText = buildSearchableText(analysis: analysis, accessibility: accessibilitySnapshot)

            // 4. Generate embedding
            let embedding = try await llmService.generateEmbedding(text: searchableText)

            // 5. Create frame object
            var frame = CapturedFrame(
                timestamp: timestamp,
                imageData: imageData,
                accessibilityData: accessibilitySnapshot,
                llmAnalysis: analysis,
                embedding: embedding
            )

            // 6. Save image to disk
            saveImageToDisk(frame: &frame)

            // 7. Store in vector DB
            try await qdrantClient.upsertFrame(frame)

            // Update stats
            processedFrames += 1
            lastProcessedTime = timestamp
            lastError = nil

            print("Processed frame: \(analysis.summary)")

        } catch {
            lastError = error.localizedDescription
            print("Frame processing error: \(error)")
        }
    }

    private func buildAnalysisPrompt(accessibility: AccessibilitySnapshot?) -> String {
        var prompt = "Analyze this screenshot."

        if let acc = accessibility {
            if let app = acc.focusedApp {
                prompt += " The active application is \(app)."
            }
            if let window = acc.focusedWindow {
                prompt += " The window title is '\(window)'."
            }
        }

        return prompt
    }

    private func buildSearchableText(analysis: FrameAnalysis, accessibility: AccessibilitySnapshot?) -> String {
        var parts: [String] = []

        parts.append(analysis.summary)

        if let app = analysis.activeApplication {
            parts.append("Application: \(app)")
        }

        if let activity = analysis.userActivity {
            parts.append("Activity: \(activity)")
        }

        parts.append(contentsOf: analysis.visibleText)

        if let acc = accessibility {
            if let app = acc.focusedApp {
                parts.append("Focused app: \(app)")
            }
            if let window = acc.focusedWindow {
                parts.append("Window: \(window)")
            }
        }

        return parts.joined(separator: " | ")
    }

    private func saveImageToDisk(frame: inout CapturedFrame) {
        guard let storageURL = imageStorageURL else { return }

        let filename = "\(frame.id.uuidString).jpg"
        let fileURL = storageURL.appendingPathComponent(filename)

        try? frame.imageData.write(to: fileURL)
    }
}

// MARK: - Settings Helper

struct AppSettings {
    let geminiAPIKey: String
    let claudeAPIKey: String
    let openaiAPIKey: String
    let captureInterval: TimeInterval
    let activeVisionProvider: String
    let qdrantHost: String
    let qdrantPort: Int

    static func fromUserDefaults() -> AppSettings {
        AppSettings(
            geminiAPIKey: UserDefaults.standard.string(forKey: "geminiAPIKey") ?? "",
            claudeAPIKey: UserDefaults.standard.string(forKey: "claudeAPIKey") ?? "",
            openaiAPIKey: UserDefaults.standard.string(forKey: "openaiAPIKey") ?? "",
            captureInterval: UserDefaults.standard.double(forKey: "captureInterval").nonZero ?? 5.0,
            activeVisionProvider: UserDefaults.standard.string(forKey: "activeVisionProvider") ?? "gemini",
            qdrantHost: UserDefaults.standard.string(forKey: "qdrantHost") ?? "localhost",
            qdrantPort: UserDefaults.standard.integer(forKey: "qdrantPort").nonZero ?? 6333
        )
    }
}

private extension Double {
    var nonZero: Double? {
        self > 0 ? self : nil
    }
}

private extension Int {
    var nonZero: Int? {
        self > 0 ? self : nil
    }
}
