//
//  MeetingCoordinator.swift
//  localbird
//
//  Coordinates meeting recording, transcription, and storage
//

import Foundation
import AVFoundation
import Combine

/// Coordinates meeting recording and transcription workflow
@MainActor
class MeetingCoordinator: ObservableObject {
    @Published var state: MeetingRecordingState = .idle
    @Published var currentMeeting: MeetingNote?
    @Published var liveTranscript: String = ""
    @Published var recordings: [MeetingNote] = []
    @Published var lastError: String?
    @Published var modelLoadProgress: Float = 0
    @Published var isModelLoaded = false

    private let audioService: AudioRecordingService
    private let transcriptionService: TranscriptionService
    private let llmService: LLMService
    private var qdrantClient: QdrantClient?

    // Storage for meetings metadata
    private var meetingsStorageURL: URL {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let storageURL = appSupport.appendingPathComponent("Localbird/meetings", isDirectory: true)
        try? fileManager.createDirectory(at: storageURL, withIntermediateDirectories: true)
        return storageURL
    }

    private var meetingsIndexURL: URL {
        meetingsStorageURL.appendingPathComponent("meetings.json")
    }

    init(llmService: LLMService) {
        self.audioService = AudioRecordingService()
        self.transcriptionService = TranscriptionService()
        self.llmService = llmService

        // Setup audio buffer callback for real-time transcription
        audioService.onAudioBuffer = { [weak self] buffer, time in
            self?.transcriptionService.processAudioBuffer(buffer, time: time)
        }

        // Setup transcript update callback
        transcriptionService.onTranscriptUpdate = { [weak self] transcript, segments in
            Task { @MainActor in
                self?.liveTranscript = transcript
                self?.currentMeeting?.transcript = transcript
                self?.currentMeeting?.segments = segments
            }
        }

        // Load saved meetings
        loadMeetings()

        NSLog("[MeetingCoordinator] Initialized")
    }

    /// Configure with Qdrant client for vector storage
    func configure(qdrantClient: QdrantClient) {
        self.qdrantClient = qdrantClient
    }

    /// Initialize the transcription model
    func initializeModel() async {
        guard !isModelLoaded else { return }

        NSLog("[MeetingCoordinator] Initializing transcription model...")
        do {
            try await transcriptionService.loadModel(modelSize: "small")
            isModelLoaded = true
            NSLog("[MeetingCoordinator] Model loaded successfully")
        } catch {
            lastError = "Failed to load transcription model: \(error.localizedDescription)"
            NSLog("[MeetingCoordinator] Model load error: %@", error.localizedDescription)
        }
    }

    /// Start a new meeting recording
    func startMeeting(title: String = "Meeting") async throws {
        NSLog("[MeetingCoordinator] startMeeting called with title='%@'", title)
        guard state == .idle else {
            throw MeetingError.alreadyRecording
        }

        // Ensure model is loaded
        if !isModelLoaded {
            await initializeModel()
        }

        // Request microphone permission if needed
        if !audioService.hasMicrophonePermission() {
            let granted = await audioService.requestMicrophonePermission()
            if !granted {
                throw MeetingError.microphonePermissionDenied
            }
        }

        // Create new meeting
        let meetingId = UUID()
        NSLog("[MeetingCoordinator] Creating MeetingNote with title='%@'", title)
        let meeting = MeetingNote(
            id: meetingId,
            title: title,
            startTime: Date()
        )
        NSLog("[MeetingCoordinator] MeetingNote created, meeting.title='%@'", meeting.title)
        currentMeeting = meeting
        NSLog("[MeetingCoordinator] currentMeeting assigned, currentMeeting.title='%@'", currentMeeting?.title ?? "nil")

        // Reset transcription state
        transcriptionService.reset()
        liveTranscript = ""

        // Start recording
        do {
            let audioPath = try audioService.startRecording(meetingId: meetingId)
            currentMeeting?.audioPath = audioPath
            state = .recording
            NSLog("[MeetingCoordinator] Meeting started: %@", meetingId.uuidString)
        } catch {
            currentMeeting = nil
            lastError = error.localizedDescription
            throw error
        }
    }

