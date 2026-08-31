"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteParticipant } from "@/lib/academy/actions";

interface CourseVersion {
  id: string;
  version: string;
  course: { title: string } | null;
}

export default function InviteParticipantForm({ courseVersions }: { courseVersions: CourseVersion[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    email: "",
    location: "",
    jobRole: "",
    courseVersionId: courseVersions[0]?.id ?? "",
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function set(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.lastName || !form.firstName || !form.email || !form.courseVersionId) {
      setResult({ ok: false, text: "A csillaggal jelölt mezők kitöltése kötelező." });
      return;
    }
    setSending(true);
    setResult(null);
    const res = await inviteParticipant({
      lastName: form.lastName,
      firstName: form.firstName,
      email: form.email,
      location: form.location,
      jobRole: form.jobRole,
      courseVersionId: form.courseVersionId,
    });
    setSending(false);
    if (res.ok) {
      setResult({ ok: true, text: "Meghívó sikeresen elküldve!" });
      setTimeout(() => router.push("/akademia/munkatarsak"), 1500);
    } else {
      setResult({ ok: false, text: res.error ?? "Hiba az elküldés során." });
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="lastName" className="block text-xs font-semibold text-gray-600 mb-1">
            Vezetéknév <span className="text-red-500" aria-hidden>*</span>
          </label>
          <input
            id="lastName"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            required
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
          />
        </div>
        <div>
          <label htmlFor="firstName" className="block text-xs font-semibold text-gray-600 mb-1">
            Keresztnév <span className="text-red-500" aria-hidden>*</span>
          </label>
          <input
            id="firstName"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-xs font-semibold text-gray-600 mb-1">
          E-mail-cím <span className="text-red-500" aria-hidden>*</span>
        </label>
        <input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          required
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        />
      </div>

      <div>
        <label htmlFor="location" className="block text-xs font-semibold text-gray-600 mb-1">
          Telephely <span className="text-red-500" aria-hidden>*</span>
        </label>
        <input
          id="location"
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        />
      </div>

      <div>
        <label htmlFor="jobRole" className="block text-xs font-semibold text-gray-600 mb-1">
          Munkakör
        </label>
        <input
          id="jobRole"
          value={form.jobRole}
          onChange={(e) => set("jobRole", e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        />
      </div>

      <div>
        <label htmlFor="courseVersionId" className="block text-xs font-semibold text-gray-600 mb-1">
          Hozzárendelt képzés <span className="text-red-500" aria-hidden>*</span>
        </label>
        <select
          id="courseVersionId"
          value={form.courseVersionId}
          onChange={(e) => set("courseVersionId", e.target.value)}
          required
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          <option value="">— Válassz képzést —</option>
          {courseVersions.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.course?.title ?? "Névtelen kurzus"} ({cv.version})
            </option>
          ))}
        </select>
      </div>

      {result && (
        <p
          className={`rounded-xl px-4 py-2 text-sm ${result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}
          role="alert"
        >
          {result.text}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-full bg-sni-brand-teal py-2.5 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition disabled:opacity-50"
      >
        {sending ? "Küldés..." : "Meghívó küldése"}
      </button>
    </form>
  );
}
