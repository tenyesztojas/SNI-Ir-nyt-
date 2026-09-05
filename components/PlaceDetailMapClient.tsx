"use client";

import dynamic from "next/dynamic";

const PlaceDetailMap = dynamic(
  () => import("@/components/PlaceDetailMapInner"),
  {
    ssr: false,
    loading: () => (
      <div className="mt-6 flex h-56 items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-400 sm:h-64">
        Térkép betöltése...
      </div>
    ),
  }
);

export default PlaceDetailMap;