import Foundation

final class AlertEngine {
    static let maxAccuracyM = 50.0
    static let defaultRadiusM = 400.0
    static let minRadiusM = 120.0
    static let gpsLossFallbackMs: Int64 = 90_000
    static let timeFallbackLeadMs: Int64 = 120_000
    static let targetExpiryMs: Int64 = 600_000

    struct Target {
        let id: String
        let stopName: String
        let lat: Double
        let lon: Double
        let prevLat: Double?
        let prevLon: Double?
        let scheduledArrivalMs: Int64?
    }

    struct Alert {
        let targetId: String
        let title: String
        let text: String
        let scheduleEstimate: Bool
    }

    private var targets: [Target] = []
    private var fired = Set<String>()
    private var lastUsableFixMs: Int64 = -1
    private let startedAtMs: Int64

    init(nowMs: Int64) {
        startedAtMs = nowMs
    }

    func setPlan(_ newTargets: [Target], nowMs: Int64) {
        targets = newTargets
    }

    func firedIds() -> Set<String> {
        fired
    }

    /// Igaz, ha a cél az AKTUÁLIS tervben szerepel (újratervezés után a
    /// régi terv riasztása már nem számít aktuálisnak).
    func hasTarget(_ id: String) -> Bool {
        targets.contains { $0.id == id }
    }

    private func activeTarget(nowMs: Int64) -> Target? {
        targets.first { target in
            if fired.contains(target.id) { return false }
            if let arrival = target.scheduledArrivalMs,
               nowMs > arrival + Self.targetExpiryMs {
                return false
            }
            return true
        }
    }

    static func radiusFor(_ target: Target) -> Double {
        guard let prevLat = target.prevLat,
              let prevLon = target.prevLon else {
            return defaultRadiusM
        }

        let gap = distanceMeters(
            prevLat, prevLon, target.lat, target.lon
        )
        return max(minRadiusM, min(defaultRadiusM, gap * 0.6))
    }

    func onLocation(
        lat: Double,
        lon: Double,
        accuracyM: Double,
        nowMs: Int64
    ) -> Alert? {
        guard let target = activeTarget(nowMs: nowMs) else {
            return nil
        }

        guard accuracyM.isFinite,
              accuracyM > 0,
              accuracyM <= Self.maxAccuracyM else {
            return nil
        }

        lastUsableFixMs = nowMs

        let radius = Self.radiusFor(target)
        guard accuracyM <= radius / 2 else {
            return nil
        }

        let distance = Self.distanceMeters(
            lat, lon, target.lat, target.lon
        )
        guard distance <= radius else {
            return nil
        }

        fired.insert(target.id)

        return Alert(
            targetId: target.id,
            title: "Hamarosan szállj le",
            text: "Közeledsz a leszállási megállóhoz: \(target.stopName).",
            scheduleEstimate: false
        )
    }

    func onTick(nowMs: Int64) -> Alert? {
        guard let target = activeTarget(nowMs: nowMs),
              let arrival = target.scheduledArrivalMs else {
            return nil
        }

        let lastGood = lastUsableFixMs >= 0
            ? lastUsableFixMs
            : startedAtMs

        guard nowMs - lastGood >= Self.gpsLossFallbackMs else {
            return nil
        }

        guard nowMs >= arrival - Self.timeFallbackLeadMs else {
            return nil
        }

        fired.insert(target.id)

        return Alert(
            targetId: target.id,
            title: "Menetrendi becslés",
            text: "GPS-jel nélkül, csak a menetrend alapján: hamarosan érkezhetsz ide: \(target.stopName). Ellenőrizd a járművön a kijelzést.",
            scheduleEstimate: true
        )
    }

    static func distanceMeters(
        _ lat1: Double,
        _ lon1: Double,
        _ lat2: Double,
        _ lon2: Double
    ) -> Double {
        let r = 6_371_000.0
        let dLat = (lat2 - lat1) * .pi / 180
        let dLon = (lon2 - lon1) * .pi / 180

        let a = pow(sin(dLat / 2), 2)
            + cos(lat1 * .pi / 180)
            * cos(lat2 * .pi / 180)
            * pow(sin(dLon / 2), 2)

        return 2 * r * asin(min(1.0, sqrt(a)))
    }
}