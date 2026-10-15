import Foundation
import Capacitor

@objc(VedettNavigationPlugin)
public class VedettNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VedettNavigationPlugin"
    public let jsName = "VedettNavigation"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updatePlan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ttsStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeaking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeechEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSafeAreaInsets", returnType: CAPPluginReturnPromise)
    ]

    private let navigation = NavigationManager.shared

    @objc func start(_ call: CAPPluginCall) {
        guard let plan = call.getObject("plan"),
              let targets = parseTargets(plan) else {
            call.reject("Érvénytelen navigációs terv.")
            return
        }

        DispatchQueue.main.async {
            self.navigation.onAlert = { alert in
                NavigationNotifications.shared.show(alert)
            }

            NavigationNotifications.shared.requestPermission()

            self.navigation.start(targets: targets) { success in
                if success {
                    call.resolve(["active": true])
                } else {
                    call.reject("A navigáció nem indult el. Ellenőrizd a helymeghatározási engedélyt.")
                }
            }
        }
    }

    @objc func updatePlan(_ call: CAPPluginCall) {
        guard let plan = call.getObject("plan"),
              let targets = parseTargets(plan) else {
            call.reject("Érvénytelen navigációs terv.")
            return
        }

        DispatchQueue.main.async {
            self.navigation.updatePlan(targets: targets)
            call.resolve()
        }
    }

    // iOS navigációs elrendezés v2: a web a biztonsági sávokat közvetlenül a
    // UIKit-ből kapja (nincs CSS-injektálás, nincs UA-találgatás). A webes
    // oldal csak akkor vált az új elrendezésre, ha ez a metódus létezik.
    @objc func getSafeAreaInsets(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let view = self.bridge?.viewController?.view,
                  let scrollView = self.bridge?.webView?.scrollView else {
                call.reject("SAFE_AREA_UNAVAILABLE")
                return
            }
            let safe = view.safeAreaInsets
            let adjusted = scrollView.adjustedContentInset
            call.resolve([
                "safe": [
                    "top": Double(safe.top), "right": Double(safe.right),
                    "bottom": Double(safe.bottom), "left": Double(safe.left)
                ],
                "adjusted": [
                    "top": Double(adjusted.top), "right": Double(adjusted.right),
                    "bottom": Double(adjusted.bottom), "left": Double(adjusted.left)
                ]
            ])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.navigation.stop()
            call.resolve()
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "active": self.navigation.active,
                "stoppedByUser": self.navigation.userStopped
            ])
        }
    }

    @objc func ttsStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(NavigationSpeech.shared.status())
        }
    }

    @objc func speak(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else {
            call.reject("Missing speech text.")
            return
        }

        DispatchQueue.main.async {
            if NavigationSpeech.shared.speak(text) {
                call.resolve(["spoken": true])
            } else {
                let status = NavigationSpeech.shared.status()
                let code: String
                if status["enabled"] as? Bool == false {
                    code = "SPEECH_DISABLED"
                } else if status["available"] as? Bool == false {
                    code = "LANGUAGE_NOT_SUPPORTED"
                } else {
                    code = "SPEAK_FAILED"
                }

                self.notifyListeners("ttsError", data: ["code": code])
                call.reject(code)
            }
        }
    }

    @objc func stopSpeaking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            NavigationSpeech.shared.stop()
            call.resolve()
        }
    }

    @objc func setSpeechEnabled(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else {
            call.reject("Missing enabled parameter.")
            return
        }

        DispatchQueue.main.async {
            NavigationSpeech.shared.setEnabled(enabled)
            call.resolve(["enabled": enabled])
        }
    }

    private func parseTargets(
        _ plan: [String: Any]
    ) -> [AlertEngine.Target]? {
        guard let version = plan["version"] as? Int,
              version == 1,
              let rawTargets = plan["targets"] as? [[String: Any]] else {
            return nil
        }

        var targets: [AlertEngine.Target] = []

        for raw in rawTargets {
            guard let id = raw["id"] as? String,
                  let stopName = raw["stopName"] as? String,
                  let lat = raw["lat"] as? Double,
                  let lon = raw["lon"] as? Double,
                  lat.isFinite,
                  lon.isFinite,
                  (-90.0...90.0).contains(lat),
                  (-180.0...180.0).contains(lon) else {
                return nil
            }

            let prevLat = raw["prevLat"] as? Double
            let prevLon = raw["prevLon"] as? Double

            if let prevLat = prevLat, !prevLat.isFinite {
                return nil
            }
            if let prevLon = prevLon, !prevLon.isFinite {
                return nil
            }

            let arrival = (raw["scheduledArrivalMs"] as? NSNumber)?
                .int64Value

            targets.append(
                AlertEngine.Target(
                    id: id,
                    stopName: stopName,
                    lat: lat,
                    lon: lon,
                    prevLat: prevLat,
                    prevLon: prevLon,
                    scheduledArrivalMs: arrival
                )
            )
        }

        return targets
    }
}