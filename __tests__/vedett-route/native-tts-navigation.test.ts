// VÉDETT ÚTVONAL — natív (Android TextToSpeech) magyar hangos navigáció
//   node --test __tests__/vedett-route/native-tts-navigation.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getNativeTtsStatus,
  nativeSpeak,
  nativeStopSpeaking,
  onNativeTtsError,
  setNativeSpeechEnabled,
} from "../../lib/vedett-route/native/nativeNavigationBridge.ts";
import {
  describeNativeTtsError,
  describeNativeTtsUnavailable,
  resolveSpeechEngine,
} from "../../lib/vedett-route/navigation/speechSupport.ts";

const read = (p: string) => readFileSync(p, "utf8");
const NAV = "vedett-utvonal-native/android/app/src/main/java/hu/vedettsarok/utvonal/navigation/";
const tts = read(NAV + "NavigationTts.java");
const plugin = read(NAV + "VedettNavigationPlugin.java");
const service = read(NAV + "NavigationLocationService.java");
const hook = read("lib/hooks/useNavigationSpeech.ts");
const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");

function nativeWin(handler: (method: string, opts?: Record<string, unknown>) => unknown) {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const listeners: Record<string, (d: unknown) => void> = {};
  return {
    calls,
    listeners,
    win: {
      Capacitor: {
        isNativePlatform: () => true,
        nativePromise: async (_p: string, method: string, opts?: Record<string, unknown>) => {
          calls.push([method, opts]);
          const r = handler(method, opts);
          if (r instanceof Error) throw r;
          return r;
        },
        addListener: (_p: string, ev: string, cb: (d: unknown) => void) => {
          listeners[ev] = cb;
          return { remove: () => delete listeners[ev] };
        },
      },
    },
  };
}

describe("beszédmotor-választás (web és iOS nem romlik)", () => {
  test("natív app + elérhető magyar TTS -> native; hiányzó -> web fallback vagy none; böngésző -> web/none", () => {
    assert.equal(resolveSpeechEngine({ nativePlatform: true, nativeTts: null, webSupported: false }), "pending");
    assert.equal(resolveSpeechEngine({ nativePlatform: true, nativeTts: { available: true }, webSupported: false }), "native");
    assert.equal(resolveSpeechEngine({ nativePlatform: true, nativeTts: { available: false }, webSupported: true }), "web");
    assert.equal(resolveSpeechEngine({ nativePlatform: true, nativeTts: { available: false }, webSupported: false }), "none");
    assert.equal(resolveSpeechEngine({ nativePlatform: false, nativeTts: null, webSupported: true }), "web");
    assert.equal(resolveSpeechEngine({ nativePlatform: false, nativeTts: null, webSupported: false }), "none");
  });
});

