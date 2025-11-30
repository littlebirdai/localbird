//
//  CapturedFrame.swift
//  localbird
//

import Foundation
import AppKit

/// Represents a single captured frame with its associated data
struct CapturedFrame: Identifiable, Codable {
    let id: UUID
    let timestamp: Date
    let imageData: Data
    let accessibilityData: AccessibilitySnapshot?
    var llmAnalysis: FrameAnalysis?
    var embedding: [Float]?

    init(
        id: UUID = UUID(),
        timestamp: Date = Date(),
        imageData: Data,
        accessibilityData: AccessibilitySnapshot? = nil,
        llmAnalysis: FrameAnalysis? = nil,
        embedding: [Float]? = nil
    ) {
        self.id = id
        self.timestamp = timestamp
        self.imageData = imageData
        self.accessibilityData = accessibilityData
        self.llmAnalysis = llmAnalysis
        self.embedding = embedding
    }
}

/// Snapshot of accessibility tree at capture time
struct AccessibilitySnapshot: Codable {
    let focusedApp: String?
    let focusedWindow: String?
    let elements: [AccessibilityElement]
}

/// Simplified accessibility element representation
struct AccessibilityElement: Codable {
    let role: String
    let title: String?
    let value: String?
    let frame: CGRect?
    let children: [AccessibilityElement]?

    enum CodingKeys: String, CodingKey {
        case role, title, value, frame, children
    }

    init(role: String, title: String?, value: String?, frame: CGRect?, children: [AccessibilityElement]?) {
        self.role = role
        self.title = title
        self.value = value
        self.frame = frame
        self.children = children
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        role = try container.decode(String.self, forKey: .role)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        value = try container.decodeIfPresent(String.self, forKey: .value)
        children = try container.decodeIfPresent([AccessibilityElement].self, forKey: .children)

        if let frameDict = try container.decodeIfPresent([String: CGFloat].self, forKey: .frame) {
            frame = CGRect(
                x: frameDict["x"] ?? 0,
                y: frameDict["y"] ?? 0,
                width: frameDict["width"] ?? 0,
                height: frameDict["height"] ?? 0
            )
        } else {
            frame = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(role, forKey: .role)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(value, forKey: .value)
        try container.encodeIfPresent(children, forKey: .children)

        if let frame = frame {
            let frameDict: [String: CGFloat] = [
                "x": frame.origin.x,
                "y": frame.origin.y,
                "width": frame.size.width,
                "height": frame.size.height
            ]
            try container.encode(frameDict, forKey: .frame)
        }
    }
}

/// Structured analysis from LLM
struct FrameAnalysis: Codable {
    let summary: String
    let activeApplication: String?
    let userActivity: String?
    let visibleText: [String]
    let uiElements: [String]
    let metadata: [String: String]
}
