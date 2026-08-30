"use client";

import { useState } from "react";
import { upsertHelpSettings } from "@/app/kozosseg/actions";
import {
  HELP_NEEDED_CATEGORIES,
  HELP_OFFERED_CATEGORIES,
  HELP_VISIBILITY_LABELS,
  type CommunityHelpSettings,
  type HelpVisibility,
} from "@/lib/community/types";

// ── Szöveg konstansok ─────────────────────────────────────────

const FO_TAJEKOZTATO =
  "A Közösségi segítség funkcióval önkéntes, hétköznapi segítséget kérhetsz vagy ajánlhatsz fel más felhasználóknak. A VédettSarok kizárólag a felhasználók közötti kapcsolatfelvétel technikai lehetőségét biztosítja. A konkrét segítség elfogadása, nyújtása és megszervezése a felhasználók saját döntése és felelőssége alapján történik.";

// A sárga box első mondata félkövér, a többi normál szöveg – két részre osztjuk:
const UZLETSZERU_ELSO =
  "Ez a felület kizárólag önkéntes, nem üzletszerű közösségi segítségkérésre és segítségfelajánlásra használható.";
const UZLETSZERU_TOBBI =
  " Tilos fizetős vagy üzletszerű szolgáltatás, gyermekfelügyelet, gyermek egyedüli kísérése, személyszállítás, betegszállítás, egészségügyi ellátás, terápia, szociális ellátás, sürgősségi segítség, pénzkérés, kölcsönkérés, jogi vagy pénzügyi tanácsadás hirdetése, szervezése vagy közvetítése.";

const ADATVEDELMI_BOX_CIM = "Személyes és érzékeny adatok védelme";
const ADATVEDELMI_BOX_SZOVEG =
  "Ne tegyél közzé gyermek teljes nevét, fényképét, pontos lakcímét, intézményének nevét, napi útvonalát, telefonszámát, e-mail-címét, TAJ-számát, személyazonosító okmányának adatait, diagnózisát vagy más egészségügyi adatát. Csak a segítség megszervezéséhez feltétlenül szükséges információt oszd meg.";

// Checkbox melletti szöveg – „112" kiemelten jelenik meg (külön span, nem link a labelben)
const FELELOSSEG_ELOTTE =
  "Megértettem, hogy a VédettSarok Közösségi segítség funkciója kizárólag önkéntes kapcsolatfelvételi lehetőséget biztosít. A VédettSarok nem gyermekfelügyeleti, személyszállítási, egészségügyi, terápiás, szociális, jogi, pénzügyi vagy sürgősségi szolgáltatás, és ilyen szolgáltatást nem közvetít. A VédettSarok nem minősíti és nem garantálja a felhasználók személyazonosságát, alkalmasságát, képzettségét, jogosultságát, biztosítását vagy megbízhatóságát. A kapcsolatfelvétel, az adatmegosztás, a személyes találkozó, valamint a segítség elfogadása vagy nyújtása a résztvevők saját döntése és felelőssége. Közvetlen veszélyhelyzetben a ";
const FELELOSSEG_UTANA = "-t kell hívni.";

const LEIRAS_ADATVEDELMI =
  "Ne ossz meg pontos lakcímet, gyermek teljes nevét, fényképét, iskolája vagy óvodája nevét, napi útvonalát, telefonszámát, TAJ-számát, diagnózisát vagy más érzékeny személyes adatát. Csak a segítség megszervezéséhez szükséges információt add meg.";

const GYERMEK_FIGYELMEZTES =
  "Fontos: a VédettSarok nem gyermekfelügyeleti szolgáltatás. Gyermekkel kapcsolatos bármilyen segítség kizárólag a szülő vagy törvényes képviselő saját döntése, előzetes egyeztetése és felelőssége alapján történhet. A VédettSarok nem ellenőrzi a segítséget nyújtó személy alkalmasságát, képzettségét vagy megbízhatóságát.";

const SZALLITAS_FIGYELMEZTES =
  "Fontos: a VédettSarok nem személyszállítási szolgáltatás. Bármilyen utazás, fuvar vagy kísérés megszervezése kizárólag a felek saját döntése és felelőssége alapján történik. A VédettSarok nem ellenőrzi a járművet, vezetői jogosultságot, biztosítást vagy az utazás körülményeit.";

