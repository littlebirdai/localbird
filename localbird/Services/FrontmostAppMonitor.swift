//
//  FrontmostAppMonitor.swift
//  localbird
//
//  Monitors for frontmost application changes using NSWorkspace notifications
//

import Foundation
import AppKit

@MainActor
class FrontmostAppMonitor {
    private(set) var currentApp: NSRunningApplication?
    private(set) var previousApp: NSRunningApplication?

    var onAppChanged: ((NSRunningApplication?, NSRunningApplication?) -> Void)?

    private var workspaceObserver: NSObjectProtocol?
    private var isMonitoring = false

    func startMonitoring() {
        guard !isMonitoring else { return }

        currentApp = NSWorkspace.shared.frontmostApplication
        NSLog("[FrontmostAppMonitor] Starting, current app: %@", currentApp?.localizedName ?? "none")

        workspaceObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handleAppActivation(notification)
        }

        isMonitoring = true
    }

    func stopMonitoring() {
        guard isMonitoring else { return }

        if let observer = workspaceObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
            workspaceObserver = nil
        }

        isMonitoring = false
        NSLog("[FrontmostAppMonitor] Stopped")
    }

    private func handleAppActivation(_ notification: Notification) {
        let newApp = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication

        // Only trigger if app actually changed (different process ID)
        guard newApp?.processIdentifier != currentApp?.processIdentifier else {
            return
        }

        NSLog("[FrontmostAppMonitor] App changed: %@ -> %@",
              currentApp?.localizedName ?? "none",
              newApp?.localizedName ?? "none")

        previousApp = currentApp
        currentApp = newApp

        onAppChanged?(newApp, previousApp)
    }

    deinit {
        if let observer = workspaceObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
        }
    }
}
