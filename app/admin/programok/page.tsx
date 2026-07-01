import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";

function supabaseAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function AdminProgramokPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const admin = supabaseAdmin();
  const { data: programs } = await admin
    .from("programs")
    .select("*")
    .order("created_at", { ascending: false });

  const pending = programs?.filter((p) => p.status === "pending") ?? [];
  const others = programs?.filter((p) => p.status !== "pending") ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">← Admin áttekintés</Link>
      <h1 className="mt-3 text-2xl font-bold text-gray-900">Programajánlók kezelése</h1>

      <h2 className="mt-6 text-lg font-semibold text-gray-800">Jóváhagyásra váró ({pending.length})</h2>
      {pending.length === 0 && <p className="text-sm text-gray-500 mt-2">Nincs várakozó program.</p>}
      <div className="mt-3 space-y-4">
        {pending.map((p) => (
          <ProgramCard key={p.id} p={p} />
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-gray-800">Korábbi ({others.length})</h2>
      <div className="mt-3 space-y-3">
        {others.map((p) => (
          <ProgramCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

function ProgramCard({ p }: { p: Record<string, string> }) {
  const statusColor = p.status === "approved"
    ? "bg-green-100 text-green-800"
    : p.status === "rejected"
    ? "bg-red-100 text-red-700"
    : "bg-yellow-100 text-yellow-800";

  return (
    <div className="card text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{p.name}</p>
          <p className="text-gray-500">{p.location} &bull; {p.event_date}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
          {p.status === "approved" ? "Jóváhagyva" : p.status === "rejected" ? "Elutasítva" : "Várakozik"}
        </span>
      </div>
      <p className="mt-2 text-gray-700">{p.description}</p>
      {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sni-brand-blue hover:underline">{p.url}</a>}
      {p.contact && <p className="mt-1 text-gray-500">Kontakt: {p.contact}</p>}

      {p.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <ApproveButton id={p.id} action="approved" label="Jóváhagyás" cls="btn-primary text-xs py-1.5 px-3" />
          <ApproveButton id={p.id} action="rejected" label="Elutasítás" cls="btn-secondary text-xs py-1.5 px-3" />
        </div>
      )}
    </div>
  );
}

function ApproveButton({ id, action, label, cls }: { id: string; action: string; label: string; cls: string }) {
  return (
    <form action={`/api/admin/programok/${id}`} method="POST">
      <input type="hidden" name="status" value={action} />
      <button type="submit" className={cls}>{label}</button>
    </form>
  );
}
