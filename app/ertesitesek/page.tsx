import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getMyNotifications } from "@/lib/community/data";
import MarkReadButton from "./MarkReadButton";

export const metadata = { title: "Értesítések – VédettSarok" };
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  connection_request: "Új kapcsolódási kérés",
  connection_accepted: "Elfogadott kérés",
  new_message: "Új üzenet",
  moderation: "Moderációs figyelmeztetés",
  system: "Rendszerüzenet",
};

const TYPE_COLORS: Record<string, string> = {
  connection_request: "bg-blue-50 text-blue-700",
  connection_accepted: "bg-green-50 text-green-700",
  new_message: "bg-sni-brand-teal/10 text-sni-brand-teal",
  moderation: "bg-red-50 text-red-700",
  system: "bg-gray-100 text-gray-600",
};

const TYPE_LINKS: Record<string, string> = {
  connection_request: "/kozosseg/kapcsolataim",
  connection_accepted: "/kozosseg/kapcsolataim",
  new_message: "/kozosseg/uzenetek",
  moderation: "/kozosseg/profilom",
  system: "/kozosseg",
};

export default async function ErtesitesekPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const notifications = await getMyNotifications();
  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-sni-text flex items-center gap-2">
          <Bell size={22} />
          Értesítések
        </h1>
        {hasUnread && <MarkReadButton />}
      </div>

      {notifications.length === 0 ? (
        <div className="mt-12 text-center text-gray-400">
          <p className="text-4xl mb-3">🔔</p>
          <p>Még nincs értesítésed.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={
                n.related_thread_id
                  ? `/kozosseg/uzenetek/${n.related_thread_id}`
                  : (TYPE_LINKS[n.type] ?? "/kozosseg")
              }
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition hover:shadow-md ${
                n.read_at
                  ? "border-gray-100 bg-white"
                  : "border-sni-brand-teal/30 bg-sni-brand-teal/5"
              }`}
            >
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  TYPE_COLORS[n.type] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {TYPE_LABELS[n.type] ?? n.type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sni-text">{n.title}</p>
                {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
              </div>
              <p className="shrink-0 text-xs text-gray-400">
                {new Date(n.created_at).toLocaleDateString("hu-HU", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
