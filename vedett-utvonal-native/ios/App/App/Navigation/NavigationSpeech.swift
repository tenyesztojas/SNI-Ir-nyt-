import Foundation
import AVFoundation

/// A háttérbeli (pl. zárt képernyős) leszállási riasztás bemondásának
/// feltételei. Mind teljesülnie kell; ellenkező esetben csak a helyi
/// értesítés jelenik meg (az MINDIG megmarad, a beszéd nem helyettesíti).
enum BackgroundAlertSpeechPolicy {
    static func shouldSpeak(
        navigationActive: Bool,
        alertBelongsToCurrentPlan: Bool,
        appIsActive: Bool,
        userEnabledSpeech: Bool,
        alreadySpoken: Bool
    ) -> Bool {
        navigationActive &&
            alertBelongsToCurrentPlan &&
            !appIsActive &&
            userEnabledSpeech &&
            !alreadySpoken
    }
}

/// Natív magyar hangos navigáció (AVSpeechSynthesizer).
///
/// Audio session: CSAK tényleges beszéd alatt aktív (speak → setActive(true),
/// a mondat végén / megszakításakor setActive(false)). Nincs néma hang,
/// nincs folyamatos lejátszás: az `audio` háttérmód kizárólag azt teszi
/// lehetővé, hogy egy elkezdett vagy háttérben indított navigációs mondat
/// zárt képernyőn is elhangozzon.
final class NavigationSpeech: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = NavigationSpeech()

    private let synthesizer = AVSpeechSynthesizer()
    private var enabled = true
    // Csak a WebView kifejezett setSpeechEnabled(true) hívása kapcsolja be
    // (alapértéke false), így a háttérbeli bemondás sosem indulhat a
    // felhasználói beállítás ismerete nélkül (pl. hidegindítás után).
    private var userEnabledByWebView = false
    private var currentUtterance: AVSpeechUtterance?
    private var currentIsBackgroundAlert = false
    private var spokenBackgroundAlertKeys = Set<String>()

    private override init() {
        super.init()
        synthesizer.delegate = self

        let session = AVAudioSession.sharedInstance()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: session
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMediaServicesReset(_:)),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: session
        )
    }

    func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didFinish utterance: AVSpeechUtterance
    ) {
        if utterance === currentUtterance {
            currentUtterance = nil
            currentIsBackgroundAlert = false
            releaseAudioSession()
        }
    }

    func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didCancel utterance: AVSpeechUtterance
    ) {
        if utterance === currentUtterance {
            currentUtterance = nil
            currentIsBackgroundAlert = false
            releaseAudioSession()
        }
    }

    // Telefonhívás, Siri, ébresztő, más app kizárólagos hangja: a
    // félbeszakadt mondatot NEM folytatjuk utólag (addigra elavult lehet),
    // és a megszakítás végén sem indítunk automatikusan semmit — a
    // következő bemondás aktiválja újra a sessiont.
    @objc private func handleInterruption(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else {
            return
        }

        DispatchQueue.main.async {
            switch type {
            case .began:
                self.stop()
            case .ended:
                self.releaseAudioSession()
            @unknown default:
                break
            }
        }
    }

    @objc private func handleMediaServicesReset(_ notification: Notification) {
        DispatchQueue.main.async {
            self.stop()
        }
    }

    private func releaseAudioSession() {
        guard !synthesizer.isSpeaking && !synthesizer.isPaused else {
            return
        }

        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: [.notifyOthersOnDeactivation]
            )
        } catch {
            NSLog("VedettUtvonal audio release error: %@", error.localizedDescription)
        }
    }

    private func hungarianVoice() -> AVSpeechSynthesisVoice? {
        if let voice = AVSpeechSynthesisVoice(language: "hu-HU") {
            return voice
        }

        return AVSpeechSynthesisVoice.speechVoices().first {
            $0.language.lowercased() == "hu" ||
            $0.language.lowercased().hasPrefix("hu-")
        }
    }
    func status() -> [String: Any] {
        let available = hungarianVoice() != nil
        let reason: Any = available ? NSNull() : "LANGUAGE_NOT_SUPPORTED"
        return [
            "available": available,
            "reason": reason,
            "enabled": enabled,
            "speaking": synthesizer.isSpeaking
        ]
    }

    func setEnabled(_ value: Bool) {
        enabled = value
        userEnabledByWebView = value

        if !value {
            stop()
        }
    }

    /// A WebView által kifejezetten engedélyezett hang (navigáció közben,
    /// bekapcsolt hangbeállítással — lásd setNativeSpeechEnabled a JS-ben).
    func isUserSpeechEnabled() -> Bool {
        enabled && userEnabledByWebView
    }

    func hasSpokenBackgroundAlert(_ key: String) -> Bool {
        spokenBackgroundAlertKeys.contains(key)
    }

    /// Háttérbeli leszállási riasztás bemondása; kulcsonként legfeljebb egyszer.
    func speakBackgroundAlert(_ text: String, key: String) -> Bool {
        guard isUserSpeechEnabled(), !spokenBackgroundAlertKeys.contains(key) else {
            return false
        }

        spokenBackgroundAlertKeys.insert(key)

        guard speak(text) else {
            return false
        }

        currentIsBackgroundAlert = true
        return true
    }

    /// Navigáció indításakor/leállításakor: a duplikációszűrő ürül, és egy
    /// még szóló háttérbeli riasztás azonnal elhallgat.
    func endNavigationSession() {
        spokenBackgroundAlertKeys.removeAll()

        if currentIsBackgroundAlert {
            stop()
        }
    }

    func speak(_ text: String) -> Bool {
        guard enabled,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let voice = hungarianVoice() else {
            return false
        }

        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }

        do {
            // Navigációs hangutasítás: rövid bemondás, más alkalmazás hangját
            // lehalkítja, a beszédalapú hangot (podcast, hangoskönyv) megszakítja.
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .voicePrompt,
                options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // Do not block speech solely because audio session setup failed.
            // AVSpeechSynthesizer may still be able to play using the active session.
            NSLog("VedettUtvonal audio session setup warning: %@", error.localizedDescription)
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = 0.48
        utterance.volume = 1.0

        currentUtterance = utterance
        currentIsBackgroundAlert = false
        synthesizer.speak(utterance)
        return true
    }

    func stop() {
        currentUtterance = nil
        currentIsBackgroundAlert = false

        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }

        releaseAudioSession()
    }
}
