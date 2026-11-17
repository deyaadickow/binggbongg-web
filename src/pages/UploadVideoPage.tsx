// Upload a video from the browser. Same pipeline the phones use since AWS keys were pulled out
// of the clients (2026-09-24): ask for a pre-signed url, PUT to S3 from here, then tell the
// backend the key. The thumbnail uploadPost requires is taken from the video itself rather than
// asked for separately.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readCopiedLink } from "../lib/copiedLink";
import { useLocation, useNavigate } from "react-router-dom";
import { post } from "../lib/api";
import { useSession } from "../lib/session";
import { videoDuration, videoThumbnail } from "../lib/upload";
import { socialPut, socialUploadPost, socialUploadUrls, socialUser, type ReplyComment } from "../lib/social";
import { EMPTY_STICKERS, StickerEditor, stickerParams, stickerProblem, type StickerState } from "../components/StickerEditor";
import { CameraCapture, cameraSupported, type Capture } from "../components/CameraCapture";
import { ReplyBubble } from "../components/SocialStickers";
import { Notice } from "../components/Common";
import { GoldSelect } from "../components/GoldSelect";
import { tt, useT  } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { requireVerified } from "../lib/verifyEmail";
import { showGoldAlert } from "../components/GoldToast";
import { songAttachPost } from "../lib/song";

interface ContestCat { id: number; name?: string | null }
interface CountryRow { name?: string | null; states?: { name?: string | null }[] }
/** Sent by the recorder (RemixRecorderPage): a Duet / Stitch of another post, or a video made with
 *  "Use this sound". Steve, 2026-11-16. */
type Remix =
  | { type: "duet" | "stitch"; postId: number; userName?: string; soundId?: number | null }
  | { type?: undefined; soundId: number; soundTitle?: string };

/** A sanity ceiling only — the server has the real say. Catches a wrong file before any bytes move. */
const MAX_MB = 512;

