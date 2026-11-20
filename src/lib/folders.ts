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
