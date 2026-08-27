"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { toggleOverwhelmedMode } from "@/app/vedett-jelzes/actions";
import { AlertTriangle, QrCode, ArrowLeft, CheckCircle } from "lucide-react";

interface Props {
  displayName: string;
  neurodivergenceLabel: string;
  needLabels: string[];
  overwhelmedMode: boolean;
  qrUrl: string;
  signalId: string;
}

export default function DigitalisKartya({
  displayName,
  neurodivergenceLabel,
  needLabels,
  overwhelmedMode: initialOverwhelmed,
  qrUrl,
}: Props) {
  const [overwhelmed, setOverwhelmed] = useState(initialOverwhelmed);
  const [isPending, startTransition] = useTransition();
  const [showQr, setShowQr] = useState(false);

  function handleToggleOverwhelmed() {
    startTransition(async () => {
      await toggleOverwhelmedMode(overwhelmed);
      setOverwhelmed((v) => !v);
    });
  }

  return (
    <div
      className={`fixed inset-0 flex flex-col transition-colors duration-500 ${
        overwhelmed
          ? "bg-red-600"
          : "bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue"
      }`}
    >
      {/* Vissza gomb */}
      <div className="flex items-center justify-between px-5 pt-5">
        <a
          href="/vedett-jelzes/sajat-jelzes"
          className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/30"
        >
          <ArrowLeft size={15} /> Vissza
        </a>
        <button
          onClick={() => setShowQr((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/30"
          title="QR kód megjelenítése"
        >
          <QrCode size={15} /> QR kód
        </button>
      </div>

      {/* Fő tartalom */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {/* Logó */}
        <Image
          src="/vedett-jelzes-logo.png"
          alt="Védett Jelzés"
          width={72}
          height={72}
          className="opacity-90"
        />

        {/* Név */}
        <div>
          <p className="text-4xl font-extrabold text-white drop-shadow">{displayName}</p>
          <p className="mt-2 rounded-full bg-white/25 px-4 py-1.5 text-sm font-semibold text-white">
            {neurodivergenceLabel}
          </p>
        </div>

        {/* Túlterhelődtem mód üzenet */}
        {overwhelmed && (
          <div className="flex items-center gap-2 rounded-2xl bg-white/20 px-5 py-3 text-white">
            <AlertTriangle size={20} className="shrink-0" />
            <span className="font-bold">Túl vagyok terhelve — nyugodt helyre van szükségem</span>
          </div>
        )}

        {/* Segítségigények (nem overwhelmed módban) */}
        {!overwhelmed && needLabels.length > 0 && (
          <div className="flex max-w-sm flex-wrap justify-center gap-2">
            {needLabels.map((label) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm text-white"
              >
                <CheckCircle size={13} className="shrink-0" />
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Segítségigények (overwhelmed módban — piros háttéren más szín) */}
        {overwhelmed && needLabels.length > 0 && (
          <div className="flex max-w-sm flex-wrap justify-center gap-2">
            {needLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-white/20 px-3 py-1 text-sm text-white/90"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Túlterhelődtem toggle */}
      <div className="flex justify-center pb-8">
        <button
          onClick={handleToggleOverwhelmed}
          disabled={isPending}
          className={`flex items-center gap-2 rounded-full px-6 py-3 font-bold text-sm transition disabled:opacity-60 ${
            overwhelmed
              ? "bg-white text-red-600 hover:bg-gray-100"
              : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          <AlertTriangle size={16} />
          {overwhelmed ? "Megnyugodtam" : "Túlterhelődtem"}
        </button>
      </div>

      {/* QR kód panel */}
      {showQr && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowQr(false)}
        >
          <div
            className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
              alt="QR kód"
              width={200}
              height={200}
              className="rounded-xl"
            />
            <p className="max-w-[200px] text-center text-xs text-gray-400 break-all">{qrUrl}</p>
            <button
              onClick={() => setShowQr(false)}
              className="rounded-full bg-gray-100 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
            >
              Bezárás
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
