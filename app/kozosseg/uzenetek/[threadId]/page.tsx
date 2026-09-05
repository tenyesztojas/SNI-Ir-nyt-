import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getThreadMessages, getMyThreads, getOwnCommunityProfile } from "@/lib/community/data";
import { markThreadMessagesRead } from "@/app/kozosseg/actions";
import { ROLE_LABELS } from "@/lib/community/types";
import ChatInput from "./ChatInput";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage(
  props: {
    params: Promise<{ threadId: string }>;
  }
) {
  const params = await props.params;
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const [ownProfile, threads] = await Promise.all([
    getOwnCommunityProfile(),
    getMyThreads(),
  ]);
  if (!ownProfile) redirect("/kozosseg/bekapcsolas");

  const thread = threads.find((t) => t.id === params.threadId);
  if (!thread) notFound();

  // Először olvasottnak jelöljük (hogy a header badge frissüljön),
  // majd párhuzamosan töltjük be az üzeneteket
  await markThreadMessagesRead(params.threadId);
  const messages = await getThreadMessages(params.threadId);

  const other = thread.other_profile;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Fejléc */}
      <div className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6 flex items-center gap-3">
        <Link href="/kozosseg/uzenetek" className="text-gray-400 hover:text-sni-brand-teal transition">
          ← Vissza
        </Link>
        <div className="h-9 w-9 rounded-full bg-sni-brand-teal/20 flex items-center justify-center text-sni-brand-teal font-bold">
          {other?.display_name?.charAt(0).toUpperCase() ?? "?"}
        </div>
        <div>
          <p className="font-semibold text-sni-text text-sm">{other?.display_name ?? "—"}</p>
          {other && <p className="text-xs text-gray-400">{ROLE_LABELS[other.role]}</p>}
        </div>
      </div>

      {/* Üzenetek */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-3">
        {/* Adatvédelmi szöveg */}
        <div className="text-center">
          <span className="rounded-full bg-amber-50 px-4 py-1.5 text-xs text-amber-700">
            Kérjük, ne ossz meg gyermeknevet, pontos címet, iskolát vagy óvodát.
          </span>
        </div>

        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">Még nincsenek üzenetek.</p>
        )}

        {messages.map((m) => {
          const isMine = m.sender_user_id === user.id;
          if (m.status === "deleted_by_user") {
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <span className="rounded-2xl bg-gray-100 px-4 py-2 text-xs text-gray-400 italic">
                  [Törölt üzenet]
                </span>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  isMine
                    ? "bg-sni-brand-teal text-white rounded-br-sm"
                    : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-soft"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[10px] ${isMine ? "text-white/70" : "text-gray-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString("hu-HU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {isMine && m.read_at && " ✓✓"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Beviteli mező */}
      <ChatInput threadId={params.threadId} />
      <AutoRefresh />
    </div>
  );
}
