import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user || profile?.role !== "admin") {
    redirect("/");
  }

  return <>{children}</>;
}
