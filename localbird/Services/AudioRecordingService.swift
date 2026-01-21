//
//  AudioRecordingService.swift
//  localbird
//
//  Audio recording service using AVAudioEngine for microphone capture
//

import Foundation
import AVFoundation
import Combine

/// Service for recording audio from the microphone
@MainActor
class AudioRecordingService: ObservableObject {
    @Published var isRecording = false
    @Published var currentDuration: TimeInterval = 0
    @Published var audioLevel: Float = 0

    private var audioEngine: AVAudioEngine?
    private var audioFile: AVAudioFile?
    private var recordingStartTime: Date?
    private var durationTimer: Timer?

    // Callback for audio buffer (for real-time transcription)
    var onAudioBuffer: ((AVAudioPCMBuffer, AVAudioTime) -> Void)?

    // Storage directory for audio files
    private var storageURL: URL {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let storageURL = appSupport.appendingPathComponent("Localbird/meetings", isDirectory: true)
        try? fileManager.createDirectory(at: storageURL, withIntermediateDirectories: true)
        return storageURL
    }

    init() {
        NSLog("[AudioRecording] Service initialized")
    }

    /// Request microphone permission
    func requestMicrophonePermission() async -> Bool {
        return await withCheckedContinuation { continuation in
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                NSLog("[AudioRecording] Microphone permission: %@", granted ? "granted" : "denied")
                continuation.resume(returning: granted)
            }
        }
    }

    /// Check if microphone permission is granted
    func hasMicrophonePermission() -> Bool {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        return status == .authorized
    }

    /// Start recording audio
    /// - Parameter meetingId: UUID for the meeting (used for filename)
    /// - Returns: Path to the audio file being recorded
    func startRecording(meetingId: UUID) throws -> String {
        guard !isRecording else {
            throw AudioRecordingError.alreadyRecording
        }

        guard hasMicrophonePermission() else {
            throw AudioRecordingError.noMicrophonePermission
        }

        let audioFilePath = storageURL.appendingPathComponent("\(meetingId.uuidString).m4a")

        // Setup audio engine
        audioEngine = AVAudioEngine()
        guard let audioEngine = audioEngine else {
            throw AudioRecordingError.engineSetupFailed
        }

        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)

        // Check for valid format
        guard inputFormat.sampleRate > 0 && inputFormat.channelCount > 0 else {
            throw AudioRecordingError.invalidAudioFormat
        }

        NSLog("[AudioRecording] Input format: %f Hz, %d channels",
              inputFormat.sampleRate, inputFormat.channelCount)

        // Create audio file for recording
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: inputFormat.sampleRate,
            AVNumberOfChannelsKey: inputFormat.channelCount,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioFile = try AVAudioFile(forWriting: audioFilePath, settings: settings)
        } catch {
            NSLog("[AudioRecording] Failed to create audio file: %@", error.localizedDescription)
            throw AudioRecordingError.fileCreationFailed(error)
        }

        // Install tap to capture audio
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, time in
            guard let self = self else { return }

            // Write to file
            do {
                try self.audioFile?.write(from: buffer)
            } catch {
                NSLog("[AudioRecording] Write error: %@", error.localizedDescription)
            }

            // Calculate audio level for UI feedback
            let level = self.calculateAudioLevel(buffer: buffer)
            DispatchQueue.main.async {
                self.audioLevel = level
            }

            // Forward buffer for real-time transcription
            // Note: We call this synchronously because the buffer is only valid during this callback
            // The TranscriptionService.processAudioBuffer copies the data it needs internally
            self.onAudioBuffer?(buffer, time)
        }

        // Start the engine
        do {
            try audioEngine.start()
        } catch {
            NSLog("[AudioRecording] Failed to start engine: %@", error.localizedDescription)
            inputNode.removeTap(onBus: 0)
            throw AudioRecordingError.engineStartFailed(error)
        }

        recordingStartTime = Date()
        isRecording = true

        // Start duration timer
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let start = self.recordingStartTime else { return }
            DispatchQueue.main.async {
                self.currentDuration = Date().timeIntervalSince(start)
            }
        }

        NSLog("[AudioRecording] Recording started: %@", audioFilePath.path)
        return audioFilePath.path
    }

    /// Stop recording audio
    /// - Returns: Path to the recorded audio file
    func stopRecording() -> String? {
        guard isRecording else { return nil }

        durationTimer?.invalidate()
        durationTimer = nil

        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil

        let filePath = audioFile?.url.path
        audioFile = nil

        isRecording = false
        recordingStartTime = nil
        currentDuration = 0
        audioLevel = 0

        NSLog("[AudioRecording] Recording stopped: %@", filePath ?? "nil")
        return filePath
    }

    /// Calculate audio level from buffer (for visualization)
    private func calculateAudioLevel(buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData else { return 0 }

        let channelDataValue = channelData.pointee
        let frameLength = UInt(buffer.frameLength)

        var sum: Float = 0
        for i in 0..<Int(frameLength) {
            sum += abs(channelDataValue[i])
        }

        let average = sum / Float(frameLength)
        // Convert to dB-like scale (0-1 range)
        let level = min(1.0, max(0.0, average * 10))
        return level
    }

    /// Get the format for transcription (16kHz mono for Whisper)
    func getTranscriptionFormat() -> AVAudioFormat? {
        return AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1)
    }

    /// Delete audio file for a meeting
    func deleteAudioFile(meetingId: UUID) {
        let filePath = storageURL.appendingPathComponent("\(meetingId.uuidString).m4a")
        try? FileManager.default.removeItem(at: filePath)
        NSLog("[AudioRecording] Deleted audio file: %@", filePath.path)
    }
}

// MARK: - Errors

enum AudioRecordingError: Error, LocalizedError {
    case alreadyRecording
    case noMicrophonePermission
    case engineSetupFailed
    case engineStartFailed(Error)
    case invalidAudioFormat
    case fileCreationFailed(Error)

    var errorDescription: String? {
        switch self {
        case .alreadyRecording:
            return "Already recording"
        case .noMicrophonePermission:
            return "Microphone permission not granted"
        case .engineSetupFailed:
            return "Failed to setup audio engine"
        case .engineStartFailed(let error):
            return "Failed to start audio engine: \(error.localizedDescription)"
        case .invalidAudioFormat:
            return "Invalid audio format"
        case .fileCreationFailed(let error):
            return "Failed to create audio file: \(error.localizedDescription)"
        }
    }
}
