import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { post } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice } from "../components/Common";
import { tt, useT, type StringKey } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { requireVerified } from "../lib/verifyEmail";
import { StartPodcastLink } from "./PodcastPages";
import { InfoBanner } from "./InformationCenterPage";

/** Steve, 2026-11-25: the Bingg Bongg button's page IS the Information Center now — "add all the links
 *  from the information center on this page and delete the information center link". Every box is the
 *  Information Center's gold box with a red star each side, All Country Battles included (no longer
 *  blue), plus a new "Features" box that opens Settings at its Features list. Country VS Country stays
 *  off while the battles are turned off (2026-11-24). */
const BB_LINKS: { to: string; key: StringKey }[] = [
  { to: "/ads-for-referrals?video=en", key: "ic_million" },
  { to: "/country-battles", key: "acb_tab" },
  { to: "/settings#features", key: "set_box_features" },
  { to: "/features", key: "tab_70_features" },
  { to: "/feature-videos", key: "tab_70_videos" },
  { to: "/one-video", key: "ic_one_video" },
];

function BinggBonggLinks() {
  const { t } = useT();
  return (
    <nav className="ic-list" style={{ marginTop: 12 }} aria-label={t("information_center")}>
      {BB_LINKS.map((it) => (
        <Link key={it.key} to={it.to} className="ic-btn">
          <span className="ic-star" aria-hidden>★</span>
          <span className="ic-label">{t(it.key)}</span>
          <span className="ic-star" aria-hidden>★</span>
        </Link>
      ))}
    </nav>
  );
}

/** Camera preview + one button — same startLive endpoint the phones call, then the room page as host. */
export function GoLivePage() {
  const { t, tn } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Multi-live 24 (2026-11-05): the host picks how many are on camera, him included (4 = today).

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((e) => setPreviewError(`Camera or microphone not available: ${(e as Error).message}`));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [isLoggedIn]);

  async function goLive() {
    if (!user) return;
    if (!requireVerified()) return; // browse first, verify before doing anything (2026-11-05)
    setBusy(true);
    setError(null);
    try {
      // Steve, 2026-11-11: no room size any more — every room holds 24 and the server switches it
      // to the big grid when a 5th person comes in.
      const res = await post<unknown>("startLive", { user_id: user.id });
      const roomName = (res as { room_name?: string }).room_name;
      if (!res.status || !roomName) throw new Error(res.message ?? tt("couldn_t_start_the_stream"));
      streamRef.current?.getTracks().forEach((t) => t.stop()); // the room takes the camera over
      navigate(`/live/${encodeURIComponent(roomName)}?host=1`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // Signed out: the banner and the links still show (the main page no longer has an Information
  // Center button), with the sign-in note where the camera would be.
  if (!isLoggedIn) return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageTitle>{t("go_live")}</PageTitle>
      <InfoBanner />
      <Notice>{tn("sign_in_to_go_live", <Link to="/login">{t("sign_in")}</Link>)}</Notice>
      <BinggBonggLinks />
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageTitle>{t("go_live")}</PageTitle>
      {/* The Information Center's video banner on top (Steve, 2026-11-25): swipe for the next, tap plays it. */}
      <InfoBanner />
      <div className="card" style={{ aspectRatio: "9 / 12", background: "#000", display: "grid", placeItems: "center" }}>
        {previewError ? <p className="muted center" style={{ padding: 20 }}>{previewError}</p> : <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}
      <button className="btn block" style={{ marginTop: 14, minHeight: 52, fontSize: 17 }} onClick={goLive} disabled={busy}>
        {busy ? "Starting…" : "Go Live"}
      </button>
      {/* The "Join the … whole country battle Now" button under Go Live was removed (Steve,
          2026-11-24: "Remove the join the american whole country from this page"); in its place
          the Information Center's buttons — since 2026-11-25 all of them, gold with red stars. */}
      <BinggBonggLinks />
      {/* Bingg Bongg Podcast (Steve, 2026-11-10) — right under Go Live, only while switched on. */}
      <StartPodcastLink />
      {previewError && <p className="muted center" style={{ fontSize: 13, marginTop: 8 }}>{t("you_can_still_go_live_and_turn_the_camer")}</p>}
      <p className="muted center" style={{ fontSize: 13, marginTop: 8 }}>{t("your_followers_see_you_in_live_now_the_m")}</p>
      {/* Steve, 2026-10-03 — the gamers' route in. Someone with a capture card and OBS is not
          going to find this under Settings, so it sits next to the camera button they came for. */}
      <p className="center" style={{ fontSize: 13, marginTop: 14 }}>
        {tn("playing_a_game_on_your_computer", <Link to="/go-live/computer">{t("go_live_from_your_pc_with_obs")}</Link>)}
      </p>
    </div>
  );
}
