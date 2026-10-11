import Foundation
import UserNotifications

final class NavigationNotifications {
    static let shared = NavigationNotifications()

    private let center = UNUserNotificationCenter.current()

    private init() {}

    func requestPermission() {
        center.getNotificationSettings { [weak self] settings in
            guard settings.authorizationStatus == .notDetermined else {
                return
            }

            self?.center.requestAuthorization(
                options: [.alert, .sound, .badge]
            ) { granted, error in
                if let error = error {
                    NSLog(
                        "VedettUtvonal notification permission error: %@",
                        error.localizedDescription
                    )
                }

                NSLog(
                    "VedettUtvonal notification permission granted: %@",
                    granted ? "yes" : "no"
                )
            }
        }
    }

    func show(_ alert: AlertEngine.Alert) {
        center.getNotificationSettings { [weak self] settings in
            guard settings.authorizationStatus == .authorized ||
                  settings.authorizationStatus == .provisional else {
                return
            }

            let content = UNMutableNotificationContent()
            content.title = alert.title
            content.body = alert.text
            content.sound = .default

            let request = UNNotificationRequest(
                identifier: "vedett-route-\(alert.targetId)",
                content: content,
                trigger: nil
            )

            self?.center.add(request) { error in
                if let error = error {
                    NSLog(
                        "VedettUtvonal notification error: %@",
                        error.localizedDescription
                    )
                }
            }
        }
    }
}