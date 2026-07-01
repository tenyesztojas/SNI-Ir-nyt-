import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewsletterForm from "./NewsletterForm";

export default async function AdminNewsletterPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("newsletter_subscribed", true);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-gray-900">Hírlevél küldése</h1>
      <p className="mt-1 text-sm text-gray-500">
        Jelenleg <strong>{count ?? 0}</strong> aktív feliratkozó van.
      </p>
      <div className="mt-6">
        <NewsletterForm subscriberCount={count ?? 0} />
      </div>
    </div>
  );
}
