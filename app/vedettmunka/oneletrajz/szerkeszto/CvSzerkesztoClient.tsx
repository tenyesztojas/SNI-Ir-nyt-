"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { CvData } from "@/lib/vedettmunka/types";
import { EMPTY_CV } from "@/lib/vedettmunka/types";

const CV_KEY = "vm_cv_draft";

const STEPS = [
  "Alapadatok",
  "Jogosítványok",
  "Iskolai végzettség",
  "Szakma",
  "Munkahelyek",
  "Számítógépes ismeretek",
  "Nyelvismeret",
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

function cls(...c: string[]) { return c.filter(Boolean).join(" "); }

function Input({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
      />
    </label>
  );
}

export default function CvSzerkesztoClient() {
  const [step, setStep] = useState(0);
  const [cv, setCv] = useState<CvData>(EMPTY_CV);
  const router = useRouter();
  const photoRef = useRef<HTMLInputElement>(null);

  // localStorage betöltés
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CV_KEY);
      if (saved) setCv(JSON.parse(saved));
    } catch {}
  }, []);

  function save(updated: CvData) {
    setCv(updated);
    try { localStorage.setItem(CV_KEY, JSON.stringify(updated)); } catch {}
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("A fénykép mérete legfeljebb 5 MB lehet."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => save({ ...cv, foto_base64: ev.target?.result as string });
    reader.readAsDataURL(file);
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

            {/* Fénykép */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Fénykép (opcionális)</p>
              <p className="text-xs text-gray-400 mb-2">
                A fénykép nem kötelező. Csak akkor tölts fel képet, ha szeretnéd, hogy szerepeljen az önéletrajzodban.
              </p>
              <div className="flex items-center gap-4">
                {cv.foto_base64 && (
                  <img src={cv.foto_base64} alt="Fotó" className="h-20 w-20 rounded-xl object-cover border border-gray-200" />
                )}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => photoRef.current?.click()}
                    className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-semibold hover:border-sni-brand-teal"
                  >
                    {cv.foto_base64 ? "Csere" : "Fotó feltöltése"}
                  </button>
                  {cv.foto_base64 && (
                    <button
                      type="button"
                      onClick={() => save({ ...cv, foto_base64: null })}
                      className="rounded-full border border-red-100 px-4 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
                    >
                      Törlés
                    </button>
                  )}
                </div>
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </div>
              <p className="mt-1 text-xs text-gray-400">A feltöltött képet csak az önéletrajz elkészítéséhez használjuk, nem tároljuk tartósan.</p>
            </div>

            <Input label="Teljes neve" value={cv.nev} onChange={(v) => save({ ...cv, nev: v })} placeholder="pl. Kovács Anna" />
            <Input label="Születési év" value={cv.szuletesi_ev} onChange={(v) => save({ ...cv, szuletesi_ev: v })} placeholder="pl. 1990" />
            <Input label="Lakóhely" value={cv.lakhely} onChange={(v) => save({ ...cv, lakhely: v })} placeholder="pl. Budapest" />
            <Input label="Telefonszám" value={cv.telefon} onChange={(v) => save({ ...cv, telefon: v })} type="tel" placeholder="+36 20 123 4567" />
            <Input label="E-mail" value={cv.email} onChange={(v) => save({ ...cv, email: v })} type="email" placeholder="email@pelda.hu" />
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

        {/* 2. Iskolai végzettség */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Iskolai végzettség</h2>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Milyen iskolát végeztél?</span>
              <select
                value={cv.iskolai_vegzettseg}
                onChange={(e) => save({ ...cv, iskolai_vegzettseg: e.target.value })}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
              >
                <option value="">— Válassz —</option>
                {VEGZETTSEG_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <Input label="Hol végezted? (település)" value={cv.iskola_helye} onChange={(v) => save({ ...cv, iskola_helye: v })} placeholder="pl. Budapest" />
            <Input label="Mikor? (évszám)" value={cv.iskola_eve} onChange={(v) => save({ ...cv, iskola_eve: v })} placeholder="pl. 2010" />
          </div>
        )}

        {/* 3. Szakma */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Szakma</h2>
            <Input label="Ha van szakmád, mi az?" value={cv.szakma} onChange={(v) => save({ ...cv, szakma: v })} placeholder="pl. villanyszerelő" />
            <Input label="Hol végezted?" value={cv.szakma_helye} onChange={(v) => save({ ...cv, szakma_helye: v })} />
            <Input label="Mikor?" value={cv.szakma_eve} onChange={(v) => save({ ...cv, szakma_eve: v })} placeholder="pl. 2012" />
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

        {/* 6. Nyelvismeret */}
        {step === 6 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-extrabold text-sni-brand-navy text-lg">Nyelvismeret</h2>
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
            <p className="text-sm text-gray-500">Van valami más, amit fontosnak tartasz megemlíteni az önéletrajzodban?</p>
            <textarea
              value={cv.egyeb_info}
              onChange={(e) => save({ ...cv, egyeb_info: e.target.value })}
              rows={5}
              placeholder="pl. Hobbijaim, önkéntes tevékenység, díjak, projektek..."
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
