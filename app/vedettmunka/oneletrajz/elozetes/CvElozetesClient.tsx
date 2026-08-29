"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { CvData } from "@/lib/vedettmunka/types";
import { EMPTY_CV } from "@/lib/vedettmunka/types";

const CV_KEY = "vm_cv_draft";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cv-section mb-5">
      <h3 className="cv-section-title">{title}</h3>
      <div className="cv-section-body">{children}</div>
    </div>
  );
}

export default function CvElozetesClient() {
  const [cv, setCv] = useState<CvData | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CV_KEY);
      if (saved) setCv(JSON.parse(saved));
      else setCv(EMPTY_CV);
    } catch {
      setCv(EMPTY_CV);
    }
  }, []);

  if (!cv) return <div className="py-16 text-center text-gray-400">Betöltés...</div>;

  const jogositvanyok = [
    cv.b_jogositvany && "B kategóriás jogosítvány",
    cv.targonca_jogositvany && "Targoncavezető-jogosítvány",
    cv.egyeb_jogositvany,
  ].filter(Boolean).join(", ");

  return (
    <>
      {/* Nyomtatási CSS */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #cv-print-root { display: block !important; }
          #cv-print-root { position: fixed; top: 0; left: 0; width: 100%; }
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

      {/* Vezérlő gomb sáv */}
      <div className="print:hidden mx-auto max-w-3xl px-4 pt-6 pb-2 sm:px-6 flex flex-wrap gap-3 items-center">
        <Link href="/vedettmunka/oneletrajz/szerkeszto"
          className="rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold hover:border-sni-brand-teal">
          ← Szerkesztés
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-full bg-sni-brand-teal px-6 py-2 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
        >
          PDF letöltése / Nyomtatás
        </button>
        <p className="text-xs text-gray-400">
          A böngésző nyomtatás párbeszédablakában válaszd a &ldquo;Mentés PDF-ként&rdquo; lehetőséget.
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6 print:px-0 print:max-w-none print:pb-0">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm print:rounded-none print:shadow-none print:border-none">

          {/* CV tartalma */}
          <div id="cv-print-root" className="cv-page p-8">

            {/* Fejléc: bal oldali sáv */}
            <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
              {/* Bal sáv */}
              <div style={{ width: 180, minWidth: 180, background: "#123A5C", color: "white", borderRadius: 12, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                {cv.foto_base64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cv.foto_base64} alt="Fotó" style={{ width: 100, height: 120, objectFit: "cover", borderRadius: 8, border: "3px solid #34D8C3" }} />
                )}
                <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>Elérhetőség</div>
                {cv.telefon && <div style={{ fontSize: 10, color: "#e2e8f0" }}>📞 {cv.telefon}</div>}
                {cv.email && <div style={{ fontSize: 10, color: "#e2e8f0", wordBreak: "break-all" }}>✉ {cv.email}</div>}
                {cv.lakhely && <div style={{ fontSize: 10, color: "#e2e8f0" }}>📍 {cv.lakhely}</div>}
                {cv.szuletesi_ev && <div style={{ fontSize: 10, color: "#e2e8f0" }}>🎂 {cv.szuletesi_ev}</div>}

                {jogositvanyok && (
                  <>
                    <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>Jogosítványok</div>
                    <div style={{ fontSize: 10, color: "#e2e8f0" }}>{jogositvanyok}</div>
                  </>
                )}

                {cv.szamitogep.length > 0 && (
                  <>
                    <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>Számítógép</div>
                    {cv.szamitogep.map((s) => <div key={s} style={{ fontSize: 10, color: "#e2e8f0" }}>• {s}</div>)}
                  </>
                )}

                {cv.munkaba_allas && (
                  <>
                    <div style={{ width: "100%", color: "#34D8C3", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>Munkába állás</div>
                    <div style={{ fontSize: 10, color: "#e2e8f0" }}>{cv.munkaba_allas}</div>
                  </>
                )}
              </div>

              {/* Jobb oldal: Név + szekciók */}
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: "#123A5C", marginBottom: 2 }}>{cv.nev || "Önéletrajz"}</h1>
                <div style={{ height: 3, width: 60, background: "#34D8C3", borderRadius: 2, marginBottom: 16 }} />

                {/* Végzettség */}
                {(cv.iskolai_vegzettseg || cv.iskola_helye) && (
                  <Section title="Iskolai végzettség">
                    <p className="cv-job-title">{cv.iskolai_vegzettseg}</p>
                    <p className="cv-job-meta">{[cv.iskola_helye, cv.iskola_eve].filter(Boolean).join(" · ")}</p>
                  </Section>
                )}

                {/* Szakma */}
                {cv.szakma && (
                  <Section title="Szakma">
                    <p className="cv-job-title">{cv.szakma}</p>
                    <p className="cv-job-meta">{[cv.szakma_helye, cv.szakma_eve].filter(Boolean).join(" · ")}</p>
                  </Section>
                )}

                {/* Munkatapasztalat */}
                {!cv.nem_dolgozott && cv.munkahelyek.some((m) => m.hol) && (
                  <Section title="Munkatapasztalat">
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
                  <Section title="Munkatapasztalat">
                    <p style={{ fontSize: 10, color: "#555" }}>Álláskereső</p>
                  </Section>
                )}

                {/* Nyelvismeret */}
                {cv.nyelvek.some((l) => l.nyelv) && (
                  <Section title="Nyelvismeret">
                    {cv.nyelvek.filter((l) => l.nyelv).map((l, i) => (
                      <div key={i} className="cv-row">
                        <span className="cv-label">{l.nyelv}</span>
                        <span>{l.szint}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Egyéb */}
                {cv.egyeb_info && (
                  <Section title="Egyéb információ">
                    <p style={{ whiteSpace: "pre-wrap", fontSize: 10 }}>{cv.egyeb_info}</p>
                  </Section>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Figyelmeztetés */}
        <div className="print:hidden mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <strong>Fontos:</strong> A dokumentumot mentsd el saját eszközödre (Mentés PDF-ként a nyomtató párbeszédablakban).
          A VédettMunka nem tárolja tartósan az önéletrajzodat.
        </div>
      </div>
    </>
  );
}
