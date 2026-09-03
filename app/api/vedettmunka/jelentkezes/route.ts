import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_CV_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_CV_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_CV_EXT = new Set([".pdf", ".doc", ".docx"]);

/** Veszélyes karakterek eltávolítása fájlnévből */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w.\-_() ]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 200);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const jobId        = (formData.get("job_id") as string)?.trim();
    const employerId   = (formData.get("employer_id") as string)?.trim();
    const userId       = (formData.get("user_id") as string)?.trim();
    const name         = (formData.get("applicant_name") as string)?.trim();
    const email        = (formData.get("applicant_email") as string)?.trim();
    const message      = (formData.get("message") as string)?.trim() ?? "";
    const cvFile       = formData.get("cv_file") as File | null;

    if (!jobId || !name || !email) {
      return NextResponse.json({ error: "Hiányzó kötelező mezők." }, { status: 400 });
    }

    // ── Szerveres CV-fájl ellenőrzés ──────────────────────────────
    let cvFilename: string | null = null;
    const attachments: { filename: string; content: Buffer }[] = [];

    if (cvFile && cvFile.size > 0) {
      // Méret limit
      if (cvFile.size > MAX_CV_SIZE) {
        return NextResponse.json(
          { error: "A csatolt dokumentum mérete legfeljebb 5 MB lehet." },
          { status: 400 }
        );
      }

      // MIME-típus ellenőrzés
      if (!ALLOWED_CV_MIME.has(cvFile.type)) {
        return NextResponse.json(
          { error: "Csak PDF, DOC vagy DOCX formátumú dokumentumot csatolhatsz." },
          { status: 400 }
        );
      }

      // Kiterjesztés ellenőrzés
      const ext = "." + cvFile.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_CV_EXT.has(ext)) {
        return NextResponse.json(
          { error: "Csak PDF, DOC vagy DOCX formátumú dokumentumot csatolhatsz." },
          { status: 400 }
        );
      }

      const safeFilename = sanitizeFilename(cvFile.name);
      const buffer = Buffer.from(await cvFile.arrayBuffer());
      cvFilename = safeFilename;
      attachments.push({ filename: safeFilename, content: buffer });
    }

    // ── Hirdetés adatainak lekérése ──────────────────────────────
    const admin = createAdminClient();
    const { data: job } = await admin
      .from("job_posts")
      .select("title, application_email, employer_id, employers(company_name, privacy_policy_url)")
      .eq("id", jobId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "A lehetőség nem található." }, { status: 404 });
    }

    const applicationEmail = job.application_email;
    const jobTitle = job.title;
    const empData = (job.employers as { company_name: string; privacy_policy_url: string | null }[] | null)?.[0];
    const companyName = empData?.company_name ?? "";
    const employerPrivacyUrl = empData?.privacy_policy_url ?? null;

    // ── E-mail összeállítása és küldése ───────────────────────────
    const resend = getResend();

    const tipus = (formData.get("tipus") as string | null) === "erdeklodes" ? "érdeklődés" : "jelentkezés";

    const htmlBody = `
      <h2 style="color:#123A5C">Új ${tipus} – VédettKarrier</h2>
      <p><strong>Lehetőség:</strong> ${jobTitle}</p>
      <p><strong>Karrierpartner:</strong> ${companyName}</p>
      <hr>
      <p><strong>Neve:</strong> ${name}</p>
      <p><strong>E-mail:</strong> <a href="mailto:${email}">${email}</a></p>
      ${message ? `<p><strong>Üzenet:</strong></p><p style="white-space:pre-wrap">${message.replace(/</g, "&lt;")}</p>` : ""}
      <hr>
      <p style="font-size:12px;color:#888">
        Ez a ${tipus} a VédettKarrier felületen keresztül érkezett.<br>
        A felhasználó az adattovábbítási hozzájárulást megadta.<br>
        ${cvFilename ? "A felhasználó által csatolt dokumentum mellékelve." : "Nem érkezett csatolt dokumentum."}<br>
        A VédettKarrier technikai platformként továbbítja az adatokat – nem tárolja a bemutatkozó lapot tartósan, és nem munkaerő-közvetítő szolgáltatás.
      </p>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "VédettKarrier <noreply@vedettsarok.hu>",
      to: applicationEmail,
      replyTo: email,
      subject: `[VédettKarrier] Új ${tipus}: ${jobTitle} – ${name}`,
      html: htmlBody,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    // ── Napló bejegyzés (CV tartalom nélkül) ─────────────────────
    const deliveryStatus = emailError ? "failed" : "sent";

    await admin.from("job_applications_log").insert({
      job_id: jobId || null,
      employer_id: employerId || null,
      user_id: userId || null,
      applicant_name: name,
      applicant_email: email,
      cv_filename: cvFilename,
      delivery_status: deliveryStatus,
      sent_at: new Date().toISOString(),
    });

    // ── Consent napló ─────────────────────────────────────────────
    // Ha a naplózás sikertelen, a jelentkezés sem mehet ki
    const { error: consentError } = await admin.from("vm_consent_log").insert({
      user_id: userId || null,
      job_id: jobId || null,
      employer_id: employerId || null,
      consent_type: "job_application_data_forwarding",
      employer_privacy_url: employerPrivacyUrl,
      metadata: {
        job_title: jobTitle,
        company_name: companyName,
        has_cv: cvFilename !== null,
        delivery_status: deliveryStatus,
      },
    });

    if (consentError) {
      // Hiba esetén visszajelzés, de a küldési log már mentve van
      console.error("Consent log hiba (vm_consent_log):", consentError.message);
      if (emailError) {
        return NextResponse.json({ error: "Az e-mail küldése sikertelen, a hozzájárulás nem naplózható." }, { status: 500 });
      }
      // E-mail elment, de consent log sikertelen – közepes kockázat
      return NextResponse.json(
        { error: "Jelentkezés elküldve, de a hozzájárulási napló írása sikertelen. Kérjük, jelezd az oldal üzemeltetőjének." },
        { status: 500 }
      );
    }

    if (emailError) {
      return NextResponse.json({ error: "Az e-mail küldése sikertelen." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // FONTOS: ne logolj CV tartalmat, FormData-t vagy üzenettartalmat
    console.error("Jelentkezés API hiba:", (err as Error).message);
    return NextResponse.json({ error: "Szerverhiba." }, { status: 500 });
  }
}
