"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reportSchema, ReportInput } from "@/lib/schemas";
import { isCurrentUserAdmin } from "@/lib/data";

export async function submitReport(input: ReportInput): Promise<{ error?: string }> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Hibás vagy hiányos adatok." };
  }
  const data = parsed.data;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { error: "A hibajelentéshez be kell jelentkezned." };
  }

  const { error } = await supabase.from("reports").insert({
    place_id: data.placeId,
    report_type: data.reportType,
    description: data.description,
    reported_by: user.id,
  });

  if (error) {
    return { error: "Nem sikerült elküldeni a jelzést. Próbáld újra." };
  }

  revalidatePath("/admin/jelzesek");
  return {};
}

export async function decideReport(
  reportId: string,
  decision: "resolved" | "dismissed"
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    return { error: "Nincs jogosultságod ehhez a művelethez." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("reports").update({ status: decision }).eq("id", reportId);

  if (error) {
    return { error: "Nem sikerült a státusz frissítése." };
  }

  revalidatePath("/admin/jelzesek");
  revalidatePath("/admin");
  return {};
}
