// Inbox -> Announcements (Steve, 2026-11-09): "Video Announcement of the day ... They will have to
// login to Bingg Bongg with their account to see the announcement video. In their inbox
// announcement will be the daily video announcement message with the video link" + "Make it in
// English and Tagalog so they can see both videos if they want".
//
// The phones have had Inbox -> Announcements for a long time; the web had no view of it at all.
// Signed in only: a signed-out visitor (most often someone tapping the link in the email) goes to
// the sign-in page and comes straight back here afterwards.
//
// Routes:
//   /announcements              the list, newest first
//   /announcements/:id          that announcement — its video opens straight away (the emails link
//                               here); one without a video is scrolled to and outlined
//   /announcements/:id?lang=fil the same, in Tagalog (lang=en for English)
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { Loading, Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { InboxTabs } from "../components/InboxTabs";
import {
  ANNOUNCEMENTS_PAGE, fetchAnnouncements, fetchWelcomeMessage, isFilipinoLang, videoFor, videoLangs,
  type Announcement, type AnnouncementLang,
} from "../lib/announcements";

/** How far a deep link pages back looking for its announcement before giving up. */
const MAX_DEEP_LINK_PAGES = 10;

/** Message text with its links clickable. Everything else stays plain text — never HTML. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        // A sentence's full stop or closing bracket is not part of the link.
        const m = /^(.*?)([.,;:!?)\]]*)$/.exec(p);
        const url = m ? m[1] : p;
        const tail = m ? m[2] : "";
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return (
          <Fragment key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold-bright)", textDecoration: "underline", wordBreak: "break-all" }}>{url}</a>
            {tail}
          </Fragment>
        );
      })}
    </>
  );
}

function When({ at }: { at?: string | null }) {
  if (!at) return null;
  const d = new Date(at.replace(" ", "T") + (/Z$|[+-]\d\d:?\d\d$/.test(at) ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return null;
  return (
    <span className="muted" style={{ fontSize: 12 }}>
      {d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}

export function PlayDisc({ size = 72 }: { size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: "50%", display: "grid", placeItems: "center",
      background: "linear-gradient(180deg,#FFDD55,#D4AF37)", color: "#000",
      fontSize: size * 0.42, boxShadow: "0 4px 22px rgba(240,196,32,.45)", paddingLeft: size * 0.06,
    }}>▶</span>
  );
}

function Card({ a, filipino, highlight, onPlay, cardRef }: {
  a: Announcement; filipino: boolean; highlight: boolean;
  onPlay: (lang: AnnouncementLang) => void; cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const { t } = useT();
  // Tagalog text for a Filipino reader, when the admin wrote it; English otherwise.
  const title = (filipino && a.titleFil) || a.title;
  const message = (filipino && a.messageFil) || a.message;
  const langs = videoLangs(a, filipino);
  // A poster that will not load falls back to the black-and-gold logo card, not a broken image.
  const [posterFailed, setPosterFailed] = useState(false);
  const poster = a.poster && !posterFailed ? a.poster : null;

  return (
    <div ref={cardRef} className="card pad" style={{
      borderColor: highlight ? "var(--gold-bright)" : "var(--gold-border)",
      borderWidth: highlight ? 2 : undefined, marginBottom: 12,
      boxShadow: highlight ? "0 0 0 3px rgba(255,221,85,.25)" : undefined,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <img src="/logo_round.png" alt="" width={40} height={40} style={{ borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <strong style={{ color: "var(--gold)", fontSize: 16, display: "block", wordBreak: "break-word" }}>{title}</strong>}
          <When at={a.createdAt} />
        </div>
      </div>

      {message && (
        <p style={{ margin: "10px 0 0", color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <Linkified text={message} />
        </p>
      )}

      {langs.length > 0 ? (
        <>
          <button type="button" onClick={() => onPlay(langs[0])} aria-label={t("ann_play_video")} style={{
            position: "relative", display: "grid", placeItems: "center", width: "100%", marginTop: 12, padding: 0,
            height: "min(62vw, 340px)", borderRadius: 12, overflow: "hidden", cursor: "pointer",
            background: "#000", border: "2px solid var(--gold-border)",
          }}>
            {poster
              ? <img src={poster} alt="" onError={() => setPosterFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
              : <img src="/logo_horizontal.png" alt="" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", height: 44, maxWidth: "70%", opacity: 0.9 }} />}
            <span style={{ position: "relative" }}><PlayDisc /></span>
          </button>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {langs.map((l) => (
              <button key={l} type="button" className="btn" style={{ flex: "1 1 0", minWidth: 120 }} onClick={() => onPlay(l)}>
                ▶ {l === "fil" ? t("ann_tagalog") : t("ann_english")}
              </button>
            ))}
          </div>
        </>
      ) : a.image ? (
        <img src={a.image} alt="" style={{ display: "block", width: "100%", marginTop: 12, borderRadius: 12, border: "1px solid var(--gold-border)" }} />
      ) : null}
    </div>
  );
}

/** Full-screen player: black, the video fitted whole, the browser's own controls, sound on. */
export function Player({ a, lang, filipino, onLang, onClose }: {
  a: Announcement; lang: AnnouncementLang; filipino: boolean;
  onLang: (l: AnnouncementLang) => void; onClose: () => void;
}) {
  const { t } = useT();
  const src = videoFor(a, lang) ?? "";
  const langs = videoLangs(a, filipino);
  const title = (filipino && a.titleFil) || a.title;
  const [failed, setFailed] = useState(false);
  // Opened straight from an email link there has been no click on the page yet, and browsers
  // refuse to start a video WITH sound until there is one. Then a big gold play button is shown
  // instead of a silent or frozen first frame; one tap on it plays with sound.
  const [needsTap, setNeedsTap] = useState(false);
  const videoEl = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setFailed(false);
    setNeedsTap(false);
    const v = videoEl.current;
    if (!v) return;
    v.muted = false;
    v.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "NotAllowedError") setNeedsTap(true);
    });
  }, [src]);
  const tapToPlay = () => {
    const v = videoEl.current;
    if (!v) return;
    v.muted = false;
    void v.play().then(() => setNeedsTap(false)).catch(() => undefined);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under the player.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title || t("announcements")} style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "#000", display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} aria-label={t("ann_close")} style={{
          width: 40, height: 40, borderRadius: "50%", background: "#000", color: "var(--gold)", flexShrink: 0,
          border: "2px solid var(--gold-border)", fontSize: 20, fontWeight: 700, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
        <b style={{ color: "var(--gold)", fontSize: 17, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</b>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
        {/* Keyed on the file, so switching language starts the other video from the top. */}
        <video key={src} ref={videoEl} src={src} poster={a.poster ?? undefined} controls playsInline
          onError={() => setFailed(true)} onPlay={() => setNeedsTap(false)}
          style={{ flex: 1, minWidth: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
        {needsTap && !failed && (
          <button type="button" onClick={tapToPlay} aria-label={t("ann_play_video")} style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            background: "transparent", border: 0, padding: 0, cursor: "pointer",
          }}><PlayDisc size={88} /></button>
        )}
        {failed && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, pointerEvents: "none" }}>
            <p style={{ color: "var(--gold)", textAlign: "center", fontWeight: 700 }}>{t("ann_video_failed")}</p>
          </div>
        )}
      </div>
      {langs.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 14px 14px", flexShrink: 0 }}>
          <div className="lp-langs" role="group" aria-label={t("ann_video_language")}>
            {langs.map((l) => (
              <button key={l} type="button" className={l === lang ? "on" : ""} aria-pressed={l === lang}
                onClick={() => { if (l !== lang) onLang(l); }}>
                {l === "fil" ? t("ann_tagalog") : t("ann_english")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AnnouncementsPage() {
  const { t, lang: siteLang } = useT();
  const { user, isLoggedIn } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { id: idParam } = useParams();
  const [search] = useSearchParams();
  const filipino = isFilipinoLang(siteLang);
  // user?.id, never `user` — the session object is replaced on every balance refresh, and an
  // effect keyed on the object would re-fetch the whole list each time.
  const userId = user?.id ?? 0;

  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pages, setPages] = useState(0);
  const [welcome, setWelcome] = useState<string | null>(null);
  const busy = useRef(false);

  const load = useCallback(async (start: number) => {
    if (!userId || busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const batch = await fetchAnnouncements(start);
      setRows((prev) => {
        if (start === 0) return batch;
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...batch.filter((r) => !seen.has(r.id))];
      });
      setDone(batch.length < ANNOUNCEMENTS_PAGE);
      setPages((n) => (start === 0 ? 1 : n + 1));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the announcements.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (userId) load(0); }, [userId, load]);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchWelcomeMessage().then((w) => { if (live) setWelcome(w); });
    return () => { live = false; };
  }, [userId]);

  const wantedId = idParam ? Number(idParam) : 0;
  const wanted = useMemo(() => (wantedId ? rows.find((r) => r.id === wantedId) : undefined), [rows, wantedId]);

  // A deep link to an older announcement: keep paging back until it turns up (or the list ends).
  useEffect(() => {
    if (wantedId && !wanted && !done && !loading && !error && pages > 0 && pages < MAX_DEEP_LINK_PAGES) load(rows.length);
  }, [wantedId, wanted, done, loading, error, pages, rows.length, load]);

  // One without a video is scrolled to and outlined instead.
  const cardEls = useRef(new Map<number, HTMLDivElement>());
  useEffect(() => {
    if (wanted && videoLangs(wanted, filipino).length === 0) {
      cardEls.current.get(wanted.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [wanted, filipino]);

  const wantedLangs = wanted ? videoLangs(wanted, filipino) : [];
  const askedLang = search.get("lang");
  const playLang: AnnouncementLang | null = wantedLangs.length === 0 ? null
    : wantedLangs.includes(askedLang as AnnouncementLang) ? (askedLang as AnnouncementLang) : wantedLangs[0];

  const fromList = (location.state as { fromList?: boolean } | null)?.fromList === true;
  const open = (a: Announcement, l: AnnouncementLang) =>
    navigate(`/announcements/${a.id}?lang=${l}`, { state: { fromList: true } });
  const switchLang = (l: AnnouncementLang) =>
    navigate(`/announcements/${wantedId}?lang=${l}`, { replace: true, state: location.state });
  const close = useCallback(() => {
    if (fromList) navigate(-1);
    else navigate("/announcements", { replace: true });
  }, [fromList, navigate]);

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const notFound = wantedId > 0 && !wanted && !loading && (done || pages >= MAX_DEEP_LINK_PAGES || !!error);
  let body: ReactNode;
  if (loading && rows.length === 0) body = <Loading />;
  else if (rows.length === 0 && !error && !welcome) body = <p className="soft">{t("ann_empty")}</p>;
  else body = null;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("announcements")}</PageTitle>
      <InboxTabs />
      {error && <Notice error>{error}</Notice>}
      {notFound && !error && <Notice>{t("ann_not_found")}</Notice>}
      {body}
      {rows.map((a) => (
        <Card key={a.id} a={a} filipino={filipino} highlight={a.id === wantedId}
          onPlay={(l) => open(a, l)}
          cardRef={(el) => { if (el) cardEls.current.set(a.id, el); else cardEls.current.delete(a.id); }} />
      ))}
      {!done && rows.length > 0 && (
        <button className="btn" style={{ marginTop: 6 }} disabled={loading} onClick={() => load(rows.length)}>{t("show_more")}</button>
      )}
      {/* The phones' built-in last card: the welcome message, from the app itself. */}
      {done && welcome && (
        <Card a={{ id: 0, title: "Bingg Bongg", message: welcome, titleFil: null, messageFil: null, image: "",
                   videoEn: null, videoFil: null, poster: null, createdAt: null, welcome: true }}
          filipino={filipino} highlight={false} onPlay={() => undefined} />
      )}
      {wanted && playLang && (
        <Player a={wanted} lang={playLang} filipino={filipino} onLang={switchLang} onClose={close} />
      )}
    </div>
  );
}
