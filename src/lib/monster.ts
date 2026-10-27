// Monster Videos (Steve, 2026-10-26: "Option 2 is beautiful ... 250 coins for each video ... they
// will own it ... Yes go for it"). The server is MonsterVideoController.
import { post } from "./api";
import { API_BASE, uploadErrorMessage } from "./upload";

export interface MonsterStyle { id: number; name: string; category: string; thumb?: string | null; coins: number }
export interface MonsterSettings { enabled: boolean; coins: number; styles?: MonsterStyle[] }
export interface MonsterVideo {
  id: number;
  status: "queued" | "processing" | "done" | "failed";
  style_name?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  coins_charged: number;
  refunded: boolean;
  posted: boolean;
}

export const isWorking = (v: MonsterVideo) => v.status === "queued" || v.status === "processing";

export async function fetchMonsterSettings(myUserId: number): Promise<MonsterSettings> {
  const res = await post<MonsterSettings>("fetchMonsterSettings", { my_user_id: myUserId }).catch(() => null);
  return res?.status ? (res.data ?? { enabled: false, coins: 250 }) : { enabled: false, coins: 250 };
}

export async function fetchMyMonsterVideos(myUserId: number): Promise<MonsterVideo[]> {
  const res = await post<MonsterVideo[]>("fetchMyMonsterVideos", { my_user_id: myUserId }).catch(() => null);
  return res?.status ? (res.data ?? []) : [];
}

export async function postMonsterVideo(myUserId: number, id: number): Promise<string> {
  const res = await post("postMonsterVideo", { my_user_id: myUserId, id }).catch(() => null);
  return res?.message || (res?.status ? "Posted to your feed." : "Couldn't post that.");
}

export async function deleteMonsterVideo(myUserId: number, id: number): Promise<boolean> {
  const res = await post("deleteMonsterVideo", { my_user_id: myUserId, id }).catch(() => null);
  return !!res?.status;
}

/** Multipart: the photo. The server answers straight away with a queued order. */
export function createMonsterVideo(myUserId: number, file: File, styleId: number, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("my_user_id", String(myUserId));
    form.append("style_id", String(styleId));
    form.append("photo", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + "createMonsterVideo", true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.timeout = 120000;
    xhr.onload = () => {
      let body: { status?: boolean; message?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* status check below */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.status) resolve(body.message || "Your Monster Video is being made.");
      else reject(new Error(body.message || uploadErrorMessage(xhr.status)));
    };
    xhr.ontimeout = () => reject(new Error("That took too long. Check My Monster Videos before trying again."));
    xhr.onerror = () => reject(new Error(uploadErrorMessage(0)));
    xhr.send(form);
  });
}
