// Szerveroldali bekötés: service role kliens + web-push (a meglévő VAPID-
// konfigurációval). Csak szerverakcióból/route-ból hívható; a kliensre nem
// kerülhet (service role). Nem dob.

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureVapidConfigured } from "@/lib/push";
import { notifyTravelEvent, type TravelNotifyEvent, type TravelNotifyOutcome } from "@/lib/family/travelNotify";

export async function notifyChildTravelEvent(travelStatusId: string, event: TravelNotifyEvent): Promise<TravelNotifyOutcome | null> {
  try {
    const admin = createAdminClient();
    return await notifyTravelEvent(
      {
        async claim(id, ev) {
          const { data, error } = await admin.rpc("claim_child_travel_notification", {
            p_travel_status_id: id,
            p_event: ev,
          });
          if (error) throw error;
          const rows = (data ?? []) as Array<{ notification_id: string; recipient_user_id: string | null }>;
          if (rows.length === 0) return null;
          return {
            notificationId: rows[0].notification_id,
            recipients: rows.map((r) => r.recipient_user_id).filter((u): u is string => typeof u === "string"),
          };
        },
        vapidReady: ensureVapidConfigured,
        async loadSubscriptions(userIds) {
          const { data, error } = await admin
            .from("push_subscriptions")
            .select("endpoint, keys, user_id")
            .in("user_id", userIds);
          if (error) throw error;
          return (data ?? []) as Array<{ endpoint: string; keys: { p256dh: string; auth: string }; user_id: string }>;
        },
        async send(sub, payload, opts) {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, opts);
        },
        async removeSubscription(sub) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", sub.user_id);
        },
        async recordResult(notificationId, result) {
          const { error } = await admin
            .from("child_travel_notifications")
            .update({ ...result, completed_at: new Date().toISOString() })
            .eq("id", notificationId);
          if (error) throw error;
        },
        logError(message, detail) {
          console.error(message, detail ?? {});
        },
      },
      travelStatusId,
      event
    );
  } catch {
    console.error("[family-travel-push] setup failed");
    return null;
  }
}
