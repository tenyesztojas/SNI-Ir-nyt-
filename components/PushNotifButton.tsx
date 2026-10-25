"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { postPushJson, subscribeAndSave, syncPushSubscription, unsubscribeAndDelete, type PushFlowDeps } from "@/lib/pushClientFlow";

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "unsupported" | "loading" | "subscribed" | "unsubscribed" | "denied";

// Siker csak a szerver igazolt válasza után (lásd lib/pushClientFlow.ts).
function flowDeps(reg: ServiceWorkerRegistration): PushFlowDeps {
  return {
    getSubscription: () => reg.pushManager.getSubscription(),
    subscribe: () =>
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      }),
    post: postPushJson,
  };
}

export default function PushNotifButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const state = await syncPushSubscription(flowDeps(reg));
        if (state === "error") setError("Az értesítési állapotot nem sikerült ellenőrizni.");
        setStatus(state === "on" ? "subscribed" : "unsubscribed");
      })
      .catch(() => setStatus("unsubscribed"));
  }, []);

  async function subscribe() {
    setStatus("loading");
    setError(null);
    try {
      if (!PUBLIC_VAPID_KEY) throw new Error("vapid");
      const reg = await navigator.serviceWorker.ready;
      if (await subscribeAndSave(flowDeps(reg))) {
        setStatus("subscribed");
      } else {
        setError("A feliratkozást nem sikerült menteni. Próbáld újra később.");
        setStatus("unsubscribed");
      }
    } catch {
      if (Notification.permission === "denied") {
        setStatus("denied");
      } else {
        setError("A feliratkozást nem sikerült menteni. Próbáld újra később.");
        setStatus("unsubscribed");
      }
    }
  }

  async function unsubscribe() {
    setStatus("loading");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (await unsubscribeAndDelete(flowDeps(reg))) {
        setStatus("unsubscribed");
      } else {
        setError("A leiratkozást nem sikerült menteni. Próbáld újra később.");
        setStatus("subscribed");
      }
    } catch {
      setError("A leiratkozást nem sikerült menteni. Próbáld újra később.");
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
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {error}
          </p>
        )}
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
