"use client";

import { useId } from "react";

/**
 * SNI Iránytű márkajelzés — pajzs (biztonság) + iránytű (irányadás) +
 * családi figura + támogató kéz (gondoskodás).
 *
 * Vektoros (SVG) ikon, hogy minden méretben éles maradjon (header, favicon,
 * app ikon), és könnyen átszínezhető legyen sötét/világos háttéren is.
 */
export default function Logo({
  size = 40,
  className,
  title = "SNI Iránytű",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const gradId = `sni-logo-grad-${uid}`;

  return (
    <svg
      viewBox="0 0 200 220"
      width={size}
      height={(size * 220) / 200}
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradId} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#34D8C3" />
          <stop offset="55%" stopColor="#1C8AA8" />
          <stop offset="100%" stopColor="#123A5C" />
        </linearGradient>
      </defs>

      {/* pajzs külső kontúr */}
      <path
        d="M100,6 C140,6 170,18 186,36 L186,108 C186,156 154,192 100,212 C46,192 14,156 14,108 L14,36 C30,18 60,6 100,6 Z"
        fill={`url(#${gradId})`}
      />
      {/* pajzs belső (fehér) terület */}
      <path
        d="M100,21.6 C134,21.6 159.5,31.8 173.1,47.1 L173.1,108.3 C173.1,149.1 145.9,179.7 100,196.7 C54.1,179.7 26.9,149.1 26.9,108.3 L26.9,47.1 C40.5,31.8 66,21.6 100,21.6 Z"
        fill="#FFFFFF"
      />

      {/* iránytű gyűrű */}
      <circle
        cx="100"
        cy="92"
        r="40"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2.5"
        strokeDasharray="6 5"
        opacity="0.85"
      />
      <path d="M48,92 L62,86 L62,98 Z" fill={`url(#${gradId})`} />
      <path d="M152,92 L138,86 L138,98 Z" fill={`url(#${gradId})`} />

      {/* tűhegy (kétszínű) */}
      <path d="M100,26 L109,88 L100,98 L91,88 Z" fill="#34D8C3" />
      <path d="M91,88 L109,88 L100,118 Z" fill="#123A5C" />
      <circle cx="100" cy="90" r="6" fill="#FFFFFF" stroke="#123A5C" strokeWidth="2.5" />

      {/* támogató kéz */}
      <path
        d="M38,192 C38,176 58,166 100,166 C142,166 162,176 162,192 C162,200 150,202 141,197 C131,204 116,199 100,201 C84,199 69,204 59,197 C50,202 38,200 38,192 Z"
        fill="#123A5C"
      />

      {/* bal felnőtt figura */}
      <circle cx="66" cy="130" r="15" fill="#34D8C3" />
      <path d="M46,180 L46,150 A20,20 0 0 1 86,150 L86,180 Z" fill="#34D8C3" />

      {/* jobb felnőtt figura */}
      <circle cx="134" cy="130" r="15" fill="#1C8AA8" />
      <path d="M114,180 L114,150 A20,20 0 0 1 154,150 L154,180 Z" fill="#1C8AA8" />

      {/* gyermek figura */}
      <circle cx="100" cy="150" r="11" fill="#123A5C" />
      <path d="M84,194 L84,178 A16,16 0 0 1 116,178 L116,194 Z" fill="#123A5C" />
    </svg>
  );
}
