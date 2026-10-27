// Monster Videos — Steve, 2026-10-26: "Option 2 is beautiful" ... "We can charge 250 coins for each
// video that's $5 and they will own it" ... "Yes go for it". The browser's half of the phones'
// screen, built on CartoonPage: signed in only, price from the server, one confirm naming it, the
// button dead until the server answers. The video is made AFTER the answer (about a minute), so
// "My Monster Videos" re-asks every 10 s while anything is still being made.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { currentAuthHeaders } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice } from "../components/Common";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import {
  createMonsterVideo, deleteMonsterVideo, fetchMonsterSettings, fetchMyMonsterVideos, isWorking, postMonsterVideo,
  type MonsterStyle, type MonsterVideo,
} from "../lib/monster";

export function MonsterPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [coins, setCoins] = useState(250);
  const [styles, setStyles] = useState<MonsterStyle[]>([]);
  const [styleId, setStyleId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [picked, setPicked] = useState<File | null>(null);
  const [pickedUrl, setPickedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<MonsterVideo[]>([]);
  const [playing, setPlaying] = useState<MonsterVideo | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchMonsterSettings(user.id).then((s) => {
      setCoins(s.coins ?? 250);
      setEnabled(s.enabled !== false);
      setStyles(s.styles ?? []);
      setStyleId((prev) => prev ?? s.styles?.[0]?.id ?? null);
    });
  }, [user]);

  const refresh = useCallback(() => {
    if (user) fetchMyMonsterVideos(user.id).then(setVideos);
  }, [user]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!videos.some(isWorking)) return;
    const id = window.setTimeout(refresh, 10000);
    return () => window.clearTimeout(id);
  }, [videos, refresh]);

  const chosen = useMemo(() => styles.find((s) => s.id === styleId) ?? null, [styles, styleId]);
  const price = chosen?.coins || coins;
  const categories = useMemo(() => [...new Set(styles.map((s) => s.category))], [styles]);

  useEffect(() => () => { if (pickedUrl) URL.revokeObjectURL(pickedUrl); }, [pickedUrl]);
  const choose = (file?: File) => {
    if (!file) return;
    if (pickedUrl) URL.revokeObjectURL(pickedUrl);
    setPicked(file);
    setPickedUrl(URL.createObjectURL(file));
    setError("");
    setNote("");
  };

  async function run() {
    if (!user || !picked || !chosen || busy) return;
    if (!window.confirm(t("monster_confirm_cost", price))) return;
    setBusy(true);
    setError("");
    try {
      setNote(await createMonsterVideo(user.id, picked, chosen.id, currentAuthHeaders()));
      setPicked(null); // pick again to pay again
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="page">
        <PageTitle>{t("fname_monster_videos")}</PageTitle>
        <Notice><Link to="/login">{t("sign_in_2")}</Link></Notice>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("fname_monster_videos")}</PageTitle>
      <p className="soft">{t("monster_intro")}</p>

      <div style={{ background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 260, overflow: "hidden" }}>
        {pickedUrl ? <img src={pickedUrl} alt="" style={{ width: "100%", maxHeight: 420, objectFit: "contain" }} />
          : chosen?.thumb ? <img src={chosen.thumb} alt="" style={{ maxWidth: "100%", maxHeight: 420 }} />
          : <span className="muted">{t("monster_pick_photo_hint")}</span>}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => choose(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => cameraRef.current?.click()} disabled={busy}>{t("take_a_selfie")}</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => galleryRef.current?.click()} disabled={busy}>{t("choose_a_photo")}</button>
      </div>

      {categories.map((cat) => (
        <div key={cat} style={{ marginTop: 14 }}>
          <div style={{ color: "var(--gold)", fontWeight: 700, marginBottom: 6 }}>{cat}</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {styles.filter((s) => s.category === cat).map((s) => {
              const on = s.id === styleId;
              return (
                <button key={s.id} onClick={() => setStyleId(s.id)} disabled={busy} aria-pressed={on}
                        style={{ flex: "0 0 112px", padding: 0, background: "transparent", border: "none", cursor: "pointer", color: on ? "var(--gold)" : "#fff", font: "inherit" }}>
                  <div style={{ width: 112, height: 112, borderRadius: 12, overflow: "hidden", background: "#000",
                                border: `${on ? 3 : 1}px solid ${on ? "var(--gold)" : "var(--gold-border)"}` }}>
                    {s.thumb && <img src={s.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: on ? 700 : 400, marginTop: 4 }}>{s.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {enabled ? (
        <button className="btn primary" style={{ width: "100%", marginTop: 14 }} onClick={run} disabled={!picked || !chosen || busy}>
          {busy ? t("monster_sending") : t("f_make_my_monster_video", String(price))}
        </button>
      ) : (
        <div style={{ marginTop: 12 }}><Notice>{t("monster_not_on_yet")}</Notice></div>
      )}
      {note && <div style={{ marginTop: 10 }}><Notice>{note}</Notice></div>}
      {error && <div style={{ marginTop: 10 }}><Notice error>{error}</Notice></div>}

      {videos.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ color: "var(--gold)" }}>{t("my_monster_videos")}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {videos.map((v) => (
              <button key={v.id} disabled={v.status !== "done"} onClick={() => setPlaying(v)}
                      style={{ background: "#000", border: "1px solid var(--gold-border)", borderRadius: 12, padding: 6, color: "#fff", font: "inherit", textAlign: "left", cursor: v.status === "done" ? "pointer" : "default" }}>
                <div style={{ aspectRatio: "9 / 16", background: "#111", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span className="muted" style={{ fontSize: 12, padding: 8, textAlign: "center" }}>{isWorking(v) ? t("monster_status_working") : ""}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{v.style_name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {isWorking(v) ? t("monster_status_working") : v.status === "done" ? t("monster_status_ready") + (v.posted ? " · " + t("monster_posted") : "") : t("monster_status_failed", v.coins_charged)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {playing && (
        <div role="dialog" onClick={() => setPlaying(null)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 14, maxWidth: 420, width: "100%" }}>
            <video src={playing.video_url ?? undefined} controls autoPlay loop playsInline style={{ width: "100%", maxHeight: "65vh", borderRadius: 10, background: "#000" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <a className="btn" href={playing.video_url ?? "#"} download style={{ flex: 1, textAlign: "center" }}>{t("save_to_my_computer")}</a>
              {!playing.posted && (
                <button className="btn primary" style={{ flex: 1 }} onClick={async () => {
                  if (!user) return;
                  setNote(await postMonsterVideo(user.id, playing.id));
                  setPlaying(null); refresh();
                }}>{t("post_to_my_feed")}</button>
              )}
              <button className="btn" style={{ flex: 1 }} onClick={async () => {
                if (!user || !window.confirm(t("monster_delete_confirm"))) return;
                await deleteMonsterVideo(user.id, playing.id);
                setPlaying(null); refresh();
              }}>{t("delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
