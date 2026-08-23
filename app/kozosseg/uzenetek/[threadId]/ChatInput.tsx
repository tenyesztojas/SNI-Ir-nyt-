"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendMessage } from "@/app/kozosseg/actions";
import { Send } from "lucide-react";

export default function ChatInput({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll az oldal aljára
  useEffect(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, []);

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    const res = await sendMessage(threadId, body.trim());
    setSending(false);
    if (res.ok) {
      setBody("");
      router.refresh();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Írj egy üzenetet... (Enter = küldés, Shift+Enter = sortörés)"
          className="flex-1 min-h-[44px] max-h-32 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:border-sni-brand-teal focus:outline-none focus:ring-1 focus:ring-sni-brand-teal"
          rows={1}
          maxLength={2000}
        />
        <button
          onClick={handleSend}
          disabled={!body.trim() || sending}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sni-brand-teal text-white hover:bg-sni-brand-blue disabled:opacity-40 transition"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
