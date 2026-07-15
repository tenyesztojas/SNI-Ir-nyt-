"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ProgramForm() {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    const supabase = createClient();
    const { error: dbError } = await supabase.from("programs").insert({
      name,
      location,
      event_date: eventDate,
      description,
      url: url || null,
      contact: contact || null,
    });

    if (dbError) {
      setError("Hiba történt a beküldés során. Próbáld újra.");
      setStatus("error");
      return;
    }

    // Admin push értesítés
    fetch("/api/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "📅 Új programajánlás",
        body: `${name} - ${location}`,
        url: "/admin/programok",
      }),
    }).catch(() => {});

    setStatus("success");
    setName(""); setLocation(""); setEventDate("");
    setDescription(""); setUrl(""); setContact("");
  }

  if (status === "success") {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-5 text-sm text-green-800">
        <strong>Köszönjük a beküldést!</strong> A programot az admin jóváhagyása után tesszük közzé.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Program neve *</label>
        <input
          type="text" required value={name} onChange={(e) => setName(e.target.value)}
          className="input-field" placeholder="pl. Szenzoros játszóház"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Helyszín *</label>
        <input
          type="text" required value={location} onChange={(e) => setLocation(e.target.value)}
          className="input-field" placeholder="pl. Budapest, XII. ker."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Dátum, időpont *</label>
        <input
          type="text" required value={eventDate} onChange={(e) => setEventDate(e.target.value)}
          className="input-field" placeholder="pl. 2025. augusztus 10., 10:00–13:00"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Rövid leírás *</label>
        <textarea
          required rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
          className="input-field resize-none" placeholder="Miről szól a program? Kinek ajánlod?"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Webcím</label>
        <input
          type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          className="input-field" placeholder="https://pelda.hu/program"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Kontakt (e-mail vagy telefon)</label>
        <input
          type="text" value={contact} onChange={(e) => setContact(e.target.value)}
          className="input-field" placeholder="pl. info@pelda.hu"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={status === "loading"} className="btn-primary w-full disabled:opacity-60">
        {status === "loading" ? "Beküldés…" : "Program beküldése"}
      </button>
    </form>
  );
}
