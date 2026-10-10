package hu.vedettsarok.utvonal.navigation;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import hu.vedettsarok.utvonal.BuildConfig;

/**
 * CSAK DEBUG BUILD (src/debug). ADB-ből:
 *   adb shell am broadcast -n hu.vedettsarok.utvonal.debug/hu.vedettsarok.utvonal.navigation.DebugSpeechTestReceiver
 * Aktív navigáció mellett 15 mp múlva egyszer felolvassa a tesztmondatot a meglévő
 * NavigationTts-sel (kikapcsolt hangos navigációnál néma; navigációleállítás törli).
 */
public class DebugSpeechTestReceiver extends BroadcastReceiver {
    private static final long DELAY_MS = 15_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!BuildConfig.DEBUG) return;
        boolean scheduled = NavigationLocationService.scheduleDebugSpeechTest(DELAY_MS);
        Log.d("VedettNav", scheduled
            ? "debug speech test accepted"
            : "debug speech test rejected (no active navigation or already pending)");
    }
}
