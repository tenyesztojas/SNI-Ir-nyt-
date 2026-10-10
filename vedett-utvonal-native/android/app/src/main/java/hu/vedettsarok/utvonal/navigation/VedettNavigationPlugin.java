package hu.vedettsarok.utvonal.navigation;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Híd a webes navigáció és a NavigationLocationService között.
 * A web hívja: start(plan) / updatePlan(plan) / stop() / getState().
 * Indítás csak a web kifejezett navigációindítására (látható appból).
 */
@CapacitorPlugin(name = "VedettNavigation")
public class VedettNavigationPlugin extends Plugin {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4712;
    private static final long TTS_STATUS_TIMEOUT_MS = 5_000L;

    @Override
    public void load() {
        // TTS-hibák továbbítása a webnek (zárt kód, szöveg nélkül).
        NavigationTts.get(getContext()).setErrorListener((code) -> {
            JSObject data = new JSObject();
            data.put("code", code);
            notifyListeners("ttsError", data);
        });
    }

    @Override
    protected void handleOnResume() {
        NavigationTts.appInForeground = true;
    }

    @Override
    protected void handleOnPause() {
        NavigationTts.appInForeground = false;
    }

    // ---- Natív magyar TTS (a WebView-ban a Web Speech API nem elérhető) ----

    @PluginMethod
    public void ttsStatus(PluginCall call) {
        final NavigationTts tts = NavigationTts.get(getContext());
        final boolean[] done = { false };
        final Handler handler = new Handler(Looper.getMainLooper());
        final Runnable respond = () -> {
            if (done[0]) return;
            done[0] = true;
            JSObject ret = new JSObject();
            ret.put("available", tts.state() == NavigationTts.State.READY);
            ret.put("reason", tts.state() == NavigationTts.State.READY ? null
                : (tts.state() == NavigationTts.State.UNAVAILABLE ? tts.unavailableReason() : "INIT_TIMEOUT"));
            call.resolve(ret);
        };
        tts.whenInitialized(respond);
        handler.postDelayed(respond, TTS_STATUS_TIMEOUT_MS);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        String id = call.getString("id");
        if (NavigationTts.get(getContext()).speak(text, id)) {
            call.resolve();
        } else {
            call.reject("TTS_UNAVAILABLE");
        }
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        NavigationTts.get(getContext()).stop();
        call.resolve();
    }

    /** A felhasználó hangos navigációs beállítása — a háttér-figyelmeztetések is ezt követik. */
    @PluginMethod
    public void setSpeechEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        NavigationLocationService.speechEnabled = enabled;
        if (!enabled) NavigationTts.get(getContext()).stop();
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        boolean fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            call.reject("LOCATION_PERMISSION_MISSING");
            return;
        }
        JSObject plan = call.getObject("plan");
        Intent intent = new Intent(ctx, NavigationLocationService.class)
            .setAction(NavigationLocationService.ACTION_START)
            .putExtra(NavigationLocationService.EXTRA_PLAN, plan != null ? plan.toString() : null);
        try {
            ContextCompat.startForegroundService(ctx, intent);
        } catch (Exception e) {
            call.reject("FOREGROUND_SERVICE_START_FAILED");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_PERMISSION_REQUEST);
        }
        call.resolve();
    }

    @PluginMethod
    public void updatePlan(PluginCall call) {
        if (!NavigationLocationService.running) {
            call.resolve();
            return;
        }
        JSObject plan = call.getObject("plan");
        Intent intent = new Intent(getContext(), NavigationLocationService.class)
            .setAction(NavigationLocationService.ACTION_UPDATE)
            .putExtra(NavigationLocationService.EXTRA_PLAN, plan != null ? plan.toString() : null);
        try {
            getContext().startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("PLAN_UPDATE_FAILED");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        NavigationTts.get(getContext()).stop();
        if (NavigationLocationService.running) {
            try {
                getContext().startService(new Intent(getContext(), NavigationLocationService.class).setAction(NavigationLocationService.ACTION_STOP));
            } catch (Exception e) {
                getContext().stopService(new Intent(getContext(), NavigationLocationService.class));
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("active", NavigationLocationService.running);
        ret.put("stoppedByUser", NavigationLocationService.stoppedByUser);
        call.resolve(ret);
    }
}
