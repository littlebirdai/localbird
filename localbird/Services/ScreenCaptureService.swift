//
//  ScreenCaptureService.swift
//  localbird
//

import Foundation
import Combine
import ScreenCaptureKit
import AppKit

/// Service for continuous screen capture using ScreenCaptureKit
@MainActor
class ScreenCaptureService: NSObject, ObservableObject {
    @Published var isCapturing = false
    @Published var lastCaptureTime: Date?
    @Published var captureError: String?

    private var stream: SCStream?
    private var captureTimer: Timer?
    private var captureInterval: TimeInterval = 5.0 // seconds between captures

    var onFrameCaptured: ((Data, Date) -> Void)?

    override init() {
        super.init()
    }

    func startCapture() async {
        guard !isCapturing else { return }

        do {
            // Check for screen recording permission
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

            guard let display = content.displays.first else {
                captureError = "No display found"
                return
            }

            let filter = SCContentFilter(display: display, excludingWindows: [])
            let config = SCStreamConfiguration()
            config.width = Int(display.width)
            config.height = Int(display.height)
            config.pixelFormat = kCVPixelFormatType_32BGRA
            config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps max for the stream

            stream = SCStream(filter: filter, configuration: config, delegate: self)

            try stream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: .main)
            try await stream?.startCapture()

            isCapturing = true
            captureError = nil

            // Start periodic capture timer
            startCaptureTimer()

        } catch {
            captureError = "Failed to start capture: \(error.localizedDescription)"
            print("Screen capture error: \(error)")
        }
    }

    func stopCapture() {
        captureTimer?.invalidate()
        captureTimer = nil

        Task {
            try? await stream?.stopCapture()
            stream = nil
        }

        isCapturing = false
    }

    func setCaptureInterval(_ interval: TimeInterval) {
        captureInterval = interval
        if isCapturing {
            startCaptureTimer()
        }
    }

    private func startCaptureTimer() {
        captureTimer?.invalidate()
        captureTimer = Timer.scheduledTimer(withTimeInterval: captureInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.captureFrame()
            }
        }
    }

    private func captureFrame() async {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

            guard let display = content.displays.first else { return }

            let filter = SCContentFilter(display: display, excludingWindows: [])
            let config = SCStreamConfiguration()
            config.width = Int(display.width)
            config.height = Int(display.height)
            config.pixelFormat = kCVPixelFormatType_32BGRA

            let image = try await SCScreenshotManager.captureImage(
                contentFilter: filter,
                configuration: config
            )

            if let imageData = imageToData(image) {
                let timestamp = Date()
                lastCaptureTime = timestamp
                onFrameCaptured?(imageData, timestamp)
            }

        } catch {
            print("Frame capture error: \(error)")
        }
    }

    private func imageToData(_ image: CGImage) -> Data? {
        let bitmapRep = NSBitmapImageRep(cgImage: image)
        return bitmapRep.representation(using: .jpeg, properties: [.compressionFactor: 0.8])
    }

    /// Request screen recording permission
    static func requestPermission() async -> Bool {
        do {
            // This will trigger the permission dialog if not already granted
            _ = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            return true
        } catch {
            print("Permission error: \(error)")
            return false
        }
    }
}

// MARK: - SCStreamDelegate
extension ScreenCaptureService: SCStreamDelegate {
    nonisolated func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor in
            self.captureError = "Stream stopped: \(error.localizedDescription)"
            self.isCapturing = false
        }
    }
}

// MARK: - SCStreamOutput
extension ScreenCaptureService: SCStreamOutput {
    nonisolated func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        // We're using timer-based capture instead of stream output for more control
        // This delegate is required but we don't need to process every frame
    }
}