// ── Segéd komponensek ─────────────────────────────────────────

function WarningBox({ text }: { text: string }) {
  return (
    <div
      className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"
      role="note"
    >
      {text}
    </div>
  );
}

/** Adatvédelmi doboz – muted-slate stílus, vizuálisan elkülönül a sárga boxtól */
function PrivacyBox() {
  return (
    <aside
      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 mb-4"
      aria-label="Adatvédelmi figyelmeztetés"
    >
      <p className="font-semibold text-slate-800 mb-1">🔒 {ADATVEDELMI_BOX_CIM}</p>
      <p>{ADATVEDELMI_BOX_SZOVEG}</p>
    </aside>
  );
}

/** Leírás mező alatti adatminimalizálási tájékoztató */
function FieldPrivacyNote() {
  return (
    <p className="mt-1.5 text-xs text-gray-400 leading-snug">{LEIRAS_ADATVEDELMI}</p>
  );
}

// ── Fő komponens ─────────────────────────────────────────────

interface Props {
  initialSettings: CommunityHelpSettings | null;
}

export default function CommunityHelpSection({ initialSettings }: Props) {
  const [enabled, setEnabled] = useState(initialSettings?.enabled ?? false);
  const [felelossegElvállalva, setFelelossegElvállalva] = useState(
    !!initialSettings?.accepted_responsibility_notice_at
  );
  const [showEnableForm, setShowEnableForm] = useState(false);

  const [helpNeeded, setHelpNeeded] = useState(initialSettings?.help_needed_enabled ?? false);
  const [neededCats, setNeededCats] = useState<string[]>(initialSettings?.help_needed_categories ?? []);
  const [neededDesc, setNeededDesc] = useState(initialSettings?.help_needed_description ?? "");

  const [helpOffered, setHelpOffered] = useState(initialSettings?.help_offered_enabled ?? false);
  const [offeredCats, setOfferedCats] = useState<string[]>(initialSettings?.help_offered_categories ?? []);
  const [offeredDesc, setOfferedDesc] = useState(initialSettings?.help_offered_description ?? "");

  const [visibility, setVisibility] = useState<HelpVisibility>(
    initialSettings?.visibility ?? "connections_only"
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggleCat(arr: string[], set: (v: string[]) => void, val: string) {
    set(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  const hasChildCat = (cats: string[]) => cats.includes("gyermek_melletti_jelenlét");
  const hasTransportCat = (cats: string[]) => cats.includes("szallitasban_segitseg");

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    const result = await upsertHelpSettings({
      enabled,
      accepted_responsibility_notice_at: felelossegElvállalva ? new Date().toISOString() : null,
      help_needed_enabled: helpNeeded,
      help_needed_categories: neededCats,
      help_needed_description: neededDesc || null,
      help_offered_enabled: helpOffered,
      help_offered_categories: offeredCats,
      help_offered_description: offeredDesc || null,
      visibility,
    });
    setSaving(false);
    setMsg(result.ok
      ? { ok: true, text: "Közösségi segítség beállítások mentve!" }
      : { ok: false, text: result.error ?? "Hiba a mentés során." }
    );
  }

  async function handleDisable() {
    setSaving(true);
    await upsertHelpSettings({ enabled: false });
    setEnabled(false);
    setShowEnableForm(false);
    setSaving(false);
    setMsg({ ok: true, text: "Közösségi segítség kikapcsolva." });
  }

  return (
    <div className="mt-8 border-t pt-8">
      <h2 className="text-lg font-bold text-sni-text mb-1">Közösségi segítség</h2>
      <p className="text-sm text-gray-500 mb-4">
        Jelezd, ha önkéntes, közösségi segítségre van szükséged, vagy ha te tudsz másoknak segíteni.
      </p>

      {/* Főkapcsoló */}
      {!enabled && !showEnableForm && (
        <button
          onClick={() => setShowEnableForm(true)}
          className="rounded-full border border-sni-brand-teal px-5 py-2 text-sm font-semibold text-sni-brand-teal hover:bg-sni-brand-teal/10 transition"
        >
          Szeretnék részt venni a közösségi segítségnyújtásban
        </button>
      )}

      {/* Bekapcsolási folyamat: felelősségi nyilatkozat */}
      {showEnableForm && !enabled && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-sm font-semibold text-blue-900 mb-2">Közösségi segítség bekapcsolása</p>

          {/* 1. Fő tájékoztató szöveg */}
          <p className="text-sm text-blue-800 mb-4">{FO_TAJEKOZTATO}</p>

          {/* 2. Sárga tiltási box – első mondat félkövér */}
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 mb-4"
            role="note"
          >
            <p className="font-semibold mb-1">{UZLETSZERU_ELSO}</p>
            <p>{UZLETSZERU_TOBBI.trim()}</p>
          </div>

          {/* 3. Adatvédelmi box – vizuálisan elkülönített, slate stílus */}
          <PrivacyBox />

          {/* 4. Checkbox + nyilatkozat – id/htmlFor, tel:112 stopPropagation */}
          <div className="flex items-start gap-3 mb-4">
            <input
              id="ks-felelosseg-checkbox"
              type="checkbox"
              checked={felelossegElvállalva}
              onChange={(e) => setFelelossegElvállalva(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-sni-brand-teal cursor-pointer focus:ring-2 focus:ring-sni-brand-teal focus:outline-none"
            />
            <label
              htmlFor="ks-felelosseg-checkbox"
              className="text-xs text-gray-700 cursor-pointer leading-relaxed select-none"
            >
              {FELELOSSEG_ELOTTE}
              <a
                href="tel:112"
                className="font-bold underline text-gray-900 focus:outline-none focus:ring-2 focus:ring-sni-brand-teal rounded"
                aria-label="Hívás: 112 segélyhívó"
                onClick={(e) => e.stopPropagation()}
              >
                112
              </a>
              {FELELOSSEG_UTANA}
            </label>
          </div>

          {/* 5. Gombok */}
          <div className="flex gap-3">
            <button
              disabled={!felelossegElvállalva}
              onClick={() => { setEnabled(true); setShowEnableForm(false); }}
              className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy disabled:opacity-40 transition hover:bg-sni-brand-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-sni-brand-teal"
              aria-disabled={!felelossegElvállalva}
            >
              Bekapcsolás
            </button>
            <button
              onClick={() => setShowEnableForm(false)}
              className="rounded-full border border-gray-200 px-5 py-2 text-sm text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Mégsem
            </button>
          </div>
        </div>
      )}

      {/* Beállítások — ha engedélyezve van */}
      {enabled && (
        <div className="space-y-6">
          {/* Felelősségi tájékoztató */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
            A Közösségi segítség önkéntes kapcsolódási lehetőség. A VédettSarok nem gyermekfelügyeleti,
            személyszállítási, egészségügyi, terápiás, szociális vagy sürgősségi szolgáltatás.
            A VédettSarok nem vállal felelősséget a konkrét segítségkérésért vagy segítségnyújtásért.
          </div>

          {/* A) Segítséget kérek */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <button
                type="button"
                onClick={() => setHelpNeeded(!helpNeeded)}
                className={`relative h-6 w-11 rounded-full transition focus:outline-none focus:ring-2 focus:ring-sni-brand-teal ${helpNeeded ? "bg-sni-brand-teal" : "bg-gray-200"}`}
                aria-checked={helpNeeded}
                role="switch"
                aria-label="Segítséget kérek"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${helpNeeded ? "left-5" : "left-0.5"}`} />
              </button>
              <span className="text-sm font-semibold text-sni-text">Segítséget kérek</span>
            </label>

            {helpNeeded && (
              <div className="space-y-4 mt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kategóriák</p>
                <div className="flex flex-wrap gap-2">
                  {HELP_NEEDED_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleCat(neededCats, setNeededCats, cat.value)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-sni-brand-teal ${
                        neededCats.includes(cat.value)
                          ? "bg-sni-brand-teal text-sni-brand-navy"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {hasChildCat(neededCats) && <WarningBox text={GYERMEK_FIGYELMEZTES} />}
                {hasTransportCat(neededCats) && <WarningBox text={SZALLITAS_FIGYELMEZTES} />}

                <div>
                  <label
                    htmlFor="needed-desc"
                    className="text-xs font-semibold text-gray-500 mb-1 block"
                  >
                    Miben lenne szükséged segítségre? (opcionális, max. 500 karakter)
                  </label>
                  <textarea
                    id="needed-desc"
                    value={neededDesc}
                    onChange={(e) => setNeededDesc(e.target.value.slice(0, 500))}
                    rows={3}
                    placeholder="Rövid leírás, általános szinten…"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal resize-none"
                  />
                  <p className="text-right text-xs text-gray-400">{neededDesc.length}/500</p>
                  <FieldPrivacyNote />
                </div>
              </div>
            )}
          </div>

          {/* B) Segítséget ajánlok */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <button
                type="button"
                onClick={() => setHelpOffered(!helpOffered)}
                className={`relative h-6 w-11 rounded-full transition focus:outline-none focus:ring-2 focus:ring-sni-brand-teal ${helpOffered ? "bg-sni-brand-teal" : "bg-gray-200"}`}
                aria-checked={helpOffered}
                role="switch"
                aria-label="Segítséget tudok felajánlani"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${helpOffered ? "left-5" : "left-0.5"}`} />
              </button>
              <span className="text-sm font-semibold text-sni-text">Segítséget tudok felajánlani</span>
            </label>

            {helpOffered && (
              <div className="space-y-4 mt-3">
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
                  Csak olyan segítséget ajánlj fel, amit biztonságosan, önkéntesen és felelősen tudsz vállalni.
                  A VédettSarok nem ellenőrzi és nem garantálja a felajánlott segítség teljesülését vagy minőségét.
                </div>

                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kategóriák</p>
                <div className="flex flex-wrap gap-2">
                  {HELP_OFFERED_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleCat(offeredCats, setOfferedCats, cat.value)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-sni-brand-teal ${
                        offeredCats.includes(cat.value)
                          ? "bg-sni-brand-teal text-sni-brand-navy"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {hasChildCat(offeredCats) && <WarningBox text={GYERMEK_FIGYELMEZTES} />}
                {hasTransportCat(offeredCats) && <WarningBox text={SZALLITAS_FIGYELMEZTES} />}

                <div>
                  <label
                    htmlFor="offered-desc"
                    className="text-xs font-semibold text-gray-500 mb-1 block"
                  >
                    Miben tudsz segíteni másoknak? (opcionális, max. 500 karakter)
                  </label>
                  <textarea
                    id="offered-desc"
                    value={offeredDesc}
                    onChange={(e) => setOfferedDesc(e.target.value.slice(0, 500))}
                    rows={3}
                    placeholder="Rövid leírás, általános szinten…"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal resize-none"
                  />
                  <p className="text-right text-xs text-gray-400">{offeredDesc.length}/500</p>
                  <FieldPrivacyNote />
                </div>
              </div>
            )}
          </div>

          {/* Láthatóság */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
            <p className="text-sm font-semibold text-sni-text mb-3">Láthatóság</p>
            <div className="flex flex-col gap-2">
              {(Object.entries(HELP_VISIBILITY_LABELS) as [HelpVisibility, string][]).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="help_visibility"
                    value={val}
                    checked={visibility === val}
                    onChange={() => setVisibility(val)}
                    className="accent-sni-brand-teal"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">Pontos lakcím nem jelenik meg. Csak általános helyadat (város, kerület, megye) látható mások számára.</p>
          </div>

          {/* Mentés / kikapcsolás */}
          {msg && (
            <div className={`rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`} role="status" aria-live="polite">
              {msg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy disabled:opacity-60 transition hover:bg-sni-brand-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-sni-brand-teal"
            >
              {saving ? "Mentés..." : "Beállítások mentése"}
            </button>
            <button
              onClick={handleDisable}
              disabled={saving}
              className="rounded-full border border-red-200 px-5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              Funkció kikapcsolása
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
