//
//  TranscriptionService.swift
//  localbird
//
//  Speech-to-text transcription service using WhisperKit
//

import Foundation
import AVFoundation
import Combine
#if canImport(WhisperKit)
import WhisperKit
#endif

/// Service for transcribing audio to text using WhisperKit
@MainActor
class TranscriptionService: ObservableObject {
    @Published var isModelLoaded = false
    @Published var isTranscribing = false
    @Published var currentTranscript = ""
    @Published var segments: [TranscriptSegment] = []
    @Published var modelLoadProgress: Float = 0
    @Published var lastError: String?

    #if canImport(WhisperKit)
    private var realtimeWhisper: WhisperKit?  // Small model for live preview
    private var finalWhisper: WhisperKit?      // Large model for accurate final transcript
    #endif

    private let realtimeModelSize = "small"
    private let finalModelSize = "large-v3"

    // Audio buffer for streaming transcription (accessed from audio thread with lock protection)
    private nonisolated(unsafe) var audioBuffer: [Float] = []
    private let bufferLock = NSLock()

    // Minimum audio length for transcription (in samples at 16kHz)
    private let minSamplesForTranscription = 16000 * 2 // 2 seconds

    private var isFinalModelLoaded = false

    // Callback for live transcript updates
    var onTranscriptUpdate: ((String, [TranscriptSegment]) -> Void)?

    init() {
        NSLog("[Transcription] Service initialized")
    }

    /// Load the realtime Whisper model (small, for live preview)
    /// - Parameter modelSize: Size of model to load (overrides default for testing)
    func loadModel(modelSize: String? = nil) async throws {
        let size = modelSize ?? realtimeModelSize
        #if canImport(WhisperKit)
        NSLog("[Transcription] Loading realtime WhisperKit model: %@", size)

        do {
            // WhisperKit automatically downloads and caches models
            realtimeWhisper = try await WhisperKit(
                model: "openai_whisper-\(size)",
                verbose: true,
                logLevel: .info,
                prewarm: true,
                load: true,
                download: true
            )

            isModelLoaded = true
            NSLog("[Transcription] Realtime model loaded successfully")
        } catch {
            NSLog("[Transcription] Failed to load realtime model: %@", error.localizedDescription)
            lastError = error.localizedDescription
            throw error
        }
        #else
        NSLog("[Transcription] WhisperKit not available - using mock transcription")
        // Simulate model loading for testing without WhisperKit
        try await Task.sleep(nanoseconds: 500_000_000)
        isModelLoaded = true
        #endif
    }

    /// Load the final Whisper model (large-v3, for accurate transcription)
    private func loadFinalModelIfNeeded() async throws {
        guard !isFinalModelLoaded else { return }

        #if canImport(WhisperKit)
        NSLog("[Transcription] Loading final WhisperKit model: %@", finalModelSize)

        do {
            finalWhisper = try await WhisperKit(
                model: "openai_whisper-\(finalModelSize)",
                verbose: true,
                logLevel: .info,
                prewarm: true,
                load: true,
                download: true
            )

            isFinalModelLoaded = true
            NSLog("[Transcription] Final model (large-v3) loaded successfully")
        } catch {
            NSLog("[Transcription] Failed to load final model: %@", error.localizedDescription)
            lastError = error.localizedDescription
            throw error
        }
        #else
        isFinalModelLoaded = true
        #endif
    }