    /// Stop the current meeting recording
    func stopMeeting() async throws -> MeetingNote {
        guard state == .recording, var meeting = currentMeeting else {
            throw MeetingError.notRecording
        }

        state = .processing

        // Stop recording
        let audioPath = audioService.stopRecording()
        meeting.endTime = Date()

        NSLog("[MeetingCoordinator] Recording stopped, processing transcription...")

        // If we don't have much live transcript, do full file transcription
        NSLog("[MeetingCoordinator] Checking transcript state - isEmpty=%d, segmentsEmpty=%d", meeting.transcript.isEmpty, meeting.segments.isEmpty)
        if meeting.transcript.isEmpty || meeting.segments.isEmpty {
            if let path = audioPath {
                NSLog("[MeetingCoordinator] Starting file transcription for path: %@", path)
                do {
                    let segments = try await transcriptionService.transcribeFile(audioPath: path)
                    NSLog("[MeetingCoordinator] File transcription returned %d segments", segments.count)
                    meeting.segments = segments
                    meeting.transcript = segments.map { $0.text }.joined(separator: " ")
                    NSLog("[MeetingCoordinator] Transcript assembled, length=%d", meeting.transcript.count)
                } catch {
                    NSLog("[MeetingCoordinator] File transcription error: %@", error.localizedDescription)
                    // Keep any live transcript we have
                    meeting.transcript = liveTranscript
                    meeting.segments = transcriptionService.segments
                }
            }
        } else {
            // Use live transcription results
            NSLog("[MeetingCoordinator] Using live transcription results")
            meeting.transcript = liveTranscript
            meeting.segments = transcriptionService.segments
        }
        NSLog("[MeetingCoordinator] Transcription phase complete")

        // Clean the transcript (remove blank audio markers)
        let cleanedTranscript = meeting.cleanTranscript
        NSLog("[MeetingCoordinator] Cleaned transcript length=%d (was %d)", cleanedTranscript.count, meeting.transcript.count)

        // Generate title from transcript if generic
        NSLog("[MeetingCoordinator] Current title='%@', cleanedTranscript empty=%d", meeting.title, cleanedTranscript.isEmpty)
        if meeting.title == "Meeting" && !cleanedTranscript.isEmpty {
            NSLog("[MeetingCoordinator] Generating title from transcript...")
            let newTitle = generateTitle(from: cleanedTranscript)
            NSLog("[MeetingCoordinator] Generated new title='%@'", newTitle)
            meeting = MeetingNote(
                id: meeting.id,
                title: newTitle,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                transcript: meeting.transcript,
                segments: meeting.segments,
                embedding: nil,
                audioPath: meeting.audioPath
            )
        }
        NSLog("[MeetingCoordinator] Title phase complete, proceeding to embedding")

        // Generate embedding for search (skip if no API key configured)
        NSLog("[MeetingCoordinator] Checking if embedding should be generated, transcript length=%d", cleanedTranscript.count)
        if !cleanedTranscript.isEmpty && llmService.hasEmbeddingSupport() {
            NSLog("[MeetingCoordinator] Generating embedding...")
            do {
                let embedding = try await llmService.generateEmbedding(text: cleanedTranscript)
                meeting.embedding = embedding
                NSLog("[MeetingCoordinator] Generated embedding for meeting")
            } catch {
                NSLog("[MeetingCoordinator] Failed to generate embedding: %@", error.localizedDescription)
            }
        } else {
            NSLog("[MeetingCoordinator] Skipping embedding generation (no transcript or no API key)")
        }

        // Generate meeting summary using LLM
        if !cleanedTranscript.isEmpty && llmService.hasChatSupport() {
            NSLog("[MeetingCoordinator] Generating meeting summary...")
            do {
                let summary = try await generateMeetingSummary(transcript: cleanedTranscript)
                meeting.summary = summary
                NSLog("[MeetingCoordinator] Generated meeting summary")
            } catch {
                NSLog("[MeetingCoordinator] Failed to generate summary: %@", error.localizedDescription)
            }
        }

        // Store in Qdrant if available
        if let qdrantClient = qdrantClient, let embedding = meeting.embedding {
            do {
                try await storeMeetingInQdrant(meeting: meeting, embedding: embedding)
                NSLog("[MeetingCoordinator] Stored meeting in Qdrant")
            } catch {
                NSLog("[MeetingCoordinator] Failed to store in Qdrant: %@", error.localizedDescription)
            }
        }

        // Save to local storage
        recordings.insert(meeting, at: 0)
        saveMeetings()

        // Reset state
        currentMeeting = nil
        liveTranscript = ""
        state = .idle

        NSLog("[MeetingCoordinator] Meeting completed: %@", meeting.id.uuidString)
        return meeting
    }

    /// Cancel the current recording without saving
    func cancelMeeting() {
        guard state == .recording else { return }

        _ = audioService.stopRecording()

        if let meeting = currentMeeting {
            audioService.deleteAudioFile(meetingId: meeting.id)
        }

        currentMeeting = nil
        liveTranscript = ""
        state = .idle

        NSLog("[MeetingCoordinator] Meeting cancelled")
    }

    /// Get current status
    func getStatus() -> MeetingStatus {
        return MeetingStatus(
            state: state,
            currentMeetingId: currentMeeting?.id,
            duration: currentMeeting?.duration ?? 0,
            liveTranscript: liveTranscript,
            error: lastError
        )
    }

    /// Get a meeting by ID
    func getMeeting(id: UUID) -> MeetingNote? {
        return recordings.first { $0.id == id }
    }

