"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CvData } from "@/lib/vedettmunka/types";
import { EMPTY_CV } from "@/lib/vedettmunka/types";
import { MEGYEK, TELEPULESEK, EGYEB_OPCIO } from "@/lib/vedettmunka/telepulesek";

const CV_KEY = "vk_bemutatkozo_draft";

const STEPS = [
  "Ki vagy te?",
  "Van jogosítványod?",
  "Milyen iskolát végeztél?",
  "Milyen szakmai végzettséged van?",
  "Hol dolgoztál eddig?",
  "Milyen digitális eszközöket használsz?",
  "Milyen nyelveken beszélsz?",
  "Mikor tudnál munkába állni?",
  "Mit szeretnél még elmondani?",
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

const NYELV_SZINTEK = [
  { value: "alapszinten_eri", label: "Alapszinten értem", desc: "Egyszerű szavakat és mondatokat megértek." },
  { value: "egyszeruen_hasznalom", label: "Egyszerű helyzetekben használom", desc: "Röviden tudok beszélni vagy írni." },
  { value: "jol_hasznalom", label: "Jól használom", desc: "Munkában is tudom használni." },
  { value: "nagyon_jol", label: "Nagyon jól használom", desc: "Magabiztosan beszélek és írok." },
  { value: "nyelvvizsga", label: "Nyelvvizsgám is van", desc: "" },
];

const ALLOWED_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_SIZE = 2 * 1024 * 1024;

function filterPhone(v: string) {
  return v.replace(/[^\d\s+\-().]/g, "");
}

function filterEv(v: string) {
  return v.replace(/\D/g, "").slice(0, 4);
}

function Input({
  label, value, onChange, type = "text", placeholder = "", maxLength, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; maxLength?: number; hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
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
  const digitalis_eszkozok = (raw.digitalis_eszkozok && typeof raw.digitalis_eszkozok === "object")
    ? (raw.digitalis_eszkozok as CvData["digitalis_eszkozok"])
    : EMPTY_CV.digitalis_eszkozok;
  return {
    ...EMPTY_CV,
    ...(raw as Partial<CvData>),
    szuletesi_datum: (() => {
      const d = str(raw.szuletesi_datum) || str(raw.szuletesi_ev);
      if (!d) return "";
      return d.length > 4 ? d.slice(0, 4) : d;
    })(),
    lakhely_megye: str(raw.lakhely_megye),
    weboldal: str(raw.weboldal),
    vegzettsegek,
    szakmak,
    digitalis_eszkozok,
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

  function SkipButton({ onClick }: { onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="self-start rounded-full border border-gray-200 px-5 py-1.5 text-xs font-semibold text-gray-400 hover:border-gray-300 hover:text-gray-500"
      >
        Kihagyom ezt a részt
      </button>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

      {/* Adatvédelmi tájékoztató */}
      <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">A bemutatkozó lapról</p>
        <p className="text-xs">
          A bemutatkozó lap adatai és az opcionálisan feltöltött fénykép a{" "}
          <strong>böngésződben kerülnek feldolgozásra</strong>.
          A VédettKarrier nem menti őket szerveroldali dokumentum-adatbázisba.
          A PDF-et letöltés után a saját eszközödön tárolod.
        </p>
        <p className="mt-2 text-xs text-blue-700">
          A VédettKarrier nem kér diagnózist, egészségügyi dokumentumot, fogyatékossági igazolást
          vagy gyermekre vonatkozó adatot. Kérjük, ilyen adatot ne írj be és ne tölts fel.
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
          ✓ A bemutatkozó lap piszkozatát töröltük erről az eszközről.
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

        {/* 0. Ki vagy te? */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Ki vagy te?</h2>

            {/* Fénykép */}
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
                  dragOver ? "border-sni-brand-teal bg-teal-50" : "border-gray-200 hover:border-sni-brand-teal hover:bg-gray-50"
                }`}
              >
                {cv.foto_base64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cv.foto_base64} alt="Fotó" className="h-24 w-24 rounded-xl object-cover border border-gray-200" />
                ) : (
                  <div className="text-3xl text-gray-300">🖼</div>
                )}
                <p className="text-xs text-gray-500 text-center">
                  {cv.foto_base64 ? "Kattints a cseréhez" : "Húzd ide a képet, vagy kattints a tallózáshoz"}
                </p>
                {cv.foto_base64 && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); save({ ...cv, foto_base64: null }); setPhotoError(null); }}
                    className="rounded-full border border-red-100 px-4 py-1 text-xs font-semibold text-red-500 hover:bg-red-50">
                    Fotó törlése
                  </button>
                )}
              </div>
              <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
              {photoError && <p className="mt-2 text-xs font-semibold text-red-600">{photoError}</p>}
            </div>

            <Input label="Mi a neved?" hint="Azt a nevet írd ide, amit a jelentkezésben használni szeretnél."
              value={cv.nev} onChange={(v) => save({ ...cv, nev: v })} placeholder="pl. Kovács Anna" />

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Mikor születtél?</span>
              <span className="text-xs text-gray-400">Elég az évet megadni.</span>
              <input type="text" value={cv.szuletesi_datum}
                onChange={(e) => save({ ...cv, szuletesi_datum: filterEv(e.target.value) })}
                placeholder="pl. 1985" maxLength={4} inputMode="numeric"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal" />
            </label>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-gray-700">Honnan keresel munkalehetőséget?</span>
                <span className="text-xs text-gray-400">Elég a vármegyét megadni. Pontos címet ne írj ide.</span>
                <select value={cv.lakhely_megye}
                  onChange={(e) => { setLakhelyEgyeb(false); save({ ...cv, lakhely_megye: e.target.value, lakhely: "" }); }}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal bg-white">
                  <option value="">– Válassz –</option>
                  {MEGYEK.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              {cv.lakhely_megye && (
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Település (opcionális)</span>
                  {lakhelyEgyeb ? (
                    <div className="flex gap-2">
                      <input type="text" value={cv.lakhely}
                        onChange={(e) => save({ ...cv, lakhely: e.target.value })}
                        placeholder="Írja be a település nevét"
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal" />
                      <button type="button" onClick={() => { setLakhelyEgyeb(false); save({ ...cv, lakhely: "" }); }}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:border-gray-400">Vissza</button>
                    </div>
                  ) : (
                    <select value={cv.lakhely}
                      onChange={(e) => {
                        if (e.target.value === EGYEB_OPCIO) { setLakhelyEgyeb(true); save({ ...cv, lakhely: "" }); }
                        else { save({ ...cv, lakhely: e.target.value }); }
                      }}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal bg-white">
                      <option value="">– Válassz települést –</option>
                      {(TELEPULESEK[cv.lakhely_megye] ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </label>
              )}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Mi a telefonszámod? (opcionális)</span>
              <span className="text-xs text-gray-400">Ezt csak akkor add meg, ha szeretnéd, hogy telefonon is elérjenek.</span>
              <input type="tel" value={cv.telefon}
                onChange={(e) => save({ ...cv, telefon: filterPhone(e.target.value) })}
                placeholder="+36 20 123 4567" inputMode="tel"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Mi az e-mail-címed?</span>
              <span className="text-xs text-gray-400">Erre az e-mail-címre írhatnak neked.</span>
              <input type="email" value={cv.email}
                onChange={(e) => { save({ ...cv, email: e.target.value }); setEmailError(e.target.value.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)); }}
                onBlur={(e) => setEmailError(e.target.value.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value))}
                placeholder="email@pelda.hu"
                className={`rounded-xl border px-3 py-2 text-sm outline-none ${emailError ? "border-red-400" : "border-gray-200 focus:border-sni-brand-teal"}`} />
              {emailError && <span className="text-xs text-red-500">Kérjük, valós e-mail-formátumban add meg. (pl. nev@pelda.hu)</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Van saját weboldalad vagy szakmai oldalad? (opcionális)</span>
              <span className="text-xs text-gray-400">Ide írhatsz saját honlapot, portfóliót, LinkedIn-profilt vagy más szakmai oldalt. Ha nincs ilyen, hagyd üresen.</span>
              <input type="url" value={cv.weboldal}
                onChange={(e) => save({ ...cv, weboldal: e.target.value })}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && !v.startsWith("http")) save({ ...cv, weboldal: `https://${v}` }); }}
                placeholder="https://nevem.hu"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal" />
            </label>
          </div>
        )}

        {/* 1. Jogosítványok */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Van jogosítványod?</h2>
            <p className="text-xs text-gray-400">Ha nincs, lépj tovább – ez a rész nem kötelező.</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={cv.b_jogositvany} onChange={(e) => save({ ...cv, b_jogositvany: e.target.checked })} className="rounded" />
              <span className="text-sm">B kategóriás jogosítvány (személyautó)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={cv.targonca_jogositvany} onChange={(e) => save({ ...cv, targonca_jogositvany: e.target.checked })} className="rounded" />
              <span className="text-sm">Targoncavezető-jogosítvány</span>
            </label>
            <Input label="Egyéb jogosítvány / engedély (opcionális)" value={cv.egyeb_jogositvany}
              onChange={(v) => save({ ...cv, egyeb_jogositvany: v })} placeholder="pl. ADR, emelőgép..." />
          </div>
        )}

        {/* 2. Iskolai végzettség */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Milyen iskolát végeztél?</h2>
            <p className="text-xs text-gray-400">Ha több iskolát is elvégeztél, add hozzá mindegyiket. Ha nem szeretnéd megadni, kattints a „Kihagyom&quot; gombra.</p>
            {cv.vegzettsegek.map((v, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-400">{i + 1}. végzettség</p>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Milyen iskolát végeztél?</span>
                  <select value={v.szint}
                    onChange={(e) => { const list = [...cv.vegzettsegek]; list[i] = { ...list[i], szint: e.target.value }; save({ ...cv, vegzettsegek: list }); }}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal">
                    <option value="">— Válassz —</option>
                    {VEGZETTSEG_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <Input label="Hol végezted? (opcionális)" value={v.hely}
                  onChange={(val) => { const list = [...cv.vegzettsegek]; list[i] = { ...list[i], hely: val }; save({ ...cv, vegzettsegek: list }); }}
                  placeholder="pl. Budapest" />
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Mikor? (évszám, opcionális)</span>
                  <input type="text" inputMode="numeric" value={v.ev}
                    onChange={(e) => { const list = [...cv.vegzettsegek]; list[i] = { ...list[i], ev: filterEv(e.target.value) }; save({ ...cv, vegzettsegek: list }); }}
                    placeholder="pl. 2010" maxLength={4}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal" />
                </label>
                {cv.vegzettsegek.length > 1 && (
                  <button type="button" onClick={() => save({ ...cv, vegzettsegek: cv.vegzettsegek.filter((_, j) => j !== i) })}
                    className="self-start text-xs text-red-500 hover:underline">Törlés</button>
                )}
              </div>
            ))}
            <button type="button"
              onClick={() => save({ ...cv, vegzettsegek: [...cv.vegzettsegek, { szint: "", hely: "", ev: "" }] })}
              className="self-start rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal">
              + Újabb végzettség
            </button>
          </div>
        )}

        {/* 3. Szakma */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Milyen szakmai végzettséged van?</h2>
            <p className="text-xs text-gray-400">Írd le, milyen szakmát, tanfolyamot vagy képzést végeztél. Ha nincs, kattints a „Kihagyom&quot; gombra.</p>
            {!cv.szakma_kihagyva && (
              <>
                {cv.szakmak.map((s, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
                    <p className="text-xs font-bold text-gray-400">{i + 1}. szakma / képzés</p>
                    <Input label="Mit tanultál? Milyen szakmád van?"
                      hint="Pl. villanyszerelő, könyvelő, ECDL-tanfolyam, pék..." value={s.nev}
                      onChange={(val) => { const list = [...cv.szakmak]; list[i] = { ...list[i], nev: val }; save({ ...cv, szakmak: list }); }}
                      placeholder="pl. számítógép-kezelő tanfolyam" />
                    <Input label="Hol végezted? (opcionális)" value={s.hely}
                      onChange={(val) => { const list = [...cv.szakmak]; list[i] = { ...list[i], hely: val }; save({ ...cv, szakmak: list }); }}
                      placeholder="pl. Budapest" />
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-semibold text-gray-700">Mikor? (évszám, opcionális)</span>
                      <input type="text" inputMode="numeric" value={s.ev}
                        onChange={(e) => { const list = [...cv.szakmak]; list[i] = { ...list[i], ev: filterEv(e.target.value) }; save({ ...cv, szakmak: list }); }}
                        placeholder="pl. 2012" maxLength={4}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal" />
                    </label>
                    {cv.szakmak.length > 1 && (
                      <button type="button" onClick={() => save({ ...cv, szakmak: cv.szakmak.filter((_, j) => j !== i) })}
                        className="self-start text-xs text-red-500 hover:underline">Törlés</button>
                    )}
                  </div>
                ))}
                <button type="button"
                  onClick={() => save({ ...cv, szakmak: [...cv.szakmak, { nev: "", hely: "", ev: "" }] })}
                  className="self-start rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal">
                  + Újabb szakma / képzés
                </button>
              </>
            )}
            {cv.szakma_kihagyva && (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                Ezt a részt kihagytad. Ha mégis kitöltenéd, kattints a „Visszaveszem&quot; gombra.
              </div>
            )}
            <SkipButton onClick={() => save({ ...cv, szakma_kihagyva: !cv.szakma_kihagyva })} />
          </div>
        )}

        {/* 4. Munkahelyek */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Hol dolgoztál eddig?</h2>
            <p className="text-xs text-gray-400">Írd le röviden, hol dolgoztál, mikor, és mit csináltál ott. Ha még nem dolgoztál sehol, jelöld be lent.</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={cv.nem_dolgozott}
                onChange={(e) => save({ ...cv, nem_dolgozott: e.target.checked })} className="rounded" />
              <span className="text-sm">Még nem dolgoztam sehol / álláskereső vagyok</span>
            </label>
            {!cv.nem_dolgozott && (
              <>
                {cv.munkahelyek.map((m, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
                    <p className="text-xs font-bold text-gray-400">{i + 1}. munkahely</p>
                    <Input label="Hol dolgoztál?" value={m.hol}
                      onChange={(v) => { const list = [...cv.munkahelyek]; list[i] = { ...list[i], hol: v }; save({ ...cv, munkahelyek: list }); }}
                      placeholder="pl. Minta Kft., Budapest" />
                    <Input label="Mit csináltál ott?" value={m.mit}
                      onChange={(v) => { const list = [...cv.munkahelyek]; list[i] = { ...list[i], mit: v }; save({ ...cv, munkahelyek: list }); }}
                      placeholder="pl. raktáros, adatrögzítő" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input label="Mettől?" value={m.mettol}
                        onChange={(v) => { const list = [...cv.munkahelyek]; list[i] = { ...list[i], mettol: v }; save({ ...cv, munkahelyek: list }); }}
                        placeholder="pl. 2020.01" />
                      <Input label="Meddig?" value={m.meddig}
                        onChange={(v) => { const list = [...cv.munkahelyek]; list[i] = { ...list[i], meddig: v }; save({ ...cv, munkahelyek: list }); }}
                        placeholder="pl. 2023.06 vagy jelenleg" />
                    </div>
                    {cv.munkahelyek.length > 1 && (
                      <button type="button" onClick={() => save({ ...cv, munkahelyek: cv.munkahelyek.filter((_, j) => j !== i) })}
                        className="self-start text-xs text-red-500 hover:underline">Törlés</button>
                    )}
                  </div>
                ))}
                <button type="button"
                  onClick={() => save({ ...cv, munkahelyek: [...cv.munkahelyek, { hol: "", mit: "", mettol: "", meddig: "" }] })}
                  className="self-start rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal">
                  + Újabb munkahely
                </button>
              </>
            )}
          </div>
        )}

        {/* 5. Digitális eszközök */}
        {step === 5 && (
          <div className="flex flex-col gap-5">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Milyen digitális eszközöket használsz?</h2>
            <p className="text-xs text-gray-400">Jelöld be, milyen típusú programokat használsz, és röviden írd le, mit ismersz. Ha nem szeretnéd kitölteni, lépj tovább.</p>

            {(["irodai", "egyeb_prog", "kozossegi", "egyeb_dig"] as const).map((key) => {
              const labels: Record<typeof key, { cim: string; hint: string; placeholder: string }> = {
                irodai: {
                  cim: "Irodai szoftverek",
                  hint: "Sorold fel, mit használsz magabiztosan.",
                  placeholder: "Például: szövegszerkesztő, táblázatkezelő, prezentációkészítő, online dokumentumok…",
                },
                egyeb_prog: {
                  cim: "Egyéb programok",
                  hint: "Sorold fel, milyen egyéb programokat használsz.",
                  placeholder: "Például: grafikai program, számlázóprogram, ügyviteli rendszer, webes felület…",
                },
                kozossegi: {
                  cim: "Közösségi média alkalmazások",
                  hint: "Sorold fel, milyen közösségi média felületeket használsz.",
                  placeholder: "Például: Facebook, Instagram, TikTok, YouTube, LinkedIn…",
                },
                egyeb_dig: {
                  cim: "Egyéb digitális tudás",
                  hint: "Írd le, milyen más digitális dolgot tudsz.",
                  placeholder: "Például: weboldal kezelése, képszerkesztés, videóvágás, online ügyintézés…",
                },
              };
              const { cim, hint, placeholder } = labels[key];
              const val = cv.digitalis_eszkozok[key];
              return (
                <div key={key} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-2">
                  <p className="text-sm font-bold text-sni-brand-navy">{cim}</p>
                  <p className="text-xs text-gray-400">{hint}</p>
                  <textarea
                    value={val}
                    onChange={(e) => save({ ...cv, digitalis_eszkozok: { ...cv.digitalis_eszkozok, [key]: e.target.value } })}
                    rows={2}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* 6. Nyelvek */}
        {step === 6 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Milyen nyelveken beszélsz?</h2>
            <p className="text-xs text-gray-400">Írd le, milyen nyelvet használsz, és milyen szinten. Ha nem szeretnéd megadni, kattints a „Kihagyom&quot; gombra.</p>

            {!cv.nyelv_kihagyva && cv.nyelvek.map((l, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
                <Input label="Milyen nyelv?" value={l.nyelv}
                  onChange={(v) => { const list = [...cv.nyelvek]; list[i] = { ...list[i], nyelv: v }; save({ ...cv, nyelvek: list }); }}
                  placeholder="pl. angol" />
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-700">Milyen szinten?</span>
                  <div className="flex flex-col gap-1.5">
                    {NYELV_SZINTEK.map((s) => (
                      <label key={s.value} className={`flex items-start gap-2.5 cursor-pointer rounded-xl border px-3 py-2 text-sm transition ${l.szint === s.value ? "border-sni-brand-teal bg-sni-brand-teal/5" : "border-gray-100 hover:border-sni-brand-teal/40"}`}>
                        <input type="radio" name={`szint_${i}`} value={s.value} checked={l.szint === s.value}
                          onChange={() => { const list = [...cv.nyelvek]; list[i] = { ...list[i], szint: s.value }; save({ ...cv, nyelvek: list }); }}
                          className="mt-0.5 accent-sni-brand-teal" />
                        <span>
                          <span className="font-semibold">{s.label}</span>
                          {s.desc && <span className="text-xs text-gray-400 block">{s.desc}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </label>
                {l.szint === "nyelvvizsga" && (
                  <Input label="Milyen nyelvvizsgád van?" value={l.vizsga ?? ""}
                    onChange={(v) => { const list = [...cv.nyelvek]; list[i] = { ...list[i], vizsga: v }; save({ ...cv, nyelvek: list }); }}
                    placeholder="Például: angol B2, német C1…" />
                )}
                {cv.nyelvek.length > 1 && (
                  <button type="button" onClick={() => save({ ...cv, nyelvek: cv.nyelvek.filter((_, j) => j !== i) })}
                    className="self-start text-xs text-red-500 hover:underline">Törlés</button>
                )}
              </div>
            ))}

            {!cv.nyelv_kihagyva && (
              <button type="button"
                onClick={() => save({ ...cv, nyelvek: [...cv.nyelvek, { nyelv: "", szint: "", vizsga: "" }] })}
                className="self-start rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal">
                + Újabb nyelv
              </button>
            )}
            {cv.nyelv_kihagyva && (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                Ezt a részt kihagytad.
              </div>
            )}
            <SkipButton onClick={() => save({ ...cv, nyelv_kihagyva: !cv.nyelv_kihagyva })} />
          </div>
        )}

        {/* 7. Munkába állás */}
        {step === 7 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Mikor tudnál munkába állni?</h2>
            <p className="text-xs text-gray-400">Válaszd azt, ami most leginkább igaz rád.</p>
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

        {/* 8. Amit még el szeretnél mondani */}
        {step === 8 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Mit szeretnél még elmondani magadról?</h2>
            <p className="text-sm text-gray-500">
              Ide leírhatsz bármit, amit fontosnak tartasz. Például: kreatív elfoglaltságaid, kedvenc időtöltésed,
              sport, önkéntes munka, hobbik, erősségek, vagy bármi, ami segít jobban megismerni téged.
            </p>
            <textarea
              value={cv.egyeb_info}
              onChange={(e) => save({ ...cv, egyeb_info: e.target.value })}
              rows={5}
              placeholder="Például: szeretek rajzolni, szeretek állatokkal foglalkozni, sportolok, szívesen segítek másoknak, szeretek rendszerezni, pontos vagyok…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
            />
          </div>
        )}

        {/* 9. Kész */}
        {step === 9 && (
          <div className="text-center py-4">
            <p className="text-5xl mb-4">🎉</p>
            <h2 className="text-xl font-extrabold text-sni-brand-navy">Elkészült a bemutatkozó lapod!</h2>
            <p className="mt-2 text-sm text-gray-600">
              Kattints az „Előnézet megtekintése&quot; gombra a PDF letöltéshez.
            </p>
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
          <button type="button" onClick={goNext}
            className="rounded-full bg-sni-brand-teal px-6 py-2 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white">
            {isLast ? "Előnézet megtekintése" : "Tovább →"}
          </button>
        </div>
      </div>
    </div>
  );
}
