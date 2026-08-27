// Minimális ambient típusdeklaráció az "adm-zip" csomaghoz — csak azt a
// szűk felületet fedi, amit a staticFileProvider.ts ténylegesen használ.
// (A hivatalos @types/adm-zip csomag telepítése helyett, hogy elkerüljük a
// felesleges devDependency-t egy ilyen kis felhasználásért.)
declare module "adm-zip" {
  interface AdmZipEntry {
    entryName: string;
    getData(): Buffer;
  }

  class AdmZip {
    constructor(buffer?: Buffer | string);
    getEntries(): AdmZipEntry[];
    getEntry(name: string): AdmZipEntry | null;
  }

  export = AdmZip;
}
