import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

export async function POST(request: Request) {
  const { name, email, message, honeypot } = await request.json() as {
    name: string;
    email: string;
    message: string;
    honeypot?: string;
  };

  // Honeypot: bot töltötte ki → csendben elutasítjuk
  if (honeypot) {
    return NextResponse.json({ ok: true });
  }

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Hiányzó mezők." }, { status: 400 });
  }

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
