// VÉDETT ÚTVONAL — navigáció visszaállítása újraindítás után, háttérnavigációs
// tájékoztatás, hangtámogatás-felismerés (2026-10-09)
//   node --test __tests__/vedett-route/navigation-resume-and-background-notice.test.ts

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NAVIGATION_SESSION_STORAGE_KEY,
  NAVIGATION_SESSION_TTL_MS,
  clearNavigationSession,
  deriveDestinationFromJourney,
  loadNavigationSession,
  saveNavigationSession,
  serializeNavigationSession,
} from "../../lib/vedett-route/navigation/navigationSessionPersistence.ts";
import {
  JOURNEY_FINISHED_GRACE_MS,
  TRANSIT_SCHEDULE_GRACE_MS,
  assessJourneyResume,
  assessNavigationResume,
  describeNavigationResume,
} from "../../lib/vedett-route/navigation/navigationResume.ts";
import {
  createInitialForegroundRecoveryState,
  isForegroundRecoveryActive,
  startForegroundRecovery,
  updateForegroundRecoveryPhase,
} from "../../lib/vedett-route/navigation/foregroundReacquisition.ts";
import { createInitialRerouteGuardState, shouldStartAutomaticReroute } from "../../lib/vedett-route/navigation/rerouteGuard.ts";
import {
  BACKGROUND_NAVIGATION_NOTICE_ACK_KEY,
  BACKGROUND_NAVIGATION_NOTICE_TEXT,
  loadBackgroundNavigationNoticeAcknowledged,
  saveBackgroundNavigationNoticeAcknowledged,
  shouldShowBackgroundNavigationNotice,
} from "../../lib/vedett-route/navigation/backgroundNavigationNotice.ts";
import { detectSpeechSynthesisSupport } from "../../lib/vedett-route/navigation/speechSupport.ts";
import type { Journey } from "../../lib/vedett-route/types.ts";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}
type G = { window: { localStorage: ReturnType<typeof createMemoryStorage> } };
(globalThis as unknown as G).window = { localStorage: createMemoryStorage() };
const storage = () => (globalThis as unknown as G).window.localStorage;

