"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMediaAppearance } from "./actions";

export default function MediaAdminForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const router = useRouter();

  const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await addMediaAppearance(fd);
        (e.target as HTMLFormElement).reset();
        setUrl("");
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-semibold text-sni-text">
          Cím <span className="text-red-500">*</span>
        </label>
        <input
          name="title"
          type="text"
          required
          placeholder="Pl. VédettSarok a Reggeli Híradóban"
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-sni-text">
          URL <span className="text-red-500">*</span>
        </label>
        <input
          name="url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=... vagy https://cikk.hu/..."
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20"
        />
        {url && (
          <p className={`mt-1 text-xs font-medium ${isYoutube ? "text-red-600" : "text-blue-600"}`}>
            {isYoutube ? "▶ YouTube — beágyazva jelenik meg" : "🔗 Cikk — külső oldalra nyílik"}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-sni-text">
          Megjelenés dátuma (opcionális)
        </label>
        <input
          name="published_at"
          type="date"
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sni-brand-blue disabled:opacity-60"
      >
        {isPending ? "Mentés..." : "Hozzáadás"}
      </button>
    </form>
  );
}
