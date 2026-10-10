package hu.vedettsarok.utvonal.navigation;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class AlertEngineTest {
    private static final long T = 1_000_000_000L;
    private final AlertEngine.Target t1 = new AlertEngine.Target("leg1", "Astoria", 47.4935, 19.0605, 47.4960, 19.0560, T + 10 * 60_000L);
    private final AlertEngine.Target t2 = new AlertEngine.Target("leg2", "Blaha", 47.4965, 19.0700, null, null, T + 20 * 60_000L);

    @Test
    public void ordersTargetsGatesAccuracyAndFiresOnce() {
        AlertEngine e = new AlertEngine(T);
        e.setPlan(Arrays.asList(t1, t2), T);
        assertNull(e.onLocation(47.4979, 19.0540, 10, T + 60_000));
        assertNull(e.onLocation(47.4937, 19.0603, 80, T + 61_000));
        assertNull(e.onLocation(47.4965, 19.0700, 5, T + 62_000));
        AlertEngine.Alert a = e.onLocation(47.4937, 19.0603, 10, T + 63_000);
        assertNotNull(a);
        assertEquals("leg1", a.targetId);
        assertNull(e.onLocation(47.4936, 19.0604, 5, T + 64_000));
        e.setPlan(Arrays.asList(t1, t2), T + 65_000);
        assertNull(e.onLocation(47.4937, 19.0603, 10, T + 66_000));
    }

    @Test
    public void planUpdateDoesNotPostponeGpsLossFallback() {
        AlertEngine e = new AlertEngine(T);
        e.setPlan(Collections.singletonList(t2), T);
        e.setPlan(Collections.singletonList(t2), T + 18 * 60_000L); // változatlan terv frissítése
        assertNotNull(e.onTick(T + 18 * 60_000L + 1));
    }

    @Test
    public void scheduleFallbackIsLabelledOnceAndExpires() {
        AlertEngine k = new AlertEngine(T);
        k.setPlan(Collections.singletonList(t2), T);
        AlertEngine.Alert a = k.onTick(T + 18 * 60_000L + 1);
        assertNotNull(a);
        assertTrue(a.scheduleEstimate);
        assertNull(k.onTick(T + 19 * 60_000L));
        AlertEngine x = new AlertEngine(T);
        x.setPlan(Collections.singletonList(t2), T);
        assertNull(x.onTick(T + 31 * 60_000L));
    }
}
