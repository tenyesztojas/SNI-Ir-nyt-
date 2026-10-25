// Védett Család — gyermekutazási push-értesítés magja (függőségmentes, tesztelhető).
//
// Biztonsági modell:
//   - A címzetteket NEM a kliens és nem ez a modul dönti el: a
//     claim_child_travel_notification() SQL-függvény (service_role only)
//     számolja ki a child_travel_statuses SELECT policy-jével azonos
//     feltétellel (aktív owner / aktív, megtekintési joggal bíró guardian).
//   - Dupla értesítés ellen a DB véd: (travel_status_id, event) UNIQUE +
//     INSERT … ON CONFLICT DO NOTHING. Párhuzamos/ismételt gombnyomásnál
//     pontosan egy hívó kap címzettlistát, a többi null-t.
//   - A payload nem tartalmaz nevet, gyermek- vagy napirend-azonosítót,
//     programcímet, helyet.
//   - Ez a függvény SOHA nem dob: az utazási állapot rögzítését nem
//     akadályozhatja. A kimenetel a child_travel_notifications sorban
//     ellenőrizhető (delivery_status, sent/failed/removed, last_error).

export type TravelNotifyEvent = "departed" | "arrived" | "help_requested";
type Action = "depart" | "arrive" | "help";

export interface TravelRpcRowLike {
  id?: unknown;
  status?: unknown;
  departed_at?: unknown;
  arrived_at?: unknown;
  help_requested_at?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A sikeres RPC-válaszból: melyik eseményről lehet értesítés. Csak jelöltet
// ad — azt, hogy ténylegesen menjen-e (megtörtént-e, friss-e, első-e), a DB
// claim dönti el atomikusan.
export function travelNotifyEventFor(action: Action, row: TravelRpcRowLike | null | undefined): TravelNotifyEvent | null {
  if (!row || typeof row.id !== "string" || !UUID_RE.test(row.id)) return null;
  if (action === "depart") return typeof row.departed_at === "string" ? "departed" : null;
  if (action === "arrive") return row.status === "arrived" && typeof row.arrived_at === "string" ? "arrived" : null;
  if (action === "help") return typeof row.help_requested_at === "string" ? "help_requested" : null;
  return null;
}

// Szándékosan általános szöveg: nincs név, program, hely; nincs kézbesítési
// vagy beavatkozási ígéret; a segítségkérés nem segélyhívás.
export const TRAVEL_PUSH_TEXT: Record<TravelNotifyEvent, { title: string; body: string }> = {
  departed: { title: "Védett Család", body: "Utazási jelzés: a gyermeked jelezte, hogy elindult." },
  arrived: { title: "Védett Család", body: "Utazási jelzés: a gyermeked jelezte, hogy megérkezett." },
  help_requested: {
    title: "Védett Család – segítségkérés",
    body: "A gyermeked segítséget kért az alkalmazásban. Nézd meg minél előbb. Ez nem segélyhívás: vészhelyzetben hívd a 112-t.",
  },
};

export const TRAVEL_PUSH_URL = "/csalad";

export interface TravelPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction: boolean;
}

export function buildTravelPushPayload(event: TravelNotifyEvent, notificationId: string): TravelPushPayload {
  const t = TRAVEL_PUSH_TEXT[event];
  return {
    title: t.title,
    body: t.body,
    url: TRAVEL_PUSH_URL,
    // Átlátszatlan, egyedi tag: két gyermek jelzése nem írja felül egymást.
    tag: `family-travel-${notificationId}`,
    requireInteraction: event === "help_requested",
  };
}

export function travelPushOptions(event: TravelNotifyEvent): { TTL: number; urgency: "high" | "normal"; timeout: number } {
  return event === "help_requested"
    ? { TTL: 60 * 60, urgency: "high", timeout: 5000 }
    : { TTL: 15 * 60, urgency: "normal", timeout: 5000 };
}

export type TravelDeliveryStatus =
  | "sent"
  | "partial"
  | "failed"
  | "no_recipients"
  | "no_subscriptions"
  | "skipped_config"
  | "error";

export interface TravelNotifyResult {
  delivery_status: TravelDeliveryStatus;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  removed_count: number;
  last_error: string | null;
}

export interface PushSubscriptionRow {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_id: string;
}

