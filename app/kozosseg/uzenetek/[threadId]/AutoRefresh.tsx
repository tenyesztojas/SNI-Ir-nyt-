"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Mountkor egyszer meghívja a router.refresh()-t, hogy a Header badge frissüljön. */
export default function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, []);
  return null;
}
