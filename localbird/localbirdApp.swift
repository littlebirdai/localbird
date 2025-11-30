//
//  localbirdApp.swift
//  localbird
//
//  Created by Alexander Green on 11/30/25.
//

import SwiftUI

@main
struct localbirdApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            SettingsView()
        }

        Window("Timeline", id: "timeline") {
            TimelineView(coordinator: appDelegate.coordinator)
        }
        .defaultSize(width: 1200, height: 800)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    let coordinator = CaptureCoordinator()

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBar()
        configureCoordinator()
    }

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "bird.fill", accessibilityDescription: "Localbird")
            button.action = #selector(togglePopover)
            button.target = self
        }

        // Setup popover for status view
        popover = NSPopover()
        popover?.contentSize = NSSize(width: 320, height: 400)
        popover?.behavior = .transient
        popover?.contentViewController = NSHostingController(rootView: ContentView(coordinator: coordinator))
    }

    private func configureCoordinator() {
        let settings = AppSettings.fromUserDefaults()
        coordinator.configure(settings: settings)
    }

    @objc private func togglePopover() {
        guard let button = statusItem?.button else { return }

        if let popover = popover {
            if popover.isShown {
                popover.performClose(nil)
            } else {
                popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            }
        }
    }
}
