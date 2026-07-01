"use client";

import { useRef, useState } from "react";

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (key: string, opts: { action: string }) => Promise<string>;
      getResponse: () => string;
      reset: () => void;
    };
  }
}

export default function KapcsolatForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const captchaRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    const recaptchaToken = window.grecaptcha?.getResponse();
    if (!recaptchaToken) {
      setError("Kérjük, töltsd ki a reCAPTCHA ellenőrzést.");
      setStatus("idle");
      return;
    }

    try {
      const res = await fetch("/api/kapcsolat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, recaptchaToken }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Hiba történt.");
      setStatus("success");
      setName(""); setEmail(""); setMessage("");
      window.grecaptcha?.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ismeretlen hiba.");
      setStatus("error");
      window.grecaptcha?.reset();
    }
  }

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

  return (
    <>
      <script
        src={`https://www.google.com/recaptcha/api.js`}
        async
        defer
      />
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Neved</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-sni-brand-blue focus:outline-none focus:ring-1 focus:ring-sni-brand-blue"
            placeholder="pl. Kovács Anna"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail cím</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-sni-brand-blue focus:outline-none focus:ring-1 focus:ring-sni-brand-blue"
            placeholder="email@pelda.hu"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Üzeneted</label>
          <textarea
            required
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-sni-brand-blue focus:outline-none focus:ring-1 focus:ring-sni-brand-blue resize-none"
            placeholder="Miben segíthetünk?"
          />
        </div>

        <div
          className="g-recaptcha"
          data-sitekey={siteKey}
          ref={captchaRef}
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {status === "success" ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
            Üzeneted megérkezett, hamarosan válaszolunk!
          </div>
        ) : (
          <button
            type="submit"
            disabled={status === "loading"}
            className="btn-primary w-full disabled:opacity-60"
          >
            {status === "loading" ? "Küldés…" : "Üzenet küldése"}
          </button>
        )}
      </form>
    </>
  );
}
