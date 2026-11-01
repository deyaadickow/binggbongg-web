// Steve, 2026-11-01, on a page opened from Bingg Bongg Features: "please add a back button to all
// these features." About thirty pages already carry PageTitle's gold back arrow; the rest (Live
// Now among them) left a member opening them from the directory with no way back but the
// browser's own button. Rather than edit every page — and miss the next one — this shows the same
// gold chevron above any page that has no back arrow of its own, and stays out of the way on the
// pages that do.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";

export function FallbackBack() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pageHasOwn, setPageHasOwn] = useState(true);

  useEffect(() => {
    const main = ref.current?.parentElement;
    if (!main) return;
    // Pages draw their header after their data arrives, so keep watching rather than looking once.
    const check = () => setPageHasOwn(!!main.querySelector(".back-circle:not(.fallback-back)"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(main, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [pathname]);

  const home = pathname === "/" || pathname === "";
  const back = () => {
    // react-router keeps the position in history.state.idx; 0 means this page was opened
    // directly (a shared link), where "back" would leave the site — go to the directory instead.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate("/features");
  };
  return (
    <div ref={ref} className="fallback-back-row" style={{ display: home || pageHasOwn ? "none" : "flex" }}>
      <button className="back-circle fallback-back" onClick={back} aria-label={t("back")}>‹</button>
    </div>
  );
}
