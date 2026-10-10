package hu.vedettsarok.utvonal.navigation;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Védett Útvonal — natív magyar hangos navigáció (Android TextToSpeech).
 * Egyetlen, alkalmazásszintű példány: a WebView-ból (VedettNavigationPlugin)
 * és a háttérszolgáltatásból (NavigationLocationService) is ezt használjuk.
 *
 * - Ellenőrzött inicializálás: csak akkor READY, ha a motor elindult ÉS a
 *   magyar nyelv (hu-HU) támogatott és az adatai telepítve vannak.
 * - QUEUE_FLUSH: egy új utasítás mindig megszakítja az előzőt (nincs
 *   felhalmozódó, elavult várólista).
 * - Audio focus: rövid, "duckolós" (GAIN_TRANSIENT_MAY_DUCK) fókusz
 *   navigációs célra — a zene halkul, nem áll le; felolvasás után elengedjük.
 * - Nem naplóz szöveget vagy helyadatot.
 */
public final class NavigationTts implements TextToSpeech.OnInitListener {
    public enum State { NOT_STARTED, INITIALIZING, READY, UNAVAILABLE }

    public interface ErrorListener {
        void onTtsError(String code);
    }

    /** A WebView/Activity látható-e (a plugin állítja). Háttérben csak a service beszél. */
    public static volatile boolean appInForeground = true;

    private static NavigationTts instance;

    public static synchronized NavigationTts get(Context context) {
        if (instance == null) instance = new NavigationTts(context.getApplicationContext());
        return instance;
    }

    private final Context appContext;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> waiters = new ArrayList<>();
    private TextToSpeech tts;
    private volatile State state = State.NOT_STARTED;
    private volatile String unavailableReason = null;
    private volatile ErrorListener errorListener;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;

    private NavigationTts(Context appContext) {
        this.appContext = appContext;
    }

    public State state() {
        return state;
    }

    public String unavailableReason() {
        return unavailableReason;
    }

    public void setErrorListener(ErrorListener listener) {
        this.errorListener = listener;
    }

    /** Lusta inicializálás; a callback a fő szálon fut, amikor az állapot végleges (READY/UNAVAILABLE). */
    public synchronized void whenInitialized(Runnable callback) {
        if (state == State.READY || state == State.UNAVAILABLE) {
            main.post(callback);
            return;
        }
        waiters.add(callback);
        if (state == State.NOT_STARTED) {
            state = State.INITIALIZING;
            try {
                tts = new TextToSpeech(appContext, this);
            } catch (RuntimeException e) {
                finishInit(State.UNAVAILABLE, "ENGINE_INIT_FAILED");
            }
        }
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS || tts == null) {
            finishInit(State.UNAVAILABLE, "ENGINE_INIT_FAILED");
            return;
        }
        int lang;
        try {
            lang = tts.setLanguage(new Locale("hu", "HU"));
        } catch (RuntimeException e) {
            lang = TextToSpeech.LANG_NOT_SUPPORTED;
        }
        if (lang == TextToSpeech.LANG_MISSING_DATA) {
            finishInit(State.UNAVAILABLE, "LANGUAGE_MISSING_DATA");
            return;
        }
        if (lang == TextToSpeech.LANG_NOT_SUPPORTED) {
            finishInit(State.UNAVAILABLE, "LANGUAGE_NOT_SUPPORTED");
            return;
        }
        tts.setAudioAttributes(navigationAttributes());
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {}

            @Override public void onDone(String utteranceId) {
                main.post(NavigationTts.this::abandonFocus);
            }

            @Override public void onStop(String utteranceId, boolean interrupted) {
                main.post(NavigationTts.this::abandonFocus);
            }

            @Override @SuppressWarnings("deprecation")
            public void onError(String utteranceId) {
                reportError("SPEAK_FAILED");
            }

            @Override public void onError(String utteranceId, int errorCode) {
                reportError("SPEAK_FAILED_" + errorCode);
            }
        });
        finishInit(State.READY, null);
    }

    private void reportError(String code) {
        main.post(() -> {
            abandonFocus();
            ErrorListener l = errorListener;
            if (l != null) l.onTtsError(code);
        });
    }

    private synchronized void finishInit(State finalState, String reason) {
        state = finalState;
        unavailableReason = reason;
        if (finalState == State.UNAVAILABLE && tts != null) {
            try { tts.shutdown(); } catch (RuntimeException ignored) {}
            tts = null;
        }
        List<Runnable> pending = new ArrayList<>(waiters);
        waiters.clear();
        for (Runnable r : pending) main.post(r);
    }

    /** true = a motor elfogadta a felolvasást. Nem READY állapotban false (nincs "sikeres" állítás). */
    public synchronized boolean speak(String text, String utteranceId) {
        if (state != State.READY || tts == null || text == null || text.trim().isEmpty()) return false;
        requestFocus();
        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId != null ? utteranceId : "vu");
        if (result != TextToSpeech.SUCCESS) {
            abandonFocus();
            return false;
        }
        return true;
    }

    public synchronized void stop() {
        if (tts != null) {
            try { tts.stop(); } catch (RuntimeException ignored) {}
        }
        abandonFocus();
    }

    /** Navigáció leállításakor: erőforrás felszabadítása; a következő használat újra inicializál. */
    public synchronized void shutdown() {
        stop();
        if (tts != null) {
            try { tts.shutdown(); } catch (RuntimeException ignored) {}
        }
        tts = null;
        state = State.NOT_STARTED;
        unavailableReason = null;
        waiters.clear();
    }

    private static AudioAttributes navigationAttributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
    }

    @SuppressWarnings("deprecation")
    private void requestFocus() {
        if (audioManager == null) audioManager = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(navigationAttributes())
                    .build();
            }
            audioManager.requestAudioFocus(focusRequest);
        } else {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
    }

    @SuppressWarnings("deprecation")
    private void abandonFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            audioManager.abandonAudioFocus(null);
        }
    }
}
