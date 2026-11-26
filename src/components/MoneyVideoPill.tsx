import { useEffect, useState } from "react";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { fetchMoneyVideo, type MoneyVideo } from "../lib/moneyVideo";
import { FeatureVideoPlayer } from "./FeatureVideoPlayer";

/**
 * Steve, 2026-11-26: "Please add a link right bellow the tabs on top that says... 'How to make money
 * on Bingg Bongg'". A small black pill with a gold border and gold text, centred under the Home
 * feed's tab row. Tap plays the video full screen in the Features player; no sign-in needed.
 * Hidden whenever fetchMoneyVideo fails or says show=false.
 */
export function MoneyVideoPill() {
  const { t } = useT();
  const { user } = useSession();
  const [video, setVideo] = useState<MoneyVideo | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let live = true;
    fetchMoneyVideo(user?.id).then((v) => { if (live) setVideo(v); });
    return () => { live = false; };
  }, [user?.id]);

  if (!video?.video) return null;
  const title = t("how_to_make_money");
  return (
    <>
      <div className="money-pill-row">
        <button type="button" className="money-pill" onClick={() => setPlaying(true)}>{title}</button>
      </div>
      {playing && (
        <FeatureVideoPlayer
          items={[{ url: video.video, title, trackKey: "how_to_make_money", trackLabel: "How to make money on Bingg Bongg" }]}
          onClose={() => setPlaying(false)} />
      )}
    </>
  );
}
