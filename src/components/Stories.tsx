// Stories that disappear after 24 hours (Steve, 2026-11-17, "Next").
//
//  - StoryRow: the round avatars at the top of Home — gold ring = something new, grey = seen. The
//    first circle is your own, with a small gold ＋ badge and "Your story". Guests don't see it.
//  - StoryViewer: full screen, one progress bar per story, photo 5 s / video its own length; tap
//    right = next, left = back, hold = pause, swipe down = close (and → ← Space Esc on a keyboard).
//    Goes on to the next member's stories. Your own: "👁 N viewers" and ⋯ → Delete. Someone else's:
//    "Send a message" opens your chat with them, starting "Replied to your story: …".
//  - StoryComposer: the camera (photo, or video up to 60 s) or a file from the gallery, a caption,
//    Post → presigned upload → createStory. Refusals come back in the gold popup.
//  - useUserStories + StoryRingAvatar: the ring on a profile's avatar.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { displayName, initials, mediaUrl, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import { CameraCapture, cameraSupported, type Capture } from "./CameraCapture";
import { videoDuration, videoThumbnail } from "../lib/upload";
import {
  STORY_MAX_SECONDS, STORY_PHOTO_SECONDS, createStory, deleteStory, fetchStoriesFeed, fetchStoryViewers, fetchUserStories,
  markStorySeen, socialPut, socialUploadUrls, socialUser, type Story, type StoryGroup, type StoryViewer as Viewer,
} from "../lib/social";

