// "Go live from your computer" — Steve, 2026-10-03, after watching the TikTok gaming streams:
// "we should start it the right way with the real build with the key. if they see we have the key
// they will say this is the real thing."
//
// This is the page a PC gamer actually uses: their permanent RTMP server address and stream key,
// pasted once into OBS. Their computer composes the picture (gameplay plus facecam, the split
// every one of those TikTok streamers was doing) and sends us a single video stream — which is
// why none of this needs a new tile layout in the app.
//
// Deliberately on the WEB rather than the phones: someone setting up OBS is already at a
// computer. Copy buttons matter here in a way they never do on a phone.
//
// The key is permanent. It comes from the token server, which holds the LiveKit credentials and
// stores nothing itself — LiveKit is the store (see /ingress/key's own doc comment there).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tokenServer } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice } from "../components/Common";
import { useT } from "../lib/i18n";

interface IngressKey {
  url: string;
  streamKey: string;
  ingressId: string;
  roomName: string;
}

/** A read-only field with a Copy button — the only interaction this page really needs. */
function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // A stream key is a credential: anyone holding it can broadcast as this member. It stays
  // masked until asked for, so it can't be read over a shoulder or caught by a screen share —
  // which, on a page aimed at people who stream their screen for a living, is not hypothetical.
  const shown = !secret || revealed ? value : "•".repeat(Math.min(value.length, 32));

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission can be refused; the value is on screen either way, so this is
      // worth noticing but not worth an error state.
      setRevealed(true);
    }
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" readOnly value={shown} style={{ flex: 1, fontFamily: "ui-monospace, monospace" }} />
        {secret && (
          <button className="btn small" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Show"}
          </button>
        )}
        <button className="btn small" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}

export function StreamFromPcPage() {
  const { t, tn } = useT();
  const { isLoggedIn } = useSession();
  const [key, setKey] = useState<IngressKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [confirmingNewKey, setConfirmingNewKey] = useState(false);

  const load = useCallback(async (regenerate: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setKey(await tokenServer<IngressKey>(regenerate ? "ingress/regenerate" : "ingress/key", { method: "POST", body: {} }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmingNewKey(false);
    }
  }, []);

  useEffect(() => { if (isLoggedIn) void load(false); }, [isLoggedIn, load]);

  if (!isLoggedIn) {
    return (
      <div className="pad">
        <h1 className="page-title">{t("go_live_from_your_computer")}</h1>
        <Notice>{tn("please_sign_in_for_stream_key", <Link to="/login">{t("sign_in_2")}</Link>)}</Notice>
      </div>
    );
  }

  return (
    <div className="pad">
      <h1 className="page-title">{t("go_live_from_your_computer")}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("stream_your_game_from_a_pc_with_obs_stre")}</p>

      {error && <Notice>{error}</Notice>}
      {busy && !key && <p className="muted">{t("getting_your_stream_key")}</p>}

      {key && (
        <>
          <div className="card pad" style={{ marginBottom: 16 }}>
            <CopyRow label={t("server")} value={key.url} />
            <CopyRow label={t("simulcast_key_hint")} value={key.streamKey} secret />
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              {t("this_key_is_yours_and_does_not_change_pa")}</p>
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <h2 className="card-title" style={{ marginTop: 0 }}>{t("setting_up_obs")}</h2>
            <ol className="muted" style={{ paddingLeft: 18, marginBottom: 0, lineHeight: 1.7 }}>
              <li>{tn("obs_step_open_settings_stream", <b>{t("settings_stream")}</b>)}</li>
              <li>{tn("obs_step_set_service", <b>{t("service")}</b>, <b>{t("custom")}</b>)}</li>
              <li>{tn("obs_step_paste_server_and_key", <b>{t("server")}</b>, <b>{t("simulcast_key_hint")}</b>)}</li>
              <li>
                {tn("obs_step_output_settings", <b>{t("settings_output")}</b>,
                   <b>{t("n2500_kbps")}</b>, <b>{t("n2_seconds")}</b>)}
              </li>
              <li>
                {tn("obs_step_add_sources", <b>{t("display_capture")}</b>,
                   <b>{t("game_capture")}</b>, <b>{t("video_capture_device")}</b>)}
              </li>
              <li>{tn("obs_step_click_start", <b>{t("start_streaming")}</b>)}</li>
            </ol>
          </div>

          <div className="card pad">
            <h2 className="card-title" style={{ marginTop: 0 }}>{t("lost_your_key")}</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              {t("if_anyone_else_has_seen_your_key_make_a")}</p>
            {confirmingNewKey ? (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" disabled={busy} onClick={() => void load(true)}>
                  {busy ? "Making a new key…" : "Yes, make a new key"}
                </button>
                <button className="btn small" disabled={busy} onClick={() => setConfirmingNewKey(false)}>{t("cancel")}</button>
              </div>
            ) : (
              <button className="btn small" onClick={() => setConfirmingNewKey(true)}>{t("make_a_new_key")}</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
