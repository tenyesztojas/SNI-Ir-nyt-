package hu.vedettsarok.utvonal.navigation;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import hu.vedettsarok.utvonal.BuildConfig;
import hu.vedettsarok.utvonal.MainActivity;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Védett Útvonal — aktív navigáció közbeni, látható appból indított
 * "location" típusú foreground service (MVP). Csak leszállási
 * figyelmeztetést ad; a navigációs állapot a webes oldalon marad.
 * Helyadatot nem tárol és nem küld sehova.
 */
public class NavigationLocationService extends Service {
    public static final String ACTION_START = "hu.vedettsarok.utvonal.nav.START";
    public static final String ACTION_UPDATE = "hu.vedettsarok.utvonal.nav.UPDATE";
    public static final String ACTION_STOP = "hu.vedettsarok.utvonal.nav.STOP";
    public static final String ACTION_STOP_BY_USER = "hu.vedettsarok.utvonal.nav.STOP_BY_USER";
    public static final String EXTRA_PLAN = "plan";

    private static final String CHANNEL_ONGOING = "vu_navigation_ongoing";
    private static final String CHANNEL_ALERTS = "vu_navigation_alerts";
    private static final int ONGOING_ID = 4711;
    private static final int ALERT_ID_BASE = 4800;
    private static final long TICK_MS = 15_000L;
    private static final long MAX_SESSION_MS = 6L * 60 * 60 * 1000; // = NAVIGATION_SESSION_TTL_MS

    static volatile boolean running = false;
    static volatile boolean stoppedByUser = false;
    /** A felhasználó hangos navigációs beállítása (a web állítja a pluginon át). Alapból KI. */
    static volatile boolean speechEnabled = false;

    // ---- CSAK DEBUG BUILD: ADB-ből indítható, egyszeri hangteszt (lásd src/debug DebugSpeechTestReceiver) ----
    static final String DEBUG_SPEECH_TEST_TEXT = "Figyelem! Hamarosan le kell szállnod. Készülj fel a leszállásra.";
    private static volatile NavigationLocationService instance;
    private Runnable debugSpeechTest;

    /** Csak debug buildben és futó navigáció mellett; függő teszt mellett nem ütemez újat. */
    static boolean scheduleDebugSpeechTest(long delayMs) {
        if (!BuildConfig.DEBUG) return false;
        NavigationLocationService s = instance;
        if (s == null || !running) return false;
        return s.scheduleDebugSpeechTestOnce(delayMs);
    }

    private boolean scheduleDebugSpeechTestOnce(long delayMs) {
        if (debugSpeechTest != null) return false;
        debugSpeechTest = () -> {
            debugSpeechTest = null;
            if (!running) return;
            if (!speechEnabled) {
                debug("debug speech test: silent (speech disabled)");
                return;
            }
            final NavigationTts tts = NavigationTts.get(this);
            tts.whenInitialized(() -> debug("debug speech test " + (tts.speak(DEBUG_SPEECH_TEST_TEXT, "debug-speech-test")
                ? "queued" : "unavailable:" + tts.unavailableReason())));
        };
        handler.postDelayed(debugSpeechTest, delayMs);
        debug("debug speech test scheduled in " + delayMs + " ms");
        return true;
    }

    private void cancelDebugSpeechTest() {
        if (debugSpeechTest != null) {
            handler.removeCallbacks(debugSpeechTest);
            debugSpeechTest = null;
            debug("debug speech test cancelled");
        }
    }

    private AlertEngine engine;
    private LocationManager locationManager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long startedAtMs;
    private int alertCounter = 0;
    private int fixCount = 0;

