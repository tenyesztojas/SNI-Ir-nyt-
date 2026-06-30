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
      <div className="border-b border-sni-brand-teal/30 bg-gradient-to-r from-sni-brand-teal/15 to-sni-brand-blue/15 py-1 text-center text-xs font-semibold tracking-wide text-sni-brand-navy">
        Itt biztonságban vagy!
      </div>
    </>
  );
}
