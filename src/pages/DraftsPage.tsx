// Drafts (Steve, 2026-11-17: "All" — TikTok-style features): the videos saved on this browser with
// "Save draft". Tap one to open the normal upload page with everything filled in (Post, or Save
// draft again); ⋯ deletes it after the gold confirm. Posting a draft deletes it once it is up.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { showGoldAlert, showGoldConfirm } from "../components/GoldToast";
import { socialUser } from "../lib/social";
import { deleteDraft, draftsSupported, listDrafts, onDraftsChanged, type Draft } from "../lib/drafts";

export function DraftsPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: realUser } = useSession();
  // On the dev server the Social mock's pretend member has drafts too.
  const user = socialUser(realUser);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const load = () => { void listDrafts(uid).then(setDrafts); };
    load();
    return onDraftsChanged(load);
  }, [user?.id]);

  // One object URL per thumbnail, released when the list changes or the page closes.
  const thumbs = useMemo(() => {
    const out: Record<number, string> = {};
    for (const d of drafts ?? []) if (d.thumb) out[d.id] = URL.createObjectURL(d.thumb);
    return out;
  }, [drafts]);
  useEffect(() => () => { Object.values(thumbs).forEach((u) => URL.revokeObjectURL(u)); }, [thumbs]);

  async function remove(d: Draft) {
    if (!user) return;
    const yes = await showGoldConfirm({ message: t("dft_delete_q"), confirmLabel: t("dft_delete"), cancelLabel: t("cancel"), danger: true });
    if (!yes) return;
    try { await deleteDraft(user.id, d.id); } catch { showGoldAlert(t("something_went_wrong")); }
  }

  if (!user) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <PageTitle>{t("dft_title")}</PageTitle>
        <div className="card pad center">
          <p style={{ color: "var(--gold)", marginTop: 0 }}>{t("dft_sign_in")}</p>
          <Link to="/login" state={{ from: location.pathname }} className="btn gold">{t("fnd_sign_in")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("dft_title")}</PageTitle>
      <p className="muted" style={{ marginTop: 0, fontSize: 13, textAlign: "center" }}>{t("dft_note")}</p>
      {!draftsSupported() ? (
        <Notice error>{t("dft_not_supported")}</Notice>
      ) : drafts === null ? <Loading /> : drafts.length === 0 ? (
        <div className="card pad center">
          <p style={{ color: "var(--gold)", marginTop: 0 }}>{t("dft_empty")}</p>
          <button className="btn gold" onClick={() => navigate("/upload")}>{t("dft_make_video")}</button>
        </div>
      ) : (
        <div className="drafts-grid">
          {drafts.map((d) => (
            <div key={d.id} className="draft-tile">
              <button type="button" className="draft-open" onClick={() => navigate(`/upload?draft=${d.id}`)}
                aria-label={t("dft_open")}>
                {thumbs[d.id] ? <img src={thumbs[d.id]} alt="" /> : <span className="draft-noimg">🎬</span>}
                <span className="draft-date">{new Date(d.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                {d.fields.description && <span className="draft-caption">{d.fields.description}</span>}
              </button>
              <button type="button" className="draft-more" aria-label={t("dft_delete")} title={t("dft_delete")}
                onClick={() => void remove(d)}>⋯</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
