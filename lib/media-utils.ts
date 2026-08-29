/** YouTube URL-ből embed URL kinyerése (youtu.be + youtube.com/watch?v=) */
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

/** Típus automatikus felismerése az URL alapján */
export function detectMediaType(url: string): "youtube" | "article" {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  return "article";
}
