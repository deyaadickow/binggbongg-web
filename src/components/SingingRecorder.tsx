// The Singing Contest recorder in the host's live room (Steve, 2026-11-26). Mounted only when the host came from
// the Singing Contest page (/go-live?singing=1 → /live/<room>?host=1&singing=1). As soon as the room is up and
// publishing it calls startSingingContestRecording, shows a red "● REC m:ss" pill + Stop counting down from
// recording.seconds_left (re-synced every 10 s), stops at 0 or on Stop, then says the video is being made.
// While pending/recording the parent hides guest controls and declines join requests (onBlocking).
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { fetchSingingContestRecording, mss, recBlocking, startSingingContestRecording, stopSingingContestRecording, type ScRecording } from "../lib/singingContest";

export function SingingRecorder({ myId, roomName, ready, onBlocking }: { myId: number; roomName: string; ready: boolean; onBlocking?: (blocking: boolean) => void }) {
  const { t } = useT();
  const [rec, setRec] = useState<ScRecording | null>(null);
  const [left, setLeft] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const stopping = useRef(false);
  const recRef = useRef<ScRecording | null>(null);
  recRef.current = rec;

  const apply = useCallback((r: ScRecording | undefined | null) => {
    if (!r) return;
    setRec(r);
    setLeft(r.seconds_left);
    if (r.status === "failed" || r.status === "cancelled") setMessage(r.reason_text ?? t("try_again"));
    if (r.status === "processing" || r.status === "done") setDone(true);
  }, [t]);

  // Start once, the moment the room is live.
  useEffect(() => {
    if (!ready || started.current || !myId || !roomName) return;
    started.current = true;
    startSingingContestRecording(myId, roomName)
      .then((r) => { if (!r.status || !r.recording) setMessage(r.message ?? t("try_again")); else apply(r.recording); })
      .catch((e) => setMessage((e as Error).message));
  }, [ready, myId, roomName, apply, t]);

  const blocking = recBlocking(rec) || (started.current && !rec && !message);
  useEffect(() => { onBlocking?.(blocking); }, [blocking, onBlocking]);

  const stop = useCallback(async () => {
    const r = recRef.current;
    if (!r || stopping.current) return;
    stopping.current = true;
    try {
      const res = await stopSingingContestRecording(myId, r.recording_id);
      if (res.status && res.recording) apply(res.recording.status === "recording" || res.recording.status === "pending" ? { ...res.recording, status: "processing" } : res.recording);
      else { setMessage(res.message ?? t("try_again")); stopping.current = false; }
    } catch (e) { setMessage((e as Error).message); stopping.current = false; }
  }, [myId, apply, t]);

  // Local countdown every second; server re-sync every 10 s.
  const live = rec?.status === "recording" || rec?.status === "pending";
  useEffect(() => {
    if (!live) return;
    const tick = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    const sync = window.setInterval(() => {
      const r = recRef.current;
      if (r) fetchSingingContestRecording(myId, r.recording_id).then((x) => { if (x.status && x.recording && !stopping.current) apply(x.recording); }).catch(() => undefined);
    }, 10000);
    return () => { clearInterval(tick); clearInterval(sync); };
  }, [live, myId, apply]);
  useEffect(() => { if (live && rec?.status === "recording" && left <= 0) void stop(); }, [live, rec?.status, left, stop]);

  // Leaving the room mid-recording: the server stops by itself; say so too (fire and forget).
  useEffect(() => () => {
    const r = recRef.current;
    if (r && recBlocking(r) && !stopping.current) stopSingingContestRecording(myId, r.recording_id).catch(() => undefined);
  }, [myId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, margin: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid #F0C420", color: "#F0C420", background: "#000", fontWeight: 800, fontSize: 14 }}>{t("sc_live_tag")}</span>
        {live && rec?.status === "recording" && (
          <>
            <span role="status" aria-live="polite" style={{ padding: "6px 14px", borderRadius: 999, background: "#E53935", color: "#fff", fontWeight: 900, fontSize: 16, letterSpacing: 0.5, fontVariantNumeric: "tabular-nums", boxShadow: "0 0 12px rgba(229,57,53,.55)" }}>
              {t("sc_rec", mss(left))}
            </span>
            <button className="btn small" style={{ borderColor: "#E53935", color: "#fff", background: "#000" }} onClick={() => void stop()}>■ {t("sc_stop")}</button>
          </>
        )}
        {(rec?.status === "pending" || (started.current && !rec && !message)) && <span style={{ color: "#F0C420", fontWeight: 700 }}>{t("sc_rec_starting")}</span>}
      </div>
      {live && <div style={{ color: "#F0C420", fontSize: 12 }}>{t("sc_no_guests")}</div>}
      {done && <div role="status" style={{ maxWidth: 480, textAlign: "center", padding: "10px 14px", border: "2px solid #F0C420", borderRadius: 14, background: "#000", color: "#F0C420", fontWeight: 800 }}>{t("sc_made")}</div>}
      {message && !done && <div role="alert" style={{ maxWidth: 480, textAlign: "center", padding: "10px 14px", border: "2px solid #F0C420", borderRadius: 14, background: "#000", color: "#F0C420", fontWeight: 700 }}>{message}</div>}
    </div>
  );
}
