"use client";

import { useState } from "react";
import { submitUserReport } from "@/app/kozosseg/actions";
import { USER_REPORT_CATEGORIES, CHILD_WARNING_CATEGORIES } from "@/lib/community/types";

interface Props {
  reportedUserId: string;
  relatedHelpSettingId?: string | null;
}

export default function ReportUserButton({ reportedUserId, relatedHelpSettingId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const selectedCategory = USER_REPORT_CATEGORIES.find((c) => c.value === reason);
  const showChildWarning = CHILD_WARNING_CATEGORIES.includes(
    reason as (typeof CHILD_WARNING_CATEGORIES)[number]
  );

  function handleOpen() {
    setOpen(true);
    setResult(null);
    setReason("");
    setDescription("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setResult({ ok: false, text: "Kérjük, válassz bejelentési okot." });
      return;
    }
    if (description.trim().length < 20) {
      setResult({ ok: false, text: "Kérjük, adj meg legalább 20 karakteres indoklást." });
      return;
    }
    if (description.trim().length > 1000) {
      setResult({ ok: false, text: "A leírás legfeljebb 1000 karakter lehet." });
      return;
    }
    setSending(true);
    const res = await submitUserReport({
      reportedUserId,
      relatedHelpSettingId: relatedHelpSettingId ?? null,
      reason,
      description,
    });
    setSending(false);
    if (res.ok) {
      setResult({
        ok: true,
        text: "Köszönjük, megkaptuk a jelentést. Az adminisztrátorok megvizsgálják, és szükség esetén intézkednek.",
      });
    } else {
      setResult({
        ok: false,
        text: res.error ?? "A jelentést most nem sikerült elküldeni. Kérjük, próbáld újra később.",
      });
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        aria-haspopup="dialog"
        className="text-xs text-gray-400 hover:text-red-500 transition underline"
      >
        Felhasználó jelentése
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh] overflow-y-auto">

            {/* ── 112 vészjelzés – mindig látható, nem zárható be ── */}
            <div
              className="rounded-t-2xl bg-red-600 px-5 py-4 text-white"
              role="alert"
              aria-live="assertive"
            >
              <p className="font-bold text-base mb-1">
                ⚠️ Azonnali veszély esetén ne várj a VédettSarok válaszára.
              </p>
              <p className="text-sm leading-snug">
                Ha valaki közvetlen veszélyben van, gyermek veszélyeztetése, erőszak, fenyegetés,
                eltűnés, baleset vagy más sürgős helyzet merül fel, azonnal hívd a{" "}
                <a
                  href="tel:112"
                  className="font-bold underline focus:outline-none focus:ring-2 focus:ring-white rounded"
                  aria-label="Hívás: 112 segélyhívó"
                >
                  112-t
                </a>
                . A VédettSarokban tett jelentés nem helyettesíti a rendőrségi, mentőszolgálati,
                gyermekvédelmi vagy más hatósági bejelentést.
              </p>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <h2 id="report-dialog-title" className="text-base font-bold text-sni-text">
                Felhasználó jelentése
              </h2>

              {result?.ok ? (
                <>
                  <div
                    className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700"
                    role="status"
                    aria-live="polite"
                  >
                    {result.text}
                  </div>
                  {/* 112 emlékeztető a siker üzenetben */}
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    Ha valaki közvetlen veszélyben van, hívd a{" "}
                    <a href="tel:112" className="font-bold underline">
                      112-t
                    </a>{" "}
                    haladéktalanul. Ez az értesítés nem jelent azonnali hatósági intézkedést.
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="w-full rounded-full border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50"
                    autoFocus
                  >
                    Bezárás
                  </button>
                </>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                  {/* Kategória választó */}
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-600">
                      Bejelentés oka <span className="text-red-500" aria-hidden="true">*</span>
                    </span>
                    <select
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        setResult(null);
                      }}
                      required
                      aria-required="true"
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20"
                    >
                      <option value="">— Válassz okot —</option>
                      {USER_REPORT_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                          {c.severity === "critical" ? " 🚨" : c.severity === "high" ? " ⚠️" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Súlyossági tájékoztató */}
                  {selectedCategory && (
                    <div
                      className={`rounded-xl px-4 py-3 text-xs ${
                        selectedCategory.severity === "critical"
                          ? "border border-red-300 bg-red-50 text-red-800"
                          : selectedCategory.severity === "high"
                          ? "border border-amber-200 bg-amber-50 text-amber-800"
                          : "border border-gray-200 bg-gray-50 text-gray-600"
                      }`}
                      role="status"
                      aria-live="polite"
                    >
                      {selectedCategory.severity === "critical" && (
                        <>
                          <strong>Kritikus bejelentés.</strong> Az adminisztrátorok kiemelten
                          foglalkoznak ezzel az esettel. Ha közvetlen veszély áll fenn, hívd a{" "}
                          <a href="tel:112" className="font-bold underline">
                            112-t
                          </a>
                          .
                        </>
                      )}
                      {selectedCategory.severity === "high" && (
                        <>
                          <strong>Magas prioritású bejelentés.</strong> Az adminisztrátorok hamarosan
                          megvizsgálják.
                        </>
                      )}
                      {selectedCategory.severity === "normal" && (
                        <>Az adminisztrátorok megvizsgálják a bejelentést.</>
                      )}
                    </div>
                  )}

                  {/* Gyermekbiztonsági figyelmeztetés */}
                  {showChildWarning && (
                    <div
                      className="rounded-xl border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900"
                      role="alert"
                      aria-live="assertive"
                    >
                      <p className="font-bold mb-1">🚸 Gyermek biztonságát érintő ügy</p>
                      <p className="mb-2">
                        Ha egy gyermek közvetlen veszélyben lehet, azonnal hívd a{" "}
                        <a
                          href="tel:112"
                          className="font-bold underline focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
                          aria-label="Hívás: 112 segélyhívó"
                        >
                          112-t
                        </a>
                        . Ha nem azonnali veszélyhelyzetről van szó, de gyermek veszélyeztetésére,
                        elhanyagolására vagy bántalmazására utaló információt észlelsz, a jelentés
                        mellett jelezheted azt az illetékes gyermekjóléti szolgálatnak is.
                      </p>
                      <p className="text-xs text-red-700 border-t border-red-200 pt-2">
                        <strong>Adatvédelmi megjegyzés:</strong> A jelentésben ne adj meg
                        szükségtelenül gyermeknevet, pontos címet, iskola vagy óvoda nevét, fényképet,
                        egészségügyi adatot, TAJ-számot vagy más azonosító adatot.
                      </p>
                    </div>
                  )}

                  {/* Leírás */}
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="report-description"
                      className="text-xs font-semibold text-gray-600"
                    >
                      Részletes leírás{" "}
                      <span className="text-red-500" aria-hidden="true">
                        *
                      </span>
                    </label>
                    {/* Adatminimalizálási figyelmeztetés – mező felett */}
                    <p className="text-xs text-gray-400 leading-snug mb-1">
                      Csak a kivizsgáláshoz szükséges információt add meg. Ne írj be TAJ-számot,
                      okmányadatot, banki adatot, pontos lakcímet, gyermek teljes nevét,
                      intézményének nevét, fényképét vagy részletes egészségügyi adatot.
                    </p>
                    <textarea
                      id="report-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                      required
                      aria-required="true"
                      rows={4}
                      placeholder="Írd le röviden, mi történt. Csak annyi információt adj meg, amennyi a helyzet megértéséhez szükséges."
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20 resize-none"
                      aria-describedby="desc-counter desc-privacy"
                    />
                    <p
                      id="desc-counter"
                      className="text-right text-xs text-gray-400"
                      aria-live="polite"
                    >
                      {description.length}/1000
                    </p>
                  </div>

                  <p id="desc-privacy" className="text-xs text-gray-400">
                    A bejelentés tartalma és a bejelentő személye az érintett felhasználóval nem kerül
                    megosztásra, kivéve, ha ezt jogszabály, bíróság vagy hatóság kötelezően előírja.
                  </p>

                  {result && !result.ok && (
                    <p
                      className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600"
                      role="alert"
                      aria-live="assertive"
                    >
                      {result.text}
                    </p>
                  )}

                  {/* Küldés előtti megjegyzés */}
                  <p className="text-xs text-gray-400 leading-snug">
                    A jelentést a VédettSarok biztonsági és moderációs célból vizsgálja. Nem
                    garantálható az azonnali válasz vagy intézkedés. Közvetlen veszély esetén hívd a{" "}
                    <a
                      href="tel:112"
                      className="font-semibold underline focus:outline-none focus:ring-2 focus:ring-gray-400 rounded"
                      aria-label="Hívás: 112 segélyhívó"
                    >
                      112-t
                    </a>
                    .
                  </p>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={sending}
                      className="flex-1 rounded-full bg-red-500 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60 transition focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      {sending ? "Küldés..." : "Jelentés elküldése"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-full border border-gray-200 px-5 py-2 text-sm text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    >
                      Mégsem
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