    /// Transcribe an audio file using the large-v3 model for accuracy
    /// - Parameter audioPath: Path to the audio file
    /// - Returns: Array of transcript segments with timestamps
    func transcribeFile(audioPath: String) async throws -> [TranscriptSegment] {
        guard isModelLoaded else {
            throw TranscriptionError.modelNotLoaded
        }

        isTranscribing = true
        defer { isTranscribing = false }

        NSLog("[Transcription] Transcribing file with large-v3: %@", audioPath)

        #if canImport(WhisperKit)
        // Load the final model on demand (first transcription will download ~1.5GB)
        try await loadFinalModelIfNeeded()

        guard let whisper = finalWhisper else {
            throw TranscriptionError.modelNotLoaded
        }

        do {
            let results = try await whisper.transcribe(audioPath: audioPath)

            var transcriptSegments: [TranscriptSegment] = []
            for result in results {
                for segment in result.segments {
                    let transcriptSegment = TranscriptSegment(
                        startTime: TimeInterval(segment.start),
                        endTime: TimeInterval(segment.end),
                        text: segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                    transcriptSegments.append(transcriptSegment)
                }
            }

            segments = transcriptSegments
            currentTranscript = transcriptSegments.map { $0.text }.joined(separator: " ")

            NSLog("[Transcription] Transcription complete: %d segments", segments.count)
            return transcriptSegments
        } catch {
            NSLog("[Transcription] Transcription failed: %@", error.localizedDescription)
            lastError = error.localizedDescription
            throw error
        }
        #else
        // Mock transcription for testing without WhisperKit
        try await Task.sleep(nanoseconds: 1_000_000_000)
        let mockSegments = [
            TranscriptSegment(startTime: 0, endTime: 5, text: "This is a mock transcription for testing."),
            TranscriptSegment(startTime: 5, endTime: 10, text: "WhisperKit is not available in this build.")
        ]
        segments = mockSegments
        currentTranscript = mockSegments.map { $0.text }.joined(separator: " ")
        return mockSegments
        #endif
    }

    /// Process audio buffer for real-time transcription
    /// - Parameter buffer: Audio buffer from AVAudioEngine
    /// Note: This is called from the audio thread, so we copy data first then dispatch to MainActor
    nonisolated func processAudioBuffer(_ buffer: AVAudioPCMBuffer, time: AVAudioTime) {
        // Convert buffer to float array at 16kHz mono - this copies the data
        guard let convertedSamples = convertBufferToFloatArray(buffer) else { return }

        bufferLock.lock()
        audioBuffer.append(contentsOf: convertedSamples)
        // Limit buffer size to prevent memory issues
        if audioBuffer.count > 16000 * 60 { // Max 60 seconds of audio
            audioBuffer = Array(audioBuffer.suffix(16000 * 30)) // Keep last 30 seconds
        }

        let shouldTranscribe = audioBuffer.count >= minSamplesForTranscription
        var samplesToProcess: [Float] = []
        if shouldTranscribe {
            samplesToProcess = audioBuffer
            // Keep last 0.5 seconds for context overlap
            let overlapSamples = 8000
            if audioBuffer.count > overlapSamples {
                audioBuffer = Array(audioBuffer.suffix(overlapSamples))
            } else {
                audioBuffer = []
            }
        }
        bufferLock.unlock()

        if shouldTranscribe {
            Task { @MainActor [weak self] in
                await self?.transcribeBuffer(samples: samplesToProcess)
            }
        }
    }

    /// Transcribe buffered audio samples using the small model for speed
    private func transcribeBuffer(samples: [Float]) async {
        #if canImport(WhisperKit)
        guard let whisper = realtimeWhisper else { return }

        do {
            let results = try await whisper.transcribe(audioArray: samples)

            for result in results {
                let text = result.text
                if !text.isEmpty {
                    let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmedText.isEmpty {
                        // Add to current transcript
                        if !currentTranscript.isEmpty {
                            currentTranscript += " "
                        }
                        currentTranscript += trimmedText

                        // Create segment (approximate timing)
                        let segment = TranscriptSegment(
                            startTime: Double(segments.count) * 2.0,
                            endTime: Double(segments.count + 1) * 2.0,
                            text: trimmedText
                        )
                        segments.append(segment)

                        // Notify listeners
                        onTranscriptUpdate?(currentTranscript, segments)
                    }
                }
            }
        } catch {
            NSLog("[Transcription] Real-time transcription error: %@", error.localizedDescription)
        }
        #endif
    }

    /// Convert AVAudioPCMBuffer to float array at 16kHz mono
    private nonisolated func convertBufferToFloatArray(_ buffer: AVAudioPCMBuffer) -> [Float]? {
        guard let channelData = buffer.floatChannelData else { return nil }

        let frameLength = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        let sampleRate = buffer.format.sampleRate

        // Mix to mono
        var monoSamples = [Float](repeating: 0, count: frameLength)
        for frame in 0..<frameLength {
            var sum: Float = 0
            for channel in 0..<channelCount {
                sum += channelData[channel][frame]
            }
            monoSamples[frame] = sum / Float(channelCount)
        }

        // Resample to 16kHz if needed
        if abs(sampleRate - 16000) > 1 {
            let ratio = 16000.0 / sampleRate
            let newLength = Int(Double(frameLength) * ratio)
            var resampledSamples = [Float](repeating: 0, count: newLength)

            for i in 0..<newLength {
                let srcIndex = Double(i) / ratio
                let srcIndexInt = Int(srcIndex)
                let frac = Float(srcIndex - Double(srcIndexInt))

                if srcIndexInt + 1 < frameLength {
                    resampledSamples[i] = monoSamples[srcIndexInt] * (1 - frac) + monoSamples[srcIndexInt + 1] * frac
                } else if srcIndexInt < frameLength {
                    resampledSamples[i] = monoSamples[srcIndexInt]
                }
            }

            return resampledSamples
        }

        return monoSamples
    }

    /// Reset the transcription state
    func reset() {
        bufferLock.lock()
        audioBuffer = []
        bufferLock.unlock()

        currentTranscript = ""
        segments = []
        lastError = nil
    }
}

// MARK: - Errors

enum TranscriptionError: Error, LocalizedError {
    case modelNotLoaded
    case transcriptionFailed(Error)
    case invalidAudioFile

    var errorDescription: String? {
        switch self {
        case .modelNotLoaded:
            return "Whisper model not loaded"
        case .transcriptionFailed(let error):
            return "Transcription failed: \(error.localizedDescription)"
        case .invalidAudioFile:
            return "Invalid audio file"
        }
    }
}
