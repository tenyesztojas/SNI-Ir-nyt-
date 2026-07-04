import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { Users } from "lucide-react";

export default async function AdminUsersPage() {
  const supabase = createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, role, newsletter_subscribed")
    .order("display_name");

  let authUsers: { id: string; email: string; created_at: string }[] = [];
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceRoleKey
      );
      const { data } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      authUsers = (data?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
      }));
    } catch {
      // service role key not set
    }
  }

  const authMap = new Map(authUsers.map((u) => [u.id, u]));
  const hasEmail = authUsers.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        Vissza az admin attekinteshez
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <Users className="text-sni-brand-blue" size={28} />
        <h1 className="text-2xl font-bold text-sni-text">
          Felhasznalok ({profiles?.length ?? 0} fo)
        </h1>
      </div>

      {!hasEmail && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Email-cimek es regisztracio datuma csak akkor jelenik meg, ha a{" "}
          <strong>SUPABASE_SERVICE_ROLE_KEY</strong> kornyezeti valtozo be van allitva Vercelben.
          Addig a Supabase Dashboard Authentication menupont alatt lathatod a reszleteket.
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Nev</th>
              {hasEmail && <th className="px-4 py-3">Email</th>}
              <th className="px-4 py-3">Szerep</th>
              <th className="px-4 py-3">Hirlevel</th>
              {hasEmail && <th className="px-4 py-3">Regisztralt</th>}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
