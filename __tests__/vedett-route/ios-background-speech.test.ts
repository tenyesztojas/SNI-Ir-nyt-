// VÉDETT ÚTVONAL — iOS háttérbeli navigációs hang (12-es TestFlight-build előkészítése)
//   node --test __tests__/vedett-route/ios-background-speech.test.ts
//
// Valós eszközhiba (1.0 (11)): a natív mondat képernyőzárkor megszakadt,
// feloldáskor folytatódott — az Info.plist csak `location` háttérmódot
// deklarált. Ez a teszt forrásszinten rögzíti a javítás szerződését (Swift a
// CI-ben az "iOS Build Check" workflow-ban fordul; itt nincs Swift-fordító).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const IOS = "vedett-utvonal-native/ios/App/App";
const read = (p: string) => readFileSync(p, "utf8").replace(/^﻿/, "");
const plist = read(`${IOS}/Info.plist`);
const speech = read(`${IOS}/Navigation/NavigationSpeech.swift`);
const plugin = read(`${IOS}/Navigation/VedettNavigationPlugin.swift`);
const manager = read(`${IOS}/Navigation/NavigationManager.swift`);
const engine = read(`${IOS}/Navigation/AlertEngine.swift`);

function swiftSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return swiftSources(full);
    return name.endsWith(".swift") ? [full] : [];
  });
}

describe("Info.plist háttérmódok", () => {
  test("UIBackgroundModes pontosan: location + audio (más háttérmód nincs)", () => {
    const m = plist.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/);
    assert.ok(m, "UIBackgroundModes hiányzik");
    const modes = [...m[1].matchAll(/<string>([^<]+)<\/string>/g)].map((x) => x[1]).sort();
    assert.deepEqual(modes, ["audio", "location"]);
  });

  test("nincs néma hang / végtelen lejátszás / háttérben tartási kerülőút", () => {
    const audioFiles = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.(mp3|caf|wav|m4a|aiff?)$/i.test(name) ? [full] : [];
      });
    })(IOS);
    assert.deepEqual(audioFiles, []);
    for (const file of swiftSources(IOS)) {
      const src = read(file);
      assert.doesNotMatch(src, /AVAudioPlayer|AVAudioEngine|AVQueuePlayer|numberOfLoops|beginBackgroundTask/, file);
    }
  });
});

describe("NavigationSpeech — audio session és megszakítások", () => {
  test("navigációs hangutasítás-mód: .playback + .voicePrompt, lehalkít / beszédet megszakít", () => {
    assert.match(speech, /setCategory\(\s*\.playback,\s*mode: \.voicePrompt,\s*options: \[\.duckOthers, \.interruptSpokenAudioAndMixWithOthers\]\s*\)/);
    assert.doesNotMatch(speech, /\.mixWithOthers\b/);
  });

  test("a session csak beszéd alatt aktív: a mondat végén és megszakításakor felszabadul", () => {
    const releases = speech.match(/currentUtterance = nil\s*currentIsBackgroundAlert = false\s*releaseAudioSession\(\)/g) ?? [];
    assert.equal(releases.length, 2, "didFinish + didCancel");
    assert.match(speech, /setActive\(\s*false,\s*options: \[\.notifyOthersOnDeactivation\]\s*\)/);
    assert.match(speech, /guard !synthesizer\.isSpeaking && !synthesizer\.isPaused else/);
    assert.match(speech, /func stop\(\) \{[\s\S]*?releaseAudioSession\(\)\s*\}/);
  });

  test("megszakítás (hívás, Siri): kezdetkor leáll, végén NINCS automatikus folytatás", () => {
    assert.match(speech, /name: AVAudioSession\.interruptionNotification/);
    assert.match(speech, /name: AVAudioSession\.mediaServicesWereResetNotification/);
    assert.match(speech, /case \.began:\s*self\.stop\(\)/);
    assert.match(speech, /case \.ended:\s*self\.releaseAudioSession\(\)/);
    assert.doesNotMatch(speech, /continueSpeaking/);
  });
});

