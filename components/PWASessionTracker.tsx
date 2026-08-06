"use client";

import { useEffect } from "react";

export default function PWASessionTracker() {
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;

    if (!isStandalone) return;

    // Naponta egyszer naplózzuk
    const today = new Date().toISOString().slice(0, 10);
    const lastTracked = localStorage.getItem("pwa-session-tracked");
    if (lastTracked === today) return;

    const platform = /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios"
      : /Android/.test(navigator.userAgent) ? "android"
      : "other";

    fetch("/api/pwa-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "session", platform }),
    }).then(() => {
      localStorage.setItem("pwa-session-tracked", today);
    }).catch(() => {});
  }, []);

  return null;
}
