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
    private var meetingCoordinator: MeetingCoordinator?
    private var isConfigured = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSLog("[Localbird] Service starting on port %d", port)

        // Initialize coordinator (but don't start capture until configured)
        coordinator = CaptureCoordinator()

        // Initialize meeting coordinator with shared LLM service
        if let coordinator = coordinator {
            meetingCoordinator = MeetingCoordinator(llmService: coordinator.llmService)
            meetingCoordinator?.configure(qdrantClient: coordinator.qdrantClient)
        }

        // Start HTTP server
        startHTTPServer()

        NSLog("[Localbird] Service ready, waiting for configuration...")
    }

    func applicationWillTerminate(_ notification: Notification) {
        NSLog("[Localbird] Service shutting down")
        httpServer?.stop()
        coordinator?.stopCapture()
        meetingCoordinator?.cancelMeeting()
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

        // Meeting callbacks - called from MainActor context in HTTPServer
        httpServer?.onStartMeeting = { [weak self] title in
            NSLog("[localbirdApp] onStartMeeting callback with title='%@'", title)
            guard let mc = self?.meetingCoordinator else {
                throw MeetingError.notRecording
            }
            try await mc.startMeeting(title: title)
            guard let meeting = mc.currentMeeting else {
                throw MeetingError.notRecording
            }
            NSLog("[localbirdApp] onStartMeeting returning meeting title='%@'", meeting.title)
            return meeting
        }

        httpServer?.onStopMeeting = { [weak self] in
            NSLog("[localbirdApp] onStopMeeting callback entered")
            guard let mc = self?.meetingCoordinator else {
                throw MeetingError.notRecording
            }
            return try await mc.stopMeeting()
        }

        httpServer?.onCancelMeeting = { [weak self] in
            self?.meetingCoordinator?.cancelMeeting()
        }

        httpServer?.getMeetingStatus = { [weak self] in
            guard let meetingCoordinator = self?.meetingCoordinator else {
                return MeetingStatus(state: .idle, currentMeetingId: nil, duration: 0, liveTranscript: "", error: "Not initialized")
            }
            return meetingCoordinator.getStatus()
        }

        httpServer?.getMeetings = { [weak self] in
            return self?.meetingCoordinator?.recordings ?? []
        }

        httpServer?.getMeeting = { [weak self] id in
            return self?.meetingCoordinator?.getMeeting(id: id)
        }

        httpServer?.deleteMeeting = { [weak self] id in
            self?.meetingCoordinator?.deleteMeeting(id: id)
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
