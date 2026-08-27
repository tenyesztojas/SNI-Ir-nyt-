import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let vapidInitialized = false;

function initVapid() {
  if (vapidInitialized) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails("mailto:holvay.csaba@gmail.com", pub, priv);
  vapidInitialized = true;
}

export async function sendAdminPush(title: string, body: string, url = "/admin") {
  try {
    initVapid();
    if (!vapidInitialized) return;

    const admin = createAdminClient();

    // Csak admin felhasználók push subscription-jei
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    if (!adminProfiles?.length) return;
    const adminIds = adminProfiles.map((p) => p.id);

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, keys")
      .in("user_id", adminIds);

    if (!subs?.length) return;

    const payload = JSON.stringify({ title, body, url });

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
            payload
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410 || status === 404) {
            await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      })
    );
  } catch {
    // Push errors should never break the main flow
  }
}