export interface TravelNotifyDeps {
  // null: nincs mit küldeni (már értesítettünk / nem történt meg / elavult).
  claim(travelStatusId: string, event: TravelNotifyEvent): Promise<{ notificationId: string; recipients: string[] } | null>;
  vapidReady(): boolean;
  loadSubscriptions(userIds: string[]): Promise<PushSubscriptionRow[]>;
  send(sub: PushSubscriptionRow, payload: string, opts: ReturnType<typeof travelPushOptions>): Promise<void>;
  removeSubscription(sub: PushSubscriptionRow): Promise<void>;
  recordResult(notificationId: string, result: TravelNotifyResult): Promise<void>;
  logError(message: string, detail?: Record<string, unknown>): void;
}

export type TravelNotifyOutcome =
  | { notified: false; reason: "not_claimed" | "claim_error" }
  | { notified: true; notificationId: string; result: TravelNotifyResult };

function errCode(err: unknown): string {
  const s = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof s === "number" ? `push_status_${s}` : "push_error";
}

export async function notifyTravelEvent(
  deps: TravelNotifyDeps,
  travelStatusId: string,
  event: TravelNotifyEvent
): Promise<TravelNotifyOutcome> {
  let claimed: { notificationId: string; recipients: string[] } | null;
  try {
    claimed = await deps.claim(travelStatusId, event);
  } catch (err) {
    safeLog(deps, "[family-travel-push] claim failed", { event, code: (err as { code?: unknown })?.code ?? null });
    return { notified: false, reason: "claim_error" };
  }
  if (!claimed) return { notified: false, reason: "not_claimed" };

  const { notificationId } = claimed;
  const recipients = Array.from(new Set(claimed.recipients));
  const result: TravelNotifyResult = {
    delivery_status: "error",
    recipient_count: recipients.length,
    sent_count: 0,
    failed_count: 0,
    removed_count: 0,
    last_error: null,
  };

  try {
    if (recipients.length === 0) {
      result.delivery_status = "no_recipients";
    } else if (!deps.vapidReady()) {
      result.delivery_status = "skipped_config";
      result.last_error = "vapid_not_configured";
    } else {
      const allowed = new Set(recipients);
      // Védelmi mélység: csak a DB által visszaadott címzettek feliratkozásai.
      const subs = (await deps.loadSubscriptions(recipients)).filter((s) => allowed.has(s.user_id));
      if (subs.length === 0) {
        result.delivery_status = "no_subscriptions";
      } else {
        const payload = JSON.stringify(buildTravelPushPayload(event, notificationId));
        const opts = travelPushOptions(event);
        const errors = new Map<string, number>();
        const settled = await Promise.allSettled(subs.map((s) => deps.send(s, payload, opts)));
        for (let i = 0; i < settled.length; i++) {
          const r = settled[i];
          if (r.status === "fulfilled") {
            result.sent_count++;
            continue;
          }
          result.failed_count++;
          const code = errCode(r.reason);
          errors.set(code, (errors.get(code) ?? 0) + 1);
          if (code === "push_status_404" || code === "push_status_410") {
            try {
              await deps.removeSubscription(subs[i]);
              result.removed_count++;
            } catch {
              // a lejárt feliratkozás törlése nem kritikus
            }
          }
        }
        result.delivery_status = result.failed_count === 0 ? "sent" : result.sent_count === 0 ? "failed" : "partial";
        if (errors.size) result.last_error = Array.from(errors, ([c, n]) => `${c}x${n}`).join(",");
      }
    }
  } catch (err) {
    result.delivery_status = "error";
    result.last_error = "internal_error";
    safeLog(deps, "[family-travel-push] send failed", { event, notificationId, code: errCode(err) });
  }

  try {
    await deps.recordResult(notificationId, result);
  } catch {
    safeLog(deps, "[family-travel-push] result record failed", { event, notificationId });
  }
  if (result.delivery_status !== "sent" && result.delivery_status !== "no_subscriptions" && result.delivery_status !== "no_recipients") {
    safeLog(deps, "[family-travel-push] delivery problem", { event, notificationId, status: result.delivery_status, error: result.last_error });
  }
  return { notified: true, notificationId, result };
}

function safeLog(deps: TravelNotifyDeps, message: string, detail?: Record<string, unknown>) {
  try {
    deps.logError(message, detail);
  } catch {
    // a naplózás hibája sem akadályozhatja a folyamatot
  }
}
