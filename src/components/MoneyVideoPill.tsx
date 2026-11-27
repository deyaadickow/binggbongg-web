import { useEffect, useRef, useState } from "react";
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
  // Steve, 2026-11-26: "When i click on how to make money on bingg bongg on main feed, I hear two
  // sound, one from the video i was just watching and the second one from the ad." Everything
  // playing on the page (feed ads, promo cards, podcast) pauses while the money video plays and
  // starts again when it closes.
  const paused = useRef<HTMLMediaElement[]>([]);
  const openVideo = () => {
    paused.current = Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio"))
      .filter((m) => !m.paused && !m.ended);
    paused.current.forEach((m) => m.pause());
    setPlaying(true);
  };
  const closeVideo = () => {
    setPlaying(false);
    paused.current.forEach((m) => { if (m.isConnected) m.play().catch(() => undefined); });
    paused.current = [];
  };

  // Steve, 2026-11-26, again: "I still hear two sound". Pausing once on open isn't enough when a
  // feed card starts on its own afterwards (a card finishing loading, the next ad), so while the
  // money video is up anything else on the page that starts playing is paused straight away.
  useEffect(() => {
    if (!playing || !video?.video) return;
    const file = video.video.split("/").pop() ?? video.video;
    const onPlay = (e: Event) => {
      const m = e.target as HTMLMediaElement;
      if (!(m instanceof HTMLMediaElement)) return;
      if ((m.currentSrc || m.src || "").includes(file)) return;
      m.pause();
    };
    document.addEventListener("play", onPlay, true);
    return () => document.removeEventListener("play", onPlay, true);
  }, [playing, video?.video]);

  useEffect(() => {
    let live = true;
    fetchMoneyVideo(user?.id).then((v) => { if (live) setVideo(v); });
    return () => { live = false; };
  }, [user?.id]);

  if (!video?.video) return null;
  const title = t("how_to_make_money");
  return (
    <>
      {/* In HomePage's .money-pill-row, left of the Singing Contest pill (Steve, 2026-11-26). */}
      <button type="button" className="money-pill" onClick={openVideo}>{title}</button>
      {playing && (
        <FeatureVideoPlayer
          items={[{ url: video.video, title, trackKey: "how_to_make_money", trackLabel: "How to make money on Bingg Bongg" }]}
          onClose={closeVideo} />
      )}
    </>
  );
}
