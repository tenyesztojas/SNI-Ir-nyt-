"use client";

import { useRouter } from "next/navigation";
import { markAllNotificationsRead } from "@/app/kozosseg/actions";

export default function MarkReadButton() {
  const router = useRouter();

  async function handle() {
    await markAllNotificationsRead();
    router.refresh();
  }

  return (
    <button
      onClick={handle}
      className="text-sm font-semibold text-sni-brand-teal hover:underline"
    >
      Mind olvasott
    </button>
  );
}
