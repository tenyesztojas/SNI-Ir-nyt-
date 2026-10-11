import Foundation
import AVFoundation

final class NavigationSpeech: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = NavigationSpeech()

    private let synthesizer = AVSpeechSynthesizer()
    private var enabled = true
    private var currentUtterance: AVSpeechUtterance?

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didFinish utterance: AVSpeechUtterance
    ) {
        if utterance === currentUtterance {
            currentUtterance = nil
            releaseAudioSession()
        }
    }

    func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didCancel utterance: AVSpeechUtterance
    ) {
        if utterance === currentUtterance {
            currentUtterance = nil
            releaseAudioSession()
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

    func status() -> [String: Any] {
        let available = AVSpeechSynthesisVoice(language: "hu-HU") != nil
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

        if !value {
            stop()
        }
    }

    func speak(_ text: String) -> Bool {
        guard enabled,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let voice = AVSpeechSynthesisVoice(language: "hu-HU") else {
            return false
        }

        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }

        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.duckOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("VedettUtvonal audio session error: %@", error.localizedDescription)
            currentUtterance = nil
            synthesizer.stopSpeaking(at: .immediate)
            releaseAudioSession()
            return false
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = 0.48
        utterance.volume = 1.0

        currentUtterance = utterance
        synthesizer.speak(utterance)
        return true
    }

    func stop() {
        currentUtterance = nil

        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }

        releaseAudioSession()
    }
}