import { getCurrentUserAndProfile } from "@/lib/data";
import HeaderClient from "./HeaderClient";

export default async function Header() {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <>
      <HeaderClient
        isLoggedIn={!!user}
        displayName={profile?.displayName}
        isAdmin={profile?.role === "admin"}
      />
      <div className="border-b border-sni-brand-teal/20 bg-gradient-to-r from-sni-brand-teal/10 via-sni-brand-blue/10 to-sni-brand-navy/10 py-1.5 text-center text-sm font-semibold text-sni-brand-navy">
        Itt biztonságban vagy!
      </div>
    </>
  );
}
