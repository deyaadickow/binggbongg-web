import { useCallback, useEffect, useState } from "react";
import { displayName, mediaUrl, post, type UserSummary } from "../lib/api";
import { tt } from "../lib/i18n";

/** Top Supporters board (Steve, 2026-11-26: "Yes add an optional \"Top Supporters\" board inside Bingg Bongg live
 *  rooms, BBs only No money, No $ signs"). The host switches it on for their stream; everyone in the room then sees
 *  the top 8 by REAL BBs gifted in this stream (LivestreamController::fetchTopSupporters). Never a money figure. */
export type TopSupporter = { user_id: number; fullname?: string; username?: string; profile_image?: string; bbs: number };
type Resp = { status?: boolean; on?: boolean; supporters?: TopSupporter[] };

export function useTopSupporters(roomName: string, giftTick: number) {
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<TopSupporter[]>([]);
  const refresh = useCallback(() => {
    if (!roomName) return;
    post<Resp>("fetchTopSupporters", { room_name: roomName }).then((r) => {
      const d = r as unknown as Resp;
      setOn(!!d?.on);
      setRows(Array.isArray(d?.supporters) ? d.supporters : []);
    }).catch(() => { /* keep what we have */ });
  }, [roomName]);
  useEffect(() => { refresh(); const id = window.setInterval(refresh, 10000); return () => window.clearInterval(id); }, [refresh]);
  // A gift just landed: the ledger row is written before the chat line, so a short wait is enough.
  useEffect(() => { if (giftTick > 0) { const id = window.setTimeout(refresh, 1500); return () => window.clearTimeout(id); } }, [giftTick, refresh]);
  const setBoard = useCallback(async (next: boolean, myUserId: number) => {
    const r = (await post<Resp>("setTopSupportersBoard", { my_user_id: myUserId, room_name: roomName, on: next ? 1 : 0 })) as unknown as Resp;
    if (r?.status) { setOn(!!r.on); refresh(); return true; }
    return false;
  }, [roomName, refresh]);
  return { on, rows, setBoard, refresh };
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function TopSupportersStrip({ rows }: { rows: TopSupporter[] }) {
  return (
    <div className="top-supporters" aria-label={tt("ts_title")}>
      <div className="ts-title">🏆 {tt("ts_title")}</div>
      {rows.length === 0 ? (
        <div className="ts-empty">{tt("ts_empty")}</div>
      ) : (
        <div className="ts-row">
          {rows.map((r, i) => {
            const name = displayName({ fullname: r.fullname, username: r.username } as Partial<UserSummary>);
            return (
              <div key={r.user_id} className="ts-chip" title={name}>
                <span className="ts-rank">{MEDALS[i] ?? `#${i + 1}`}</span>
                {r.profile_image ? <img src={mediaUrl(r.profile_image)} alt="" /> : <span className="ts-noimg">{(name || "?").slice(0, 1)}</span>}
                <span className="ts-text">
                  <span className="ts-name">{name}</span>
                  <span className="ts-bbs">{tt("ts_bbs", r.bbs.toLocaleString())}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
