"use client";

import { useState, useTransition } from "react";
import { Calendar, BedDouble, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { ServicePackage, AvailabilitySlot } from "@/lib/types";
import { submitBooking } from "@/lib/actions/bookings";

interface Props {
  placeId: string;
  providerId: string;
  packages: ServicePackage[];
  slots: AvailabilitySlot[];
  isLoggedIn: boolean;
  bookingType: "appointment" | "accommodation" | "both";
}

export default function BookingWidget({
  placeId, providerId, packages, slots, isLoggedIn, bookingType,
}: Props) {
  const [selectedPackage, setSelectedPackage] = useState<ServicePackage | null>(null);
  const [form, setForm] = useState({
    appointmentDate: "", appointmentTime: "",
    checkinDate: "", checkoutDate: "", numGuests: "1",
    guestName: "", guestEmail: "", guestPhone: "", guestNote: "",
  });
  const [step, setStep] = useState<"select" | "form" | "done">("select");
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Ha nem bejelentkezett: lock képernyő
  if (!isLoggedIn) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft text-center">
        <Lock size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="font-semibold text-gray-900">Árak és foglalás</p>
        <p className="mt-1 text-sm text-gray-500">
          Az árak megtekintéséhez és foglaláshoz{" "}
          <a href="/belepes" className="text-sni-brand-blue hover:underline font-medium">
            jelentkezz be
          </a>
          .
        </p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-600 mb-3" />
        <p className="font-bold text-emerald-900">Foglalási kérelem elküldve!</p>
        <p className="mt-1 text-sm text-emerald-700">
          A szolgáltató hamarosan visszaigazol. Foglalás azonosítója:{" "}
          <span className="font-mono text-xs">{bookingId?.slice(0, 8)}…</span>
        </p>
        <button onClick={() => { setStep("select"); setSelectedPackage(null); }}
          className="btn-secondary mt-4 text-sm">
          Új foglalás
        </button>
      </div>
    );
  }

  const appointmentPackages = packages.filter((p) => p.packageType === "appointment");
  const accommodationPackages = packages.filter((p) => p.packageType === "accommodation");

  function handleSubmit() {
    if (!selectedPackage) return;
    if (!form.guestName.trim()) { setError("Add meg a neved."); return; }
    if (!form.guestEmail.includes("@")) { setError("Érvényes e-mail szükséges."); return; }
    if (selectedPackage.packageType === "appointment" && !form.appointmentDate) {
      setError("Válassz dátumot."); return;
    }
    if (selectedPackage.packageType === "accommodation" && (!form.checkinDate || !form.checkoutDate)) {
      setError("Add meg a check-in és check-out dátumot."); return;
    }
    setError(null);
    startTransition(async () => {
      const r = await submitBooking({
        packageId: selectedPackage.id,
        placeId,
        providerId,
        bookingType: selectedPackage.packageType,
        appointmentDate: form.appointmentDate || undefined,
        appointmentTime: form.appointmentTime || undefined,
        checkinDate: form.checkinDate || undefined,
        checkoutDate: form.checkoutDate || undefined,
        numGuests: Number(form.numGuests) || 1,
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        guestPhone: form.guestPhone || undefined,
        guestNote: form.guestNote || undefined,
      });
      if (r.error) { setError(r.error); return; }
      setBookingId(r.bookingId ?? null);
      setStep("done");
    });
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Calendar size={20} className="text-sni-brand-teal" /> Foglalás / Időpontkérés
      </h2>

      {step === "select" && (
        <div className="space-y-4">
          {appointmentPackages.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Időpontos foglalás
              </p>
              <div className="space-y-2">
                {appointmentPackages.map((pkg) => (
                  <button key={pkg.id} onClick={() => { setSelectedPackage(pkg); setStep("form"); }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-sni-brand-teal hover:bg-teal-50/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{pkg.name}</p>
                        {pkg.description && <p className="text-xs text-gray-500 mt-0.5">{pkg.description}</p>}
                        {pkg.durationMinutes && <p className="text-xs text-gray-400">{pkg.durationMinutes} perc</p>}
                      </div>
                      <p className="text-sni-brand-teal font-bold text-sm shrink-0 ml-3">
                        {pkg.priceAmount.toLocaleString("hu-HU")} Ft<span className="font-normal text-gray-400">/{pkg.priceUnit}</span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {accommodationPackages.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                <BedDouble size={13} className="inline mr-1" />Szállásfoglalás
              </p>
              <div className="space-y-2">
                {accommodationPackages.map((pkg) => (
                  <button key={pkg.id} onClick={() => { setSelectedPackage(pkg); setStep("form"); }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-sni-brand-teal hover:bg-teal-50/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{pkg.name}</p>
                        {pkg.unitName && <p className="text-xs text-gray-500">{pkg.unitName}{pkg.maxGuests ? ` · max. ${pkg.maxGuests} fő` : ""}</p>}
                        {pkg.description && <p className="text-xs text-gray-400 mt-0.5">{pkg.description}</p>}
                      </div>
                      <p className="text-sni-brand-teal font-bold text-sm shrink-0 ml-3">
                        {pkg.priceAmount.toLocaleString("hu-HU")} Ft<span className="font-normal text-gray-400">/{pkg.priceUnit}</span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {packages.length === 0 && (
            <p className="text-center text-gray-400 py-4">Hamarosan elérhetők lesznek a foglalási lehetőségek.</p>
          )}
        </div>
      )}

      {step === "form" && selectedPackage && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-3">
            <p className="text-sm font-semibold text-teal-800">{selectedPackage.name}</p>
            <span className="ml-auto text-sni-brand-teal font-bold text-sm">
              {selectedPackage.priceAmount.toLocaleString("hu-HU")} Ft/{selectedPackage.priceUnit}
            </span>
          </div>

          {selectedPackage.packageType === "appointment" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kért dátum *</label>
                <input type="date" className="input-field text-sm" value={form.appointmentDate}
                  onChange={(e) => set("appointmentDate", e.target.value)}
                  min={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kért időpont</label>
                <input type="time" className="input-field text-sm" value={form.appointmentTime}
                  onChange={(e) => set("appointmentTime", e.target.value)} />
              </div>
            </div>
          )}

          {selectedPackage.packageType === "accommodation" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Check-in *</label>
                <input type="date" className="input-field text-sm" value={form.checkinDate}
                  onChange={(e) => set("checkinDate", e.target.value)}
                  min={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Check-out *</label>
                <input type="date" className="input-field text-sm" value={form.checkoutDate}
                  onChange={(e) => set("checkoutDate", e.target.value)} min={form.checkinDate} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vendégek száma</label>
                <input type="number" min="1" max={selectedPackage.maxGuests ?? 99}
                  className="input-field text-sm" value={form.numGuests}
                  onChange={(e) => set("numGuests", e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Neved *</label>
              <input type="text" className="input-field text-sm" value={form.guestName}
                onChange={(e) => set("guestName", e.target.value)} placeholder="Kovács Anna" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail *</label>
              <input type="email" className="input-field text-sm" value={form.guestEmail}
                onChange={(e) => set("guestEmail", e.target.value)} placeholder="anna@email.hu" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
            <input type="tel" className="input-field text-sm" value={form.guestPhone}
              onChange={(e) => set("guestPhone", e.target.value)} placeholder="+36 30 123 4567" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Megjegyzés</label>
            <textarea rows={3} className="input-field text-sm resize-none" value={form.guestNote}
              onChange={(e) => set("guestNote", e.target.value)}
              placeholder="Különleges igények, kérdések..." maxLength={500} />
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Adataid kizárólag a foglalás lebonyolításához kerülnek felhasználásra (Adatkezelési Tájékoztató 2.4. pont).
            A foglalás visszaigazolásig nem kötelező érvényű.
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button disabled={isPending} onClick={handleSubmit}
              className="btn-primary flex-1 disabled:opacity-50">
              {isPending ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
              Foglalási kérelem küldése
            </button>
            <button type="button" onClick={() => setStep("select")} className="btn-secondary">
              Vissza
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
