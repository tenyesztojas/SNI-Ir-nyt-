"use client";

// Gyermekoldali utazási gombok. Dupla kattintás ellen: szinkron ref-zár +
// letiltott gombok a kérés idejére. A szerver dönti el az átmenetet.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTravelStatusAction } from "@/lib/actions/travelStatus";
import {
  TRAVEL_ACTION_LABEL,
  TRAVEL_ACTION_SUCCESS,
  TRAVEL_ERROR_TEXT,
  availableActionsFor,
  childTravelLabel,
  type TravelAction,
  type TravelState,
} from "@/lib/family/travelStatus";

const STYLE: Record<TravelAction, string> = {
  depart: "bg-sni-brand-blue text-white",
  arrive: "bg-green-600 text-white",
  help: "border-2 border-red-600 bg-white text-red-700",
};

export default function TravelStatusControls({
  scheduleItemId,
  initialState,
  carriedOver = false,
}: {
  scheduleItemId: string;
  initialState: TravelState | null;
  // Tegnap megkezdett, nyitott út: új indulás nem, csak lezárás/segítség.
  carriedOver?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<TravelState | null>(initialState);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  function run(action: TravelAction) {
    if (busy.current) return;
    busy.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await setTravelStatusAction(scheduleItemId, action);
        if (res.ok) {
          setState(res.state);
          setMessage({ kind: "ok", text: TRAVEL_ACTION_SUCCESS[action] });
        } else {
          setMessage({ kind: "error", text: TRAVEL_ERROR_TEXT[res.error] });
          // Elavult kliensállapot (pl. másik lapon már lezárták): a szerveres
          // állapot újratöltése — optimista frissítés nincs.
          if (res.error === "travel_closed" || res.error === "travel_not_departed" || res.error === "travel_not_today") {
            router.refresh();
          }
        }
      } catch {
        setMessage({ kind: "error", text: TRAVEL_ERROR_TEXT.travel_unknown });
      } finally {
        busy.current = false;
      }
    });
  }

  const actions = availableActionsFor(state, carriedOver);

  return (
    <div className="mt-4">
      <p className="text-base text-gray-800" aria-live="polite">
        <span className="font-semibold">Állapotom: {childTravelLabel(state)}</span>
        <span className="block text-sm text-gray-600">Ezt te jelzed – az alkalmazás nem követi, hol vagy.</span>
      </p>
      {state?.status === "arrived" && (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-lg font-semibold text-green-800">Megérkeztél – az utazás lezárult.</p>
      )}
      {state?.status === "help_requested" && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base font-semibold text-red-800">
          Segítségkérés rögzítve. Ez nem segélyhívás – vészhelyzetben hívd a 112-t.
        </p>
      )}
      {actions.length > 0 && (
        <div className="mt-3 grid gap-3">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              disabled={pending}
              aria-disabled={pending}
              onClick={() => run(a)}
              className={`min-h-[56px] w-full rounded-xl px-4 text-lg font-semibold disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${STYLE[a]}`}
            >
              {pending ? "Mentés…" : TRAVEL_ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      )}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-3 text-base ${message.kind === "error" ? "text-red-700" : "text-green-800"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
