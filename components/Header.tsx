import { unstable_noStore as noStore } from "next/cache";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getUnreadNotificationCount } from "@/lib/community/data";
import HeaderClient from "./HeaderClient";

export default async function Header() {
  noStore(); // mindig friss adatot olvas, nem cache-elt RSC outputot
  const { user, profile } = await getCurrentUserAndProfile();
  const unreadCount = user ? await getUnreadNotificationCount() : 0;

  return (
    <HeaderClient
      isLoggedIn={!!user}
      displayName={profile?.displayName}
      isAdmin={profile?.role === "admin"}
      communityUnread={unreadCount}
      pilotAccess={profile?.pilotAccess ?? []}
    />
  );
}
