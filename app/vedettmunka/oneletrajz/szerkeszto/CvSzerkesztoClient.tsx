"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CvData } from "@/lib/vedettmunka/types";
import { EMPTY_CV } from "@/lib/vedettmunka/types";
import { MEGYEK, TELEPULESEK, EGYEB_OPCIO } from "@/lib/vedettmunka/telepulesek";

const CV_KEY = "vm_cv_draft";

const STEPS = [
  "Alapadatok",
  "Jogosítványok",
  "Iskolai végzettség",
  "Szakma",
  "Munkahelyek",
  "Számítógépes ismeretek",
  "Idegennyelv-ismeret",
  "Munkába állás",
  "Egyéb információ",
  "Kész!",
];

const VEGZETTSEG_OPTIONS = [
  "Általános iskola",
  "Szakiskola",
  "Szakmunkásképző",
  "Szakképző iskola",
  "Technikum",
  "Gimnázium",
  "Főiskola / egyetem",
  "Egyéb",
];

const MUNKABA_ALLAS_OPTIONS = [
  "azonnal",
  "2 héten belül",
  "1 hónapon belül",
  "1–2 hónapon belül",
  "később",
];

const SZAMITOGEP_OPTIONS = [
  "Microsoft Word",
  "Microsoft Excel",
  "E-mail használat",
  "Internet használat",
];

const NYELV_SZINTEK = [
  "nem beszélem",
  "kicsit értem",
  "alap szinten beszélem",
  "jól beszélem",
  "nagyon jól beszélem",
];

const ALLOWED_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_SIZE = 2 * 1024 * 1024; // 2 MB

/** Csak számjegyek, +, -, szóköz, (), . karakterek */
function filterPhone(v: string) {
  return v.replace(/[^\d\s+\-().]/g, "");
}

/** Csak 4 számjegy (évszám) */
function filterEv(v: string) {
  return v.replace(/\D/g, "").slice(0, 4);
}

function Input({
  label, value, onChange, type = "text", placeholder = "", maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
      />
    </label>
  );
}

/** Migrál régi localStorage formátumból (szuletesi_ev → szuletesi_datum, stb.) */
function migrateLegacyCv(raw: Record<string, unknown>): CvData {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const vegzettsegek = Array.isArray(raw.vegzettsegek)
    ? (raw.vegzettsegek as CvData["vegzettsegek"])
    : (raw.iskolai_vegzettseg || raw.iskola_helye || raw.iskola_eve)
      ? [{ szint: str(raw.iskolai_vegzettseg), hely: str(raw.iskola_helye), ev: str(raw.iskola_eve) }]
      : [{ szint: "", hely: "", ev: "" }];
  const szakmak = Array.isArray(raw.szakmak)
    ? (raw.szakmak as CvData["szakmak"])
    : (raw.szakma || raw.szakma_helye || raw.szakma_eve)
      ? [{ nev: str(raw.szakma), hely: str(raw.szakma_helye), ev: str(raw.szakma_eve) }]
      : [{ nev: "", hely: "", ev: "" }];
  return {
    ...EMPTY_CV,
    ...(raw as Partial<CvData>),
    szuletesi_datum: (() => {
      const d = str(raw.szuletesi_datum) || str(raw.szuletesi_ev);
      if (!d) return "";
      // Ha YYYY-MM-DD formátum → csak az év
      return d.length > 4 ? d.slice(0, 4) : d;
    })(),
    lakhely_megye: str(raw.lakhely_megye),
    weboldal: str(raw.weboldal),
    vegzettsegek,
    szakmak,
  };
}

