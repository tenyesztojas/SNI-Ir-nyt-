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
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
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