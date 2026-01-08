//
//  localbirdApp.swift
//  localbird
//
//  Headless capture service controlled via HTTP
//

import Foundation
import AppKit

@main
struct LocalbirdService {
    static func main() {
        let app = NSApplication.shared
        let delegate = ServiceDelegate()
        app.delegate = delegate

        // Parse command line arguments
        let args = CommandLine.arguments
        var port: UInt16 = 9111

        if let portIndex = args.firstIndex(of: "--port"), portIndex + 1 < args.count {
            port = UInt16(args[portIndex + 1]) ?? 9111
        }

        delegate.port = port

        // Run the app (required for ScreenCaptureKit and other AppKit features)
        app.run()
    }
}

class ServiceDelegate: NSObject, NSApplicationDelegate {
    var port: UInt16 = 9111
    private var httpServer: HTTPServer?
    private var coordinator: CaptureCoordinator?
    private var isConfigured = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSLog("[Localbird] Service starting on port %d", port)

        // Initialize coordinator (but don't start capture until configured)
        coordinator = CaptureCoordinator()

        // Start HTTP server
        startHTTPServer()

        NSLog("[Localbird] Service ready, waiting for configuration...")
    }

    func applicationWillTerminate(_ notification: Notification) {
        NSLog("[Localbird] Service shutting down")
        httpServer?.stop()
        coordinator?.stopCapture()
    }

    private func startHTTPServer() {
        httpServer = HTTPServer(port: port)

        httpServer?.getStatus = { [weak self] in
            guard let coordinator = self?.coordinator else {
                return ServiceStatus(isRunning: false, frameCount: 0, lastCaptureTime: nil, lastError: "Not initialized")
            }

            return ServiceStatus(
                isRunning: coordinator.isRunning,
                frameCount: coordinator.processedFrames,
                lastCaptureTime: coordinator.lastProcessedTime,
                lastError: coordinator.lastError
            )
        }

        httpServer?.onConfigure = { [weak self] config in
            self?.handleConfigure(config)
        }

        httpServer?.onStartCapture = { [weak self] in
            Task { @MainActor in
                await self?.coordinator?.startCapture()
                NSLog("[Localbird] Capture started via HTTP")
            }
        }

        httpServer?.onStopCapture = { [weak self] in
            Task { @MainActor in
                self?.coordinator?.stopCapture()
                NSLog("[Localbird] Capture stopped via HTTP")
            }
        }

        do {
            try httpServer?.start()
        } catch {
            NSLog("[Localbird] Failed to start HTTP server: %@", error.localizedDescription)
        }
    }

    private func handleConfigure(_ config: ServiceConfig) {
        NSLog("[Localbird] Received configuration")

        let settings = AppSettings(
            geminiAPIKey: config.geminiAPIKey ?? "",
            claudeAPIKey: config.claudeAPIKey ?? "",
            openaiAPIKey: config.openaiAPIKey ?? "",
            captureInterval: config.captureInterval ?? 5.0,
            enableFullScreenCaptures: config.enableFullScreenCaptures ?? true,
            fullScreenCaptureInterval: config.fullScreenCaptureInterval ?? 1.0,
            activeVisionProvider: config.activeVisionProvider ?? "gemini",
            qdrantHost: config.qdrantHost ?? "localhost",
            qdrantPort: config.qdrantPort ?? 6333
        )

        Task { @MainActor in
            coordinator?.configure(settings: settings)
            isConfigured = true
            NSLog("[Localbird] Configuration applied")
        }
    }
}
