import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Users, UserPlus } from "lucide-react";
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
    // service role key not set
  }

  const authMap = new Map(authUsers.map((u) => [u.id, u]));
  const hasEmail = authUsers.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        Vissza az admin attekinteshez
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="text-sni-brand-blue" size={28} />
          <h1 className="text-2xl font-bold text-sni-text">
            Felhasznalok ({profiles?.length ?? 0} fo)
          </h1>
        </div>
        <Link href="/admin/felhasznalok/uj" className="btn-primary inline-flex items-center gap-2">
          <UserPlus size={16} /> Uj felhasznalo felvetele
        </Link>
      </div>

      {!hasEmail && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Email-cimek csak akkor jelennek meg, ha a{" "}
          <strong>SUPABASE_SERVICE_ROLE_KEY</strong> be van allitva Vercelben.
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Nev</th>
              {hasEmail && <th className="px-4 py-3">Email</th>}
              <th className="px-4 py-3">Szerep</th>
              <th className="px-4 py-3">Hirlevél</th>
              {hasEmail && <th className="px-4 py-3">Regisztralt</th>}
              <th className="px-4 py-3">Muveletek</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(profiles ?? []).map((p) => {
              const auth = authMap.get(p.id);
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {p.display_name ?? "—"}
                  </td>
                  {hasEmail && (
                    <td className="px-4 py-3 text-gray-600">{auth?.email ?? "—"}</td>
                  )}
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-gray-600">
                    {p.newsletter_subscribed ? "igen" : "nem"}
                  </td>
                  {hasEmail && (
                    <td className="px-4 py-3 text-gray-500">
                      {auth?.created_at
                        ? new Date(auth.created_at).toLocaleDateString("hu-HU")
                        : "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">
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
