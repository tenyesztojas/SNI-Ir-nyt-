"use client";

import { useCallback, useState } from "react";
import { clearNavigationSession } from "@/lib/vedett-route/navigation/navigationSessionPersistence";
import {
  CHILD_ACCOUNT_USER_MESSAGE,
  MANUAL_REVIEW_MESSAGE,
  parseAccountDeletionStatus,
  type AccountDeletionStatus,
} from "@/lib/account/deletionState";

const GENERIC_ERROR = "A fiók törlése most nem sikerült. Próbáld újra később.";

export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AccountDeletionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [confirmFamily, setConfirmFamily] = useState(false);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "GET", cache: "no-store" });
      const json = await res.json().catch(() => null);
      const parsed = res.ok && json?.ok ? parseAccountDeletionStatus(json) : null;
      if (!parsed) {
        setError(json?.message ?? GENERIC_ERROR);
        setStatus(null);
        return;
      }
      setStatus(parsed);
    } catch {
      setError(GENERIC_ERROR);
    }
  }, []);

  async function start() {
    setOpen(true);
    setStatus(null);
    setConfirmFamily(false);
    await loadStatus();
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          confirmFamilyDeletion: status?.state === "SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED" && confirmFamily,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const parsed = parseAccountDeletionStatus(json);
        if (parsed) setStatus(parsed);
        setError(json?.message ?? GENERIC_ERROR);
        setBusy(false);
        return;
      }
      clearNavigationSession();
      window.location.assign("/");
    } catch {
      setError(GENERIC_ERROR);
      setBusy(false);
    }
  }

  async function handleTransfer(familyId: string) {
    const targetUserId = selected[familyId];
    if (busy || !targetUserId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/transfer-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId, targetUserId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.message ?? "A tulajdonjog átadása nem sikerült.");
      } else {
        await loadStatus();
      }
    } catch {
      setError("A tulajdonjog átadása nem sikerült.");
    }
    setBusy(false);
  }

  const state = status?.state;
  const canDelete =
    state === "READY" ||
    state === "GUARDIAN_READY" ||
    state === "OTHER_OWNER_READY" ||
    (state === "SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED" && confirmFamily);

  return (
    <div id="fiok-torlese" className="mt-8 rounded-2xl border border-red-100 bg-white p-6 shadow-soft">
      <h2 className="text-lg font-bold text-gray-900">Fiók törlése</h2>
      {!open ? (
        <button type="button" onClick={() => void start()} className="btn-secondary mt-3 min-h-[44px]">
          Fiók törlése
        </button>
      ) : (
        <div className="mt-3 space-y-3 text-sm text-gray-700">
          {!status && !error && <p>Állapot ellenőrzése…</p>}

          {(state === "READY") && (
            <p>
              A fiók törlése végleges. A fiókodhoz kapcsolódó személyes adatok és mentett adatok törlésre kerülnek,
              kivéve azokat az adatokat, amelyeket jogszabály alapján tovább kell megőriznünk.
            </p>
          )}

          {(state === "GUARDIAN_READY" || state === "OTHER_OWNER_READY") && (
            <p>
              A fiók törlése végleges. A saját fiókod és családtagságod törlődik, a család és a gyermekadatok
              megmaradnak a többi felhasználó számára. A jogszabály alapján megőrzendő adatok kivételével a fiókodhoz
              kapcsolódó személyes adatok törlésre kerülnek.
            </p>
          )}

          {state === "OWNER_TRANSFER_REQUIRED" && status && (
            <div>
              <p>
                Te vagy a család egyetlen tulajdonosa (owner), ezért a fiókod törlése előtt át kell adnod a
                tulajdonjogot egy másik aktív családtagnak. Nem választunk helyetted. Az átadás után folytathatod a
                törlést.
              </p>
              {status.transfer.map((f) => (
                <fieldset key={f.family_id} className="mt-3 rounded-lg border border-gray-200 p-3">
                  <legend className="px-1 font-semibold text-gray-900">{f.family_name || "Család"}</legend>
                  {f.candidates.map((c) => (
                    <label key={c.user_id} className="flex min-h-[44px] items-center gap-2">
                      <input
                        type="radio"
                        name={`owner-${f.family_id}`}
                        checked={selected[f.family_id] === c.user_id}
                        onChange={() => setSelected((s) => ({ ...s, [f.family_id]: c.user_id }))}
                      />
                      <span>{c.display_name}</span>
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={busy || !selected[f.family_id]}
                    onClick={() => void handleTransfer(f.family_id)}
                    className="btn-secondary mt-2 min-h-[44px] disabled:opacity-60"
                  >
                    Új owner kinevezése
                  </button>
                </fieldset>
              ))}
            </div>
          )}

          {state === "SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED" && status && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
              <p className="font-semibold">
                A fiókod törlésével ez a család és a hozzá kizárólagosan tartozó gyermekprofilok, valamint a
                kapcsolódó napirendi adatok is véglegesen törlődnek.
              </p>
              <ul className="mt-2 list-disc pl-5">
                {status.family_deletion.map((f) => (
                  <li key={f.family_id}>
                    {f.family_name || "Család"} – törlendő gyermekprofil: {f.child_count} db
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2">
                <input type="checkbox" checked={confirmFamily} onChange={(e) => setConfirmFamily(e.target.checked)} />
                <span>Megértettem, és kérem a család és a kapcsolódó gyermekadatok végleges törlését is.</span>
              </label>
            </div>
          )}

          {(state === "COMPLEX_FAMILY_MANUAL_REVIEW" || state === "CHILD_ACCOUNT_MANUAL_REVIEW") && (
            <p>
              {MANUAL_REVIEW_MESSAGE.replace(" Kérjük, írj a kapcsolat@vedettsarok.hu címre.", "")} Kapcsolat:{" "}
              <a href="mailto:kapcsolat@vedettsarok.hu" className="underline">kapcsolat@vedettsarok.hu</a>
            </p>
          )}

          {state === "CHILD_ACCOUNT_USER" && (
            <p>
              {CHILD_ACCOUNT_USER_MESSAGE.replace(" Kérjük, a gyermek szülője vagy gondviselője írjon a kapcsolat@vedettsarok.hu címre.", "")}{" "}
              Kapcsolat: <a href="mailto:kapcsolat@vedettsarok.hu" className="underline">kapcsolat@vedettsarok.hu</a>
            </p>
          )}

          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {(state === "READY" ||
              state === "GUARDIAN_READY" ||
              state === "OTHER_OWNER_READY" ||
              state === "SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED") && (
              <button
                type="button"
                disabled={busy || !canDelete}
                onClick={() => void handleDelete()}
                className="min-h-[44px] rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {busy ? "Törlés…" : "Fiókom végleges törlése"}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="btn-secondary min-h-[44px]">
              Mégse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
