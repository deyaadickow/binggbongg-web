// Steve, 2026-10-13: the (C) button copies a video link so it can be pasted onto a video the
// member is about to upload, which then shows a "Link" tab.
//
// On the phones (C) deliberately does NOT touch the system clipboard — Android 13+ draws its own
// clipboard overlay on every write and Steve asked for it gone, so the apps keep the link in
// their own storage and pre-fill the paste box from it. The web keeps the real clipboard write
// (on a desktop browser there is no overlay, and a URL you cannot paste into a message is half a
// feature) and remembers it here as WELL, so the upload page pre-fills exactly like the apps do.
//
// localStorage, not sessionStorage: copying on one tab and uploading on another is the normal way
// this gets used. Every access is wrapped — Safari private mode throws on read as well as write.
const KEY = "bb_copied_video_link";

export function rememberCopiedLink(url: string): void {
  try {
    localStorage.setItem(KEY, url);
  } catch {
    // Storage disabled or full. The clipboard copy already happened, so the member still has
    // the link; they just have to paste it themselves.
  }
}

/** The last link copied with (C), or "" — never null, so it can seed a text input directly. */
export function readCopiedLink(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

/** Build the link for a post. share_url comes from the backend; the fallback keeps (C) working
 *  against an older deploy, and produces the identical URL either way. */
export function videoShareUrl(post: { id: number; share_url?: string }): string {
  return post.share_url || `${window.location.origin}/video/${post.id}`;
}
