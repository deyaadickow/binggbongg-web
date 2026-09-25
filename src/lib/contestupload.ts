// Entering a talent contest.
//
// Steve, 2026-09-25: "every time i create any contest, i want that contest upload to be created
// automatically with the full name of that contest. and it will show only for that country or
// countries that i create."
//
// That is already how the backend behaves — fetchOfficialContestsOpenForUpload returns only
// contests that are active, inside their dates, and whose country list accepts THIS member's
// country. So nothing needs generating per contest: the client just renders one entry per
// contest that comes back, titled with the contest's own name. Create a contest in admin and
// its entry appears for the right members on its own; end it and the entry goes.
import { API_BASE, post } from "./api";

export interface OpenContest {
  id: number;
  name?: string | null;
  country_name?: string | null;
  countries?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
  prize_amount?: number | null;
  prize_tiers?: { rank?: number | null; prize_amount?: number | null }[] | null;
  rules?: string[] | null;
  max_video_seconds?: number | null;
  max_videos_per_user?: number | null;
  my_video_count?: number | null;
  /** null means unlimited, matching max_videos_per_user's own null-means-unlimited. */
  my_uploads_remaining?: number | null;
}

export async function fetchOpenContests(userId: number): Promise<OpenContest[]> {
  const res = await post<OpenContest[]>("fetchOfficialContestsOpenForUpload", { user_id: userId });
  return res.status ? (res.data ?? []) : [];
}

/** Enter with a video already on the member's profile — no upload, the server copies the post. */
export async function enterWithExistingVideo(userId: number, contestId: number, postId: number): Promise<void> {
  const res = await post("enterOfficialContestWithExistingVideo", {
    user_id: userId,
    official_contest_id: contestId,
    post_id: postId,
  });
  if (!res.status) throw new Error(res.message ?? "Couldn't enter that contest.");
}

/**
 * Multipart, like photos rather than like the video feed upload: the server runs Hive
 * moderation BEFORE persisting anything, so a flagged video never becomes a row at all.
 * Entering is free — there is deliberately no balance check on this path.
 */
export function uploadContestVideo(
  userId: number,
  contestId: number,
  file: File,
  durationSeconds: number | null,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("user_id", String(userId));
    form.append("official_contest_id", String(contestId));
    form.append("video", file);
    if (durationSeconds != null) form.append("duration_seconds", String(Math.round(durationSeconds)));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + "uploadOfficialContestVideo", true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { status?: boolean; message?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* falls through to the status check */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.status) resolve();
      else reject(new Error(body.message ?? `Upload failed (${xhr.status}). Please try again.`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(form);
  });
}
