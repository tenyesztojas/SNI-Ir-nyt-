import Foundation
import UIKit
import AuthenticationServices
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
        CAPPluginMethod(name: "getSafeAreaInsets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private let navigation = NavigationManager.shared

    // Google-belépés (ASWebAuthenticationSession): csak a saját URL-séma
    // fogadható el visszatérési címként; egyszerre egy munkamenet él.
    static let allowedAuthCallbackScheme = "hu.vedettsarok.utvonal"
    private var authSession: ASWebAuthenticationSession?
    private var authPresentationContext: VedettAuthPresentationContext?

    @objc func start(_ call: CAPPluginCall) {
        guard let plan = call.getObject("plan"),
              let targets = parseTargets(plan) else {
            call.reject("Érvénytelen navigációs terv.")
            return
        }

        DispatchQueue.main.async {
            // Új navigációs munkamenet: a háttérbeli bemondások duplikációszűrője ürül.
            NavigationSpeech.shared.endNavigationSession()
            self.navigation.onAlert = { [weak self] alert in
                // A helyi értesítés MINDIG megjelenik; a beszéd csak kiegészíti.
                NavigationNotifications.shared.show(alert)
                self?.speakBackgroundAlertIfAllowed(alert)
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
    /// Hitelesítés az Apple OAuth-ra szánt ASWebAuthenticationSession-nel.
    /// A rendszer a visszatérési (callback) URL-t KÖZVETLENÜL ide adja vissza
    /// — nincs appUrlOpen, nincs SFSafariViewController. A WebView a kapott
    /// URL-ből a meglévő /auth/callback kódcserét végzi (ugyanaz a PKCE
    /// code_verifier, amelyet a WebView signInWithOAuth hívása hozott létre).
    /// Hibakódok: AUTH_INVALID_REQUEST, AUTH_CANCELLED, AUTH_FAILED,
    /// AUTH_UNAVAILABLE.
    @objc func authenticate(_ call: CAPPluginCall) {
        guard let rawUrl = call.getString("url"),
              let url = URL(string: rawUrl),
              url.scheme?.lowercased() == "https",
              call.getString("callbackScheme") == Self.allowedAuthCallbackScheme else {
            call.reject("AUTH_INVALID_REQUEST")
            return
        }

        DispatchQueue.main.async {
            // Egy korábbi, még nyitott munkamenet lezárul (annak hívása
            // AUTH_CANCELLED-del tér vissza; a WebView ezt elavultként kezeli).
            self.authSession?.cancel()

            var session: ASWebAuthenticationSession?
            session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: Self.allowedAuthCallbackScheme
            ) { [weak self] callbackURL, error in
                DispatchQueue.main.async {
                    if let finished = session, self?.authSession === finished {
                        self?.authSession = nil
                        self?.authPresentationContext = nil
                    }
                    session = nil

                    if let callbackURL = callbackURL {
                        call.resolve(["url": callbackURL.absoluteString])
                    } else if let authError = error as? ASWebAuthenticationSessionError,
                              authError.code == .canceledLogin {
                        call.reject("AUTH_CANCELLED")
                    } else {
                        call.reject("AUTH_FAILED")
                    }
                }
            }

            guard let newSession = session else {
                call.reject("AUTH_UNAVAILABLE")
                return
            }

            let context = VedettAuthPresentationContext(
                window: self.bridge?.viewController?.view.window
            )
            newSession.presentationContextProvider = context
            // A meglévő Safari-munkamenet (Google-fiók) használható maradjon.
            newSession.prefersEphemeralWebBrowserSession = false

            self.authSession = newSession
            self.authPresentationContext = context

            if !newSession.start() {
                self.authSession = nil
                self.authPresentationContext = nil
                session = nil
                call.reject("AUTH_UNAVAILABLE")
            }
        }
    }

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
            // Leállítás után nincs háttérbeli bemondás, és egy éppen szóló elhallgat.
            NavigationSpeech.shared.endNavigationSession()
            call.resolve()
        }
    }

    /// Háttérben (pl. zárt képernyőn) a natív leszállási riasztás hangosan is
    /// elhangzik — de csak aktív navigáció, az aktuális tervhez tartozó cél,
    /// a felhasználó által engedélyezett hang és háttérben lévő alkalmazás
    /// esetén, munkamenetenként és célonként legfeljebb egyszer. Előtérben a
    /// WebView saját hangos navigációja szól, ezért ott nincs natív bemondás.
    private func speakBackgroundAlertIfAllowed(_ alert: AlertEngine.Alert) {
        let work = { [weak self] in
            guard let self = self else { return }
            let speech = NavigationSpeech.shared
            let key = "\(self.navigation.sessionGeneration):\(alert.targetId)"
            guard BackgroundAlertSpeechPolicy.shouldSpeak(
                navigationActive: self.navigation.active,
                alertBelongsToCurrentPlan: self.navigation.isCurrentTarget(alert.targetId),
                appIsActive: UIApplication.shared.applicationState == .active,
                userEnabledSpeech: speech.isUserSpeechEnabled(),
                alreadySpoken: speech.hasSpokenBackgroundAlert(key)
            ) else {
                return
            }
            _ = speech.speakBackgroundAlert(alert.text, key: key)
        }

        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
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

/// Az ASWebAuthenticationSession megjelenítési ablaka: az alkalmazás saját
/// (Capacitor) ablaka; ha az nem elérhető, az aktív jelenet kulcsablaka.
final class VedettAuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    private weak var window: UIWindow?

    init(window: UIWindow?) {
        self.window = window
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = window {
            return window
        }
        let keyWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        return keyWindow ?? ASPresentationAnchor()
    }
}
