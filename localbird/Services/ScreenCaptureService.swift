//
//  ScreenCaptureService.swift
//  localbird
//

import Foundation
import Combine
import ScreenCaptureKit
import AppKit

/// Result of capturing a specific window
struct WindowCapture {
    let image: CGImage
    let windowTitle: String?
    let windowBounds: CGRect
    let appBundleId: String?
    let appName: String?
}

/// Service for continuous screen capture using ScreenCaptureKit
@MainActor
class ScreenCaptureService: NSObject, ObservableObject {
    @Published var isCapturing = false
    @Published var lastCaptureTime: Date?
    @Published var captureError: String?

    private var stream: SCStream?
    private var captureTimer: Timer?
    private var captureInterval: TimeInterval = 5.0 // seconds between captures

    /// Callback now includes optional capture metadata
    var onFrameCaptured: ((Data, Date, CaptureMetadata?) -> Void)?

    override init() {
        super.init()
    }

    func startCapture() async {
        guard !isCapturing else {
            NSLog("[ScreenCapture] Already capturing, skipping")
            return
        }

        NSLog("[ScreenCapture] Starting capture...")

        do {
            // Check for screen recording permission
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            NSLog("[ScreenCapture] Got shareable content, displays: %d, windows: %d", content.displays.count, content.windows.count)

            guard let display = content.displays.first else {
                captureError = "No display found"
                NSLog("[ScreenCapture] No display found!")
                return
            }

            NSLog("[ScreenCapture] Display: %dx%d", Int(display.width), Int(display.height))

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

            NSLog("[ScreenCapture] Stream started, starting timer with interval: %f", captureInterval)
            // Start periodic capture timer
            startCaptureTimer()

        } catch {
            captureError = "Failed to start capture: \(error.localizedDescription)"
            NSLog("[ScreenCapture] Error: %@", error.localizedDescription)
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
        NSLog("[ScreenCapture] Setting up timer...")
        captureTimer?.invalidate()
        captureTimer = Timer.scheduledTimer(withTimeInterval: captureInterval, repeats: true) { [weak self] _ in
            NSLog("[ScreenCapture] Timer fired!")
            Task { @MainActor in
                await self?.captureFrame(trigger: .timer)
            }
        }
        // Fire immediately too
        NSLog("[ScreenCapture] Timer created, firing immediately...")
        Task {
            await captureFrame(trigger: .timer)
        }
    }

    /// Capture frame - can be called with different triggers
    func captureFrame(trigger: CaptureTrigger = .timer) async {
        NSLog("[ScreenCapture] captureFrame() called, trigger: %@", trigger.rawValue)

        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

            guard let display = content.displays.first else {
                NSLog("[ScreenCapture] No display in captureFrame")
                return
            }

            // Get current frontmost app
            let frontmostApp = NSWorkspace.shared.frontmostApplication

            // Try to capture the frontmost app's window
            if let app = frontmostApp,
               let windowCapture = try await captureAppWindow(app: app, content: content, display: display) {

                if let imageData = imageToData(windowCapture.image) {
                    NSLog("[ScreenCapture] Window capture: %@ - %@, %d bytes",
                          windowCapture.appName ?? "unknown",
                          windowCapture.windowTitle ?? "untitled",
                          imageData.count)

                    let timestamp = Date()
                    lastCaptureTime = timestamp

                    let metadata = CaptureMetadata(
                        trigger: trigger,
                        appBundleId: windowCapture.appBundleId,
                        appName: windowCapture.appName,
                        windowTitle: windowCapture.windowTitle,
                        windowBounds: windowCapture.windowBounds
                    )

                    onFrameCaptured?(imageData, timestamp, metadata)
                }
            } else {
                // Fallback to full screen capture
                NSLog("[ScreenCapture] Falling back to full screen capture")
                try await captureFullScreen(display: display, trigger: trigger)
            }

        } catch {
            NSLog("[ScreenCapture] captureFrame error: %@", error.localizedDescription)
        }
    }

    /// Capture a specific app's frontmost window
    private func captureAppWindow(app: NSRunningApplication, content: SCShareableContent, display: SCDisplay) async throws -> WindowCapture? {
        // Find windows belonging to this app
        let appWindows = content.windows.filter { window in
            window.owningApplication?.processID == app.processIdentifier &&
            window.isOnScreen &&
            window.frame.width > 100 && window.frame.height > 100 // Filter tiny windows
        }.sorted { $0.windowLayer < $1.windowLayer } // Lower layer = more frontmost

        guard let frontmostWindow = appWindows.first else {
            NSLog("[ScreenCapture] No visible windows for app: %@", app.localizedName ?? "unknown")
            return nil
        }

        NSLog("[ScreenCapture] Capturing window: %@ (%dx%d)",
              frontmostWindow.title ?? "untitled",
              Int(frontmostWindow.frame.width),
              Int(frontmostWindow.frame.height))

        // Create filter for just this window
        let filter = SCContentFilter(display: display, including: [frontmostWindow])

        let config = SCStreamConfiguration()
        config.width = Int(frontmostWindow.frame.width)
        config.height = Int(frontmostWindow.frame.height)
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.captureResolution = .best

        let image = try await SCScreenshotManager.captureImage(
            contentFilter: filter,
            configuration: config
        )

        return WindowCapture(
            image: image,
            windowTitle: frontmostWindow.title,
            windowBounds: frontmostWindow.frame,
            appBundleId: app.bundleIdentifier,
            appName: app.localizedName
        )
    }

    /// Fallback full screen capture
    private func captureFullScreen(display: SCDisplay, trigger: CaptureTrigger) async throws {
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = Int(display.width)
        config.height = Int(display.height)
        config.pixelFormat = kCVPixelFormatType_32BGRA

        NSLog("[ScreenCapture] Capturing full screen...")
        let image = try await SCScreenshotManager.captureImage(
            contentFilter: filter,
            configuration: config
        )

        if let imageData = imageToData(image) {
            NSLog("[ScreenCapture] Full screen capture: %d bytes", imageData.count)
            let timestamp = Date()
            lastCaptureTime = timestamp

            let metadata = CaptureMetadata(
                trigger: trigger,
                appBundleId: nil,
                appName: "Full Screen",
                windowTitle: nil,
                windowBounds: CGRect(x: 0, y: 0, width: display.width, height: display.height)
            )

            onFrameCaptured?(imageData, timestamp, metadata)
        }
    }

    private func imageToData(_ image: CGImage) -> Data? {
        // Downsample to max 1440px width to save storage (~100-200KB vs 500KB-1MB)
        let maxWidth: CGFloat = 1440
        let scaledImage: CGImage

        if CGFloat(image.width) > maxWidth {
            let scale = maxWidth / CGFloat(image.width)
            let newWidth = Int(maxWidth)
            let newHeight = Int(CGFloat(image.height) * scale)

            guard let context = CGContext(
                data: nil,
                width: newWidth,
                height: newHeight,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else {
                return nil
            }

            context.interpolationQuality = .high
            context.draw(image, in: CGRect(x: 0, y: 0, width: newWidth, height: newHeight))

            guard let resized = context.makeImage() else { return nil }
            scaledImage = resized
        } else {
            scaledImage = image
        }

        let bitmapRep = NSBitmapImageRep(cgImage: scaledImage)
        return bitmapRep.representation(using: .jpeg, properties: [.compressionFactor: 0.7])
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
