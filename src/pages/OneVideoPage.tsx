// "1 Video 70+ Features" (Steve, 2026-11-14: "For You / 70+ Features / 70+ Videos / '1 Video 70+ Features' — Add the
// 8 minutes video here / Our Ads"). One long video that walks through every feature, opened straight in the same
// player as the other video pages (language + Download bar on top). The video is an ordinary server row in
// tbl_feature_videos under the key "all_features_video", so swapping it or adding a language needs no release.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { FeatureVideoPlayer } from "../components/FeatureVideoPlayer";
import { fetchFeatureVideos, featureVideoSources, type VideoSources } from "../lib/featureVideos";
import { useSession } from "../lib/session";

export const ONE_VIDEO_KEY = "all_features_video";

export function OneVideoPage() {
  const { t, lang } = useT();
  const nav = useNavigate();
  const { user } = useSession();
  const [item, setItem] = useState<{ url: string; title: string; sources: VideoSources; trackKey: string } | null | undefined>(undefined);

  const load = useCallback(async () => {
    setItem(undefined);
    const urls = await fetchFeatureVideos(lang || "en");
    const url = urls[ONE_VIDEO_KEY];
    setItem(url ? { url, title: "", sources: featureVideoSources[ONE_VIDEO_KEY] ?? {}, trackKey: "one_video_70_features" } : null);
  }, [lang]);

  useEffect(() => { load(); }, [load]);
  const close = useCallback(() => nav("/"), [nav]);

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageTitle backTo="/">{t("tab_1_video")}</PageTitle>
      {item === undefined ? <Loading /> : item === null ? (
        <div className="center" style={{ marginTop: 20 }}>
          <Notice>{t("no_videos_yet")}</Notice>
          <button className="btn" style={{ marginTop: 12 }} onClick={load}>{t("try_again")}</button>
        </div>
      ) : (
        <FeatureVideoPlayer items={[item]} start={0} country={user?.country} onClose={close} />
      )}
    </div>
  );
}