function ago(raw?: string): string {
  if (!raw) return "";
  const d = new Date(raw.length >= 19 && !raw.includes("T") ? raw.slice(0, 19).replace(" ", "T") + "Z" : raw);
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function Circle({ user, size = 62 }: { user?: Partial<UserSummary> | null; size?: number }) {
  const name = displayName(user);
  const src = mediaUrl(user?.profile_image);
  return (
    <span className="story-face" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {src ? <img src={src} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : initials(name || "?")}
    </span>
  );
}

// ---- The row on Home -----------------------------------------------------------------------------

export function StoryRow() {
  const { t } = useT();
  const { user } = useSession();
  const me = socialUser(user);
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [viewer, setViewer] = useState<{ groups: StoryGroup[]; start: number } | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    if (!me) return;
    fetchStoriesFeed(me.id).then(setGroups).catch(() => setGroups([]));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  if (!me) return null;
  const mine = groups.find((g) => g.is_me) ?? null;
  const others = groups.filter((g) => !g.is_me);

  const onSeen = (storyId: number) => setGroups((gs) => gs.map((g) => {
    if (!g.stories.some((s) => s.id === storyId)) return g;
    const stories = g.stories.map((s) => (s.id === storyId ? { ...s, seen: true } : s));
    return { ...g, stories, has_unseen: stories.some((s) => !s.seen) };
  }));

  return (
    <>
      <div className="story-row" role="list" aria-label={t("soc_stories")}>
        <div className="story-item" role="listitem">
          <button type="button" className={`story-ring${mine ? " seen" : " none"}`} aria-label={t("soc_your_story")}
            onClick={() => (mine ? setViewer({ groups: [mine], start: 0 }) : setComposing(true))}>
            <Circle user={user ?? me} />
          </button>
          <button type="button" className="story-badge" aria-label={t("soc_add_story")} onClick={() => setComposing(true)}>＋</button>
          <span className="story-name">{t("soc_your_story")}</span>
        </div>
        {others.map((g, i) => (
          <div key={g.user.id} className="story-item" role="listitem">
            <button type="button" className={`story-ring${g.has_unseen ? "" : " seen"}`} aria-label={displayName(g.user)}
              onClick={() => setViewer({ groups: others, start: i })}>
              <Circle user={g.user} />
            </button>
            <span className="story-name">{g.user.username || displayName(g.user)}</span>
          </div>
        ))}
      </div>
      {viewer && (
        <StoryViewer groups={viewer.groups} start={viewer.start} onClose={() => { setViewer(null); load(); }} onSeen={onSeen}
          onAdd={() => { setViewer(null); setComposing(true); }} />
      )}
      {composing && <StoryComposer onClose={() => setComposing(false)} onPosted={() => { setComposing(false); load(); }} />}
    </>
  );
}

// ---- A profile's ring ----------------------------------------------------------------------------

export function useUserStories(userId: number | null | undefined) {
  const { user } = useSession();
  const me = socialUser(user);
  const [stories, setStories] = useState<Story[]>([]);
  const reload = useCallback(() => {
    if (!userId) { setStories([]); return; }
    fetchUserStories(userId, me?.id).then(setStories).catch(() => setStories([]));
  }, [userId, me?.id]);
  useEffect(() => { reload(); }, [reload]);
  return { stories, reload };
}

/** The profile avatar: a gold ring while the member has live stories (grey once all are seen); tap opens them. */
export function StoryRingAvatar({ profile, children }: { profile: UserSummary; children: ReactNode }) {
  const { stories, reload } = useUserStories(profile.id);
  const [open, setOpen] = useState(false);
  if (!stories.length) return <>{children}</>;
  const unseen = stories.some((s) => !s.seen);
  const group: StoryGroup = { user: { id: profile.id, fullname: profile.fullname, username: profile.username, profile_image: profile.profile_image }, stories };
  return (
    <>
      <button type="button" className={`story-ring profile${unseen ? "" : " seen"}`} onClick={() => setOpen(true)} aria-label="Stories">
        {children}
      </button>
      {open && <StoryViewer groups={[group]} start={0} onClose={() => { setOpen(false); reload(); }} />}
    </>
  );
}

// ---- The viewer ----------------------------------------------------------------------------------

export function StoryViewer({ groups: initial, start, onClose, onSeen, onAdd }: {
  groups: StoryGroup[];
  start: number;
  onClose: () => void;
  onSeen?: (storyId: number) => void;
  onAdd?: () => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const me = socialUser(user);
  const [groups, setGroups] = useState(initial);
  const [gi, setGi] = useState(start);
  const firstUnseen = (g?: StoryGroup) => Math.max(0, g ? g.stories.findIndex((s) => !s.seen) : 0);
  const [si, setSi] = useState(() => firstUnseen(initial[start]));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [typing, setTyping] = useState(false);
  const [muted, setMuted] = useState(false);
  const [message, setMessage] = useState("");
  const [menu, setMenu] = useState(false);
  const [viewers, setViewers] = useState<{ list: Viewer[]; count: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const press = useRef<{ x: number; y: number; at: number; held: boolean } | null>(null);
  const holdTimer = useRef(0);

  const group = groups[gi];
  const story = group?.stories[si];
  const isMine = !!me && !!group && (group.is_me || Number(group.user.id) === Number(me.id));
  const stopped = paused || typing || menu || !!viewers;

  const next = useCallback(() => {
    setProgress(0);
    const g = groups[gi];
    if (g && si + 1 < g.stories.length) { setSi(si + 1); return; }
    if (gi + 1 < groups.length) { setGi(gi + 1); setSi(firstUnseen(groups[gi + 1])); return; }
    onClose();
  }, [groups, gi, si, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    if (si > 0) { setSi(si - 1); return; }
    if (gi > 0) { setGi(gi - 1); setSi(0); return; }
    const v = videoRef.current;
    if (v) v.currentTime = 0;
  }, [gi, si]);

  // Seen: once per story, never your own.
  useEffect(() => {
    if (!story || !me || isMine || story.seen) return;
    void markStorySeen(me.id, story.id);
    onSeen?.(story.id);
    setGroups((gs) => gs.map((g, i) => (i !== gi ? g : { ...g, stories: g.stories.map((s) => (s.id === story.id ? { ...s, seen: true } : s)) })));
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A photo runs on the clock; a video on its own time (see onTimeUpdate below).
  useEffect(() => {
    if (!story || story.media_type !== "photo" || stopped) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress((p) => {
        const np = p + dt / (STORY_PHOTO_SECONDS * 1000);
        if (np >= 1) { window.setTimeout(next, 0); return 1; }
        return np;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story?.id, story?.media_type, stopped, next]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || story?.media_type !== "video") return;
    if (stopped) v.pause();
    else v.play().catch(() => { v.muted = true; setMuted(true); void v.play().catch(() => undefined); });
  }, [stopped, story?.id, story?.media_type]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") { if (e.key === "Escape") (e.target as HTMLElement).blur(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") { e.preventDefault(); if (viewers) setViewers(null); else if (menu) setMenu(false); else onClose(); }
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose, menu, viewers]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  if (!group || !story) return null;

  function down(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, input, a, .story-viewers")) return;
    press.current = { x: e.clientX, y: e.clientY, at: Date.now(), held: false };
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => { if (press.current) { press.current.held = true; setPaused(true); } }, 220);
  }
  function up(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    window.clearTimeout(holdTimer.current);
    if (!p) return;
    if (p.held) { setPaused(false); return; }
    if (e.clientY - p.y > 80 && Math.abs(e.clientX - p.x) < 120) { onClose(); return; }
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - box.left < box.width * 0.35) prev(); else next();
  }

  async function remove() {
    if (!me || !story) return;
    setMenu(false);
    const yes = await showGoldConfirm({ message: t("soc_delete_story_q"), confirmLabel: t("soc_delete"), cancelLabel: t("cancel"), danger: true });
    if (!yes) return;
    try {
      await deleteStory(me.id, story.id);
      const left = group.stories.filter((s) => s.id !== story.id);
      if (!left.length) { onClose(); return; }
      setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, stories: left } : g)));
      setSi(Math.min(si, left.length - 1));
      setProgress(0);
    } catch (err) {
      showGoldAlert((err as Error).message || t("something_went_wrong"));
    }
  }

  async function openViewers() {
    if (!me || !story) return;
    try {
      const r = await fetchStoryViewers(me.id, story.id);
      setViewers({ list: r.viewers, count: r.count });
    } catch (err) {
      showGoldAlert((err as Error).message || t("something_went_wrong"));
    }
  }

  function sendMessage() {
    const text = message.trim();
    if (!text) return;
    if (!user) { navigate("/login"); return; }
    const preview = story?.caption ? ` (${story.caption.slice(0, 40)})` : "";
    navigate(`/messages/${group.user.id}`, { state: { draft: t("soc_replied_to_story", text) + preview } });
  }

  return (
    <div className="story-viewer" role="dialog" aria-label={t("soc_stories")}>
      <div className="story-stage" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { press.current = null; window.clearTimeout(holdTimer.current); setPaused(false); }}
        onContextMenu={(e) => e.preventDefault()}>
        {story.media_type === "video" ? (
          <video key={story.id} ref={videoRef} className="story-media" src={mediaUrl(story.media_url)} poster={mediaUrl(story.thumbnail)}
            autoPlay playsInline muted={muted}
            onTimeUpdate={(e) => { const v = e.currentTarget; const d = v.duration && isFinite(v.duration) ? v.duration : (story.duration || 1); setProgress(Math.min(1, v.currentTime / d)); }}
            onEnded={next} onError={() => window.setTimeout(next, 800)} />
        ) : (
          <img key={story.id} className="story-media" src={mediaUrl(story.media_url)} alt="" draggable={false} />
        )}

        <div className="story-bars">
          {group.stories.map((s, i) => (
            <span key={s.id} className="story-bar"><span style={{ width: `${i < si ? 100 : i > si ? 0 : Math.round(progress * 100)}%` }} /></span>
          ))}
        </div>
        <div className="story-head">
          <Link to={`/profile/${group.user.id}`} onClick={onClose} className="story-who">
            <Circle user={group.user} size={34} />
            <b>{isMine ? t("soc_your_story") : group.user.username || displayName(group.user)}</b>
            <span>{ago(story.created_at)}</span>
          </Link>
          {story.media_type === "video" && (
            <button type="button" className="story-icon" onClick={() => setMuted((m) => !m)} aria-label={muted ? t("soc_unmute") : t("soc_mute")}>{muted ? "🔇" : "🔊"}</button>
          )}
          {stopped && !typing && <span className="story-paused" aria-hidden>❚❚</span>}
          {isMine && <button type="button" className="story-icon" onClick={() => setMenu((m) => !m)} aria-label={t("soc_more")}>⋯</button>}
          <button type="button" className="story-icon" onClick={onClose} aria-label={t("close")}>✕</button>
        </div>
        {menu && (
          <div className="story-menu">
            {onAdd && <button type="button" className="btn" onClick={() => { setMenu(false); onAdd(); }}>＋ {t("soc_add_story")}</button>}
            <button type="button" className="btn" style={{ color: "#ff6b6b" }} onClick={() => void remove()}>{t("soc_delete")}</button>
            <button type="button" className="btn" onClick={() => setMenu(false)}>{t("cancel")}</button>
          </div>
        )}
        {story.caption && <div className="story-caption">{story.caption}</div>}

        <div className="story-foot">
          {isMine ? (
            <button type="button" className="btn small story-views" onClick={() => void openViewers()}>
              👁 {t("soc_n_viewers", Number(story.views_count ?? 0))}
            </button>
          ) : (
            <form className="story-reply" onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
              <input className="input" value={message} maxLength={300} placeholder={t("soc_send_a_message")}
                onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onChange={(e) => setMessage(e.target.value)} />
              <button type="submit" className="btn gold small" disabled={!message.trim()}>{t("send")}</button>
            </form>
          )}
        </div>

        {viewers && (
          <div className="story-viewers" onClick={() => setViewers(null)}>
            <div className="card pad" onClick={(e) => e.stopPropagation()}>
              <div className="card-title" style={{ textAlign: "center", marginBottom: 10 }}>👁 {t("soc_n_viewers", viewers.count)}</div>
              {viewers.list.length === 0 && <p className="muted center">{t("soc_no_viewers")}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
                {viewers.list.map((v) => (
                  <Link key={v.id} to={`/profile/${v.id}`} onClick={onClose} className="row" style={{ gap: 10, color: "var(--gold)" }}>
                    <Circle user={v} size={36} />
                    <span style={{ fontWeight: 700 }}>{v.username ? `@${v.username}` : displayName(v)}</span>
                    <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>{ago(v.viewed_at)}</span>
                  </Link>
                ))}
              </div>
              <button type="button" className="btn" style={{ width: "100%", marginTop: 12 }} onClick={() => setViewers(null)}>{t("close")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Posting a story -----------------------------------------------------------------------------

interface Picked { kind: "photo" | "video"; file: File; url: string; duration?: number; thumb?: Blob }

export function StoryComposer({ onClose, onPosted }: { onClose: () => void; onPosted: (s: Story) => void }) {
  const { t } = useT();
  const { user } = useSession();
  const me = socialUser(user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url); }, [picked]);

  async function onFile(f?: File | null) {
    if (!f) return;
    try {
      if (f.type.startsWith("image/")) {
        if (f.size > 20 * 1024 * 1024) throw new Error(t("soc_photo_too_big"));
        setPicked({ kind: "photo", file: f, url: URL.createObjectURL(f) });
      } else if (f.type.startsWith("video/")) {
        const d = await videoDuration(f);
        if (d > STORY_MAX_SECONDS + 1) throw new Error(t("soc_story_max_60"));
        const thumb = await videoThumbnail(f, 0.5).catch(() => undefined);
        setPicked({ kind: "video", file: f, url: URL.createObjectURL(f), duration: d, thumb });
      } else {
        throw new Error(t("soc_pick_photo_or_video"));
      }
    } catch (e) {
      showGoldAlert((e as Error).message);
    }
  }

  function onCapture(c: Capture) {
    setCamera(false);
    const file = new File([c.blob], `story.${c.ext}`, { type: c.contentType });
    setPicked({ kind: c.kind, file, url: URL.createObjectURL(c.blob), duration: c.duration, thumb: c.thumb });
  }

  async function postIt() {
    if (!me || !picked || busy) return;
    // The dev server never uploads to S3 or posts a story (lib/socialMock.ts).
    const mocked = import.meta.env.DEV;
    try {
      setBusy(t("soc_preparing"));
      const ext = picked.kind === "photo" ? (picked.file.type.split("/")[1] || "jpg").replace("jpeg", "jpg") : (picked.file.type.includes("mp4") ? "mp4" : picked.file.type.includes("quicktime") ? "mov" : "webm");
      const stamp = Date.now();
      const files = [{ file_name: `story_${stamp}.${ext}`, content_type: picked.file.type || (picked.kind === "photo" ? "image/jpeg" : "video/mp4") }];
      if (picked.kind === "video") files.push({ file_name: `story_${stamp}_thumb.jpg`, content_type: "image/jpeg" });
      const slots = await socialUploadUrls(me.id, files, mocked);
      if (slots.length !== files.length) throw new Error(t("couldn_t_prepare_the_upload"));
      if (picked.kind === "video") {
        if (!picked.thumb) throw new Error(t("couldn_t_create_a_thumbnail_for_that_vid"));
        await socialPut(slots[1], new File([picked.thumb], slots[1].file_name, { type: "image/jpeg" }));
      }
      await socialPut(slots[0], picked.file, (f) => setBusy(t("soc_uploading_pct", Math.round(f * 100))));
      setBusy(t("soc_checking"));
      const story = await createStory({
        myUserId: me.id, mediaType: picked.kind, mediaPath: slots[0].key,
        thumbnail: picked.kind === "video" ? slots[1].key : undefined, duration: picked.duration, caption,
      });
      onPosted(story);
      showGoldAlert(t("soc_story_up"));
    } catch (e) {
      showGoldAlert((e as Error).message || t("something_went_wrong"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="story-viewer" role="dialog" aria-label={t("soc_add_story")}>
      <div className="story-compose">
        <div className="cosmic-head" style={{ marginBottom: 10 }}>
          <button className="back-circle" onClick={onClose} aria-label={t("back")}>‹</button>
          <h1 className="page-title" style={{ margin: 0 }}>{t("soc_your_story")}</h1>
        </div>
        {camera ? (
          <CameraCapture allowPhoto maxSeconds={STORY_MAX_SECONDS} onDone={onCapture} onCancel={() => setCamera(false)} />
        ) : !picked ? (
          <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "center" }}>
            <p style={{ color: "var(--gold)", margin: 0 }}>{t("soc_story_explain")}</p>
            {cameraSupported() && <button className="btn gold" onClick={() => setCamera(true)}>📷 {t("soc_take_photo_or_video")}</button>}
            <button className="btn" onClick={() => fileRef.current?.click()}>🖼️ {t("soc_pick_from_gallery")}</button>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }}
              onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <div className="story-preview">
              {picked.kind === "photo"
                ? <img src={picked.url} alt="" />
                : <video src={picked.url} autoPlay muted loop playsInline />}
              {caption.trim() && <div className="story-caption">{caption}</div>}
            </div>
            <input className="input" value={caption} maxLength={200} placeholder={t("soc_add_caption")} onChange={(e) => setCaption(e.target.value)} />
            <div className="row" style={{ gap: 10, width: "100%" }}>
              <button className="btn" style={{ flex: 1 }} disabled={!!busy} onClick={() => { URL.revokeObjectURL(picked.url); setPicked(null); }}>{t("soc_retake")}</button>
              <button className="btn gold" style={{ flex: 1 }} disabled={!!busy} onClick={() => void postIt()}>{busy || t("soc_post")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
