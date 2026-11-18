// Bingg Bongg AI Assistant on the Home feed (Steve, 2026-11-18): "An I-con with Bingg or Bongg's face
// on the I-con. When a member clicks this I-con a popup page will appear with 3 questions ... When
// they click on the yes, show them that feature. We will have many many of these pages with
// different questions about Bingg Bongg."
//
// The pages come from the server (admin "AI Assistant Pages"), already in the member's language.
// Each question's YES targets a Features-directory tile by its key (videoKey ?? nameKey): "open"
// does what tapping the tile does, "video" plays the tile's feature video.
//
//   fetchFeedAssistant  checkHeader — { language, after_id } -> { enabled, order, total, page }
import { post } from "./api";

export interface FaQuestion { text: string; action: "open" | "video"; tile: string; target: string }
export interface FaPage {
  id: number;
  position: number;
  assistant: "bingg" | "bongg";
  name: string;
  greeting: string;
  questions: FaQuestion[];
  language: string;
}
export interface FaState { enabled: boolean; order: "next" | "random"; total: number; page: FaPage | null }

const LAST_KEY = "feed_assistant_last_id";

export function lastShownId(): number {
  try { return Number(localStorage.getItem(LAST_KEY) ?? 0) || 0; } catch { return 0; }
}

export function rememberShown(id: number) {
  try { localStorage.setItem(LAST_KEY, String(id)); } catch { /* private mode */ }
}

/** The page after `afterId` (or a random one), translated by the server. Null on any failure. */
export async function fetchFeedAssistant(language: string, afterId = lastShownId()): Promise<FaState | null> {
  try {
    const res = await post<FaState>("fetchFeedAssistant", { language, after_id: afterId });
    return res.status && res.data ? res.data : null;
  } catch {
    return null;
  }
}

export const assistantFace = (who?: string) => (who === "bongg" ? "/img/assistant_bongg.jpg" : "/img/assistant_bingg.jpg");

/** Opens the popup from anywhere (the Features tile uses "/?assistant=1" instead). */
export const OPEN_EVENT = "bb:open-feed-assistant";
export function openFeedAssistant() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