export default function CvSzerkesztoClient() {
  const [step, setStep] = useState(0);
  const [cv, setCv] = useState<CvData>(EMPTY_CV);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [draftDeleted, setDraftDeleted] = useState(false);
  const [lakhelyEgyeb, setLakhelyEgyeb] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const router = useRouter();
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CV_KEY);
      if (saved) {
        const migrated = migrateLegacyCv(JSON.parse(saved));
        setCv(migrated);
        // Ha a tárolt lakhely nem szerepel a megye listájában → szabad szöveges mód
        if (migrated.lakhely_megye && migrated.lakhely) {
          const opts = TELEPULESEK[migrated.lakhely_megye] ?? [];
          if (!opts.includes(migrated.lakhely)) setLakhelyEgyeb(true);
        }
      }
    } catch {}
  }, []);

  function save(updated: CvData) {
    setCv(updated);
    setDraftDeleted(false);
    try { localStorage.setItem(CV_KEY, JSON.stringify(updated)); } catch {}
  }

  function handleDeleteDraft() {
    try { localStorage.removeItem(CV_KEY); } catch {}
    setCv(EMPTY_CV);
    setStep(0);
    setDraftDeleted(true);
  }

  const processPhotoFile = useCallback((file: File) => {
    setPhotoError(null);
    if (!ALLOWED_PHOTO_MIME.has(file.type)) {
      setPhotoError("Csak JPG, PNG vagy WEBP formátumú képet tölthetsz fel.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError("A fénykép mérete legfeljebb 2 MB lehet.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCv((prev) => {
        const updated = { ...prev, foto_base64: ev.target?.result as string };
        try { localStorage.setItem(CV_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    };
    reader.readAsDataURL(file);
  }, []);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processPhotoFile(file);
    if (photoRef.current) photoRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processPhotoFile(file);
  }

  function goNext() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      try { localStorage.setItem(CV_KEY, JSON.stringify(cv)); } catch {}
      router.push("/vedettmunka/oneletrajz/elozetes");
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Adatvédelmi tájékoztató */}
      <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">Az önéletrajzkészítőről</p>
        <p>
          Az önéletrajz adatai és az opcionálisan feltöltött fénykép a <strong>böngésződben kerülnek feldolgozásra</strong>.
          A VédettMunka nem menti őket szerveroldali CV-adatbázisba.
          A PDF-et letöltés után a saját eszközödön tárolod.
        </p>
        <p className="mt-2 text-xs text-blue-700">
          A VédettMunka nem kér diagnózist, egészségügyi dokumentumot, fogyatékossági igazolást
          vagy megváltozott munkaképességet igazoló iratot. Kérjük, ilyen dokumentumot ne tölts fel a CV-készítőbe.
        </p>
      </div>

      {/* Piszkozat törlése */}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={handleDeleteDraft}
          className="rounded-full border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
        >
          Piszkozat törlése erről az eszközről
        </button>
      </div>
      {draftDeleted && (
        <div className="mb-4 rounded-xl bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700">
          ✓ Az önéletrajz-piszkozatot töröltük erről az eszközről.
        </div>
      )}

      {/* Haladásjelző */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>{STEPS[step]}</span>
          <span>{step + 1} / {STEPS.length}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-sni-brand-teal transition-all"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6">

        {/* 0. Alapadatok */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Alapadatok</h2>

            {/* Fénykép – drag & drop + tallózás */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Fénykép (opcionális)</p>
              <p className="text-xs text-gray-400 mb-2">
                Csak JPG, PNG vagy WEBP, legfeljebb 2 MB. A kép a böngésződben marad – nem kerül szerverre.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => { setPhotoError(null); photoRef.current?.click(); }}
                className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-5 cursor-pointer transition-colors ${
                  dragOver
                    ? "border-sni-brand-teal bg-teal-50"
                    : "border-gray-200 hover:border-sni-brand-teal hover:bg-gray-50"
                }`}
              >
                {cv.foto_base64 ? (
                  <img
                    src={cv.foto_base64}
                    alt="Fotó"
                    className="h-24 w-24 rounded-xl object-cover border border-gray-200"
                  />
                ) : (
                  <div className="text-3xl text-gray-300">🖼</div>
                )}
                <p className="text-xs text-gray-500 text-center">
                  {cv.foto_base64
                    ? "Kattints a cseréhez vagy húzz ide egy újabb képet"
                    : "Húzd ide a képet, vagy kattints a tallózáshoz"}
                </p>
                {cv.foto_base64 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      save({ ...cv, foto_base64: null });
                      setPhotoError(null);
                    }}
                    className="rounded-full border border-red-100 px-4 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
                  >
                    Fotó törlése
                  </button>
                )}
              </div>
              <input
                ref={photoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhoto}
              />
              {photoError && (
                <p className="mt-2 text-xs font-semibold text-red-600">{photoError}</p>
              )}
            </div>

            <Input label="Teljes neve" value={cv.nev} onChange={(v) => save({ ...cv, nev: v })} placeholder="pl. Kovács Anna" />

            {/* Születési év – csak 4 számjegy */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Születési év</span>
              <input
                type="text"
                value={cv.szuletesi_datum}
                onChange={(e) => save({ ...cv, szuletesi_datum: filterEv(e.target.value) })}
                placeholder="pl. 1985"
                maxLength={4}
                inputMode="numeric"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
              />
            </label>

            {/* Lakóhely: megye → település */}
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-gray-700">Megye / főváros</span>
                <select
                  value={cv.lakhely_megye}
                  onChange={(e) => {
                    setLakhelyEgyeb(false);
                    save({ ...cv, lakhely_megye: e.target.value, lakhely: "" });
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal bg-white"
                >
                  <option value="">– Válassz –</option>
                  {MEGYEK.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              {cv.lakhely_megye && (
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Település</span>
                  {lakhelyEgyeb ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cv.lakhely}
                        onChange={(e) => save({ ...cv, lakhely: e.target.value })}
                        placeholder="Írja be a település nevét"
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
                      />
                      <button
                        type="button"
                        onClick={() => { setLakhelyEgyeb(false); save({ ...cv, lakhely: "" }); }}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:border-gray-400"
                      >Vissza</button>
                    </div>
                  ) : (
                    <select
                      value={cv.lakhely}
                      onChange={(e) => {
                        if (e.target.value === EGYEB_OPCIO) {
                          setLakhelyEgyeb(true);
                          save({ ...cv, lakhely: "" });
                        } else {
                          save({ ...cv, lakhely: e.target.value });
                        }
                      }}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal bg-white"
                    >
                      <option value="">– Válassz települést –</option>
                      {(TELEPULESEK[cv.lakhely_megye] ?? []).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}
                </label>
              )}
            </div>

            {/* Telefonszám – csak számok és elválasztók */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Telefonszám</span>
              <input
                type="tel"
                value={cv.telefon}
                onChange={(e) => save({ ...cv, telefon: filterPhone(e.target.value) })}
                placeholder="+36 20 123 4567"
                inputMode="tel"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
              />
            </label>

            {/* E-mail – valós formátum validáció */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">E-mail</span>
              <input
                type="email"
                value={cv.email}
                onChange={(e) => {
                  save({ ...cv, email: e.target.value });
                  setEmailError(e.target.value.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value));
                }}
                onBlur={(e) => setEmailError(e.target.value.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value))}
                placeholder="email@pelda.hu"
                className={`rounded-xl border px-3 py-2 text-sm outline-none ${emailError ? "border-red-400 focus:border-red-400" : "border-gray-200 focus:border-sni-brand-teal"}`}
              />
              {emailError && <span className="text-xs text-red-500">Kérjük, valós e-mail-formátumban add meg. (pl. nev@pelda.hu)</span>}
            </label>

            {/* Saját weboldal / szakmai oldal (opcionális) */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Saját weboldalam, szakmai oldalam (opcionális)</span>
              <span className="text-xs text-gray-400">Ha van saját weboldalad, LinkedIn-profilod, portfóliód — itt feltüntetheted. Pl.: https://nevem.hu</span>
              <input
                type="url"
                value={cv.weboldal}
                onChange={(e) => save({ ...cv, weboldal: e.target.value })}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && !v.startsWith("http://") && !v.startsWith("https://")) {
                    save({ ...cv, weboldal: `https://${v}` });
                  }
                }}
                placeholder="https://nevem.hu"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
              />
            </label>
          </div>
        )}

        {/* 1. Jogosítványok */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Jogosítványok</h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={cv.b_jogositvany} onChange={(e) => save({ ...cv, b_jogositvany: e.target.checked })} className="rounded" />
              <span className="text-sm">B kategóriás jogosítvány</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={cv.targonca_jogositvany} onChange={(e) => save({ ...cv, targonca_jogositvany: e.target.checked })} className="rounded" />
              <span className="text-sm">Targoncavezető-jogosítvány</span>
            </label>
            <Input label="Egyéb jogosítvány / engedély" value={cv.egyeb_jogositvany} onChange={(v) => save({ ...cv, egyeb_jogositvany: v })} placeholder="pl. ADR, targoncavezető..." />
          </div>
        )}

        {/* 2. Iskolai végzettség – több is felvihető */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Iskolai végzettség</h2>
            <p className="text-xs text-gray-400">Ha több iskolát is elvégeztél, add hozzá mindegyiket.</p>
            {cv.vegzettsegek.map((v, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-400">{i + 1}. végzettség</p>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Milyen iskolát végeztél?</span>
                  <select
                    value={v.szint}
                    onChange={(e) => {
                      const list = [...cv.vegzettsegek];
                      list[i] = { ...list[i], szint: e.target.value };
                      save({ ...cv, vegzettsegek: list });
                    }}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
                  >
                    <option value="">— Válassz —</option>
                    {VEGZETTSEG_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <Input label="Hol végezted? (település)" value={v.hely}
                  onChange={(val) => {
                    const list = [...cv.vegzettsegek];
                    list[i] = { ...list[i], hely: val };
                    save({ ...cv, vegzettsegek: list });
                  }} placeholder="pl. Budapest" />
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Mikor? (évszám)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={v.ev}
                    onChange={(e) => {
                      const list = [...cv.vegzettsegek];
                      list[i] = { ...list[i], ev: filterEv(e.target.value) };
                      save({ ...cv, vegzettsegek: list });
                    }}
                    placeholder="pl. 2010"
                    maxLength={4}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
                  />
                </label>
                {cv.vegzettsegek.length > 1 && (
                  <button
                    type="button"
                    onClick={() => save({ ...cv, vegzettsegek: cv.vegzettsegek.filter((_, j) => j !== i) })}
                    className="self-start text-xs text-red-500 hover:underline"
                  >
                    Törlés
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => save({ ...cv, vegzettsegek: [...cv.vegzettsegek, { szint: "", hely: "", ev: "" }] })}
              className="self-start rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal"
            >
              + Újabb végzettség
            </button>
          </div>
        )}

        {/* 3. Szakma – több is felvihető */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Szakma</h2>
            <p className="text-xs text-gray-400">Ha több szakmád is van, add hozzá mindegyiket.</p>
            {cv.szakmak.map((s, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-400">{i + 1}. szakma</p>
                <Input label="Szakma megnevezése" value={s.nev}
                  onChange={(val) => {
                    const list = [...cv.szakmak];
                    list[i] = { ...list[i], nev: val };
                    save({ ...cv, szakmak: list });
                  }} placeholder="pl. villanyszerelő" />
                <Input label="Hol végezted?" value={s.hely}
                  onChange={(val) => {
                    const list = [...cv.szakmak];
                    list[i] = { ...list[i], hely: val };
                    save({ ...cv, szakmak: list });
                  }} placeholder="pl. Budapest" />
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Mikor? (évszám)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={s.ev}
                    onChange={(e) => {
                      const list = [...cv.szakmak];
                      list[i] = { ...list[i], ev: filterEv(e.target.value) };
                      save({ ...cv, szakmak: list });
                    }}
                    placeholder="pl. 2012"
                    maxLength={4}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
                  />
                </label>
                {cv.szakmak.length > 1 && (
                  <button
                    type="button"
                    onClick={() => save({ ...cv, szakmak: cv.szakmak.filter((_, j) => j !== i) })}
                    className="self-start text-xs text-red-500 hover:underline"
                  >
                    Törlés
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => save({ ...cv, szakmak: [...cv.szakmak, { nev: "", hely: "", ev: "" }] })}
              className="self-start rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal"
            >
              + Újabb szakma
            </button>
          </div>
        )}

        {/* 4. Munkahelyek */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Munkahelyek</h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cv.nem_dolgozott}
                onChange={(e) => save({ ...cv, nem_dolgozott: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Még nem dolgoztam sehol / álláskereső vagyok</span>
            </label>
            {!cv.nem_dolgozott && (
              <>
                {cv.munkahelyek.map((m, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
                    <p className="text-xs font-bold text-gray-400">{i + 1}. munkahely</p>
                    <Input label="Hol dolgoztál?" value={m.hol} onChange={(v) => {
                      const list = [...cv.munkahelyek];
                      list[i] = { ...list[i], hol: v };
                      save({ ...cv, munkahelyek: list });
                    }} placeholder="pl. Minta Kft., Budapest" />
                    <Input label="Mit csináltál?" value={m.mit} onChange={(v) => {
                      const list = [...cv.munkahelyek];
                      list[i] = { ...list[i], mit: v };
                      save({ ...cv, munkahelyek: list });
                    }} placeholder="pl. raktáros, adatrögzítő" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input label="Mettől?" value={m.mettol} onChange={(v) => {
                        const list = [...cv.munkahelyek];
                        list[i] = { ...list[i], mettol: v };
                        save({ ...cv, munkahelyek: list });
                      }} placeholder="pl. 2020.01" />
                      <Input label="Meddig?" value={m.meddig} onChange={(v) => {
                        const list = [...cv.munkahelyek];
                        list[i] = { ...list[i], meddig: v };
                        save({ ...cv, munkahelyek: list });
                      }} placeholder="pl. 2023.06 vagy jelenleg" />
                    </div>
                    {cv.munkahelyek.length > 1 && (
                      <button
                        type="button"
                        onClick={() => save({ ...cv, munkahelyek: cv.munkahelyek.filter((_, j) => j !== i) })}
                        className="self-start text-xs text-red-500 hover:underline"
                      >
                        Törlés
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => save({ ...cv, munkahelyek: [...cv.munkahelyek, { hol: "", mit: "", mettol: "", meddig: "" }] })}
                  className="self-start rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal"
                >
                  + Újabb munkahely
                </button>
              </>
            )}
          </div>
        )}

        {/* 5. Számítógépes ismeretek */}
        {step === 5 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Számítógépes ismeretek</h2>
            {SZAMITOGEP_OPTIONS.map((o) => (
              <label key={o} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cv.szamitogep.includes(o)}
                  onChange={(e) => {
                    const list = e.target.checked ? [...cv.szamitogep, o] : cv.szamitogep.filter((s) => s !== o);
                    save({ ...cv, szamitogep: list });
                  }}
                  className="rounded"
                />
                <span className="text-sm">{o}</span>
              </label>
            ))}
            <Input label="Egyéb" value={cv.szamitogep.find((s) => !SZAMITOGEP_OPTIONS.includes(s)) ?? ""}
              onChange={(v) => {
                const base = cv.szamitogep.filter((s) => SZAMITOGEP_OPTIONS.includes(s));
                save({ ...cv, szamitogep: v ? [...base, v] : base });
              }} placeholder="pl. SAP, AutoCAD..." />
          </div>
        )}

        {/* 6. Idegennyelv-ismeret */}
        {step === 6 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Idegennyelv-ismeret</h2>
            {cv.nyelvek.map((l, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2 rounded-xl border border-gray-100 p-3">
                <Input label="Nyelv" value={l.nyelv} onChange={(v) => {
                  const list = [...cv.nyelvek];
                  list[i] = { ...list[i], nyelv: v };
                  save({ ...cv, nyelvek: list });
                }} placeholder="pl. angol" />
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Szint</span>
                  <select
                    value={l.szint}
                    onChange={(e) => {
                      const list = [...cv.nyelvek];
                      list[i] = { ...list[i], szint: e.target.value };
                      save({ ...cv, nyelvek: list });
                    }}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
                  >
                    <option value="">— Válassz —</option>
                    {NYELV_SZINTEK.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                {cv.nyelvek.length > 1 && (
                  <button type="button" onClick={() => save({ ...cv, nyelvek: cv.nyelvek.filter((_, j) => j !== i) })}
                    className="col-span-2 self-start text-xs text-red-500 hover:underline">Törlés</button>
                )}
              </div>
            ))}
            <button type="button"
              onClick={() => save({ ...cv, nyelvek: [...cv.nyelvek, { nyelv: "", szint: "" }] })}
              className="self-start rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal">
              + Újabb nyelv
            </button>
          </div>
        )}

        {/* 7. Munkába állás */}
        {step === 7 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Mikor tudnál munkába állni?</h2>
            <div className="flex flex-col gap-2">
              {MUNKABA_ALLAS_OPTIONS.map((o) => (
                <label key={o} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="munkaba" value={o} checked={cv.munkaba_allas === o}
                    onChange={() => save({ ...cv, munkaba_allas: o })} className="accent-sni-brand-teal" />
                  <span className="text-sm capitalize">{o}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 8. Egyéb */}
        {step === 8 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Egyéb információ</h2>
            <p className="text-sm text-gray-500">Miben vagy jó? Vagy mit szeretsz csinálni, elfoglalni magad?</p>
            <textarea
              value={cv.egyeb_info}
              onChange={(e) => save({ ...cv, egyeb_info: e.target.value })}
              rows={5}
              placeholder="pl. Szeretem a precíz munkát, jól dolgozom csapatban. Szabadidőmben kertészkedem..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
            />
          </div>
        )}

        {/* 9. Kész */}
        {step === 9 && (
          <div className="text-center py-4">
            <p className="text-5xl mb-4">🎉</p>
            <h2 className="text-xl font-extrabold text-sni-brand-navy">Kész az önéletrajzod!</h2>
            <p className="mt-2 text-sm text-gray-600">Kattints az Előnézet megtekintése gombra a PDF letöltéshez.</p>
          </div>
        )}

        {/* Navigáció */}
        <div className="mt-6 flex justify-between">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)}
              className="rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold hover:border-gray-300">
              ← Vissza
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={goNext}
            className="rounded-full bg-sni-brand-teal px-6 py-2 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
          >
            {isLast ? "Előnézet megtekintése" : "Tovább →"}
          </button>
        </div>
      </div>
    </div>
  );
}
