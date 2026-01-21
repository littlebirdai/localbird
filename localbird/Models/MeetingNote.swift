//
//  MeetingNote.swift
//  localbird
//
//  Data model for meeting recordings and transcripts
//

import Foundation

/// Represents a segment of transcribed audio with timestamps
struct TranscriptSegment: Codable, Identifiable {
    var id: UUID { UUID() }
    let startTime: TimeInterval
    let endTime: TimeInterval
    let text: String

    enum CodingKeys: String, CodingKey {
        case startTime, endTime, text
    }
}

/// Represents a recorded meeting with its transcript
struct MeetingNote: Codable, Identifiable {
    let id: UUID
    let title: String
    let startTime: Date
    var endTime: Date?
    var duration: TimeInterval {
        guard let end = endTime else {
            return Date().timeIntervalSince(startTime)
        }
        return end.timeIntervalSince(startTime)
    }
    var transcript: String
    var segments: [TranscriptSegment]
    var summary: String?  // LLM-generated summary
    var embedding: [Float]?
    var audioPath: String?

    /// Clean transcript with blank audio markers removed
    var cleanTranscript: String {
        MeetingNote.cleanTranscriptText(transcript)
    }

    init(
        id: UUID = UUID(),
        title: String = "Meeting",
        startTime: Date = Date(),
        endTime: Date? = nil,
        transcript: String = "",
        segments: [TranscriptSegment] = [],
        summary: String? = nil,
        embedding: [Float]? = nil,
        audioPath: String? = nil
    ) {
        self.id = id
        self.title = title
        self.startTime = startTime
        self.endTime = endTime
        self.transcript = transcript
        self.segments = segments
        self.summary = summary
        self.embedding = embedding
        self.audioPath = audioPath
    }

    /// Remove blank audio markers and other noise from transcript
    static func cleanTranscriptText(_ text: String) -> String {
        var cleaned = text
        // Remove common blank audio markers
        let patterns = [
            "\\[BLANK_AUDIO\\]",
            "\\[ Silence \\]",
            "\\[Silence\\]",
            "\\(silence\\)",
            "\\(baby babbling\\)",
            "\\(upbeat music\\)",
            "\\(music\\)",
            "<\\|startoftranscript\\|>",
            "<\\|endoftext\\|>",
            "<\\|transcribe\\|>",
            "<\\|en\\|>",
            "<\\|\\d+\\.\\d+\\|>"  // Timestamp markers like <|0.00|>
        ]

        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                cleaned = regex.stringByReplacingMatches(
                    in: cleaned,
                    options: [],
                    range: NSRange(cleaned.startIndex..., in: cleaned),
                    withTemplate: ""
                )
            }
        }

        // Clean up extra whitespace
        cleaned = cleaned.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)

        return cleaned
    }
}

/// Current state of meeting recording
enum MeetingRecordingState: String, Codable {
    case idle
    case recording
    case processing
    case error
}

/// Status response for meeting recording
struct MeetingStatus: Codable {
    let state: MeetingRecordingState
    let currentMeetingId: UUID?
    let duration: TimeInterval
    let liveTranscript: String
    let error: String?
}