describe("magyar nyelvű natív hangutasítás (Android)", () => {
  test("ellenőrzött init: READY csak sikeres motor + hu-HU nyelv esetén; hiányzó adat / nem támogatott nyelv -> UNAVAILABLE", () => {
    assert.match(tts, /tts\.setLanguage\(new Locale\("hu", "HU"\)\)/);
    assert.match(tts, /LANG_MISSING_DATA\) \{\s*\n\s*finishInit\(State\.UNAVAILABLE, "LANGUAGE_MISSING_DATA"\)/);
    assert.match(tts, /LANG_NOT_SUPPORTED\) \{\s*\n\s*finishInit\(State\.UNAVAILABLE, "LANGUAGE_NOT_SUPPORTED"\)/);
    assert.match(tts, /status != TextToSpeech\.SUCCESS[\s\S]{0,80}"ENGINE_INIT_FAILED"/);
    assert.match(tts, /if \(state != State\.READY \|\| tts == null[\s\S]{0,80}return false;/);
  });

  test("a webes hook natív motornál ugyanazt a normalizált magyar szöveget a natív TTS-nek adja", () => {
    assert.match(hook, /if \(engineRef\.current === "native"\) \{\s*\n\s*const text = normalizeHungarianTransitSpeech\(announcement\.text\);\s*\n\s*void nativeSpeak\(text, announcement\.key\)/);
  });

  test("híd: státusz, felolvasás, leállítás — zárt okkódokkal", async () => {
    const ok = nativeWin((m) => (m === "ttsStatus" ? { available: true, reason: null } : {}));
    assert.deepEqual(await getNativeTtsStatus(ok.win), { available: true, reason: null });
    assert.equal(await nativeSpeak("Szállj le a következő megállónál.", "k1", ok.win), true);
    assert.equal(await nativeStopSpeaking(ok.win), true);
    assert.deepEqual(ok.calls.map((c) => c[0]), ["ttsStatus", "speak", "stopSpeaking"]);
    assert.deepEqual(ok.calls[1][1], { text: "Szállj le a következő megállónál.", id: "k1" });
  });
});

describe("hiányzó vagy hibás TTS-motor", () => {
  test("hiányzó magyar hang / motorhiba -> available:false + érthető üzenet; ismeretlen ok nem szivárog", async () => {
    for (const reason of ["LANGUAGE_MISSING_DATA", "LANGUAGE_NOT_SUPPORTED", "ENGINE_INIT_FAILED", "INIT_TIMEOUT"]) {
      const b = nativeWin(() => ({ available: false, reason }));
      assert.deepEqual(await getNativeTtsStatus(b.win), { available: false, reason });
    }
    const weird = nativeWin(() => ({ available: false, reason: "some raw <text>" }));
    assert.deepEqual(await getNativeTtsStatus(weird.win), { available: false, reason: "UNKNOWN" });
    assert.match(describeNativeTtsUnavailable("LANGUAGE_MISSING_DATA"), /telepítsd a magyar hangot/);
    assert.match(describeNativeTtsUnavailable("ENGINE_INIT_FAILED"), /nem indult el/);
  });

  test("régi app (nincs plugin) / böngésző: nincs natív TTS, nincs kivétel", async () => {
    const old = nativeWin(() => Object.assign(new Error("plugin is not implemented on android"), { code: "UNIMPLEMENTED" }));
    assert.deepEqual(await getNativeTtsStatus(old.win), { available: false, reason: "PLUGIN_UNAVAILABLE" });
    assert.deepEqual(await getNativeTtsStatus({}), { available: false, reason: "NOT_NATIVE" });
  });

  test("felolvasás elutasítva -> false (nincs sikeres felolvasás állítva), hibaüzenet; ttsError esemény -> üzenet", async () => {
    const b = nativeWin(() => new Error("TTS_UNAVAILABLE"));
    assert.equal(await nativeSpeak("x", "k", b.win), false);
    assert.match(hook, /else setLastErrorMessage\(describeNativeTtsError\("TTS_UNAVAILABLE"\)\);/);
    const l = nativeWin(() => ({}));
    const got: string[] = [];
    const off = onNativeTtsError((c) => got.push(c), l.win);
    l.listeners.ttsError({ code: "SPEAK_FAILED_-3" });
    l.listeners.ttsError({ code: "nem zárt <kód>" });
    off();
    assert.deepEqual(got, ["SPEAK_FAILED_-3", "SPEAK_FAILED"]);
    assert.match(describeNativeTtsError("SPEAK_FAILED"), /képernyőn lévő utasítások/);
  });

  test("a felület natív okkód esetén a részletes magyarázatot mutatja", () => {
    assert.match(form, /describeNativeTtsUnavailable\(navigationSpeechStatus\.nativeUnavailableReason\)/);
    assert.match(form, /navigationSpeechStatus\.engine === "pending" \? null : navigationSpeechStatus\.engine !== "none"/);
  });
});

describe("be- és kikapcsolás minden felolvasási úton", () => {
  test("a beállítás a natív háttér-figyelmeztetésre is érvényes; alapból KI, navigáció végén KI", async () => {
    assert.match(form, /void setNativeSpeechEnabled\(navigationMode && navigationSpeechPreference\);/);
    assert.match(service, /static volatile boolean speechEnabled = false;/);
    assert.match(service, /running = false;\s*\n\s*speechEnabled = false;/);
    assert.match(plugin, /if \(!enabled\) NavigationTts\.get\(getContext\(\)\)\.stop\(\);/);
    const b = nativeWin(() => ({}));
    assert.equal(await setNativeSpeechEnabled(false, b.win), true);
    assert.deepEqual(b.calls[0], ["setSpeechEnabled", { enabled: false }]);
  });

  test("kikapcsoláskor / navigációleállításkor a webes ÉS natív felolvasás is megszakad", () => {
    assert.match(hook, /const cancelAll = \(\) => \{\s*\n\s*getSpeechSynthesis\(\)\?\.cancel\(\);\s*\n\s*if \(engineRef\.current === "native"\) void nativeStopSpeaking\(\);/);
    assert.match(hook, /stateRef\.current = INITIAL_SPEECH_ANNOUNCER_STATE;\s*\n\s*cancelAll\(\);/);
  });
});

describe("sorrend és duplikációmentesség", () => {
  test("a natív út is a meglévő speechAnnouncer dedupe-döntése UTÁN fut; QUEUE_FLUSH (nincs elavult várólista)", () => {
    const i = hook.indexOf("const decision = resolveSpeechDecision(stateRef.current, announcement);");
    const j = hook.indexOf('if (engineRef.current === "native") {');
    assert.ok(i > 0 && j > i);
    assert.match(tts, /tts\.speak\(text, TextToSpeech\.QUEUE_FLUSH,/);
  });

  test("előtérben a háttérszolgáltatás nem beszél (nincs dupla felolvasás)", () => {
    assert.match(service, /if \(speechEnabled && !NavigationTts\.appInForeground\) \{/);
    assert.match(plugin, /protected void handleOnPause\(\) \{\s*\n\s*NavigationTts\.appInForeground = false;/);
    assert.match(plugin, /protected void handleOnResume\(\) \{\s*\n\s*NavigationTts\.appInForeground = true;/);
  });
});

describe("leállítás felolvasás közben, erőforrások", () => {
  test("navigáció leállítása: TTS stop, szolgáltatás leállásakor shutdown", () => {
    assert.match(plugin, /public void stop\(PluginCall call\) \{\s*\n\s*NavigationTts\.get\(getContext\(\)\)\.stop\(\);/);
    assert.match(service, /NavigationTts\.get\(this\)\.shutdown\(\);/);
    assert.match(tts, /public synchronized void shutdown\(\) \{\s*\n\s*stop\(\);[\s\S]{0,120}tts\.shutdown\(\)/);
  });
});

describe("háttérben / lezárt képernyőn: csak a ténylegesen felismert esemény szól", () => {
  test("hang csak az AlertEngine figyelmeztetésére (deliver), menetrendi becslésnél jelölve", () => {
    const deliver = service.slice(service.indexOf("private void deliver("), service.indexOf("private Notification buildOngoing"));
    assert.match(deliver, /if \(alert == null\) return;/);
    assert.match(deliver, /alert\.scheduleEstimate \? alert\.title \+ "\. " \+ alert\.text : alert\.text/);
    // 2026-10-10: a második .speak( kizárólag a BuildConfig.DEBUG-hoz kötött ADB-hangteszt.
    assert.equal((service.match(/\.speak\(/g) ?? []).length, 2);
    const dbg = service.slice(service.indexOf("static boolean scheduleDebugSpeechTest"), service.indexOf("private void cancelDebugSpeechTest"));
    assert.match(dbg, /if \(!BuildConfig\.DEBUG\) return false;/);
    assert.match(dbg, /\.speak\(DEBUG_SPEECH_TEST_TEXT/);
  });

  test("debug hangteszt: csak debug source set, egyszeri, néma kikapcsolt hangnál, leállításkor törlődik", () => {
    const dbg = service.slice(service.indexOf("static boolean scheduleDebugSpeechTest"), service.indexOf("private void cancelDebugSpeechTest"));
    assert.match(dbg, /if \(debugSpeechTest != null\) return false;/);
    assert.match(dbg, /if \(!speechEnabled\) \{\s*\n\s*debug\("debug speech test: silent/);
    assert.match(service, /speechEnabled = false;\s*\n\s*cancelDebugSpeechTest\(\);/);
    assert.doesNotMatch(read("vedett-utvonal-native/android/app/src/main/AndroidManifest.xml"), /DebugSpeechTestReceiver/);
    assert.match(read("vedett-utvonal-native/android/app/src/debug/AndroidManifest.xml"), /DebugSpeechTestReceiver/);
  });
});

describe("audio focus", () => {
  test("rövid, duckolós navigációs fókusz; felolvasás után elengedve", () => {
    assert.match(tts, /AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK/);
    assert.match(tts, /USAGE_ASSISTANCE_NAVIGATION_GUIDANCE/);
    assert.match(tts, /public void onDone\(String utteranceId\) \{\s*\n\s*main\.post\(NavigationTts\.this::abandonFocus\);/);
    assert.doesNotMatch(tts, /AUDIOFOCUS_GAIN\)|AUDIOFOCUS_GAIN,/);
  });

  test("adatvédelem: nincs szöveg- vagy helynaplózás a TTS-ben", () => {
    assert.doesNotMatch(tts, /Log\.[dwie]\(/);
  });
});
