/**
 * Profile video folders (Steve, 2026-11-20: "give the member the ability to create as many
 * folders as they want so they can upload different category videos ... Dancing, Singing, their
 * wedding ETC."). A video is in at most one folder. Deleting a folder keeps its videos.
 *
 * Read: fetchPostFolders (user_id = the profile). Writes go through authorizeUser, which binds
 * user_id to the signed-in member, so the server never trusts the id we send for ownership.
 * A folder's videos come from fetchUserPosts with folder_id (pinned still first).
 */
import { post } from "./api";

export interface PostFolder {
  id: number;
  user_id: number;
  name: string;
  sort: number;
  post_count: number;
  cover?: string | null;
  /** A numbered series: the owner's order, #1 first (2026-11-20). */
  is_series?: boolean;
}

export const FOLDER_NAME_MAX = 30;

type FolderReply = { data?: PostFolder[]; folder?: PostFolder; code?: string; message?: string; status?: boolean };

export async function fetchPostFolders(profileId: number): Promise<PostFolder[]> {
  try {
    const r = (await post<PostFolder[]>("fetchPostFolders", { user_id: profileId })) as unknown as FolderReply;
    return Array.isArray(r.data) ? r.data : [];
  } catch {
    return [];
  }
}

async function write(endpoint: string, params: Record<string, unknown>): Promise<FolderReply> {
  return (await post(endpoint, params)) as unknown as FolderReply;
}

export const createPostFolder = (myId: number, name: string) => write("createPostFolder", { user_id: myId, name });
/** Create Series the Create Playlist way (2026-11-20): a numbered folder with these videos, #1 first. */
export const createFolderSeries = (myId: number, name: string, postIds: number[]) =>
  write("createFolderSeries", { user_id: myId, name, post_ids: postIds.join(",") });
/** Every video of a member (folders included) for the Create Series picker. */
export async function fetchAllMyVideos(profileId: number): Promise<FolderVideo[]> {
  const r = (await post("fetchUserPosts", { user_id: profileId, start: 0, count: 300 })) as unknown as { data?: FolderVideo[] };
  return Array.isArray(r.data) ? r.data : [];
}
export const renamePostFolder = (myId: number, folderId: number, name: string) =>
  write("renamePostFolder", { user_id: myId, folder_id: folderId, name });
export const deletePostFolder = (myId: number, folderId: number) =>
  write("deletePostFolder", { user_id: myId, folder_id: folderId });
/** folderId 0 = take the video out of its folder. */
export const setPostFolder = (myId: number, postId: number, folderId: number) =>
  write("setPostFolder", { user_id: myId, post_id: postId, folder_id: folderId });

/** Fired after any folder change so every open folder row refreshes. */
export const FOLDERS_CHANGED = "bb:post-folders-changed";
export function announceFoldersChanged() {
  window.dispatchEvent(new Event(FOLDERS_CHANGED));
}

// ---- Numbered series (Steve, 2026-11-20: "organize and number their videos ... from video #1
// through Video #100"). A series folder lists in the owner's order, #1 first.
export const setFolderSeries = (myId: number, folderId: number, on: boolean) =>
  write("setFolderSeries", { user_id: myId, folder_id: folderId, on: on ? 1 : 0 });

/** Give a video number `position` in its folder; the rest shift. Answers the new order (ids). */
export async function setPostPosition(myId: number, postId: number, position: number): Promise<{ ok: boolean; order: number[]; count?: number; message?: string }> {
  const r = (await post("setPostPosition", { user_id: myId, post_id: postId, position })) as unknown as { status?: boolean; order?: number[]; count?: number; message?: string };
  return { ok: !!r.status, order: Array.isArray(r.order) ? r.order.map(Number) : [], count: r.count, message: r.message };
}

/** The folder editor (2026-11-20): the whole order, top = #1. Saving makes the folder a series. */
export async function setFolderOrder(myId: number, folderId: number, postIds: number[]): Promise<{ ok: boolean; message?: string }> {
  const r = (await post("setFolderOrder", { user_id: myId, folder_id: folderId, post_ids: postIds.join(",") })) as unknown as { status?: boolean; message?: string };
  return { ok: !!r.status, message: r.message };
}

export interface FolderVideo { id: number; thumbnail?: string | null; description?: string | null; folder_pos?: number | null }

/** A folder's videos in its current order, for the editor. */
export async function fetchFolderVideos(profileId: number, folderId: number): Promise<FolderVideo[]> {
  const r = (await post("fetchUserPosts", { user_id: profileId, folder_id: folderId, start: 0, count: 300 })) as unknown as { data?: FolderVideo[] };
  return Array.isArray(r.data) ? r.data : [];
}

export interface SeriesInfo { is_series: boolean; position?: number; count?: number; folder_name?: string; prev_id?: number | null; next_id?: number | null }

export async function fetchPostSeriesInfo(postId: number): Promise<SeriesInfo> {
  try {
    return (await post("fetchPostSeriesInfo", { post_id: postId })) as unknown as SeriesInfo;
  } catch {
    return { is_series: false };
  }
}
