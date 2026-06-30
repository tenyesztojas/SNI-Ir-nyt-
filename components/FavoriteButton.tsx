"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavorite } from "@/lib/actions/favorites";

export default function FavoriteButton({
  placeId,
  placeName,
  initialActive,
}: {
  placeId: string;
  placeName: string;
  initialActive: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await toggleFavorite(placeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setActive(Boolean(result.active));
    });
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={active}
        className={`btn-secondary ${active ? "bg-sni-green" : ""}`}
        title={`${placeName} kedvencekhez adása`}
      >
        <Heart size={18} fill={active ? "currentColor" : "none"} />
        {active ? "Kedvenc" : "Kedvencekhez adom"}
      </button>
      {error && <p className="mt-1.5 text-sm text-sni-warn">{error}</p>}
    </div>
  );
}
