// Böngészős push-feliratkozás közös, tesztelhető folyamata (admin gomb és
// családi kártya). Függőségmentes: a böngésző- és hálózati műveleteket a
// hívó adja át. Siker KIZÁRÓLAG a szerver kifejezett { ok: true } válasza.
// Más user DB-sorát a kliens soha nem törli/veszi át: 409 (más fiók nevén
// lévő végpont) esetén a böngészőben bontja a régi feliratkozást, és EGYSZER
// újat kér — az új végpont már nem ütközik.

export interface PushSubLike {
  endpoint: string;
  toJSON(): unknown;
  unsubscribe(): Promise<boolean>;
}

export interface PushFlowDeps {
  getSubscription(): Promise<PushSubLike | null>;
  subscribe(): Promise<PushSubLike>;
  post(url: string, method: "POST" | "DELETE", body: unknown): Promise<{ ok: boolean; status?: number; json: unknown }>;
}

const ok = (r: { ok: boolean; json: unknown }) =>
  r.ok && !!r.json && typeof r.json === "object" && (r.json as { ok?: unknown }).ok === true;
const isConflict = (r: { status?: number; json: unknown }) =>
  r.status === 409 || (!!r.json && typeof r.json === "object" && (r.json as { error?: unknown }).error === "Endpoint in use");

export type PushSyncState = "on" | "off" | "error";

// Meglévő böngészős feliratkozás ellenőrzése a jelenlegi fiókra.
export async function syncPushSubscription(deps: PushFlowDeps): Promise<PushSyncState> {
  const sub = await deps.getSubscription();
  if (!sub) return "off";
  const r = await deps.post("/api/push/sync", "POST", { endpoint: sub.endpoint });
  if (!ok(r)) return "error";
  const j = r.json as { linked?: unknown; stale?: unknown };
  if (j.stale === true) {
    await sub.unsubscribe().catch(() => false);
    return "off";
  }
  return j.linked === true ? "on" : "off";
}

export async function subscribeAndSave(deps: PushFlowDeps): Promise<boolean> {
  let sub = (await deps.getSubscription()) ?? (await deps.subscribe());
  let r = await deps.post("/api/push/subscribe", "POST", sub.toJSON());
  if (!ok(r) && isConflict(r)) {
    const removed = await sub.unsubscribe().catch(() => false);
    if (!removed) return false;
    sub = await deps.subscribe();
    r = await deps.post("/api/push/subscribe", "POST", sub.toJSON());
  }
  return ok(r);
}

// Leiratkozás: először a szerver (saját sor), csak siker után a böngésző.
export async function unsubscribeAndDelete(deps: PushFlowDeps): Promise<boolean> {
  const sub = await deps.getSubscription();
  if (!sub) return true;
  const r = await deps.post("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint });
  if (!ok(r)) return false;
  await sub.unsubscribe().catch(() => false);
  return true;
}

export async function postPushJson(url: string, method: "POST" | "DELETE", body: unknown) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}
