// Social pages (Steve, 2026-11-17): an "Add Yours" chain (/add-yours/:id) and the Stories page the
// directory tile opens (/stories).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { StoryRow } from "../components/Stories";
import { fetchAddYours, socialUser, type AddYoursPage as AddYoursData } from "../lib/social";

function fmt(n?: number | null): string {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
}

export function AddYoursPage() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const me = socialUser(user);
  const [data, setData] = useState<AddYoursData | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(undefined);
    setError("");
    fetchAddYours(Number(id)).then(setData).catch((e) => { setError((e as Error).message); setData(null); });
  }, [id]);

  function addMine() {
    if (!data) return;
    if (!me) { navigate("/login", { state: { from: `/add-yours/${data.id}` } }); return; }
    navigate("/upload", { state: { addYours: { id: data.id, prompt: data.prompt } } });
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("soc_add_yours")}</PageTitle>
      {data === undefined ? <Loading /> : !data ? (
        <Notice error>{error || t("soc_not_found")}</Notice>
      ) : (
        <>
          <div className="card pad addyours-head">
            <div className="addyours-tag">{t("soc_add_yours")}</div>
            <h2 style={{ color: "var(--gold)", margin: "6px 0", fontSize: 22, wordBreak: "break-word" }}>{data.prompt}</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              {t("soc_n_posts", data.uses)}
              {data.creator?.username && <> · {t("soc_started_by")} <Link to={`/profile/${data.creator.id}`}>@{data.creator.username}</Link></>}
            </div>
            <button className="btn gold" style={{ marginTop: 12, width: "100%" }} onClick={addMine}>{t("soc_add_yours_btn")}</button>
            {data.origin_post_id ? <Link to={`/video/${data.origin_post_id}`} className="btn small ghost" style={{ marginTop: 8 }}>{t("soc_see_first_video")}</Link> : null}
          </div>
          {data.videos.length === 0 ? (
            <p className="muted center" style={{ marginTop: 16 }}>{t("no_videos_yet")}</p>
          ) : (
            <div className="profile-vid-grid" style={{ marginTop: 12 }}>
              {data.videos.map((v) => (
                <Link key={v.id} to={`/video/${v.id}`} className="addyours-thumb">
                  {v.thumbnail ? <img src={mediaUrl(v.thumbnail)} alt="" loading="lazy" /> : <span />}
                  <span className="addyours-thumb-meta">👁 {fmt(v.views)}{v.user?.username ? ` · @${v.user.username}` : ""}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function StoriesPage() {
  const { t } = useT();
  const { user } = useSession();
  const me = socialUser(user);
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("soc_stories")}</PageTitle>
      <div className="card pad" style={{ marginBottom: 12, color: "var(--gold)", textAlign: "center" }}>{t("soc_stories_page_explain")}</div>
      {me ? <StoryRow /> : (
        <div className="card pad" style={{ textAlign: "center" }}>
          <Link to="/login" state={{ from: "/stories" }} className="btn gold">{t("fnd_sign_in")}</Link>
        </div>
      )}
    </div>
  );
}
