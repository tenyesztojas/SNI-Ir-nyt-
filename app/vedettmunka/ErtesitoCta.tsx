"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, BellOff, Settings } from "lucide-react";
import { quickToggleAlert } from "@/app/vedettmunka/actions";

interface Props {
  /** null = not logged in, true = subscribed, false = not subscribed / alert disabled */
  initialEnabled: boolean | null;
}

export default function ErtesitoCta({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(value: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await quickToggleAlert(value);
        setEnabled(value);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  // ── Guest ──────────────────────────────────────────────────────
  if (initialEnabled === null) {
    return (
      <section className="mt-12 rounded-2xl border border-sni-brand-teal/20 bg-white p-6">
        <div className="flex items-start gap-4">
          <Bell className="mt-0.5 shrink-0 text-sni-brand-teal" size={26} />
          <div>
            <h2 className="text-lg font-extrabold text-sni-brand-navy">Lehetőségfigyelő</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Bejelentkezés után bekapcsolhatod a lehetőségfigyelőt – e-mailben jelzünk, ha új,
              általad keresett lehetőség jelenik meg.
            </p>
            <Link
              href="/belepes"
              className="mt-4 inline-block rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
            >
              Bejelentkezés
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ── Logged in ──────────────────────────────────────────────────
  return (
    <section className="mt-12 rounded-2xl border border-sni-brand-teal/20 bg-white p-6">
      <div className="flex items-start gap-4">
        {enabled ? (
          <Bell className="mt-0.5 shrink-0 text-sni-brand-teal" size={26} />
        ) : (
          <BellOff className="mt-0.5 shrink-0 text-gray-400" size={26} />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-extrabold text-sni-brand-navy">Lehetőségfigyelő</h2>
            {enabled && (
              <span className="rounded-full bg-sni-brand-teal/15 px-2.5 py-0.5 text-xs font-semibold text-sni-brand-teal">
                Bekapcsolva
              </span>
            )}
          </div>

          {enabled ? (
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              E-mailben értesítünk, ha új lehetőség jelenik meg.
              Bármikor leiratkozhatsz, vagy pontosíthatod a szűrőket a beállításokban.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Kapcsold be, és e-mailben szólunk, ha új, általad keresett lehetőség jelenik meg.
              Bármikor leiratkozhatsz.
            </p>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {enabled ? (
              <>
                <Link
                  href="/vedettmunka/ertesito"
                  className="flex items-center gap-1.5 rounded-full border border-sni-brand-teal px-5 py-2 text-sm font-semibold text-sni-brand-teal transition hover:bg-sni-brand-teal hover:text-white"
                >
                  <Settings size={14} /> Beállítások
                </Link>
                <button
                  type="button"
                  onClick={() => toggle(false)}
                  disabled={isPending}
                  className="rounded-full border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  {isPending ? "..." : "Leiratkozás"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toggle(true)}
                  disabled={isPending}
                  className="rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white disabled:opacity-50"
                >
                  {isPending ? "..." : "Lehetőségfigyelő bekapcsolása"}
                </button>
                {initialEnabled === false && (
                  <Link
                    href="/vedettmunka/ertesito"
                    className="text-sm text-sni-brand-teal hover:underline"
                  >
                    Szűrők beállítása
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
