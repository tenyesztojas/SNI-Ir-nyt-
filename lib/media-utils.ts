/** YouTube URL-ből embed URL kinyerése
 * Támogatott formátumok:
 *   youtube.com/watch?v=ID
 *   youtube.com/live/ID
 *   youtube.com/shorts/ID
 *   youtube.com/embed/ID
 *   youtu.be/ID
 */
export function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let videoId: string | null = null;
    if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1).split("?")[0];
    } else if (u.hostname.includes("youtube.com")) {
      // /watch?v=ID
      videoId = u.searchParams.get("v");
      if (!videoId) {
        // /live/ID  /shorts/ID  /embed/ID
        const match = u.pathname.match(/^\/(live|shorts|embed)\/([^/?]+)/);
        if (match) videoId = match[2];
      }
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
