// VÉDETT ÚTVONAL — dafc28d utóellenőrzés: admin-felületen nincs
// visszaállítási kérdés; magyar hang kiválasztása, aszinkron hanglista,
// beszédhibák kezelése (2026-10-09)
//   node --test __tests__/vedett-route/navigation-resume-admin-and-speech-voice.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SPEECH_NO_HUNGARIAN_VOICE_MESSAGE,
  SPEECH_VOICES_SETTLE_TIMEOUT_MS,
  describeSpeechSynthesisError,
  resolveSpeechVoiceAvailability,
  selectHungarianVoice,
} from "../../lib/vedett-route/navigation/speechSupport.ts";

const read = (p: string) => readFileSync(p, "utf8");
const formSrc = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const hookSrc = read("lib/hooks/useNavigationSpeech.ts");

describe("1) visszaállítási kérdés csak a felhasználói felületen", () => {
  test("a prop alapértéke false, és a mount-effekt a storage olvasása ELŐTT kilép", () => {
    assert.match(formSrc, /navigationResumeEnabled = false,/);
    const m = formSrc.match(/useEffect\(\(\) => \{\s*\n\s*if \(!navigationResumeEnabled\) return;\s*\n\s*const nowMs = Date\.now\(\);\s*\n\s*const persisted = loadNavigationSession\(nowMs\);/);
    assert.ok(m, "a guard a loadNavigationSession (ami lejárt/hibás bejegyzést töröl) előtt áll");
  });

  test("az admin oldal nem engedélyezi (nem adja át), a diagnosztikai szimulátor marad", () => {
    const admin = read("app/admin/vedett-utvonal/page.tsx");
    assert.doesNotMatch(admin, /navigationResumeEnabled/);
    assert.match(admin, /<VedettUtvonalSearchForm disabled=\{!enabled\} journeyMonitorSimulationEnabled \/>/);
  });

  test("a felhasználói Workspace engedélyezi", () => {
    const ws = read("components/vedett-utvonal/VedettUtvonalWorkspace.tsx");
    const block = ws.slice(ws.indexOf("<VedettUtvonalSearchForm"), ws.indexOf("/>", ws.indexOf("<VedettUtvonalSearchForm")));
    assert.match(block, /\bnavigationResumeEnabled\b/);
  });

  test("a visszaállítás többi része (dafc28d) változatlan: jóváhagyás-guard a kártyán, elutasítás törli a mentést", () => {
    assert.match(formSrc, /if \(!resumeApproved\) return;\s*\n\s*const persisted = loadNavigationSession\(Date\.now\(\)\);/);
    assert.match(formSrc, /const handleDeclineNavigationResume = \(\) => \{\s*\n\s*clearNavigationSession\(\);/);
  });
});

describe("2) magyar hang kiválasztása", () => {
  const v = (lang: string, extra: Record<string, unknown> = {}) => ({ lang, name: lang, ...extra });

  test("pontos hu-HU előnyben, azon belül az alapértelmezett", () => {
    const voices = [v("en-US", { default: true }), v("hu"), v("hu-HU", { name: "A" }), v("hu-HU", { name: "B", default: true })];
    assert.equal(selectHungarianVoice(voices)?.name, "B");
  });

  test("hu_HU / HU-hu / hu nyelvkód is elfogadott; más nyelv nem", () => {
    assert.equal(selectHungarianVoice([v("hu_HU")])?.lang, "hu_HU");
    assert.equal(selectHungarianVoice([v("HU-hu")])?.lang, "HU-hu");
    assert.equal(selectHungarianVoice([v("hu")])?.lang, "hu");
    assert.equal(selectHungarianVoice([v("hr-HR"), v("en-GB")]), null);
    assert.equal(selectHungarianVoice([]), null);
    assert.equal(selectHungarianVoice(null), null);
  });

  test("aszinkron hanglista: üres és még nem rendeződött -> UNKNOWN (nem állítunk semmit)", () => {
    assert.equal(resolveSpeechVoiceAvailability([], false), "UNKNOWN");
    assert.equal(resolveSpeechVoiceAvailability([], true), "NO_HUNGARIAN");
    assert.equal(resolveSpeechVoiceAvailability([v("en-US")], false), "NO_HUNGARIAN");
    assert.equal(resolveSpeechVoiceAvailability([v("hu-HU")], false), "HUNGARIAN");
    assert.ok(SPEECH_VOICES_SETTLE_TIMEOUT_MS > 0);
  });

  test("a hook követi a voiceschanged eseményt, settle-timeouttal, és takarít", () => {
    assert.match(hookSrc, /synth\.addEventListener\?\.\("voiceschanged", read\)/);
    assert.match(hookSrc, /synth\.removeEventListener\?\.\("voiceschanged", read\)/);
    assert.match(hookSrc, /setTimeout\(\(\) => setSettled\(true\), SPEECH_VOICES_SETTLE_TIMEOUT_MS\)/);
  });

  test("a hook magyar hangot választ, de a lang='hu-HU' megmarad (a böngészős viselkedés nem romlik)", () => {
    assert.match(hookSrc, /utterance\.lang = "hu-HU";/);
    assert.match(hookSrc, /if \(hungarianVoice\) utterance\.voice = hungarianVoice;/);
    assert.match(hookSrc, /synth\.cancel\(\);\s*\n\s*const utterance = new window\.SpeechSynthesisUtterance/);
  });

  test("magyar hang hiányában a felület nem ígér magyar felolvasást", () => {
    assert.match(SPEECH_NO_HUNGARIAN_VOICE_MESSAGE, /nem biztos, hogy magyarul/);
    assert.match(
      formSrc,
      /navigationSpeechStatus\.voiceAvailability === "NO_HUNGARIAN" && \([\s\S]{0,200}\{SPEECH_NO_HUNGARIAN_VOICE_MESSAGE\}/,
    );
  });
});

describe("3) beszédindítási hibák", () => {
  test("saját cancel() okozta canceled/interrupted nem hiba", () => {
    assert.equal(describeSpeechSynthesisError("canceled"), null);
    assert.equal(describeSpeechSynthesisError("interrupted"), null);
  });

  test("valódi hibákra érthető magyar üzenet; ismeretlen kódra általános üzenet", () => {
    for (const code of ["language-unavailable", "voice-unavailable", "not-allowed", "audio-busy", "audio-hardware", "network", "synthesis-failed", undefined]) {
      const msg = describeSpeechSynthesisError(code as string | undefined);
      assert.ok(msg && msg.length > 10, String(code));
    }
    assert.match(describeSpeechSynthesisError("language-unavailable")!, /magyarul/);
    assert.match(describeSpeechSynthesisError("whatever")!, /képernyőn lévő utasítások/);
  });

  test("a hook onerror-t köt, a speak() kivételét elkapja, sikeres indításkor és kikapcsoláskor törli a hibát", () => {
    assert.match(hookSrc, /utterance\.onerror = \(event: SpeechSynthesisErrorEvent\) => \{\s*\n\s*const message = describeSpeechSynthesisError\(event\?\.error\);\s*\n\s*if \(message\) setLastErrorMessage\(message\);/);
    assert.match(hookSrc, /utterance\.onstart = \(\) => setLastErrorMessage\(null\);/);
    assert.match(hookSrc, /try \{\s*\n\s*synth\.speak\(utterance\);\s*\n\s*\} catch \{/);
    assert.match(hookSrc, /if \(enabled\) return;\s*\n\s*setLastErrorMessage\(null\);/);
  });

  test("a hibaüzenet megjelenik a felületen (bekapcsolt hangnál)", () => {
    assert.match(formSrc, /const navigationSpeechStatus = useNavigationSpeech\(\{/);
    assert.match(formSrc, /navigationSpeechStatus\.lastErrorMessage && \([\s\S]{0,200}data-testid="navigation-speech-error"[\s\S]{0,80}\{navigationSpeechStatus\.lastErrorMessage\}/);
  });
});
