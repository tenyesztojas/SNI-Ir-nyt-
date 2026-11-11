"use client";

import { useState } from "react";
import { submitProgramAction } from "./actions";

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

    // Szerveroldali beküldés: validálás, sebességkorlát, beszúrás, majd a
    // szerver küldi az admin pusht (lásd ./actions.ts).
    let result: Awaited<ReturnType<typeof submitProgramAction>>;
    try {
      result = await submitProgramAction({ name, location, eventDate, description, url, contact });
    } catch {
      result = { ok: false, error: "Hiba történt a beküldés során. Próbáld újra." };
    }

    if (!result.ok) {
      setError(result.error);
      setStatus("error");
      return;
    }

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
        <label className="block text-sm font-medium text-gray-700 mb-1">Program dátuma *</label>
        <input
          type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)}
          className="input-field"
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