    /// Delete a meeting
    func deleteMeeting(id: UUID) {
        if let index = recordings.firstIndex(where: { $0.id == id }) {
            let meeting = recordings[index]

            // Delete audio file
            audioService.deleteAudioFile(meetingId: id)

            // Remove from list
            recordings.remove(at: index)
            saveMeetings()

            // TODO: Remove from Qdrant

            NSLog("[MeetingCoordinator] Deleted meeting: %@", id.uuidString)
        }
    }

    /// Search meetings by query
    func searchMeetings(query: String, limit: Int = 10) async throws -> [MeetingNote] {
        guard let qdrantClient = qdrantClient else {
            // Fallback to simple text search
            let lowercaseQuery = query.lowercased()
            return recordings.filter {
                $0.transcript.lowercased().contains(lowercaseQuery) ||
                $0.title.lowercased().contains(lowercaseQuery)
            }
        }

        // Generate embedding for query
        let embedding = try await llmService.generateEmbedding(text: query)

        // Search in Qdrant meetings collection
        // Note: This requires a separate meetings collection or using the same collection with a type filter
        // For now, return text-filtered results
        let lowercaseQuery = query.lowercased()
        return recordings.filter {
            $0.transcript.lowercased().contains(lowercaseQuery) ||
            $0.title.lowercased().contains(lowercaseQuery)
        }
    }

    // MARK: - Private Methods

    private func generateMeetingSummary(transcript: String) async throws -> String {
        let prompt = """
        Summarize the following meeting transcript concisely. Include:
        - Main topics discussed
        - Key decisions made
        - Action items (if any)
        - Important takeaways

        Keep the summary brief but comprehensive. Use bullet points for clarity.

        Transcript:
        \(transcript)
        """

        let messages = [ChatMessage(role: .user, content: prompt)]
        return try await llmService.chat(messages: messages)
    }

    private func generateTitle(from transcript: String) -> String {
        // Take first ~50 characters or first sentence
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if let firstSentenceEnd = trimmed.firstIndex(where: { $0 == "." || $0 == "!" || $0 == "?" }) {
            let firstSentence = String(trimmed[..<firstSentenceEnd])
            if firstSentence.count > 5 && firstSentence.count < 60 {
                return firstSentence
            }
        }

        // Fallback to first N characters
        let maxLength = 50
        if trimmed.count <= maxLength {
            return trimmed
        }

        let endIndex = trimmed.index(trimmed.startIndex, offsetBy: maxLength)
        return String(trimmed[..<endIndex]) + "..."
    }

    private func storeMeetingInQdrant(meeting: MeetingNote, embedding: [Float]) async throws {
        // Store meeting data as a point in Qdrant
        // This uses a simplified storage - in production, you might want a separate collection
        guard let qdrantClient = qdrantClient else { return }

        let payload: [String: Any] = [
            "type": "meeting",
            "meeting_id": meeting.id.uuidString,
            "title": meeting.title,
            "transcript": meeting.transcript,
            "start_time": meeting.startTime.timeIntervalSince1970,
            "end_time": meeting.endTime?.timeIntervalSince1970 ?? 0,
            "duration": meeting.duration
        ]

        // Use the existing upsert method with meeting data
        // Note: This is a simplified approach - in production you might want
        // a dedicated meetings collection
        try await qdrantClient.upsertMeeting(id: meeting.id, embedding: embedding, payload: payload)
    }

    private func loadMeetings() {
        guard FileManager.default.fileExists(atPath: meetingsIndexURL.path) else {
            NSLog("[MeetingCoordinator] No meetings index found")
            return
        }

        do {
            let data = try Data(contentsOf: meetingsIndexURL)
            recordings = try JSONDecoder().decode([MeetingNote].self, from: data)
            NSLog("[MeetingCoordinator] Loaded %d meetings", recordings.count)
        } catch {
            NSLog("[MeetingCoordinator] Failed to load meetings: %@", error.localizedDescription)
        }
    }

    private func saveMeetings() {
        do {
            let data = try JSONEncoder().encode(recordings)
            try data.write(to: meetingsIndexURL)
            NSLog("[MeetingCoordinator] Saved %d meetings", recordings.count)
        } catch {
            NSLog("[MeetingCoordinator] Failed to save meetings: %@", error.localizedDescription)
        }
    }
}

// MARK: - Errors

enum MeetingError: Error, LocalizedError {
    case alreadyRecording
    case notRecording
    case microphonePermissionDenied
    case transcriptionFailed(Error)

    var errorDescription: String? {
        switch self {
        case .alreadyRecording:
            return "A meeting is already being recorded"
        case .notRecording:
            return "No meeting is currently being recorded"
        case .microphonePermissionDenied:
            return "Microphone permission was denied"
        case .transcriptionFailed(let error):
            return "Transcription failed: \(error.localizedDescription)"
        }
    }
}
