// Settings page, above Delete Account (Steve, 2026-11-28): "Total Members On Bingg Bongg ----- 5,565"
// "and keep counting." The real number from fetchMemberCount (every member row, nothing added), asked
// again every 45 s while the tab is visible; when it changes the number counts up to it. On first show
// it counts up quickly from a little lower. Information only — not a link, not a button.
import { useEffect, useRef, useState } from "react";
import { post } from "../lib/api";
import { currentLang, useT } from "../lib/i18n";

const REFRESH_MS = 45_000;

export function MemberCountBox() {
  const { t } = useT();
  const [shown, setShown] = useState<number | null>(null);
  const shownRef = useRef<number | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    let alive = true;
    const animate = (from: number, to: number, ms: number) => {
      cancelAnimationFrame(raf.current);
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / ms);
        const v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        shownRef.current = v; setShown(v);
        if (p < 1 && alive) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    };
    const load = () => {
      if (document.visibilityState !== "visible") return;
      post<unknown>("fetchMemberCount", {}).then((r) => {
        const total = Number((r as unknown as { total?: number }).total);
        if (!alive || !r.status || !Number.isFinite(total) || total <= 0) return;
        const cur = shownRef.current;
        if (cur === null) animate(Math.max(0, total - Math.min(40, Math.round(total * 0.01) + 12)), total, 1400);
        else if (total !== cur) animate(cur, total, 1200);
      }).catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; window.clearInterval(id); cancelAnimationFrame(raf.current); document.removeEventListener("visibilitychange", load); };
  }, []);

  if (shown === null) return null;
  return (
    <div className="card settings-box" style={{ marginBottom: 12, overflow: "hidden" }} aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px" }}>
        <b style={{ color: "var(--gold)", fontSize: 15, lineHeight: 1.25 }}>{t("total_members_on_bb")}</b>
        <span style={{ color: "var(--gold)", fontWeight: 800, fontSize: 26, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {new Intl.NumberFormat(currentLang()).format(shown)}
        </span>
      </div>
    </div>
  );
}
