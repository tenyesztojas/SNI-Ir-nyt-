"use client";

import { useId } from "react";

export default function Logo({
  size = 40,
  className,
  title = "VédettSarok",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const tealGradId = `bh-teal-${uid}`;
  const needleGradId = `bh-needle-${uid}`;

  const vbW = 570;
  const vbH = 700;

  return (
    <svg
      viewBox={`450 150 ${vbW} ${vbH}`}
      width={size}
      height={Math.round((size * vbH) / vbW)}
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={tealGradId} x1="770" y1="160" x2="1030" y2="720" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#19C8C2" />
          <stop offset="1" stopColor="#11B5B0" />
        </linearGradient>
        <linearGradient id={needleGradId} x1="698" y1="495" x2="754" y2="690" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14C2BF" />
          <stop offset="0.48" stopColor="#12BDBC" />
          <stop offset="0.50" stopColor="#0C77BF" />
          <stop offset="1" stopColor="#0058AA" />
        </linearGradient>
      </defs>

      <circle cx="597" cy="217" r="45" fill="#006FBE" />
      <circle cx="851" cy="217" r="45" fill={`url(#${tealGradId})`} />

      <path
        d="M650 308 C562 295 482 354 464 453 C446 551 500 658 604 746 C644 780 683 806 724 837 C704 770 694 690 688 611 C682 515 675 410 650 308 Z"
        fill="#006FBE"
      />
      <path
        d="M798 308 C886 295 966 354 984 453 C1002 551 948 658 844 746 C804 780 765 806 724 837 C744 770 754 690 760 611 C766 515 773 410 798 308 Z"
        fill={`url(#${tealGradId})`}
      />

      <path d="M607 328 C645 327 680 346 709 382" fill="none" stroke="#006FBE" strokeWidth="26" strokeLinecap="round" />
      <path d="M841 328 C803 327 768 346 739 382" fill="none" stroke={`url(#${tealGradId})`} strokeWidth="26" strokeLinecap="round" />

      <path d="M566 423 L724 296 L882 423" fill="none" stroke="#16C3C1" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M587 446 L587 545" fill="none" stroke="#006FBE" strokeWidth="18" strokeLinecap="round" />
      <path d="M861 446 L861 545" fill="none" stroke="#006FBE" strokeWidth="18" strokeLinecap="round" />

      <rect x="699" y="405" width="22" height="22" rx="2" fill="#006FBE" />
      <rect x="727" y="405" width="22" height="22" rx="2" fill="#006FBE" />
      <rect x="699" y="433" width="22" height="22" rx="2" fill="#006FBE" />
      <rect x="727" y="433" width="22" height="22" rx="2" fill="#006FBE" />

      <path d="M724 486 L757 661 L724 706 L691 661 Z" fill={`url(#${needleGradId})`} />
      <circle cx="724" cy="626" r="22" fill="#ffffff" />
      <circle cx="724" cy="626" r="10" fill="#1B67B6" />
    </svg>
  );
}
