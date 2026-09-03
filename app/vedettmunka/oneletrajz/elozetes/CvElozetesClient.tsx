"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { CvData } from "@/lib/vedettmunka/types";
import { EMPTY_CV } from "@/lib/vedettmunka/types";

const CV_KEY = "vk_bemutatkozo_draft";

const NYELV_SZINT_LABEL: Record<string, string> = {
  alapszinten_eri: "Alapszinten értem",
  egyszeruen_hasznalom: "Egyszerű helyzetekben használom",
  jol_hasznalom: "Jól használom",
  nagyon_jol: "Nagyon jól használom",
  nyelvvizsga: "Nyelvvizsgám is van",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cv-section mb-5">
      <h3 className="cv-section-title">{title}</h3>
      <div className="cv-section-body">{children}</div>
    </div>
  );
}

function cropImageToDataUrl(src: string, w: number, h: number, scale = 3): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(src); return; }
      const imgRatio = img.width / img.height;
      const targetRatio = w / h;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgRatio > targetRatio) { sw = img.height * targetRatio; sx = (img.width - sw) / 2; }
      else { sh = img.width / targetRatio; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.98));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export default function CvElozetesClient() {
  const [cv, setCv] = useState<CvData | null>(null);
  const [croppedFoto, setCroppedFoto] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [draftDeleted, setDraftDeleted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CV_KEY);
      if (saved) {
        const raw = JSON.parse(saved) as Record<string, unknown>;
        if (raw.szuletesi_ev && !raw.szuletesi_datum) raw.szuletesi_datum = `${raw.szuletesi_ev}-01-01`;
        if (!raw.vegzettsegek) {
          raw.vegzettsegek = (raw.iskolai_vegzettseg || raw.iskola_helye || raw.iskola_eve)
            ? [{ szint: raw.iskolai_vegzettseg ?? "", hely: raw.iskola_helye ?? "", ev: raw.iskola_eve ?? "" }]
            : [{ szint: "", hely: "", ev: "" }];
        }
        if (!raw.szakmak) {
          raw.szakmak = (raw.szakma || raw.szakma_helye || raw.szakma_eve)
            ? [{ nev: raw.szakma ?? "", hely: raw.szakma_helye ?? "", ev: raw.szakma_eve ?? "" }]
            : [{ nev: "", hely: "", ev: "" }];
        }
        if (!raw.weboldal) raw.weboldal = "";
        if (!raw.lakhely_megye) raw.lakhely_megye = "";
        if (!raw.digitalis_eszkozok) raw.digitalis_eszkozok = { irodai: "", egyeb_prog: "", kozossegi: "", egyeb_dig: "" };
        setCv({ ...EMPTY_CV, ...raw });
      } else {
        setCv(EMPTY_CV);
      }
    } catch {
      setCv(EMPTY_CV);
    }
  }, []);

  useEffect(() => {
    if (!cv?.foto_base64) { setCroppedFoto(null); return; }
    cropImageToDataUrl(cv.foto_base64, 100, 120, 3).then(setCroppedFoto);
  }, [cv?.foto_base64]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const element = document.getElementById("cv-print-root");
      if (!element) return;
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf().set({
        margin: 0,
        filename: "vedettkarrier-bemutatkozo-lap.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(element).save();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Ismeretlen hiba történt a PDF letöltésekor.");
    } finally {
      setDownloading(false);
    }
  }, []);

  function handleDeleteDraft() {
    try { localStorage.removeItem(CV_KEY); } catch {}
    setCv(EMPTY_CV);
    setDraftDeleted(true);
  }

  if (!cv) return <div className="py-16 text-center text-gray-400">Betöltés...</div>;

  const jogositvanyok = [
    cv.b_jogositvany && "B kategóriás jogosítvány",
    cv.targonca_jogositvany && "Targoncavezető-jogosítvány",
    cv.egyeb_jogositvany,
  ].filter(Boolean).join(", ");

  function formatDatum(d: string) {
    if (!d) return "";
    const year = d.slice(0, 4);
    return year ? `${year}.` : d;
  }

  // Digitális eszközök összesítő (szabad szöveges kategóriák)
  const digitalisLines = Object.values(cv.digitalis_eszkozok ?? {}).filter(Boolean);
  const digitalisText = digitalisLines.join(" · ");

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #cv-print-root, #cv-print-root * { visibility: visible; }
          #cv-print-root { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
        }
        .cv-page {
          font-family: 'Nunito', 'Segoe UI', sans-serif;
          font-size: 11pt;
          color: #1a1a2e;
          line-height: 1.6;
        }
        .cv-section-title {
          font-size: 10pt;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #1C8AA8;
          border-bottom: 2px solid #34D8C3;
          padding-bottom: 2px;
          margin-bottom: 6px;
        }
        .cv-row { display: flex; gap: 8px; margin-bottom: 2px; }
        .cv-label { font-weight: 700; min-width: 140px; }
        .cv-job { margin-bottom: 8px; }
        .cv-job-title { font-weight: 700; }
        .cv-job-meta { font-size: 10pt; color: #555; }
      `}</style>

      {/* Adatvédelmi tájékoztató */}
      <div className="print:hidden mx-auto max-w-3xl px-4 pt-6 pb-0 sm:px-6">
        <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-3 text-sm text-blue-800">
          <p className="font-semibold mb-1">A bemutatkozó lapról</p>
          <p className="text-xs">
            A bemutatkozó lap adatai a <strong>böngésződben kerülnek feldolgozásra</strong>.
            A VédettKarrier nem menti őket szerveroldali dokumentum-adatbázisba. A letöltött PDF-et a saját eszközödön tárolod.
          </p>
          <p className="mt-1 text-xs text-blue-700">
            A VédettKarrier nem kér diagnózist, egészségügyi dokumentumot, fogyatékossági igazolást vagy gyermekre vonatkozó adatot.
            Kérjük, ilyen adatot ne adj meg és ne tölts fel.
          </p>
        </div>
      </div>

      {/* Vezérlő gombok */}
      <div className="print:hidden mx-auto max-w-3xl px-4 pb-2 sm:px-6 flex flex-wrap gap-3 items-center">
        <Link href="/vedettmunka/oneletrajz/szerkeszto"
          className="rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold hover:border-sni-brand-teal">
          ← Vissza a szerkesztéshez
        </Link>
        <button onClick={handleDownload} disabled={downloading}
          className="rounded-full bg-sni-brand-teal px-6 py-2 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white disabled:opacity-60">
          {downloading ? "Generálás..." : "Bemutatkozó lap letöltése"}
        </button>
        <button type="button" onClick={handleDeleteDraft}
          className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50">
          Piszkozat törlése erről az eszközről
        </button>
      </div>

      {downloadError && (
        <div className="print:hidden mx-auto max-w-3xl px-4 sm:px-6">
          <p className="mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{downloadError}</p>
        </div>
      )}
      {draftDeleted && (
        <div className="print:hidden mx-auto max-w-3xl px-4 sm:px-6">
          <p className="mt-2 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
            ✓ A bemutatkozó lap piszkozatát töröltük erről az eszközről.
          </p>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6 print:px-0 print:max-w-none print:pb-0">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm print:rounded-none print:shadow-none print:border-none">

          <div id="cv-print-root" className="cv-page p-8">

            {/* PDF fejléc: kétoszlopos */}
            <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
              {/* Bal sáv */}
              <div style={{ width: 180, minWidth: 180, background: "#123A5C", color: "white", borderRadius: 12, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                {croppedFoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={croppedFoto} alt="Fotó" style={{ width: 100, height: 120, borderRadius: 8, border: "3px solid #34D8C3", display: "block", flexShrink: 0 }} />
                )}
                <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>Elérhetőség</div>
                {cv.telefon && <div style={{ fontSize: 10, color: "#e2e8f0" }}>📞 {cv.telefon}</div>}
                {cv.email && <div style={{ fontSize: 10, color: "#e2e8f0", wordBreak: "break-all" }}>✉ {cv.email}</div>}
                {(cv.lakhely || cv.lakhely_megye) && (
                  <div style={{ fontSize: 10, color: "#e2e8f0" }}>
                    📍 {cv.lakhely || cv.lakhely_megye}
                    {cv.lakhely && cv.lakhely_megye && ` (${cv.lakhely_megye})`}
                  </div>
                )}
                {cv.szuletesi_datum && <div style={{ fontSize: 10, color: "#e2e8f0" }}>🎂 {formatDatum(cv.szuletesi_datum)}</div>}
                {cv.weboldal && (
                  <>
                    <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>Weboldal / Szakmai oldal</div>
                    <div style={{ fontSize: 9, color: "#e2e8f0", wordBreak: "break-all" }}>{cv.weboldal}</div>
                  </>
                )}
                {jogositvanyok && (
                  <>
                    <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>Jogosítványok</div>
                    <div style={{ fontSize: 10, color: "#e2e8f0" }}>{jogositvanyok}</div>
                  </>
                )}
                {digitalisText && (
                  <>
                    <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>Digitális eszközök</div>
                    <div style={{ fontSize: 9, color: "#e2e8f0", whiteSpace: "pre-wrap" }}>{digitalisLines.join("\n")}</div>
                  </>
                )}
                {cv.munkaba_allas && (
                  <>
                    <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>Mikor tud kezdeni</div>
                    <div style={{ fontSize: 10, color: "#e2e8f0" }}>{cv.munkaba_allas}</div>
                  </>
                )}
              </div>

              {/* Jobb oldal */}
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: "#123A5C", marginBottom: 2 }}>{cv.nev || "Bemutatkozó lap"}</h1>
                <div style={{ height: 3, width: 60, background: "#34D8C3", borderRadius: 2, marginBottom: 16 }} />

                {/* Amit tanultam */}
                {cv.vegzettsegek?.some((v) => v.szint || v.hely) && (
                  <Section title="Amit tanultam">
                    {cv.vegzettsegek.filter((v) => v.szint || v.hely).map((v, i) => (
                      <div key={i} className="cv-job">
                        <p className="cv-job-title">{v.szint}</p>
                        <p className="cv-job-meta">{[v.hely, v.ev].filter(Boolean).join(" · ")}</p>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Milyen munkához értek */}
                {!cv.szakma_kihagyva && cv.szakmak?.some((s) => s.nev) && (
                  <Section title="Milyen munkához értek">
                    {cv.szakmak.filter((s) => s.nev).map((s, i) => (
                      <div key={i} className="cv-job">
                        <p className="cv-job-title">{s.nev}</p>
                        <p className="cv-job-meta">{[s.hely, s.ev].filter(Boolean).join(" · ")}</p>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Hol dolgoztam eddig */}
                {!cv.nem_dolgozott && cv.munkahelyek.some((m) => m.hol) && (
                  <Section title="Hol dolgoztam eddig">
                    {cv.munkahelyek.filter((m) => m.hol).map((m, i) => (
                      <div key={i} className="cv-job">
                        <p className="cv-job-title">{m.hol}</p>
                        {m.mit && <p style={{ fontSize: 10 }}>{m.mit}</p>}
                        <p className="cv-job-meta">{[m.mettol, m.meddig].filter(Boolean).join(" – ")}</p>
                      </div>
                    ))}
                  </Section>
                )}
                {cv.nem_dolgozott && (
                  <Section title="Hol dolgoztam eddig">
                    <p style={{ fontSize: 10, color: "#555" }}>Jelenleg álláskereső vagyok.</p>
                  </Section>
                )}

                {/* Nyelvek */}
                {!cv.nyelv_kihagyva && cv.nyelvek.some((l) => l.nyelv) && (
                  <Section title="Nyelvek, amiket használok">
                    {cv.nyelvek.filter((l) => l.nyelv).map((l, i) => (
                      <div key={i} className="cv-row">
                        <span className="cv-label">{l.nyelv}</span>
                        <span>
                          {NYELV_SZINT_LABEL[l.szint] ?? l.szint}
                          {l.vizsga ? ` · ${l.vizsga}` : ""}
                        </span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Amit még fontosnak tartok magamról */}
                {cv.egyeb_info && (
                  <Section title="Amit még fontosnak tartok magamról">
                    <p style={{ whiteSpace: "pre-wrap", fontSize: 10 }}>{cv.egyeb_info}</p>
                  </Section>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Adatvédelmi szöveg */}
        <div className="print:hidden mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <strong>Amit érdemes tudni:</strong> A bemutatkozó lapot mentsd el saját eszközödre.
          A VédettKarrier nem tárolja tartósan a bemutatkozó lapodat és nem épít belőle kereshető dokumentum-adatbázist.
        </div>
      </div>
    </>
  );
}
