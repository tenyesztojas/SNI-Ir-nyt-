"use client";

// „Gyermekem utazási értesítései” — szülői/gondviselői push-feliratkozás.
// A meglévő Web Push infrastruktúrát (sw.js, /api/push/subscribe) használja;
// az admin PushNotifButton változatlan. „Bekapcsolva” CSAK a szerver
// kifejezett { ok: true } (mentés) / { linked: true } (ellenőrzés) válasza után.

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import {
  TRAVEL_PUSH_CARD_TEXT as T,
  isPushApiSuccess,
  isPushLinked,
  isPushStale,
  urlBase64ToUint8Array,
  type TravelPushUiStatus,
} from "@/lib/family/travelPushUi";
import { postPushJson, subscribeAndSave } from "@/lib/pushClientFlow";

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const SW_TIMEOUT_MS = 5000;

function supported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

async function postJson(url: string, method: "POST" | "DELETE", body: unknown): Promise<{ ok: boolean; json: unknown }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return { ok: res.ok, json: await res.json().catch(() => null) };
  } catch {
    return { ok: false, json: null };
  }
}

export default function TravelPushCard() {
  const [status, setStatus] = useState<TravelPushUiStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // A natív (Capacitor) app WebView-ja a service workert szándékosan törli.
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("VedettUtvonalNative")) return setStatus("native");
    if (!supported()) return setStatus("unsupported");
    if (!PUBLIC_VAPID_KEY) return setStatus("no_vapid");
    if (Notification.permission === "denied") return setStatus("denied");
    const reg = await getRegistration();
    if (!reg) return setStatus("sw_error");
    let sub: PushSubscription | null = null;
    try {
      sub = await reg.pushManager.getSubscription();
    } catch {
      return setStatus("sw_error");
    }
    if (!sub) return setStatus("off");
    // A böngészős feliratkozás a jelenlegi fiókhoz tartozik? Ha MÁS fiók nevén
    // van (fiókváltás), a végpontot itt, a böngészőben érvénytelenítjük — a
    // szerver nem töröl idegen sort a beküldött végpont alapján.
    const r = await postJson("/api/push/sync", "POST", { endpoint: sub.endpoint });
    if (isPushStale(r.ok, r.json)) {
      await sub.unsubscribe().catch(() => false);
      return setStatus("off");
    }
    setStatus(isPushLinked(r.ok, r.json) ? "on" : "off");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function turnOn() {
    setError(null);
    setStatus("busy");
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
      const reg = await getRegistration();
      if (!reg) return setStatus("sw_error");
      const saved = await subscribeAndSave({
        getSubscription: () => reg.pushManager.getSubscription(),
        subscribe: () =>
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
          }),
        post: postPushJson,
      });
      if (!saved) {
        setError(T.saveError);
        return setStatus("off");
      }
      setStatus("on");
    } catch {
      setError(T.saveError);
      setStatus(Notification.permission === "denied" ? "denied" : "off");
    }
  }

  async function turnOff() {
    setError(null);
    setStatus("busy");
    try {
      const reg = await getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const r = await postJson("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint });
        if (!isPushApiSuccess(r.ok, r.json)) {
          setError(T.saveError);
          return setStatus("on");
        }
        await sub.unsubscribe().catch(() => undefined);
      }
      setStatus("off");
    } catch {
      setError(T.saveError);
      await refresh();
    }
  }

  const canToggle = status === "on" || status === "off";

  return (
    <section aria-labelledby="travel-push-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <div className="flex items-start gap-3">
        {status === "on" ? (
          <Bell className="mt-0.5 shrink-0 text-sni-brand-blue" size={22} aria-hidden />
        ) : (
          <BellOff className="mt-0.5 shrink-0 text-gray-400" size={22} aria-hidden />
        )}
        <div className="flex-1">
          <h2 id="travel-push-title" className="font-semibold text-gray-900">
            {T.title}
          </h2>
          <p className="mt-1 text-sm text-gray-600">{T.intro}</p>
          <p className="mt-2 text-xs text-gray-500">{T.disclaimer}</p>
          <p className="mt-1 text-xs text-gray-500">{T.deviceNote}</p>
          <p className="mt-3 text-sm font-medium text-gray-800" role="status" aria-live="polite">
            {status === "busy" || status === "checking" ? (
              <Loader2 className="mr-1 inline animate-spin" size={14} aria-hidden />
            ) : null}
            {T.status[status]}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {canToggle && (
            <button
              type="button"
              onClick={status === "on" ? turnOff : turnOn}
              className="mt-3 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              {status === "on" ? T.turnOff : T.turnOn}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
