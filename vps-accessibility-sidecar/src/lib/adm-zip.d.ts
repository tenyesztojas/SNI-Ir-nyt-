// VPS ACCESSIBILITY SIDECAR — saját ambient típusdeklaráció (Task C3,
// 2026-09-11, kiegészítve Task C3.1-ben).
//
// EREDETI FORRÁS: lib/vedett-route/adm-zip.d.ts a fő Next.js repóban (az a
// fájl csak a staticFileProvider.ts OLVASÁSI felületét fedi: getEntries/
// getEntry). EZ a sidecar-saját másolat SZÁNDÉKOSAN BŐVEBB, mert a sidecar
// SAJÁT teszt-fixture-jei (test/*.test.ts) írásra is használják az
// adm-zip-et (addFile/toBuffer, szintetikus GTFS zip előállításához) — a
// root repo semelyik moduljában nincs ilyen igény, ezért ott ez a két
// metódus jogosan hiányzik. A két deklaráció FÜGGETLEN egymástól: a Task
// C3.1 audit óta a root TypeScript build KIZÁRJA a teljes
// vps-accessibility-sidecar/ könyvtárat (lásd a root tsconfig.json
// "exclude" listáját), így ez a fájl SOHA nem kerül a root compile alá, és
// a root saját adm-zip.d.ts-e SOHA nem kerül a sidecar compile alá
// (a sidecar tsconfig.json/tsconfig.test.json "include"-ja fizikailag a
// vps-accessibility-sidecar/ könyvtáron belülre korlátozódik) — a két
// projekt típusai emiatt garantáltan nem szennyezik egymást.
//
// (A hivatalos @types/adm-zip csomag NEM létezik az npm-en — lásd a Task
// C2 audit megjegyzését — ezért ez a kézzel írt shim a helyes, szándékos
// megoldás, nem egy hiányzó devDependency. Csak a TÉNYLEGESEN használt
// metódusokat deklarálja — nincs `any`.)
declare module "adm-zip" {
  interface AdmZipEntry {
    entryName: string;
    getData(): Buffer;
  }

  class AdmZip {
    constructor(buffer?: Buffer | string);
    getEntries(): AdmZipEntry[];
    getEntry(name: string): AdmZipEntry | null;
    /**
     * Egy bejegyzés hozzáadása/felülírása a zip-hez (runtime szignatúra,
     * lásd node_modules/adm-zip/adm-zip.js `addFile`) — a sidecar
     * test-fixture-jei ezzel építik fel a szintetikus GTFS zipet.
     */
    addFile(entryName: string, content: Buffer | string, comment?: string, attr?: number): void;
    /**
     * A teljes zip tartalma Buffer-ként. A runtime callback-es (aszinkron)
     * túlterhelése itt SZÁNDÉKOSAN nincs deklarálva, mert a sidecar sehol
     * nem hívja callback-bel — csak a tényleges használatot fedjük.
     */
    toBuffer(): Buffer;
  }

  export = AdmZip;
}
