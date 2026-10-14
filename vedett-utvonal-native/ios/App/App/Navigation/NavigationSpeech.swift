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

        if !value {
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
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.duckOthers]
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