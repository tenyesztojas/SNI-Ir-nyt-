import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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

    // Lekérjük az állás adatait (application_email)
    const admin = createAdminClient();
    const { data: job } = await admin
      .from("job_posts")
      .select("title, application_email, employers(company_name)")
      .eq("id", jobId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Az állás nem található." }, { status: 404 });
    }

    const applicationEmail = job.application_email;
    const jobTitle = job.title;
    const companyName = (job.employers as { company_name: string }[] | null)?.[0]?.company_name ?? "";

    // E-mail összeállítása
    const resend = getResend();

    const attachments: { filename: string; content: Buffer }[] = [];
    let cvFilename: string | null = null;

    if (cvFile && cvFile.size > 0) {
      const buffer = Buffer.from(await cvFile.arrayBuffer());
      cvFilename = cvFile.name;
      attachments.push({ filename: cvFile.name, content: buffer });
    }

    const htmlBody = `
      <h2 style="color:#123A5C">Új jelentkezés – Védett Munka</h2>
      <p><strong>Pozíció:</strong> ${jobTitle}</p>
      <p><strong>Munkáltató:</strong> ${companyName}</p>
      <hr>
      <p><strong>Jelölt neve:</strong> ${name}</p>
      <p><strong>E-mail:</strong> <a href="mailto:${email}">${email}</a></p>
      ${message ? `<p><strong>Üzenet:</strong></p><p style="white-space:pre-wrap">${message.replace(/</g, "&lt;")}</p>` : ""}
      <hr>
      <p style="font-size:12px;color:#888">
        Ez a jelentkezés a Védett Munka felületen keresztül érkezett.<br>
        A jelölt elfogadta, hogy adatait és önéletrajzát továbbítjuk Önnek.<br>
        A Védett Munka nem tárolja tartósan a jelölt önéletrajzát.
      </p>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "Védett Munka <noreply@vedettsarok.hu>",
      to: applicationEmail,
      replyTo: email,
      subject: `[Védett Munka] Új jelentkezés: ${jobTitle} – ${name}`,
      html: htmlBody,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    // Napló bejegyzés (CV tartalom nélkül)
    await admin.from("job_applications_log").insert({
      job_id: jobId || null,
      employer_id: employerId || null,
      user_id: userId || null,
      applicant_name: name,
      applicant_email: email,
      cv_filename: cvFilename,
      delivery_status: emailError ? "failed" : "sent",
      sent_at: new Date().toISOString(),
    });

    if (emailError) {
      console.error("Resend hiba:", emailError);
      return NextResponse.json({ error: "Az e-mail küldése sikertelen." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Jelentkezés API hiba:", err);
    return NextResponse.json({ error: "Szerverhiba." }, { status: 500 });
  }
}
