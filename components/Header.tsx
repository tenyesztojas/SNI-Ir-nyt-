import { getCurrentUserAndProfile } from "@/lib/data";
import HeaderClient from "./HeaderClient";

export default async function Header() {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <HeaderClient
      isLoggedIn={!!user}
      displayName={profile?.displayName}
      isAdmin={profile?.role === "admin"}
    />
  );
}