const T0 = Date.parse("2026-10-09T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

function makeJourney(overrides: Partial<Journey> = {}): Journey {
  return {
    totalDurationMinutes: 40,
    departureTime: iso(T0),
    arrivalTime: iso(T0 + 40 * MIN),
    walkingMinutes: 8,
    waitingMinutes: 2,
    transfers: 0,
    realtimeAvailable: true,
    fingerprint: "fp-resume-1",
    alerts: [],
    legs: [
      { mode: "WALK", fromName: "Otthon", toName: "Deák tér", durationMinutes: 5, departureTime: iso(T0), arrivalTime: iso(T0 + 5 * MIN) },
      {
        mode: "TRANSIT",
        fromName: "Deák tér",
        toName: "Örs vezér tere",
        durationMinutes: 30,
        departureTime: iso(T0 + 7 * MIN),
        arrivalTime: iso(T0 + 37 * MIN),
        realtime: true,
        delayMinutes: 2,
        tripId: "trip-m2",
        routeId: "M2",
      },
      { mode: "WALK", fromName: "Örs vezér tere", toName: "Cél", durationMinutes: 3, toLat: 47.5, toLon: 19.13 },
    ],
    ...overrides,
  } as Journey;
}

function saveSession(journey: Journey, savedAt: number, extra: Record<string, unknown> = {}) {
  const session = serializeNavigationSession({
    destination: deriveDestinationFromJourney(journey),
    displayedJourney: journey,
    nowMs: savedAt,
    liveRerouteContext: {
      weights: { transfers: 2, modeSwitches: 1, underground: 0, walking: 2, duration: 1, waiting: 1 },
      stepFreeRequired: true,
      molBubiEnabled: false,
      bikePropulsion: "ANY",
      timeMode: "DEPART_AT",
    },
  });
  storage().setItem(NAVIGATION_SESSION_STORAGE_KEY, JSON.stringify({ ...session, ...extra }));
}

const formSrc = readFileSync("components/vedett-utvonal/VedettUtvonalSearchForm.tsx", "utf8");

beforeEach(() => clearNavigationSession());

describe("1) érvényes munkamenet felismerése új keresés nélkül", () => {
  test("a főkomponens mountkor betölti és értékeli a mentett sessiont (nincs fingerprint-egyezés feltétel, nincs keresés)", () => {
    const m = formSrc.match(/useEffect\(\(\) => \{\s*\n\s*const nowMs = Date\.now\(\);\s*\n\s*const persisted = loadNavigationSession\(nowMs\);[\s\S]*?\}, \[\]\);/);
    assert.ok(m, "resume-offer mount effekt");
    assert.match(m[0], /setNavigationResumeOffer\(\{ session: persisted, assessment: assessNavigationResume\(persisted, nowMs\) \}\)/);
    assert.doesNotMatch(m[0], /fetch\(|fingerprint|setNavigationMode|handleSubmit/);
  });

  test("érvényes, folytatható session: RESUMABLE, és a kérdés szövege 'Folytatod a korábbi navigációt?'", () => {
    saveSession(makeJourney(), T0);
    const loaded = loadNavigationSession(T0 + 2 * MIN);
    assert.ok(loaded);
    assert.deepEqual(assessNavigationResume(loaded!, T0 + 2 * MIN), { status: "RESUMABLE", transitAlreadyDeparted: false });
    assert.match(formSrc, /"Folytatod a korábbi navigációt\?"/);
  });
});

describe("2) felhasználói jóváhagyás utáni visszaállítás", () => {
  test("a kártya visszaállító effektje KIZÁRÓLAG resumeApproved esetén fut, és a meglévő restorePersistedNavigation()-t hívja", () => {
    const m = formSrc.match(/useEffect\(\(\) => \{[^}]*?if \(!resumeApproved\) return;[\s\S]*?\n {2}\}, \[\]\);/);
    assert.ok(m);
    assert.match(m[0], /restorePersistedNavigation\(persisted\);/);
  });

  test("resumeApproved csak a 'Folytatom' által beállított, külön renderelt kártyán true", () => {
    assert.equal((formSrc.match(/\bresumeApproved\n/g) ?? []).length, 1, "pontosan egy helyen adjuk át");
    const block = formSrc.slice(formSrc.indexOf('data-testid="resumed-navigation"'), formSrc.indexOf("resumeApproved\n") + 20);
    assert.match(block, /liveRerouteContext=\{resumedNavigationSession\.liveRerouteContext \?\? null\}/);
    assert.match(block, /weights=\{resumedNavigationSession\.liveRerouteContext\?\.weights \?\? weights\}/);
    const accept = formSrc.match(/const handleAcceptNavigationResume = \(\) => \{[\s\S]*?\n {2}\};/)![0];
    assert.match(accept, /assessNavigationResume\(fresh, nowMs\)/);
    assert.match(accept, /if \(assessment\.status !== "RESUMABLE"\)/);
    assert.match(accept, /setResumedNavigationSession\(fresh\)/);
    assert.match(formSrc, />\s*Folytatom\s*</);
  });

  test("a mentett útvonal, úti cél és routing-korlátok (stepFree, súlyok) megmaradnak", () => {
    const j = makeJourney();
    saveSession(j, T0);
    const loaded = loadNavigationSession(T0 + MIN)!;
    assert.equal(loaded.displayedJourney.fingerprint, j.fingerprint);
    assert.equal(loaded.destination.name, "Cél");
    assert.equal(loaded.liveRerouteContext?.stepFreeRequired, true);
    assert.equal(loaded.liveRerouteContext?.weights.walking, 2);
  });
});

describe("3) elutasítás és a mentés törlése", () => {
  test("'Nem, elvetem' -> clearNavigationSession(), a kérdés eltűnik", () => {
    const decline = formSrc.match(/const handleDeclineNavigationResume = \(\) => \{[\s\S]*?\n {2}\};/)![0];
    assert.match(decline, /clearNavigationSession\(\);/);
    assert.match(decline, /setNavigationResumeOffer\(null\);/);
    assert.doesNotMatch(decline, /setResumedNavigationSession|restorePersistedNavigation/);
    saveSession(makeJourney(), T0);
    clearNavigationSession();
    assert.equal(loadNavigationSession(T0 + MIN), null);
  });

  test("'Új útvonal ugyanoda' is törli a mentést, és csak a keresőt tölti elő (nincs routing-hívás)", () => {
    const replan = formSrc.match(/const handleReplanFromNavigationResume = \(\) => \{[\s\S]*?\n {2}\};/)![0];
    assert.match(replan, /clearNavigationSession\(\);/);
    assert.match(replan, /setDestination\(\{\s*type: "KNOWN_PLACE"/);
    assert.match(replan, /setStepFreeRequired\(ctx\.stepFreeRequired\)/);
    assert.doesNotMatch(replan, /fetch\(|handleSubmit|setNavigationMode/);
  });
});

describe("4) lejárt munkamenet", () => {
  test("a hatórás TTL érvényben marad: lejárt session nem jelenik meg, és törlődik", () => {
    saveSession(makeJourney(), T0);
    assert.equal(loadNavigationSession(T0 + NAVIGATION_SESSION_TTL_MS + 1), null);
    assert.equal(storage().getItem(NAVIGATION_SESSION_STORAGE_KEY), null);
  });

  test("az út tervezett érkezése + türelmi idő után: JOURNEY_FINISHED, újratervezés javasolt", () => {
    const j = makeJourney();
    const a = assessJourneyResume(j, Date.parse(j.arrivalTime) + JOURNEY_FINISHED_GRACE_MS + 1);
    assert.equal(a.status, "REPLAN_RECOMMENDED");
    assert.match(describeNavigationResume(a), /Tervezz új útvonalat/);
  });
});

describe("5) már nem folytatható közösségi közlekedési útvonal", () => {
  test("az utolsó járat érkezése + 5 perc után TRANSIT_SCHEDULE_PASSED — a folytatás nem ajánlható fel", () => {
    const j = makeJourney({ arrivalTime: iso(T0 + 300 * MIN) }); // a teljes út még "tartana", de a járat elment
    const a = assessJourneyResume(j, T0 + 37 * MIN + TRANSIT_SCHEDULE_GRACE_MS + 1);
    assert.deepEqual(a, { status: "REPLAN_RECOMMENDED", reason: "TRANSIT_SCHEDULE_PASSED" });
    assert.match(describeNavigationResume(a), /járatai már elmentek/);
    assert.match(formSrc, /navigationResumeOffer\.assessment\.status === "RESUMABLE" && \(\s*<button type="button" onClick=\{handleAcceptNavigationResume\}/);
  });

  test("elindult, de még tartó járat: folytatható, figyelmeztetéssel", () => {
    const a = assessJourneyResume(makeJourney(), T0 + 15 * MIN);
    assert.deepEqual(a, { status: "RESUMABLE", transitAlreadyDeparted: true });
    assert.match(describeNavigationResume(a), /lemaradtál/);
  });

  test("gyalogos útvonal (nincs járat) a TTL-en és az érkezési türelmi időn belül folytatható", () => {
    const j = makeJourney({ legs: [{ mode: "WALK", fromName: "A", toName: "B", durationMinutes: 20 }] as Journey["legs"] });
    assert.deepEqual(assessJourneyResume(j, T0 + 30 * MIN), { status: "RESUMABLE", transitAlreadyDeparted: false });
  });

  test("hiányzó fingerprint: nem állítható vissza megbízhatóan", () => {
    assert.equal(assessJourneyResume(makeJourney({ fingerprint: undefined }), T0).status, "REPLAN_RECOMMENDED");
  });
});

describe("6) GPS-stabilizálás visszaállítás után", () => {
  test("a mentés nem tartalmaz felhasználói GPS-pozíciót", () => {
    saveSession(makeJourney(), T0);
    const raw = JSON.parse(storage().getItem(NAVIGATION_SESSION_STORAGE_KEY)!);
    for (const k of ["currentPosition", "geo", "latitude", "lastFix", "routeProgress", "offRouteStatus"]) {
      assert.ok(!(k in raw), k);
    }
  });

  test("restore -> restore-recovery aktív -> automatikus OFF_ROUTE reroute blokkolt, amíg nincs stabil friss GPS", () => {
    let recovery = startForegroundRecovery(createInitialForegroundRecoveryState());
    const input = {
      navigationActive: true,
      offRouteStatus: "OFF_ROUTE" as const,
      hasCurrentPosition: true,
      hasDestination: true,
      nowMs: 100_000,
    };
    const blocked = shouldStartAutomaticReroute(createInitialRerouteGuardState(), {
      ...input,
      restoreRecoveryActive: isForegroundRecoveryActive(recovery.phase),
    } as Parameters<typeof shouldStartAutomaticReroute>[1]);
    assert.equal(blocked.reason, "RESTORE_RECOVERY_ACTIVE");
    recovery = updateForegroundRecoveryPhase(recovery, { usable: true, reacquiring: false });
    assert.equal(isForegroundRecoveryActive(recovery.phase), false);
  });

  test("restorePersistedNavigation: reroute-guard reset, restore-recovery indul, friss GPS-figyelés (geo.startWatching)", () => {
    const r = formSrc.match(/const restorePersistedNavigation = \(persisted: PersistedNavigationSession\) => \{[\s\S]*?\n {2}\};/)![0];
    assert.match(r, /rerouteGuardRef\.current = resetRerouteGuard\(\);/);
    assert.match(r, /restoreRecoveryRef\.current = startForegroundRecovery\(restoreRecoveryRef\.current\);/);
    assert.match(r, /sanitizeRestoredJourney\(persisted\.displayedJourney\)/);
    assert.match(r, /geo\.startWatching\(\);/);
  });
});

describe("7) régi alternatív ajánlatok és szimulációs állapot kizárása", () => {
  test("a betöltés whitelistel: idegen mezők (Live Alternative ajánlat, szimuláció) nem jutnak vissza", () => {
    saveSession(makeJourney(), T0, {
      liveAlternativeOffer: { status: "OFFERED" },
      journeyMonitorSimulation: { active: true },
      foo: 1,
    });
    const loaded = loadNavigationSession(T0 + MIN)! as unknown as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(loaded).sort(),
      ["destination", "displayedJourney", "liveRerouteContext", "navigationActive", "savedAt", "schemaVersion"],
    );
  });

  test("a visszaállított kártya friss mount (új key), az LA-állapot kezdőállapotból indul", () => {
    assert.match(formSrc, /key=\{`resumed-\$\{resumedNavigationSession\.savedAt\}`\}/);
    assert.match(formSrc, /useState\(createInitialLiveAlternativeOffer\(\)\)/);
    assert.doesNotMatch(
      readFileSync("lib/vedett-route/navigation/navigationSessionPersistence.ts", "utf8"),
      /liveAlternativeOffer|simulation/i,
    );
  });
});

describe("8) hangtámogatás hiányának kezelése", () => {
  test("detectSpeechSynthesisSupport: csak teljes API esetén true", () => {
    const Utter = function () {};
    assert.equal(detectSpeechSynthesisSupport(null), false);
    assert.equal(detectSpeechSynthesisSupport({}), false);
    assert.equal(detectSpeechSynthesisSupport({ speechSynthesis: { speak() {}, cancel() {} } }), false);
    assert.equal(detectSpeechSynthesisSupport({ SpeechSynthesisUtterance: Utter }), false);
    assert.equal(detectSpeechSynthesisSupport({ SpeechSynthesisUtterance: Utter, speechSynthesis: null }), false);
    assert.equal(detectSpeechSynthesisSupport({ SpeechSynthesisUtterance: Utter, speechSynthesis: { speak() {} } }), false);
    assert.equal(detectSpeechSynthesisSupport({ SpeechSynthesisUtterance: Utter, speechSynthesis: { speak() {}, cancel() {} } }), true);
  });

  test("a hangkapcsoló csak támogatott esetben jelenik meg; nem támogatottnál tájékoztató sor", () => {
    const i = formSrc.indexOf("{speechSynthesisSupported === true && (");
    const sw = formSrc.indexOf('role="switch"', i);
    assert.ok(i > 0 && sw > i && sw - i < 400, "a switch a támogatás-feltételen belül van");
    assert.equal((formSrc.match(/role="switch"\s*\n\s*aria-checked=\{navigationSpeechPreference\}/g) ?? []).length, 1);
    assert.match(formSrc, /speechSynthesisSupported === false && \([\s\S]{0,200}Hangos navigáció ezen az eszközön nem érhető el\./);
    assert.match(readFileSync("lib/hooks/useNavigationSpeech.ts", "utf8"), /detectSpeechSynthesisSupport\(/);
  });
});

describe("9) háttérnavigációs tájékoztatás és kártyaelrendezés", () => {
  beforeEach(() => storage().removeItem(BACKGROUND_NAVIGATION_NOTICE_ACK_KEY));

  test("szöveg pontosan a specifikáció szerinti", () => {
    assert.equal(
      BACKGROUND_NAVIGATION_NOTICE_TEXT,
      "A folyamatos navigációhoz tartsd nyitva az alkalmazást. Lezárt képernyőnél vagy másik alkalmazás használatakor a követés szünetelhet.",
    );
  });

  test("nem ismétlődik indokolatlanul: 'Értem' után többé nem jelenik meg; navigáció nélkül sosem", () => {
    assert.equal(shouldShowBackgroundNavigationNotice({ navigationActive: false, acknowledged: false }), false);
    assert.equal(shouldShowBackgroundNavigationNotice({ navigationActive: true, acknowledged: loadBackgroundNavigationNoticeAcknowledged() }), true);
    saveBackgroundNavigationNoticeAcknowledged();
    assert.equal(loadBackgroundNavigationNoticeAcknowledged(), true);
    assert.equal(shouldShowBackgroundNavigationNotice({ navigationActive: true, acknowledged: true }), false);
  });

  test("navigációs munkamenetenként egyszer (navigationMode-hoz kötött), látható kártya mellett automatikusan eltűnik", () => {
    assert.match(formSrc, /useEffect\(\(\) => \{\s*\n\s*if \(!navigationMode\) \{\s*\n\s*setBackgroundNoticeVisible\(false\);[\s\S]*?\}, \[navigationMode\]\);/);
    assert.match(formSrc, /setTimeout\(\(\) => setBackgroundNoticeVisible\(false\), BACKGROUND_NAVIGATION_NOTICE_AUTO_HIDE_MS\)/);
  });

  test("az utasításkártyán BELÜL jelenik meg (nem takar, nem blokkol): nem fixed/absolute overlay, van 'Értem' gomb", () => {
    const card = formSrc.indexOf("ref={navigationInstructionCardRef}");
    const notice = formSrc.indexOf('data-testid="background-navigation-notice"');
    const topBar = formSrc.indexOf("ref={topActionBarRef}");
    assert.ok(card > 0 && notice > card && topBar > notice, "a tájékoztató az utasításkártya JSX-én belül, az action bar előtt");
    const block = formSrc.slice(notice - 300, notice + 700);
    assert.doesNotMatch(block, /\b(fixed|absolute)\b|pointer-events-none|z-\d+/);
    assert.match(block, /onClick=\{acknowledgeBackgroundNotice\}/);
    assert.match(block, /text-xs/);
  });

  test("a stacked overlay kártyák továbbra is a mért utasításkártya alá kerülnek (a magasabb kártyát követik)", () => {
    assert.match(formSrc, /anchorBottomPx: navigationInstructionCardVisible \? navigationInstructionCardBottomPx : null/);
    assert.match(formSrc, /new ResizeObserver\(/);
  });
});