export function UploadVideoPage() {
  const { t } = useT();
  const { user: realUser } = useSession();
  // On the dev server the Social mock's pretend member may upload too — always to the mock.
  const user = socialUser(realUser);
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  // A Green Screen recording arrives with its own length and thumbnail: a recorded MP4 often
  // has no duration in its header and can't be seeked for a frame, so those come from the
  // recorder instead (see GreenScreenPage).
  const recordedThumbRef = useRef<Blob | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [cats, setCats] = useState<ContestCat[]>([]);
  const [countries, setCountries] = useState<CountryRow[]>([]);

  const [catId, setCatId] = useState<string>("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [description, setDescription] = useState("");
  // Steve, 2026-10-13: a link copied off another video with (C). Seeded from the last link
  // copied, so the usual journey — tap (C) on a video, come here to post — needs no paste at
  // all, which is how it already works on Android and iOS.
  const [linkedUrl, setLinkedUrl] = useState(readCopiedLink);
  const [canComment, setCanComment] = useState(true);
  const [canSave, setCanSave] = useState(true);
  const [allowRepost, setAllowRepost] = useState(true);
  // Duet / Stitch (Steve, 2026-11-16): whether other members may duet or stitch THIS video.
  const [canDuet, setCanDuet] = useState(true);
  const [canStitch, setCanStitch] = useState(true);
  const [remix, setRemix] = useState<Remix | null>(null);
  // Automatic captions (Steve, 2026-11-16): on by default. Text posts and slideshows are rendered
  // on the device and have no speech, so they say what they are instead (post_kind).
  const [autoCaptions, setAutoCaptions] = useState(true);
  const [postKind, setPostKind] = useState<"video" | "text" | "slideshow" | "song">("video");
  // Bingg Bongg Song (2026-11-16): the song whose video this is, linked to the post once it is up.
  const [songId, setSongId] = useState<number | null>(null);

  // Social (Steve, 2026-11-17): the comment this video answers, the Add Yours it joins, and the
  // poll / Add Yours / link stickers.
  const [replyComment, setReplyComment] = useState<Pick<ReplyComment, "id" | "post_id" | "comment" | "user_name" | "fullname"> | null>(null);
  const [joinAddYours, setJoinAddYours] = useState<{ id: number; prompt: string } | null>(null);
  const [stickers, setStickers] = useState<StickerState>(EMPTY_STICKERS);
  const [camera, setCamera] = useState(false);
  const [newPostId, setNewPostId] = useState(0);
  const stickersWanted = new URLSearchParams(location.search).get("stickers") === "1";

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    post<{ contestCats?: ContestCat[]; countryStates?: { data?: CountryRow[] } }>("fetchSettings", { x: 1 })
      .then((r) => {
        setCats((r.data?.contestCats ?? []).slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")));
        setCountries(r.data?.countryStates?.data ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const st = location.state as { greenScreen?: { file: File; duration: number; thumb: Blob | null }; remix?: Remix; postKind?: "text" | "slideshow" | "song"; songId?: number;
      replyComment?: Pick<ReplyComment, "id" | "post_id" | "comment" | "user_name" | "fullname">; addYours?: { id: number; prompt: string } } | null;
    const gs = st?.greenScreen;
    if (st?.replyComment?.id) setReplyComment(st.replyComment);
    if (st?.addYours?.id) setJoinAddYours(st.addYours);
    setRemix(st?.remix ?? null);
    setPostKind(st?.postKind === "text" || st?.postKind === "slideshow" || st?.postKind === "song" ? st.postKind : "video");
    setSongId(st?.postKind === "song" && st.songId ? Number(st.songId) : null);
    if (!gs?.file) return;
    setFile(gs.file);
    setDuration(gs.duration);
    recordedThumbRef.current = gs.thumb && gs.thumb.size ? gs.thumb : null;
  }, [location.state]);

  // Prefill the member's own country so most people never touch these two.
  useEffect(() => {
    if (user?.country && !country) setCountry(user.country);
  }, [user?.country, country]);

  const states = useMemo(
    () => countries.find((c) => c.name === country)?.states ?? [],
    [countries, country],
  );

  const pick = useCallback(async (f: File) => {
    setError("");
    setDuration(null);
    recordedThumbRef.current = null;
    setRemix(null); // a different file is no longer that duet / stitch / sound
    setPostKind("video");
    setSongId(null);
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(0)}MB — the limit is ${MAX_MB}MB.`);
      return;
    }
    setFile(f);
    try {
      setDuration(await videoDuration(f));
    } catch (e) {
      setError((e as Error).message);
      setFile(null);
    }
  }, []);

  function onCapture(c: Capture) {
    setCamera(false);
    setError("");
    setRemix(null);
    setPostKind("video");
    setSongId(null);
    setFile(new File([c.blob], `recording.${c.ext}`, { type: c.contentType }));
    setDuration(c.duration ?? null);
    recordedThumbRef.current = c.thumb ?? null;
  }

  async function upload() {
    if (!user || !file || busy) return;
    if (realUser && !requireVerified()) return; // browse first, verify before doing anything (2026-11-05)
    if (!catId) { setError(tt("pick_a_category")); return; }
    const problem = stickerProblem(stickers, t);
    if (problem) { setError(problem); return; }
    const social = { ...stickerParams(stickers, joinAddYours?.id), ...(replyComment ? { reply_comment_id: replyComment.id } : {}) };
    // Until backend 610de8b is deployed, the dev server sends a post with stickers or a comment
    // reply (and anything from the pretend member) to the mock, never to the live server.
    const mocked = import.meta.env.DEV && (Object.keys(social).length > 0 || !realUser);
    setBusy(true);
    setError("");
    try {
      setStage("Making a thumbnail…");
      const thumb = recordedThumbRef.current ?? await videoThumbnail(file);

      setStage("Preparing the upload…");
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const slots = await socialUploadUrls(user.id, [
        { file_name: safe, content_type: file.type || "video/mp4" },
        { file_name: safe.replace(/\.[^.]+$/, "") + "-thumb.jpg", content_type: "image/jpeg" },
      ], mocked);
      const [videoSlot, thumbSlot] = slots;
      if (!videoSlot || !thumbSlot) throw new Error(tt("couldn_t_prepare_the_upload_please_try_a"));

      setStage("Uploading your video…");
      await socialPut(videoSlot, file, setProgress);

      setStage("Uploading the thumbnail…");
      await socialPut(thumbSlot, new File([thumb], "thumb.jpg", { type: "image/jpeg" }));

      setStage("Publishing…");
      const res = await socialUploadPost({
        user_id: user.id,
        video: videoSlot.key,
        thumbnail: thumbSlot.key,
        can_comment: canComment ? 1 : 0,
        can_save: canSave ? 1 : 0,
        allow_repost: allowRepost ? 1 : 0,
        contest_cat_id: catId,
        // This was posted as `link` while the box was labelled Description — tbl_post.link is
        // the external-URL column, so web captions were being written there and never shown.
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(linkedUrl.trim() ? { linked_url: linkedUrl.trim() } : {}),
        ...(country ? { country } : {}),
        ...(state ? { state } : {}),
        post_kind: postKind,
        ...(postKind === "video" ? { auto_captions: autoCaptions ? 1 : 0 } : {}),
        can_duet: canDuet ? 1 : 0,
        can_stitch: canStitch ? 1 : 0,
        // A duet keeps the original's sound (so it shows on that sound's page); a stitch and a
        // plain upload send none and the server uses the video itself as an "Original sound".
        ...(remix?.soundId ? { sound_id: remix.soundId } : {}),
        ...(remix?.type ? { remix_type: remix.type, remix_post_id: remix.postId } : {}),
        ...social,
      }, mocked);
      if (!res.status) {
        const msg = res.message || tt("couldn_t_publish_that_video");
        showGoldAlert(msg);
        throw new Error(msg);
      }
      // A Bingg Bongg Song's video: link the new post to the song (top-level post_id).
      const newPostId = Number((res as { post_id?: unknown }).post_id ?? 0);
      setNewPostId(newPostId);
      if (songId && newPostId) {
        setStage("Publishing…");
        await songAttachPost(user.id, songId, newPostId).catch(() => undefined);
      }
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStage("");
      setProgress(0);
    }
  }

  if (!user) {
    return <div className="page"><Notice>{t("sign_in_to_upload_a_video")}</Notice></div>;
  }

  if (done) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <PageTitle>{t("upload_video")}</PageTitle>
        <div className="card pad">
          <p className="soft" style={{ marginTop: 0 }}>{t("uploaded_it_will_appear_on_your_profile")}</p>
          <div className="row">
            {newPostId > 0 && <button className="btn gold" onClick={() => navigate(`/video/${newPostId}`)}>{t("soc_open_video")}</button>}
            <button className="btn" onClick={() => navigate(`/profile/${user.id}`)}>{t("see_my_profile")}</button>
            <button className="btn ghost" onClick={() => { setDone(false); setFile(null); setRemix(null); setPostKind("video"); setSongId(null); setDuration(null); setDescription(""); setLinkedUrl(""); setStickers(EMPTY_STICKERS); setReplyComment(null); setJoinAddYours(null); setNewPostId(0); }}>{t("upload_another")}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("upload_video")}</PageTitle>

      {replyComment && (
        <div className="card pad" style={{ marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ color: "var(--gold)", fontWeight: 800 }}>🎥 {t("soc_replying_with_video")}</div>
          <ReplyBubble reply={replyComment} preview />
          <button className="btn small ghost" onClick={() => setReplyComment(null)}>{t("soc_dont_reply")}</button>
        </div>
      )}
      {camera && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <CameraCapture allowPhoto={false} maxSeconds={60} onDone={onCapture} onCancel={() => setCamera(false)}
            overlay={replyComment ? <ReplyBubble reply={replyComment} preview /> : undefined} />
        </div>
      )}
      <div className="card pad" style={{ marginBottom: 12 }}>
        <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
        {!file ? (
          <>
            <p className="soft" style={{ marginTop: 0 }}>{t("choose_a_video_up_to_mb", MAX_MB)}</p>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => fileRef.current?.click()}>{t("choose_video")}</button>
              {cameraSupported() && <button className="btn" onClick={() => setCamera(true)}>🎥 {t("soc_record_camera")}</button>}
              <button className="btn" onClick={() => navigate("/green-screen")}>🟩 {t("gs_record_with")}</button>
            </div>
            {/* Steve, 2026-11-16: the editor, Text posts and Photo slideshows. */}
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn" onClick={() => navigate("/editor")}>🎞️ {t("ed_title")}</button>
              <button className="btn" onClick={() => navigate("/text-post")}>🔤 {t("tp_title")}</button>
              <button className="btn" onClick={() => navigate("/slideshow")}>🖼️ {t("ss_title")}</button>
              <button className="btn" onClick={() => navigate("/bingg-bongg-song")}>♪ {t("song_title")}</button>
            </div>
          </>
        ) : (
          <div className="row" style={{ alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</b>
              <span className="muted" style={{ fontSize: 12 }}>
                {t("n_mb", (file.size / 1024 / 1024).toFixed(1))}{duration ? ` · ${Math.round(duration)}s` : ""}
              </span>
            </div>
            <button className="btn small ghost" disabled={busy} onClick={() => fileRef.current?.click()}>{t("change")}</button>
          </div>
        )}
      </div>

      {postKind !== "video" && file && (
        <div className="card pad" style={{ marginBottom: 12, color: "var(--gold)", fontWeight: 700, textAlign: "center" }}>
          {postKind === "text" ? t("tp_title") : postKind === "song" ? `♪ ${t("song_title")}` : t("ss_title")}
        </div>
      )}

      {remix && (
        <div className="card pad" style={{ marginBottom: 12, color: "var(--gold)", fontWeight: 700, textAlign: "center",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {remix.type === "duet" ? `Duet with @${remix.userName ?? ""}`
            : remix.type === "stitch" ? `Stitched from @${remix.userName ?? ""}`
            : `♪ ${("soundTitle" in remix && remix.soundTitle) || "Sound"}`}
        </div>
      )}

      <div className="card pad" style={{ marginBottom: 12 }}>
        <label className="soft" style={{ fontSize: 13 }}>{t("category")}</label>
        <GoldSelect
          ariaLabel="Category"
          placeholder={t("choose_a_category")}
          searchable
          value={catId}
          options={cats.map((c) => ({ value: String(c.id), label: c.name ?? "" }))}
          onChange={setCatId}
          style={{ marginBottom: 10 }}
        />

        <label className="soft" style={{ fontSize: 13 }}>{t("_description")}</label>
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={t("say_something_about_this_video")} style={{ width: "100%", marginBottom: 10 }} />

        {/* Steve, 2026-10-13: paste a link copied with (C) and this video carries a "Link" tab
            straight to the one you pasted. */}
        <label className="soft" style={{ fontSize: 13 }}>{t("linked_video")}</label>
        <input className="input" value={linkedUrl} onChange={(e) => setLinkedUrl(e.target.value)}
          placeholder={t("paste_a_copied_video_link")}
          style={{ width: "100%", marginBottom: 10, textAlign: "center" }} />

        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="soft" style={{ fontSize: 13 }}>{t("battle_tab_country")}</label>
            <GoldSelect
              ariaLabel="Country"
              placeholder="—"
              searchable
              value={country}
              options={countries.map((c) => ({ value: c.name ?? "", label: c.name ?? "" }))}
              onChange={(v) => { setCountry(v); setState(""); }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="soft" style={{ fontSize: 13 }}>{t("state")}</label>
            <GoldSelect
              ariaLabel="State"
              placeholder="—"
              searchable
              disabled={!states.length}
              value={state}
              options={states.map((s) => ({ value: s.name ?? "", label: s.name ?? "" }))}
              onChange={setState}
            />
          </div>
        </div>
      </div>

      <StickerEditor value={stickers} onChange={setStickers} file={file} join={joinAddYours} reply={replyComment}
        open={stickersWanted || !!joinAddYours} />

      <div className="card" style={{ marginBottom: 12 }}>
        {([
          ["Allow comments", canComment, setCanComment],
          ["Allow saving", canSave, setCanSave],
          ["Allow reposting", allowRepost, setAllowRepost],
          ["Allow Duet", canDuet, setCanDuet],
          ["Allow Stitch", canStitch, setCanStitch],
          ...(postKind === "video" ? [[t("ac_auto_captions"), autoCaptions, setAutoCaptions]] : []),
        ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
          <label key={label} className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <div style={{ flex: 1, fontWeight: 700 }}>{label}</div>
            <input type="checkbox" className="switch" checked={val} onChange={(e) => set(e.target.checked)} />
          </label>
        ))}
      </div>

      {error && <p style={{ color: "#f55", fontSize: 13 }}>{error}</p>}

      {busy && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{stage}</div>
          <div style={{ height: 8, background: "var(--panel)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "var(--gold-border)", transition: "width .2s" }} />
          </div>
        </div>
      )}

      <button className="btn block" disabled={busy || !file} onClick={upload}
        style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
        {busy ? "Uploading…" : "Upload video"}
      </button>
    </div>
  );
}