describe("Háttérbeli leszállási riasztás bemondása", () => {
  test("feltételek: aktív navigáció, aktuális terv, háttér, engedélyezett hang, még el nem hangzott", () => {
    assert.match(
      speech,
      /navigationActive &&\s*alertBelongsToCurrentPlan &&\s*!appIsActive &&\s*userEnabledSpeech &&\s*!alreadySpoken/,
    );
    assert.match(plugin, /navigationActive: self\.navigation\.active,/);
    assert.match(plugin, /alertBelongsToCurrentPlan: self\.navigation\.isCurrentTarget\(alert\.targetId\),/);
    assert.match(plugin, /appIsActive: UIApplication\.shared\.applicationState == \.active,/);
    assert.match(plugin, /userEnabledSpeech: speech\.isUserSpeechEnabled\(\),/);
    assert.match(plugin, /alreadySpoken: speech\.hasSpokenBackgroundAlert\(key\)/);
  });

  test("a hangbeállítás natív oldalon csak a WebView kifejezett engedélyével él (fail-closed)", () => {
    assert.match(speech, /private var userEnabledByWebView = false/);
    assert.match(speech, /func setEnabled\(_ value: Bool\) \{\s*enabled = value\s*userEnabledByWebView = value/);
    assert.match(speech, /func isUserSpeechEnabled\(\) -> Bool \{\s*enabled && userEnabledByWebView\s*\}/);
    const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
    assert.match(form, /void setNativeSpeechEnabled\(navigationMode && navigationSpeechPreference\);/);
  });

  test("duplikáció és elavult riasztás ellen: munkamenet+cél kulcs, egyszeri bemondás, aktuális terv", () => {
    assert.match(plugin, /let key = "\\\(self\.navigation\.sessionGeneration\):\\\(alert\.targetId\)"/);
    assert.match(speech, /guard isUserSpeechEnabled\(\), !spokenBackgroundAlertKeys\.contains\(key\) else/);
    assert.match(speech, /spokenBackgroundAlertKeys\.insert\(key\)/);
    assert.match(manager, /func isCurrentTarget\(_ id: String\) -> Bool \{\s*isRunning && \(engine\?\.hasTarget\(id\) \?\? false\)\s*\}/);
    assert.match(engine, /func hasTarget\(_ id: String\) -> Bool \{\s*targets\.contains \{ \$0\.id == id \}\s*\}/);
    assert.equal((manager.match(/sessionGeneration \+= 1/g) ?? []).length, 2, "indításkor és leállításkor is nő");
  });

  test("leállítás után nincs megszólalás; új munkamenet ürít", () => {
    assert.match(plugin, /self\.navigation\.stop\(\)\s*\/\/[^\n]*\n\s*NavigationSpeech\.shared\.endNavigationSession\(\)/);
    assert.match(plugin, /NavigationSpeech\.shared\.endNavigationSession\(\)\s*self\.navigation\.onAlert = \{ \[weak self\] alert in/);
    assert.match(speech, /func endNavigationSession\(\) \{\s*spokenBackgroundAlertKeys\.removeAll\(\)\s*if currentIsBackgroundAlert \{\s*stop\(\)/);
  });

  test("a helyi értesítés megmarad, és a beszéd ELŐTT jelenik meg", () => {
    assert.match(
      plugin,
      /NavigationNotifications\.shared\.show\(alert\)\s*self\?\.speakBackgroundAlertIfAllowed\(alert\)/,
    );
  });

  test("a buildszám továbbra is 11", () => {
    const pbx = read("vedett-utvonal-native/ios/App/App.xcodeproj/project.pbxproj");
    const versions = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]);
    assert.ok(versions.length >= 2);
    assert.ok(versions.every((v) => v === "11"));
  });
});
