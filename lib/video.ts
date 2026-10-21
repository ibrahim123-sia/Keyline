/**
 * Video links (listing videos, the page builder's video section). YouTube and Vimeo become
 * privacy-friendly embeds; other https links to a video file play in a <video> element.
 */
export function videoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const id =
        u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.match(/^\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "player.vimeo.com") return url;
  } catch {
    return null;
  }
  return null;
}

/** YouTube's own still for a video, used when no poster image was chosen. */
export function videoThumbnailUrl(url: string): string | null {
  const embed = videoEmbedUrl(url);
  const id = embed?.match(/youtube-nocookie\.com\/embed\/([\w-]+)/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** An https link to a video file (or one in the media library) that a <video> can play. */
export function isVideoFileUrl(url: string): boolean {
  if (/^\/media\/[^\s"'<>]+\.(mp4|webm|mov|m4v)$/i.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /\.(mp4|webm|mov|m4v)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** True when the page builder can show this link: an embeddable service or a video file. */
export function isPlayableVideoUrl(url: string): boolean {
  return videoEmbedUrl(url) !== null || isVideoFileUrl(url);
}
