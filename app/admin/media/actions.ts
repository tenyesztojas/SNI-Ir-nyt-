"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// YouTube URL-ből embed URL kinyerése
export function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let videoId: string | null = null;
    if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1);
    } else if (u.hostname.includes("youtube.com")) {
      videoId = u.searchParams.get("v");
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

// Típus automatikus felismerése az URL alapján
function detectType(url: string): "youtube" | "article" {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  return "article";
}

export async function addMediaAppearance(formData: FormData) {
  const admin = createAdminClient();

  const title = (formData.get("title") as string)?.trim();
  const url   = (formData.get("url")   as string)?.trim();
  const published_at = (formData.get("published_at") as string) || null;

  if (!title || !url) throw new Error("Cím és URL kötelező.");

  const type = detectType(url);

  // YouTube esetén ellenőrizzük, hogy kinyerhető-e a video ID
  if (type === "youtube" && !getYoutubeEmbedUrl(url)) {
    throw new Error("Érvénytelen YouTube URL.");
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
