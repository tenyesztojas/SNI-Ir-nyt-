import { NextResponse } from "next/server";
import { getSignalByQrToken } from "@/lib/vedett-jelzes/data";
import {
  NEURODIVERGENCE_LABELS,
  SUPPORT_NEEDS_CATALOG,
} from "@/lib/vedett-jelzes/types";

// Publikus QR kód megjelenítő oldal — login nem szükséges
export async function GET(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const signal = await getSignalByQrToken(params.token);

  if (!signal) {
    return new NextResponse(
      `<!DOCTYPE html><html lang="hu"><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>Jelzés nem található</h2>
        <p>Ez a QR kód érvénytelen vagy a jelzés törölve lett.</p>
      </body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const neurodivLabel = NEURODIVERGENCE_LABELS[signal.neurodivergence_type] ?? signal.neurodivergence_type;
  const needLabels = SUPPORT_NEEDS_CATALOG.filter((n) =>
    signal.support_needs.includes(n.id)
  ).map((n) => n.label);

  const overwhelmedBanner = signal.overwhelmed_mode_active
    ? `<div style="background:#dc2626;color:#fff;border-radius:16px;padding:16px 24px;margin:24px 0;font-size:18px;font-weight:700;">
        ⚠️ Túl vagyok terhelve — nyugodt helyre van szükségem
      </div>`
    : "";

  const needsHtml =
    needLabels.length > 0
      ? needLabels
          .map(
            (l) =>
              `<span style="display:inline-block;background:#e0f2fe;color:#0369a1;border-radius:999px;padding:6px 14px;margin:4px;font-size:14px;">${l}</span>`
          )
          .join("")
      : "<p style='color:#9ca3af;font-size:14px;'>Nincsenek megadott segítségigények.</p>";

  const html = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Védett Jelzés – ${signal.display_name}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #123a5c 0%, #1c8aa8 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 24px;
      max-width: 420px;
      width: 100%;
      padding: 32px 28px;
      box-shadow: 0 20px 60px rgba(18,58,92,0.25);
      text-align: center;
    }
    .logo { width: 72px; height: 72px; margin: 0 auto 16px; }
    .name { font-size: 28px; font-weight: 800; color: #123a5c; margin: 0; }
    .badge {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      border-radius: 999px;
      padding: 6px 16px;
      font-size: 13px;
      font-weight: 600;
      margin-top: 8px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #9ca3af;
      margin: 24px 0 10px;
    }
    .footer {
      margin-top: 28px;
      font-size: 11px;
      color: #9ca3af;
    }
    .footer a { color: #1c8aa8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <img src="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/vedett-jelzes-logo.png" alt="Védett Jelzés" class="logo" />
    <p class="name">${escapeHtml(signal.display_name)}</p>
    <span class="badge">${escapeHtml(neurodivLabel)}</span>

    ${overwhelmedBanner}

    <p class="section-title">Segítségigények</p>
    <div>${needsHtml}</div>

    <div class="footer">
      <p>Ez a jelzés a <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://vedettsarok.hu"}">VédettSarok</a> Védett Jelzés rendszeréből származik.</p>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
