import Foundation
import CoreLocation

final class NavigationManager: NSObject, CLLocationManagerDelegate {
    static let shared = NavigationManager()

    private let locationManager = CLLocationManager()
    private var engine: AlertEngine?
    private var timer: Timer?
    private var sessionStartedAt: Date?
    private var isRunning = false
    private var stoppedByUser = false
    private var pendingStart: ((Bool) -> Void)?
    private var pendingTargets: [AlertEngine.Target]?

    var onAlert: ((AlertEngine.Alert) -> Void)?

    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = 5
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.allowsBackgroundLocationUpdates = true
    }

    var active: Bool {
        isRunning
    }

    var userStopped: Bool {
        stoppedByUser
    }

    func start(targets: [AlertEngine.Target], completion: @escaping (Bool) -> Void) {
        let previousStart = pendingStart
        pendingStart = nil
        pendingTargets = nil
        previousStart?(false)

        let authorization = locationManager.authorizationStatus

        if authorization == .notDetermined {
            pendingStart?(false)
            pendingStart = completion
            pendingTargets = targets
            locationManager.requestWhenInUseAuthorization()
            return
        }

        guard authorization == .authorizedWhenInUse ||
              authorization == .authorizedAlways else {
            completion(false)
            return
        }

        completion(startAuthorized(targets: targets))
    }

    private func startAuthorized(targets: [AlertEngine.Target]) -> Bool {
        stopInternal(userInitiated: false)

        let now = nowMs()
        let newEngine = AlertEngine(nowMs: now)
        newEngine.setPlan(targets, nowMs: now)

        engine = newEngine
        sessionStartedAt = Date()
        stoppedByUser = false
        isRunning = true

        locationManager.startUpdatingLocation()

        timer = Timer.scheduledTimer(
            withTimeInterval: 15,
            repeats: true
        ) { [weak self] _ in
            self?.tick()
        }

        return true
    }

    func updatePlan(targets: [AlertEngine.Target]) {
        guard isRunning else { return }
        engine?.setPlan(targets, nowMs: nowMs())
    }

    func stop() {
        pendingTargets = nil
        let completion = pendingStart
        pendingStart = nil
        completion?(false)
        stopInternal(userInitiated: true)
    }

    private func stopInternal(userInitiated: Bool) {
        locationManager.stopUpdatingLocation()
        timer?.invalidate()
        timer = nil
        engine = nil
        sessionStartedAt = nil
        isRunning = false
        stoppedByUser = userInitiated
    }

    private func tick() {
        guard isRunning else { return }

        if let started = sessionStartedAt,
           Date().timeIntervalSince(started) >= 6 * 60 * 60 {
            stopInternal(userInitiated: false)
            return
        }

        if let alert = engine?.onTick(nowMs: nowMs()) {
            onAlert?(alert)
        }
    }

    func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard isRunning, let location = locations.last else {
            return
        }

        if let started = sessionStartedAt,
           Date().timeIntervalSince(started) >= 6 * 60 * 60 {
            stopInternal(userInitiated: false)
            return
        }

        let coordinate = location.coordinate

        if let alert = engine?.onLocation(
            lat: coordinate.latitude,
            lon: coordinate.longitude,
            accuracyM: location.horizontalAccuracy,
            nowMs: nowMs()
        ) {
            onAlert?(alert)
        }

        if let alert = engine?.onTick(nowMs: nowMs()) {
            onAlert?(alert)
        }
    }

    func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        NSLog("VedettUtvonal GPS error: %@", error.localizedDescription)
    }

    func locationManagerDidChangeAuthorization(
        _ manager: CLLocationManager
    ) {
        NSLog(
            "VedettUtvonal location authorization: %d",
            manager.authorizationStatus.rawValue
        )

        let authorization = manager.authorizationStatus

        if let completion = pendingStart,
           authorization != .notDetermined {
            let targets = pendingTargets
            pendingStart = nil
            pendingTargets = nil

            if authorization == .authorizedWhenInUse ||
               authorization == .authorizedAlways {
                completion(targets.map { startAuthorized(targets: $0) } ?? false)
            } else {
                completion(false)
            }
        }

        if isRunning &&
           authorization != .authorizedWhenInUse &&
           authorization != .authorizedAlways {
            stopInternal(userInitiated: false)
        }
    }

    private func nowMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }
}