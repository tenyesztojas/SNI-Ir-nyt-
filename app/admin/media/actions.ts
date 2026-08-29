"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getYoutubeEmbedUrl, detectMediaType } from "@/lib/media-utils";

export async function addMediaAppearance(formData: FormData) {
  const admin = createAdminClient();

  const title = (formData.get("title") as string)?.trim();
  const url   = (formData.get("url")   as string)?.trim();
  const published_at = (formData.get("published_at") as string) || null;

  if (!title || !url) throw new Error("Cím és URL kötelező.");

  const type = detectMediaType(url);

  if (type === "youtube" && !getYoutubeEmbedUrl(url)) {
    throw new Error("Érvénytelen YouTube URL.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nincs beállítva a szerveren.");
  }

  const { error } = await admin
    .from("media_appearances")
    .insert({ title, url, type, published_at });

  if (error) throw new Error(error.message);

  revalidatePath("/rolunk");
  revalidatePath("/admin/media");
}

export async function deleteMediaAppearance(id: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("media_appearances").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/rolunk");
  revalidatePath("/admin/media");
}

export async function updateMediaSortOrder(id: string, sortOrder: number) {
  const admin = createAdminClient();
  await admin.from("media_appearances").update({ sort_order: sortOrder }).eq("id", id);
  revalidatePath("/rolunk");
  revalidatePath("/admin/media");
}