    /** Debug-diagnosztika: csak debuggable buildben, koordináta nélkül. */
    private void debug(String message) {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) Log.d("VedettNav", message);
    }

    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            fixCount++;
            if (fixCount == 1 || fixCount % 20 == 0) debug("location fix received count=" + fixCount);
            if (engine == null || !location.hasAccuracy()) return;
            deliver(engine.onLocation(location.getLatitude(), location.getLongitude(), location.getAccuracy(), System.currentTimeMillis()));
        }

        @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
    };

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            if (now - startedAtMs > MAX_SESSION_MS) {
                stopSelfCleanly();
                return;
            }
            if (engine != null) deliver(engine.onTick(now));
            handler.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        debug("onStartCommand action=" + action + " running=" + running);
        if (ACTION_STOP.equals(action) || ACTION_STOP_BY_USER.equals(action) || action == null) {
            if (ACTION_STOP_BY_USER.equals(action)) stoppedByUser = true;
            stopSelfCleanly();
            return START_NOT_STICKY;
        }
        List<AlertEngine.Target> targets = parsePlan(intent.getStringExtra(EXTRA_PLAN));
        long now = System.currentTimeMillis();
        if (ACTION_START.equals(action) || !running) {
            ensureChannels();
            Notification ongoing = buildOngoing();
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(ONGOING_ID, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                } else {
                    startForeground(ONGOING_ID, ongoing);
                }
            } catch (RuntimeException e) {
                // Android 12+/14+: indítási tiltás vagy hiányzó helyengedély — ne omoljon össze,
                // a web a getState() ellenőrzéssel látja, hogy nem fut (kontrollált újrapróba).
                debug("startForeground FAILED: " + e.getClass().getSimpleName());
                running = false;
                stopSelf();
                return START_NOT_STICKY;
            }
            debug("foreground started");
            if (engine == null) engine = new AlertEngine(now);
            instance = this;
            if (!running) {
                startedAtMs = now;
                stoppedByUser = false;
                running = true;
                startLocationUpdates();
                handler.postDelayed(tick, TICK_MS);
            }
        }
        engine.setPlan(targets, now); // frissítéskor a régi célpontok megszűnnek
        return START_NOT_STICKY;
    }

    private void startLocationUpdates() {
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 5f, listener, Looper.getMainLooper());
            debug("location updates requested");
        } catch (SecurityException | IllegalArgumentException e) {
            debug("location updates FAILED: " + e.getClass().getSimpleName());
            // Nincs engedély / nincs GPS-szolgáltató: csak a menetrendi tartalék marad.
        }
    }

    private void deliver(AlertEngine.Alert alert) {
        if (alert == null) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle(alert.title)
            .setContentText(alert.text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(alert.text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setVibrate(new long[] { 0, 400, 200, 400 })
            .setAutoCancel(true)
            .setContentIntent(openAppIntent())
            .build();
        nm.notify(ALERT_ID_BASE + (alertCounter++ % 50), n);
        // Hangjelzés CSAK a szolgáltatás által ténylegesen felismert eseményre
        // (leszállás közeledése / menetrendi becslés), CSAK bekapcsolt hangos
        // navigációnál, és CSAK ha az app nincs előtérben (előtérben a webes
        // navigáció szól — így nincs dupla felolvasás).
        if (speechEnabled && !NavigationTts.appInForeground) {
            final String spoken = alert.scheduleEstimate ? alert.title + ". " + alert.text : alert.text;
            final NavigationTts tts = NavigationTts.get(this);
            tts.whenInitialized(() -> {
                boolean ok = tts.speak(spoken, "alert-" + alert.targetId);
                debug("background alert speech " + (ok ? "queued" : "unavailable:" + tts.unavailableReason()));
            });
        }
    }

    private Notification buildOngoing() {
        Intent stop = new Intent(this, NavigationLocationService.class).setAction(ACTION_STOP_BY_USER);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL_ONGOING)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Védett Útvonal – navigáció aktív")
            .setContentText("A leszállás előtt értesítést kapsz.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setContentIntent(openAppIntent())
            .addAction(0, "Leállítás", stopPi)
            .build();
    }

    private PendingIntent openAppIntent() {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 2, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ongoing = new NotificationChannel(CHANNEL_ONGOING, "Navigáció folyamatban", NotificationManager.IMPORTANCE_LOW);
        NotificationChannel alerts = new NotificationChannel(CHANNEL_ALERTS, "Leszállási figyelmeztetés", NotificationManager.IMPORTANCE_HIGH);
        alerts.enableVibration(true);
        alerts.setVibrationPattern(new long[] { 0, 400, 200, 400 });
        nm.createNotificationChannel(ongoing);
        nm.createNotificationChannel(alerts);
    }

    static List<AlertEngine.Target> parsePlan(String json) {
        List<AlertEngine.Target> out = new ArrayList<>();
        if (json == null) return out;
        try {
            JSONArray arr = new JSONObject(json).optJSONArray("targets");
            if (arr == null) return out;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject t = arr.getJSONObject(i);
                if (!t.has("lat") || !t.has("lon") || !t.has("id")) continue;
                out.add(new AlertEngine.Target(
                    t.getString("id"),
                    t.optString("stopName", "a leszállási megálló"),
                    t.getDouble("lat"),
                    t.getDouble("lon"),
                    t.has("prevLat") ? t.getDouble("prevLat") : null,
                    t.has("prevLon") ? t.getDouble("prevLon") : null,
                    t.has("scheduledArrivalMs") ? t.getLong("scheduledArrivalMs") : null
                ));
            }
        } catch (Exception e) {
            out.clear(); // hibás terv: nincs riasztás (fail-safe)
        }
        return out;
    }

    private void stopSelfCleanly() {
        debug("stopping service stoppedByUser=" + stoppedByUser);
        running = false;
        speechEnabled = false;
        cancelDebugSpeechTest();
        instance = null;
        NavigationTts.get(this).shutdown(); // TTS-erőforrás felszabadítása navigációleállításkor
        handler.removeCallbacks(tick);
        if (locationManager != null) {
            try { locationManager.removeUpdates(listener); } catch (Exception ignored) {}
        }
        engine = null;
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelfCleanly();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        cancelDebugSpeechTest();
        instance = null;
        handler.removeCallbacks(tick);
        if (locationManager != null) {
            try { locationManager.removeUpdates(listener); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
