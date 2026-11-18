// Bingg Bongg AI Assistant (Steve, 2026-11-18): the round Bingg / Bongg face on the Home feed and the
// popup it opens — a greeting and up to 3 questions, each with a gold YES that shows that feature.
// Mounted once in App (like the Gold Digger manager): the icon only draws on the Home feed, the popup
// opens from the icon, from the Features tile ("/?assistant=1") or from openFeedAssistant().
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useT, translate } from "../lib/i18n";
import { useSession } from "../lib/session";
import { assistantFace, fetchFeedAssistant, OPEN_EVENT, rememberShown, type FaPage, type FaQuestion } from "../lib/feedAssistant";
import { FEATURES, featureHref, type Feature } from "../pages/FeaturesPage";
import { fetchFeatureVideos, featureVideoSources } from "../lib/featureVideos";
import { FeatureVideoPlayer, type PlayerItem } from "./FeatureVideoPlayer";

const DIRECTORY = "fname_features_directory";

/** The directory tile a question points at: by its video key or its name key. */
function findTile(key: string): Feature | undefined {
  const all = FEATURES.flatMap((s) => s.features);
  return all.find((f) => (f.videoKey ?? f.nameKey) === key) ?? all.find((f) => f.nameKey === key);
}

export function FeedAssistantHost() {
  const { t, lang } = useT();
  const { user } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  // The page the icon will open (its assistant's face is on the icon).
  const [next, setNext] = useState<FaPage | null>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<FaPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<PlayerItem[] | null>(null);
  const shownId = useRef(0);

  const prefetch = useCallback(async (afterId?: number) => {
    const s = await fetchFeedAssistant(lang, afterId);
    if (!s) return null;
    setEnabled(s.enabled && !!s.page);
    setNext(s.page);
    return s;
  }, [lang]);

  useEffect(() => { prefetch(); }, [prefetch]);

  const show = useCallback((p: FaPage) => {
    setPage(p);
    setFailed(false);
    shownId.current = p.id;
    rememberShown(p.id);
  }, []);

  const openPopup = useCallback(async () => {
    setOpen(true);
    if (next && next.language === lang) { show(next); return; }
    setBusy(true);
    const s = await prefetch();
    setBusy(false);
    if (s?.page) show(s.page); else { setPage(null); setFailed(true); }
  }, [next, lang, prefetch, show]);

  const close = useCallback(() => {
    setOpen(false);
    // So the next tap (and the face on the icon) is the page after this one.
    if (shownId.current) prefetch(shownId.current);
  }, [prefetch]);

  const more = async () => {
    setBusy(true);
    const s = await fetchFeedAssistant(lang, shownId.current);
    setBusy(false);
    if (s?.page) show(s.page); else setFailed(true);
  };

  // The Features tile links to "/?assistant=1"; anything else can fire the event.
  useEffect(() => {
    const onEvent = () => { openPopup(); };
    window.addEventListener(OPEN_EVENT, onEvent);
    return () => window.removeEventListener(OPEN_EVENT, onEvent);
  }, [openPopup]);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("assistant") === "1") {
      q.delete("assistant");
      navigate({ pathname: location.pathname, search: q.toString() }, { replace: true });
      openPopup();
    }
  }, [location.search, location.pathname, navigate, openPopup]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const openTile = (key: string) => {
    const f = key === DIRECTORY ? undefined : findTile(key);
    navigate((f && featureHref(f, user?.id)) || "/features");
  };

  const yes = async (q: FaQuestion) => {
    close();
    if (q.action === "video") {
      const videos = await fetchFeatureVideos(lang);
      const url = videos[q.tile];
      if (url) {
        const f = findTile(q.tile);
        const titleKey = f ? (f.labelKey ?? f.nameKey) : null;
        setPlaying([{ url, title: titleKey ? t(titleKey) : t("fa_title"), sources: featureVideoSources[q.tile],
          trackKey: q.tile, trackLabel: titleKey ? translate("en", titleKey) : q.tile }]);
        return;
      }
    }
    openTile(q.tile);
  };

  const onHome = location.pathname === "/";
  return (
    <>
      {onHome && user && enabled && !open && (
        <button type="button" className="fa-icon" onClick={openPopup} aria-label={t("fa_title")} title={t("fa_title")}>
          <img src={assistantFace(next?.assistant)} alt="" />
          <span className="fa-icon-ai">AI</span>
        </button>
      )}
      {open && (
        <div className="modal-backdrop fa-backdrop" onClick={close}>
          <div className="fa-card" role="dialog" aria-modal="true" aria-label={t("fa_title")} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="fa-x" onClick={close} aria-label={t("close")}>×</button>
            <h3 className="fa-title">{t("fa_title")}</h3>
            {page ? (
              <>
                <div className="fa-who">
                  <img src={assistantFace(page.assistant)} alt="" />
                  <div className="fa-name">{page.name}</div>
                </div>
                <p className="fa-greeting">{page.greeting}</p>
                <ol className="fa-questions">
                  {page.questions.map((q, i) => (
                    <li key={i}>
                      <span className="fa-q">({i + 1}) {q.text}</span>
                      <button type="button" className="fa-yes" onClick={() => yes(q)}>{t("fa_yes")}</button>
                    </li>
                  ))}
                </ol>
              </>
            ) : failed ? (
              <p className="fa-greeting">{t("fa_error")}</p>
            ) : (
              <p className="fa-greeting" aria-busy>…</p>
            )}
            <div className="fa-actions">
              <button type="button" className="fa-more" onClick={more} disabled={busy}>{t("fa_more")}</button>
              <button type="button" className="fa-close" onClick={close}>{t("close")}</button>
            </div>
          </div>
        </div>
      )}
      {playing && <FeatureVideoPlayer items={playing} start={0} country={user?.country} onClose={() => setPlaying(null)} />}
    </>
  );
}
