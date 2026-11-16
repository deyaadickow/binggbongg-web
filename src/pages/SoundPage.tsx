// The sound page (Steve, 2026-11-16: "Build Duet, Stitch and sounds on all 3 platforms" / "Show
// the sound line"). Opened from the "♪ title" line under a video and from the turning-record row
// of the hold menu: the sound's cover, title and singer, every video that uses it (paged, newest
// first, same as the phones), a favourite heart, and "Use this sound", which opens the recorder
// with this sound playing and mixed into the recording.
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPostsBySound, mediaUrl, post, type Post, type Sound } from "../lib/api";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { PostCard } from "../components/PostCard";
import { showGoldAlert } from "../components/GoldToast";
import { appendToFeed } from "../lib/feed";

const PAGE = 18;

export function SoundPage() {
  const { id } = useParams();
  const soundId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn } = useSession();
  const [sound, setSound] = useState<Sound | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState("");
  const [favIds, setFavIds] = useState<string[] | null>(null);

  const load = useCallback(async (start: number) => {
    setLoading(true);
    try {
      const r = await fetchPostsBySound(soundId, start, PAGE, user?.id);
      if (r.sound) setSound(r.sound);
      setPosts((cur) => (start === 0 ? r.posts : [...cur, ...r.posts]));
      // Opening one of these videos plays it in the normal player with this list as its queue.
      if (r.posts.length) appendToFeed(r.posts);
      setMore(r.posts.length >= PAGE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [soundId, user?.id]);

  useEffect(() => {
    if (!soundId) { setError("That sound isn't available."); setLoading(false); return; }
    setPosts([]);
    void load(0);
  }, [soundId, load]);

  useEffect(() => {
    if (!user) { setFavIds(null); return; }
    post<Sound[]>("fetchFavouriteSound", { user_id: user.id })
      .then((r) => setFavIds((r.data ?? []).map((s) => String(s.id)).filter(Boolean)))
      .catch(() => setFavIds(null));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFav = !!favIds?.includes(String(soundId));

  async function toggleFav() {
    if (!isLoggedIn || !user) { navigate("/login", { state: { from: location.pathname } }); return; }
    if (!favIds) return;
    const next = isFav ? favIds.filter((x) => x !== String(soundId)) : [...favIds, String(soundId)];
    setFavIds(next);
    try {
      const r = await post("updateFavouriteSound", { user_id: user.id, favourite_sounds: next.join(",") });
      if (!r.status) throw new Error(r.message || "");
    } catch (e) {
      setFavIds(favIds);
      showGoldAlert((e as Error).message || "Couldn't save that. Please try again.");
    }
  }

  function openRecorder() {
    if (!isLoggedIn || !user) { navigate("/login", { state: { from: location.pathname } }); return; }
    navigate(`/record/sound/${soundId}`);
  }

  if (error && !sound) return <div className="page"><PageTitle>Sound</PageTitle><Notice error>{error}</Notice></div>;

  const cover = mediaUrl(sound?.image);
  return (
    <div className="page">
      <PageTitle>Sound</PageTitle>
      <div className="card pad" style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ width: 96, height: 96, borderRadius: 12, overflow: "hidden", border: "2px solid var(--gold-border)", background: "#000",
          flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: "var(--gold)" }}>
          {cover ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : "♪"}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 800, fontSize: 19, color: "var(--gold)", wordBreak: "break-word" }}>♪ {sound?.title || "Sound"}</div>
          {sound?.singer && <div className="soft" style={{ marginTop: 4 }}>{sound.singer}</div>}
          {!!sound?.video_count && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{sound.video_count} {sound.video_count === 1 ? "video" : "videos"}</div>}
        </div>
        <div className="row" style={{ gap: 10 }}>
          {(favIds !== null || !isLoggedIn) && (
            <button className="btn ghost" onClick={toggleFav} aria-pressed={isFav} title={isFav ? "Remove from favourites" : "Add to favourites"}
              style={{ color: "var(--gold)", borderColor: "var(--gold-border)" }}>
              {isFav ? "♥ Favourite" : "♡ Favourite"}
            </button>
          )}
          <button className="btn" onClick={openRecorder} disabled={!sound?.sound}
            style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
            Use this sound
          </button>
        </div>
      </div>

      {posts.length > 0 && <div className="grid">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>}
      {loading && <Loading />}
      {!loading && posts.length === 0 && <Notice>No videos use this sound yet.</Notice>}
      {!loading && more && posts.length > 0 && (
        <div style={{ textAlign: "center", margin: "16px 0" }}>
          <button className="btn ghost" onClick={() => load(posts.length)}>Load more</button>
        </div>
      )}
    </div>
  );
}
