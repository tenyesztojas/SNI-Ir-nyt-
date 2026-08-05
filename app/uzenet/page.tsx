import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, Reply, ShieldOff } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { Message } from "@/lib/types";
import MessageThread from "@/components/MessageThread";

export default async function MessageInboxPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/bejelentkezes?next=/uzenet");

  const adminClient = createAdminClient();

  // Üzenetek lekérése ahol a user küldő vagy fogadó
  // GDPR: a lekérdezés NEM csatlakozik a profiles táblához — névadatok nem kerülnek le
  const { data: rawMessages } = await adminClient
    .from("messages")
    .select("id, review_id, place_id, sender_user_id, recipient_user_id, sender_role, text, created_at, read_at")
    .or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(100);

  // Helyek nevének lekérése (NEM felhasználói adatok)
  const placeIds = [...new Set((rawMessages ?? []).map((m) => m.place_id))];
  const { data: places } = await adminClient
    .from("places")
    .select("id, name, slug")
    .in("id", placeIds);

  const placeById = new Map((places ?? []).map((p) => [p.id, p]));

  const messages: Message[] = (rawMessages ?? []).map((m) => ({
    id: m.id,
    reviewId: m.review_id,
    placeId: m.place_id,
    senderUserId: m.sender_user_id,
    recipientUserId: m.recipient_user_id,
    senderRole: m.sender_role,
    text: m.text,
    createdAt: m.created_at,
    readAt: m.read_at,
    placeName: placeById.get(m.place_id)?.name,
  }));

  const unreadCount = messages.filter(
    (m) => m.recipientUserId === user.id && !m.readAt
  ).length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <MessageCircle className="text-sni-brand-teal" size={24} />
        <h1 className="text-xl font-bold text-sni-text">Üzenetek</h1>
        {unreadCount > 0 && (
          <span className="rounded-full bg-sni-brand-teal px-2.5 py-0.5 text-xs font-bold text-white">
            {unreadCount} új
          </span>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <strong>Adatvédelem:</strong> Ebben a rendszerben a hely üzemeltetője soha nem látja a valós nevedet
        vagy e-mail-edet — csak az értékelésed szövegét (ÁSZF 7.6. pont).
      </div>

      {messages.length === 0 ? (
        <div className="mt-10 text-center text-gray-500">
          <MessageCircle size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-semibold">Még nincsenek üzeneteid.</p>
          <p className="mt-1 text-sm">Ha egy hely üzemeltetője válaszol az értékelésedre, itt jelennek meg.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <MessageThread messages={messages} currentUserId={user.id} placeById={placeById} />
        </div>
      )}

      <p className="mt-8 text-xs text-gray-400">
        Üzenetet egy hely üzemeltetőjétől csak akkor kapsz, ha hozzájárultál (ÁSZF 7.6.).
        A hely blokkolásához nyisd meg az adott üzenetet.
      </p>
    </div>
  );
}
