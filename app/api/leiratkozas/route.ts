import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const html = (title: string, msg: string) => `<!DOCTYPE html>
<html lang="hu"><head><meta charset="UTF-8"><title>${title} – VédettSarok</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;padding:0 16px;color:#1f2937">
  <h1 style="font-size:1.5rem">${title}</h1>
  <p style="color:#6b7280">${msg}</p>
  <a href="https://vedettsarok.vercel.app" style="color:#0a4a6e;font-weight:600">Vissza a főoldalra</a>
</body></html>`;

  if (!token) {
    return new Response(html("Érvénytelen link", "A leiratkozási link nem érvényes."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({ newsletter_subscribed: false })
    .eq("id", token);

  if (error) {
    return new Response(html("Hiba", "Hiba történt, kérjük próbáld újra."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(
    html(
      "Sikeresen leiratkoztál",
      "Többé nem küldünk hírlevelet. Ha meggondolnád magad, visszairatkozhatsz a profilodban."
    ),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
