# Védett Útvonal — natív Android shell (v0.1)

Vékony Capacitor-wrapper a MEGLÉVŐ production Védett Útvonal körül.
Nincs saját navigációs logika, nincs saját backend — az Android WebView
közvetlenül a `https://www.vedettsarok.hu/vedett-utvonal` oldalt tölti be
(lásd `capacitor.config.ts` `server.url`). Ez a mappa SZÁNDÉKOSAN izolált
csomag, NEM része a fő Next.js `package.json`-nak.

## Előfeltételek (Windows)

- Node.js (amivel ez a mappa készült: Node 22.x, npm 10.x — bármelyik
  jelenlegi LTS megfelel)
- JDK 21 (a generált Android projekt `sourceCompatibility`/
  `targetCompatibility` = `JavaVersion.VERSION_21`)
- Android Studio (friss stabil verzió) — ez hozza magával az Android SDK-t
  és a Gradle-t is; a projekt Gradle wrappere `8.14.3`-at tölt le első
  futáskor
- Android SDK Platform 36 (`compileSdkVersion`/`targetSdkVersion` = 36),
  `minSdkVersion` = 24 — ezt Android Studio SDK Managerben kell telepíteni,
  ha még nincs meg

## Telepítés / szinkron

A `node_modules` és az `android/` Gradle-projekt már itt van ebben a
mappában (a csomagok telepítve, a platform hozzáadva). Ha mégis friss
`npm install`-ra van szükség (pl. más gépen):

```powershell
cd vedett-utvonal-native
npm install
```

Minden alkalommal, amikor a `capacitor.config.ts` vagy a telepített
Capacitor pluginok változnak, futtasd:

```powershell
npx cap sync android
```

## Megnyitás Android Studio-ban

```powershell
npx cap open android
```

Ez megnyitja az `android/` almappát Android Studio-ban. Várd meg, amíg a
Gradle sync lefut (első alkalommal letölti a Gradle 8.14.3-at és a
szükséges SDK-komponenseket, ha hiányoznak — ezt Android Studio kéri be).

## Fizikai Android telefon csatlakoztatása (USB debugging)

1. A telefonon: Beállítások → A telefonról (vagy Rendszer → Névjegy) →
   koppints 7x a "Build szám"-ra → megjelenik a "Fejlesztői beállítások".
2. Fejlesztői beállítások → "USB-hibakeresés" (USB debugging) bekapcsolása.
3. Kösd USB-kábellel a PC-hez. A telefonon megjelenő "Engedélyezed az
   USB-hibakeresést ezen a gépen?" kérdésre koppints "Engedélyezés"-t.
4. Android Studio-ban az eszköz megjelenik a futtatás-gomb melletti
   eszközválasztóban (ha nem, ellenőrizd: `adb devices` a terminálban
   mutatja-e az eszközt).

## Futtatás

Android Studio-ban válaszd ki a telefont az eszközválasztóban, majd
nyomd meg a Run (zöld play gomb) ikont. Ez buildel és telepíti az appot
a telefonra, debug módban.

Terminálból is elindítható (eszköz csatlakoztatva, USB-hibakeresés
engedélyezve):

```powershell
npx cap run android
```

## Debug APK előállítása

Android Studio-ban: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

Vagy terminálból, az `android/` mappában:

```powershell
cd android
./gradlew assembleDebug
```

(Windows-on `gradlew.bat assembleDebug`.)

### APK kimeneti útvonal (standard)

```
vedett-utvonal-native/android/app/build/outputs/apk/debug/app-debug.apk
```

Ezt az APK-t tudod közvetlenül telepíteni a telefonra (pl. `adb install
app-debug.apk`, vagy másold át a telefonra és nyisd meg).

## Mire figyelj

- A `server.url` production HTTPS-re mutat — nincs helyi web-build, nincs
  cleartext HTTP engedélyezve.
- Csak előtéri (foreground) GPS-engedély van beállítva
  (`ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`) — nincs háttérbeli
  helymeghatározás.
- A `/vedett-utvonal` oldal jelenleg bejelentkezést igényel (ez a
  production webes hozzáférési kapu, amit ez a feladat SZÁNDÉKOSAN nem
  módosított) — a natív appban is bejelentkezés után érhető el a tényleges
  kereső.
