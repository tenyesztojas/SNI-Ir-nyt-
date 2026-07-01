import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

export async function POST(request: Request) {
  const { name, email, message, recaptchaToken } = await request.json() as {
    name: string;
    email: string;
    message: string;
    recaptchaToken: string;
  };

  if (!name?.trim() || !email?.trim() || !message?.trim() || !recaptchaToken) {
    return NextResponse.json({ error: "Hiányzó mezők." }, { status: 400 });
  }

  // reCAPTCHA v2 ellenőrzés
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "reCAPTCHA nem konfigurált." }, { status: 500 });
  }

  const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${secretKey}&response=${recaptchaToken}`,
  });
  const verifyData = await verifyRes.json() as { success: boolean };
  if (!verifyData.success) {
    return NextResponse.json({ error: "reCAPTCHA ellenőrzés sikertelen." }, { status: 400 });
  }

  // Email küldés
  const resend = getResend();
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  await resend.emails.send({
    from: `VédettSarok Kapcsolat <${fromEmail}>`,
    to: "holvay.csaba@gmail.com",
    replyTo: email,
    subject: `Kapcsolatfelvétel – ${name}`,
    html: `
      <p><strong>Feladó:</strong> ${name} &lt;${email}&gt;</p>
      <p><strong>Üzenet:</strong></p>
      <p style="white-space:pre-wrap">${message.replace(/</g, "&lt;")}</p>
    `,
  });

  return NextResponse.json({ ok: true });
}
