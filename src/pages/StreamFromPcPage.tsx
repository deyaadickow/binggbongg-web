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
        <h1 className="page-title">Go Live From Your Computer</h1>
        <Notice>Please <Link to="/login">sign in</Link> to get your stream key.</Notice>
      </div>
    );
  }

  return (
    <div className="pad">
      <h1 className="page-title">Go Live From Your Computer</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Stream your game from a PC with OBS, Streamlabs, or any software that sends RTMP. Put your
        gameplay and your camera on screen together — your computer builds the picture, we send it
        to your audience.
      </p>

      {error && <Notice>{error}</Notice>}
      {busy && !key && <p className="muted">Getting your stream key…</p>}

      {key && (
        <>
          <div className="card pad" style={{ marginBottom: 16 }}>
            <CopyRow label="Server" value={key.url} />
            <CopyRow label="Stream key" value={key.streamKey} secret />
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              This key is yours and does not change. Paste it once and OBS will remember it.
              Never share it or show it on stream — anyone who has it can broadcast as you.
            </p>
          </div>

          <div className="card pad" style={{ marginBottom: 16 }}>
            <h2 className="card-title" style={{ marginTop: 0 }}>Setting up OBS</h2>
            <ol className="muted" style={{ paddingLeft: 18, marginBottom: 0, lineHeight: 1.7 }}>
              <li>In OBS open <b>Settings → Stream</b>.</li>
              <li>Set <b>Service</b> to <b>Custom…</b></li>
              <li>Paste the <b>Server</b> and <b>Stream key</b> from above.</li>
              <li>
                Under <b>Settings → Output</b>, set the video bitrate to about <b>2500 kbps</b> and
                keyframe interval to <b>2 seconds</b>. Higher looks sharper but costs your viewers
                more data, and a long keyframe interval makes people wait to see your first frame.
              </li>
              <li>
                Add a <b>Display Capture</b> or <b>Game Capture</b> source, then add your webcam as
                a <b>Video Capture Device</b> on top. Arrange them however you like — most gamers
                put the camera across the top and the game underneath.
              </li>
              <li>Click <b>Start Streaming</b>. You will appear in Live within a few seconds.</li>
            </ol>
          </div>

          <div className="card pad">
            <h2 className="card-title" style={{ marginTop: 0 }}>Lost your key?</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              If anyone else has seen your key, make a new one. The old key stops working
              immediately, so you will need to paste the new one into OBS before you stream again.
            </p>
            {confirmingNewKey ? (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" disabled={busy} onClick={() => void load(true)}>
                  {busy ? "Making a new key…" : "Yes, make a new key"}
                </button>
                <button className="btn small" disabled={busy} onClick={() => setConfirmingNewKey(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn small" onClick={() => setConfirmingNewKey(true)}>Make a new key</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
