// Inbox -> Announcements (Steve, 2026-11-09): "Video Announcement of the day ... a link to that
// video which will be on our app. They will have to login to Bingg Bongg with their account to see
// the announcement video." + "Make it in English and Tagalog so they can see both videos if they
// want".
//
// The same list the phones show under Inbox -> Announcements: fetchAdminNotification
// (tbl_admin_notification). The video and Tagalog columns are new and nullable — rows written
// before them simply have no video, and are shown as the plain text cards they always were.
import { mediaUrl, post } from "./api";

export interface Announcement {
  id: number;
  title: string;
  message: string;
  titleFil: string | null;
  messageFil: string | null;
  /** Full URL of the image the admin attached, or "" for none. */
  image: string;
  videoEn: string | null;
  videoFil: string | null;
  poster: string | null;
  createdAt: string | null;
  /** The built-in last card from settings.welcome_message — not a real row, never linkable. */
  welcome?: boolean;
}

export type AnnouncementLang = "en" | "fil";

interface RawRow {
  id?: number | string;
  title?: string | null;
  message?: string | null;
  image?: string | null;
  created_at?: string | null;
  title_fil?: string | null;
  message_fil?: string | null;
  video_url?: string | null;
  video_fil_url?: string | null;
  video_poster_url?: string | null;
}

/** "" and whitespace are "not there" — an admin clearing a field leaves an empty string. */
const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function fromRaw(r: RawRow): Announcement {
  return {
    id: Number(r.id ?? 0),
    title: clean(r.title) ?? "",
    message: clean(r.message) ?? "",
    titleFil: clean(r.title_fil),
    messageFil: clean(r.message_fil),
    image: mediaUrl(clean(r.image)),
    videoEn: clean(r.video_url),
    videoFil: clean(r.video_fil_url),
    poster: clean(r.video_poster_url),
    createdAt: clean(r.created_at),
  };
}

export const ANNOUNCEMENTS_PAGE = 20;

/** One page, newest first (the server's own order). */
export async function fetchAnnouncements(start: number, count = ANNOUNCEMENTS_PAGE): Promise<Announcement[]> {
  const res = await post<RawRow[]>("fetchAdminNotification", { start, count });
  if (res.status === false) throw new Error(res.message || "Could not load the announcements.");
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map(fromRaw).filter((a) => a.id > 0);
}

/** settings.welcome_message — the phones show it as the last card, titled with the app's name. */
let welcomeCache: Promise<string | null> | null = null;
export function fetchWelcomeMessage(): Promise<string | null> {
  welcomeCache ??= post<{ welcome_message?: string | null }>("fetchSettings", { x: 1 })
    .then((r) => clean(r.data?.welcome_message))
    .catch(() => { welcomeCache = null; return null; });
  return welcomeCache;
}

/** The videos an announcement has, in the order its buttons are drawn: Tagalog first for a
 *  member reading the site in Filipino, English first for everyone else. */
export function videoLangs(a: Announcement, filipinoReader: boolean): AnnouncementLang[] {
  const have: AnnouncementLang[] = [];
  if (a.videoEn) have.push("en");
  if (a.videoFil) have.push("fil");
  return filipinoReader ? have.reverse() : have;
}

export function videoFor(a: Announcement, lang: AnnouncementLang): string | null {
  return lang === "fil" ? a.videoFil : a.videoEn;
}

/** The site language codes that read Filipino (fil and tl are the same dictionary). */
export const isFilipinoLang = (lang: string) => lang === "fil" || lang === "tl";
