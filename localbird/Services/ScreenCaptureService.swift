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
        guard !isCapturing else {
            NSLog("[ScreenCapture] Already capturing, skipping")
            return
        }

        NSLog("[ScreenCapture] Starting capture...")

        do {
            // Check for screen recording permission
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            NSLog("[ScreenCapture] Got shareable content, displays: %d", content.displays.count)

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
                await self?.captureFrame()
            }
        }
        // Fire immediately too
        NSLog("[ScreenCapture] Timer created, firing immediately...")
        Task {
            await captureFrame()
        }
    }

    private func captureFrame() async {
        NSLog("[ScreenCapture] captureFrame() called")
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

            guard let display = content.displays.first else {
                NSLog("[ScreenCapture] No display in captureFrame")
                return
            }

            let filter = SCContentFilter(display: display, excludingWindows: [])
            let config = SCStreamConfiguration()
            config.width = Int(display.width)
            config.height = Int(display.height)
            config.pixelFormat = kCVPixelFormatType_32BGRA

            NSLog("[ScreenCapture] Capturing screenshot...")
            let image = try await SCScreenshotManager.captureImage(
                contentFilter: filter,
                configuration: config
            )
            NSLog("[ScreenCapture] Got image: %dx%d", image.width, image.height)

            if let imageData = imageToData(image) {
                NSLog("[ScreenCapture] Converted to JPEG: %d bytes", imageData.count)
                let timestamp = Date()
                lastCaptureTime = timestamp
                if let callback = onFrameCaptured {
                    NSLog("[ScreenCapture] Calling callback...")
                    callback(imageData, timestamp)
                } else {
                    NSLog("[ScreenCapture] WARNING: No callback set!")
                }
            } else {
                NSLog("[ScreenCapture] Failed to convert image to data")
            }

        } catch {
            NSLog("[ScreenCapture] captureFrame error: %@", error.localizedDescription)
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
