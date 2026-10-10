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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Shared Hungarian navigation speech engine. Never call TTS APIs while holding the state lock. */
public final class NavigationTts {
    public enum State { NOT_STARTED, INITIALIZING, READY, UNAVAILABLE }

    public interface ErrorListener { void onTtsError(String code); }

    public static volatile boolean appInForeground = true;
    private static NavigationTts instance;

    public static synchronized NavigationTts get(Context context) {
        if (instance == null) instance = new NavigationTts(context.getApplicationContext());
        return instance;
    }

    private final Context appContext;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "VedettNavigationTts");
        t.setDaemon(true);
        return t;
    });
    private final Object stateLock = new Object();
    private final List<Runnable> waiters = new ArrayList<>();
    private volatile State state = State.NOT_STARTED;
    private volatile String unavailableReason;
    private volatile ErrorListener errorListener;
    // The engine and audio focus are accessed only on the worker thread.
    private TextToSpeech tts;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private long generation;

    private NavigationTts(Context appContext) { this.appContext = appContext; }

    public State state() { return state; }
    public String unavailableReason() { return unavailableReason; }
    public void setErrorListener(ErrorListener listener) { errorListener = listener; }

    /** Callback always runs on Android's main thread. */
    public void whenInitialized(Runnable callback) {
        boolean start = false;
        synchronized (stateLock) {
            if (state == State.READY || state == State.UNAVAILABLE) {
                main.post(callback);
                return;
            }
            waiters.add(callback);
            if (state == State.NOT_STARTED) {
                state = State.INITIALIZING;
                start = true;
            }
        }
        if (start) worker.execute(this::startEngine);
    }

    private void startEngine() {
        final long token = ++generation;
        try {
            // The callback can arrive on any thread; enqueue all TTS operations on our worker.
            TextToSpeech engine = new TextToSpeech(appContext,
                status -> worker.execute(() -> finishEngineInitialization(token, status)));
            tts = engine;
        } catch (RuntimeException e) {
            finishInit(token, State.UNAVAILABLE, "ENGINE_INIT_FAILED");
        }
    }

    private void finishEngineInitialization(long token, int status) {
        if (token != generation) return;
        TextToSpeech engine = tts;
        if (status != TextToSpeech.SUCCESS || engine == null) {
            finishInit(token, State.UNAVAILABLE, "ENGINE_INIT_FAILED");
            return;
        }
        try {
            int lang = engine.setLanguage(new Locale("hu", "HU"));
            if (lang == TextToSpeech.LANG_MISSING_DATA) {
                finishInit(token, State.UNAVAILABLE, "LANGUAGE_MISSING_DATA");
                return;
            }
            if (lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                finishInit(token, State.UNAVAILABLE, "LANGUAGE_NOT_SUPPORTED");
                return;
            }
            engine.setAudioAttributes(navigationAttributes());
            engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { worker.execute(NavigationTts.this::abandonFocus); }
                @Override public void onStop(String id, boolean interrupted) {
                    worker.execute(NavigationTts.this::abandonFocus);
                }
                @Override @SuppressWarnings("deprecation") public void onError(String id) {
                    reportError("SPEAK_FAILED");
                }
                @Override public void onError(String id, int errorCode) {
                    reportError("SPEAK_FAILED_" + errorCode);
                }
            });
            finishInit(token, State.READY, null);
        } catch (RuntimeException e) {
            finishInit(token, State.UNAVAILABLE, "ENGINE_INIT_FAILED");
        }
    }

    private void finishInit(long token, State finalState, String reason) {
        if (token != generation) return;
        if (finalState == State.UNAVAILABLE) {
            TextToSpeech engine = tts;
            tts = null;
            if (engine != null) {
                try { engine.shutdown(); } catch (RuntimeException ignored) { }
            }
        }
        List<Runnable> pending;
        synchronized (stateLock) {
            state = finalState;
            unavailableReason = reason;
            pending = new ArrayList<>(waiters);
            waiters.clear();
        }
        for (Runnable callback : pending) main.post(callback);
    }

    private void reportError(String code) {
        main.post(() -> {
            ErrorListener listener = errorListener;
            if (listener != null) listener.onTtsError(code);
        });
    }

    /** Returns true if a READY engine accepted the request for processing. */
    public boolean speak(String text, String utteranceId) {
        if (text == null || text.trim().isEmpty() || state != State.READY) return false;
        final String spoken = text;
        final String id = utteranceId != null ? utteranceId : "vu";
        worker.execute(() -> {
            if (state != State.READY || tts == null) return;
            requestFocus();
            try {
                if (tts.speak(spoken, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
                    abandonFocus();
                    reportError("SPEAK_FAILED");
                }
            } catch (RuntimeException e) {
                abandonFocus();
                reportError("SPEAK_FAILED");
            }
        });
        return true;
    }

    public void stop() {
        worker.execute(() -> {
            if (tts != null) {
                try { tts.stop(); } catch (RuntimeException ignored) { }
            }
            abandonFocus();
        });
    }

    /** Release the engine without blocking Android's main or Capacitor plugin threads. */
    public void shutdown() {
        worker.execute(() -> {
            ++generation;
            TextToSpeech engine = tts;
            tts = null;
            if (engine != null) {
                try { engine.stop(); } catch (RuntimeException ignored) { }
                try { engine.shutdown(); } catch (RuntimeException ignored) { }
            }
            abandonFocus();
            List<Runnable> pending;
            synchronized (stateLock) {
                state = State.NOT_STARTED;
                unavailableReason = null;
                pending = new ArrayList<>(waiters);
                waiters.clear();
            }
            for (Runnable callback : pending) main.post(callback);
        });
    }

    private static AudioAttributes navigationAttributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
    }

    @SuppressWarnings("deprecation")
    private void requestFocus() {
        if (audioManager == null)
            audioManager = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(navigationAttributes()).build();
            }
            audioManager.requestAudioFocus(focusRequest);
        } else {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
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
