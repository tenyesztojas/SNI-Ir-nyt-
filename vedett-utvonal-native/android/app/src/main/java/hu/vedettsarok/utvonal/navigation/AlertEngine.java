package hu.vedettsarok.utvonal.navigation;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Védett Útvonal — háttérnavigációs leszállási figyelmeztetés (MVP).
 * Tiszta Java (nincs Android-függés), JVM-en tesztelhető.
 *
 * Szabályok:
 * - A célpontokat (leszállási megállók) SORRENDBEN kezeli: mindig csak az
 *   első, még el nem küldött célpont aktív, így egy későbbi szakasz közeli
 *   megállója nem riaszt korán.
 * - GPS-alapú riasztás csak elég pontos pozíciónál (accuracy <= MAX_ACCURACY_M
 *   és a sugár felénél jobb), a sugár közeli megállóknál a két megálló
 *   távolságához igazodik (nem riaszt az előző megálló előtt).
 * - Ha hosszabb ideje nincs használható GPS (pl. metró), a tervezett érkezés
 *   előtt egy MENETRENDI BECSLÉS jelölésű figyelmeztetés megy.
 * - Minden célpont legfeljebb egyszer riaszt (terv-frissítés után sem).
 */
public final class AlertEngine {
    public static final double MAX_ACCURACY_M = 50.0;
    public static final double DEFAULT_RADIUS_M = 400.0;
    public static final double MIN_RADIUS_M = 120.0;
    public static final long GPS_LOSS_FALLBACK_MS = 90_000L;
    public static final long TIME_FALLBACK_LEAD_MS = 2 * 60_000L;
    /** A tervezett érkezés után ennyivel a célpont lejártnak számít (néma kihagyás, nincs riasztás). */
    public static final long TARGET_EXPIRY_MS = 10 * 60_000L;

    public static final class Target {
        public final String id;
        public final String stopName;
        public final double lat;
        public final double lon;
        public final Double prevLat;
        public final Double prevLon;
        public final Long scheduledArrivalMs;

        public Target(String id, String stopName, double lat, double lon, Double prevLat, Double prevLon, Long scheduledArrivalMs) {
            this.id = id;
            this.stopName = stopName;
            this.lat = lat;
            this.lon = lon;
            this.prevLat = prevLat;
            this.prevLon = prevLon;
            this.scheduledArrivalMs = scheduledArrivalMs;
        }
    }

    public static final class Alert {
        public final String targetId;
        public final String title;
        public final String text;
        public final boolean scheduleEstimate;

        Alert(String targetId, String title, String text, boolean scheduleEstimate) {
            this.targetId = targetId;
            this.title = title;
            this.text = text;
            this.scheduleEstimate = scheduleEstimate;
        }
    }

    private final List<Target> targets = new ArrayList<>();
    private final Set<String> fired = new HashSet<>();
    private long lastUsableFixMs = -1L;
    private long startedAtMs;

    public AlertEngine(long nowMs) {
        this.startedAtMs = nowMs;
    }

    /**
     * Új/frissített terv: a régi célpontok elvesznek, a már elküldött azonosítók nem riasztanak újra.
     * A GPS-kiesési időzítés a pozíciókhoz kötött, nem a tervhez: tervfrissítés NEM nullázza
     * (különben minden frissítés elhalasztaná a menetrendi tartalékot).
     */
    public synchronized void setPlan(List<Target> newTargets, long nowMs) {
        targets.clear();
        if (newTargets != null) targets.addAll(newTargets);
    }

    public synchronized Set<String> firedIds() {
        return new HashSet<>(fired);
    }

    private Target activeTarget(long nowMs) {
        for (Target t : targets) {
            if (fired.contains(t.id)) continue;
            if (t.scheduledArrivalMs != null && nowMs > t.scheduledArrivalMs + TARGET_EXPIRY_MS) continue;
            return t;
        }
        return null;
    }

    static double radiusFor(Target t) {
        if (t.prevLat == null || t.prevLon == null) return DEFAULT_RADIUS_M;
        double gap = distanceMeters(t.prevLat, t.prevLon, t.lat, t.lon);
        return Math.max(MIN_RADIUS_M, Math.min(DEFAULT_RADIUS_M, gap * 0.6));
    }

    /** GPS-pozíció. Visszaad egy figyelmeztetést, ha most kell küldeni, különben null. */
    public synchronized Alert onLocation(double lat, double lon, double accuracyM, long nowMs) {
        Target t = activeTarget(nowMs);
        if (t == null) return null;
        if (!(accuracyM > 0) || accuracyM > MAX_ACCURACY_M) return null; // bizonytalan pozíció: nincs állítás
        lastUsableFixMs = nowMs;
        double radius = radiusFor(t);
        if (accuracyM > radius / 2.0) return null;
        double d = distanceMeters(lat, lon, t.lat, t.lon);
        if (d > radius) return null;
        fired.add(t.id);
        return new Alert(t.id, "Hamarosan szállj le", "Közeledsz a leszállási megállóhoz: " + t.stopName + ".", false);
    }

    /** Időzítő-tick: menetrendi tartalék, ha hosszabb ideje nincs használható GPS. */
    public synchronized Alert onTick(long nowMs) {
        Target t = activeTarget(nowMs);
        if (t == null || t.scheduledArrivalMs == null) return null;
        long lastGood = lastUsableFixMs >= 0 ? lastUsableFixMs : startedAtMs;
        if (nowMs - lastGood < GPS_LOSS_FALLBACK_MS) return null;
        if (nowMs < t.scheduledArrivalMs - TIME_FALLBACK_LEAD_MS) return null;
        fired.add(t.id);
        return new Alert(
            t.id,
            "Menetrendi becslés",
            "GPS-jel nélkül, csak a menetrend alapján: hamarosan érkezhetsz ide: " + t.stopName + ". Ellenőrizd a járművön a kijelzést.",
            true
        );
    }

    public static double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
        double r = 6_371_000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * r * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }
}
