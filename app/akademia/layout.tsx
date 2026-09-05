import { redirect } from "next/navigation";
import { getCurrentPartnerId, getPartnerProfile } from "@/lib/academy/data";
import { createClient } from "@/lib/supabase/server";

export default async function AkademiaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/belepes?next=/akademia");

  const partnerId = await getCurrentPartnerId();
  if (!partnerId) redirect("/szolgaltato/regisztracio");

  return <>{children}</>;
}
