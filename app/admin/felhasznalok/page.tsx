import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Users, UserPlus, Mail, MailX } from "lucide-react";
import UserActions from "./UserActions";

export default async function AdminUsersPage() {
  const supabase = createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, role, newsletter_subscribed")
    .order("display_name");

  let authUsers: { id: string; email: string; created_at: string }[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    authUsers = (data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
    }));
  } catch {
    // service role key nincs beállítva
  }

  const authMap = new Map(authUsers.map((u) => [u.id, u]));
  const hasEmail = authUsers.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        Vissza az admin áttekintéshez
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="text-sni-brand-blue" size={28} />
          <h1 className="text-2xl font-bold text-sni-text">
            Felhasználók ({profiles?.length ?? 0} fő)
          </h1>
        </div>
        <Link href="/admin/felhasznalok/uj" className="btn-primary inline-flex items-center gap-2">
          <UserPlus size={16} /> Új felhasználó felvitele
        </Link>
      </div>

      {!hasEmail && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Email-címek csak akkor jelennek meg, ha a{" "}
          <strong>SUPABASE_SERVICE_ROLE_KEY</strong> be van állítva Vercelben.
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[22%]" />
            {hasEmail && <col className="w-[28%]" />}
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            {hasEmail && <col className="w-[14%]" />}
            <col />
          </colgroup>
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-3 py-3">Név</th>
              {hasEmail && <th className="px-3 py-3">Email</th>}
              <th className="px-3 py-3">Szerep</th>
              <th className="px-3 py-3 text-center" title="Hírlevél-feliratkozás">Hírl.</th>
              {hasEmail && <th className="px-3 py-3">Regisztrált</th>}
              <th className="px-3 py-3">Műveletek</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(profiles ?? []).map((p) => {
              const auth = authMap.get(p.id);
              const regDate = auth?.created_at
                ? new Date(auth.created_at).toLocaleDateString("hu-HU", {
                    year: "2-digit",
                    month: "2-digit",
                    day: "2-digit",
                  })
                : "—";
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-medium text-gray-900 truncate" title={p.display_name ?? ""}>
                    {p.display_name ?? "—"}
                  </td>
                  {hasEmail && (
                    <td className="px-3 py-2.5 text-gray-500 truncate" title={auth?.email ?? ""}>
                      {auth?.email ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    {p.role === "admin" ? (
                      <span className="rounded-full bg-sni-brand-teal/10 px-2 py-0.5 text-xs font-bold text-sni-brand-teal">
                        admin
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        tag
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {p.newsletter_subscribed
                      ? <Mail size={14} className="mx-auto text-sni-brand-teal" />
                      : <MailX size={14} className="mx-auto text-gray-300" />}
                  </td>
                  {hasEmail && (
                    <td className="px-3 py-2.5 text-xs text-gray-500">{regDate}</td>
                  )}
                  <td className="px-3 py-2.5">
                    <UserActions
                      userId={p.id}
                      displayName={p.display_name ?? ""}
                      email={auth?.email ?? ""}
                      role={p.role ?? "member"}
                      isSelf={p.id === currentUser?.id}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
