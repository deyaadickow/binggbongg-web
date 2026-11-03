// Steve, 2026-11-03: "When members are watching a live add a timer for them, when a host clicks
// all watchers/audience he will be able to see how long this member has been watching this live.
// and for everyone to see."
//
// The watchers list under the Leader Board, with a gold watch-time on every row. The start time
// is LiveKit's own participant.joinedAt (set by the SFU, so the host and every viewer see the same
// number), matched to the row by the `user_<id>` identity. A member LiveKit can't place falls back
// to when this client first saw them in the list.
//
// One shared 1 s ticker, and only while this list is mounted (i.e. open) — never one per row and
// never with the list closed. Kept in its own component so the tick re-renders this list only,
// not the whole live room page.
import { useEffect, useState } from "react";
import { displayName, mediaUrl, type UserSummary } from "../lib/api";
import { Avatar } from "./Common";
import { useT } from "../lib/i18n";

export interface WatcherRow { user_id: number; fullname?: string; username?: string; profile_image?: string }

/** "12:34" under an hour, "1:05:09" from an hour. */
function formatWatchTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function WatchersList({ watchers, onStage, joinTimes, firstSeen }: {
  watchers: WatcherRow[];
  /** Host and guests on stage: they aren't "watching", so their rows get no timer. */
  onStage: Set<number>;
  /** user id -> LiveKit joinedAt (epoch ms), read once per tick. */
  joinTimes: () => Map<number, number>;
  /** user id -> when this client first saw them in the list (the fallback). */
  firstSeen: Map<number, number>;
}) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  const [longestFirst, setLongestFirst] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const joined = joinTimes();
  const startOf = (uid: number): number | null =>
    onStage.has(uid) ? null : joined.get(uid) ?? firstSeen.get(uid) ?? null;

  const rows = watchers.map((w, i) => ({ w, i, start: startOf(w.user_id) }));
  // Default keeps today's order; the toggle puts the longest watchers first (earliest start),
  // with on-stage rows (no timer) after them in their original order.
  if (longestFirst) rows.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.i - b.i);

  return (
    <>
      {watchers.length > 1 && (
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "var(--gold)", margin: "0 0 8px", cursor: "pointer" }}>
          <input type="checkbox" checked={longestFirst} onChange={(e) => setLongestFirst(e.target.checked)}
            style={{ accentColor: "var(--gold)", margin: 0 }} />
          {t("watch_time_longest_first")}
        </label>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "30vh", overflowY: "auto" }}>
        {rows.map(({ w, start }) => {
          const time = start !== null ? formatWatchTime(now - start) : null;
          return (
            <div key={w.user_id} className="row" style={{ padding: "8px 10px", border: "1px solid var(--gold-border)", borderRadius: 10, background: "#111" }}>
              <Avatar user={{ fullname: w.fullname, username: w.username, profile_image: w.profile_image ? mediaUrl(w.profile_image) : undefined } as Partial<UserSummary>} />
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {displayName({ fullname: w.fullname, username: w.username } as Partial<UserSummary>)}
              </div>
              {time !== null && (
                <div title={`${t("watch_time_watching")} ${time}`}
                  style={{ flexShrink: 0, textAlign: "right", color: "var(--gold)", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 10, opacity: 0.75 }}>{t("watch_time_watching")}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>⏱ {time}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
