// Bingg Bongg Features Videos (Steve, 2026-10-29): "Now that we have all these videos made of 60
// seconds each ... we should make another page that's called 'Bingg Bongg Features Videos' and add
// all the videos on that page with a header on each feature."
//
// One 60-second video per feature in the directory, each under its own gold heading. These are
// NOT the short videos on the directory's tiles (lib/featureVideos.ts) — those stay where they are.
// The list is a server table (fetchFeaturePageVideos), in its own order, so adding or reordering a
// video needs no release.
import { useCallback, useEffect, useState } from "react";
import { post, mediaUrl } from "../lib/api";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { FeatureVideoPlayer } from "../components/FeatureVideoPlayer";

interface FeaturePageVideoRow { id: number; sort: number; title: string; video: string; thumbnail?: string | null }
interface FeaturePageVideo { id: number; title: string; url: string; poster: string }

export function FeatureVideosPage() {
  const { t } = useT();
  const [videos, setVideos] = useState<FeaturePageVideo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<FeaturePageVideo | null>(null);

  // Keyed on nothing that re-creates (not the session user): the list is the same for everyone.
  const load = useCallback(async () => {
    setFailed(false);
    setVideos(null);
    try {
      // "platform" keeps the body non-empty — the host's firewall 403s an empty-body POST.
      const res = await post<FeaturePageVideoRow[]>("fetchFeaturePageVideos", { platform: "web" });
      if (!res.status) throw new Error(res.message || "failed");
      const rows = [...(res.data ?? [])].filter((r) => r.video).sort((a, b) => a.sort - b.sort);
      setVideos(rows.map((r) => ({ id: r.id, title: r.title, url: mediaUrl(r.video), poster: mediaUrl(r.thumbnail) })));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const closePlayer = useCallback(() => setPlaying(null), []);

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageTitle backTo="/features">{t("fname_feature_videos_page")}</PageTitle>
      {videos && videos.length > 0 && (
        <p className="muted" style={{ marginTop: -4 }}>{t("n_videos", videos.length)}</p>
      )}

      {failed ? (
        <div className="center" style={{ marginTop: 20 }}>
          <Notice error>{t("couldn_t_load_the_feature_videos")}</Notice>
          <button className="btn" style={{ marginTop: 12 }} onClick={load}>{t("try_again")}</button>
        </div>
      ) : videos === null ? (
        <Loading />
      ) : videos.length === 0 ? (
        <Notice>{t("no_videos_yet")}</Notice>
      ) : (
        <div style={{
          display: "grid", gap: 16, marginTop: 14,
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        }}>
          {videos.map((v) => (
            // The heading takes the spare height, so every card in a row lines up at the bottom
            // however many lines its title wraps to.
            <div key={v.id} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <h2 style={{
                flex: 1, display: "flex", alignItems: "flex-end", margin: "0 0 8px",
                color: "var(--gold)", fontSize: 15, fontWeight: 800, lineHeight: 1.25,
                overflowWrap: "anywhere",
              }}>
                {/* A dark plate, so the gold reads over the bright parts of the cosmic backdrop. */}
                <span style={{ background: "rgba(0,0,0,0.78)", borderRadius: 8, padding: "3px 8px" }}>{v.title}</span>
              </h2>
              <button onClick={() => setPlaying(v)} aria-label={`${t("watch_video")}: ${v.title}`} style={{
                position: "relative", display: "block", width: "100%", aspectRatio: "9 / 16", padding: 0,
                borderRadius: 14, border: "2px solid var(--gold-border)", overflow: "hidden",
                background: "#000", cursor: "pointer",
              }}>
                {v.poster && (
                  <img src={v.poster} alt="" loading="lazy" decoding="async"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                <span aria-hidden style={{
                  position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                  width: 56, height: 56, borderRadius: "50%", background: "rgba(0,0,0,0.75)",
                  border: "2px solid var(--gold-border)", color: "var(--gold)", fontSize: 22,
                  display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 4,
                }}>▶</span>
              </button>
            </div>
          ))}
        </div>
      )}
      {playing && <FeatureVideoPlayer url={playing.url} title={playing.title} onClose={closePlayer} />}
    </div>
  );
}
