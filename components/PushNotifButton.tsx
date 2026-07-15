"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "unsupported" | "loading" | "subscribed" | "unsubscribed" | "denied";

export default function PushNotifButton() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "unsubscribed");
    });
  }, []);

  async function subscribe() {
    setStatus("loading");
    try {
      console.log("[Push] VAPID key:", PUBLIC_VAPID_KEY);
      console.log("[Push] Notification permission:", Notification.permission);
      const reg = await navigator.serviceWorker.ready;
      console.log("[Push] SW ready:", reg.active?.state);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      });
      console.log("[Push] Subscribed:", sub.endpoint);

      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subJson),
      });
      console.log("[Push] API response:", res.status);

      setStatus("subscribed");
    } catch (err) {
      console.error("[Push] Subscribe error:", err);
      setStatus(Notification.permission === "denied" ? "denied" : "unsubscribed");
    }
  }

  async function unsubscribe() {
    setStatus("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch {
      setStatus("subscribed");
    }
  }

  if (status === "unsupported") return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-soft">
      <div className="flex-1">
        <p className="font-semibold text-gray-900 text-sm">Push értesítések (PWA)</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {status === "subscribed"
            ? "Értesítést kapsz minden új hely- és programbeküldésről."
            : status === "denied"
            ? "A böngésző letiltotta az értesítéseket. Engedélyezd a beállításokban."
            : "Engedélyezd, hogy értesítést kapj minden új beküldésről."}
        </p>
      </div>

      {status === "loading" && (
        <Loader2 size={20} className="animate-spin text-gray-400" />
      )}

      {status === "subscribed" && (
        <button
          onClick={unsubscribe}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <BellOff size={14} /> Kikapcsol
        </button>
      )}

      {status === "unsubscribed" && (
        <button
          onClick={subscribe}
          className="flex items-center gap-1.5 rounded-xl bg-sni-brand-teal px-3 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <Bell size={14} /> Bekapcsol
        </button>
      )}

      {status === "denied" && (
        <span className="text-xs text-gray-400 italic">Letiltva</span>
      )}
    </div>
  );
}
