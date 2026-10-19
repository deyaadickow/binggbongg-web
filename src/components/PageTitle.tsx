// Steve, 2026-10-19, after the same pass on the phones: "Do the same for iOS and web."
//
// The phones' complaint was that a page opened from the directory had no way back and nothing
// saying where you were. On the web nobody is ever truly stuck — the top nav is always on
// screen and the browser has its own back button — but only ONE page in the whole site (the
// schedule) had the app's own back control, so every other page looked unlike the phones.
//
// This is that control, and the page's title beside it: the gold chevron on a black disc, the
// same `cosmic-head` + `back-circle` pair UpcomingPage already used.
import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";

export function PageTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const navigate = useNavigate();
  const { t } = useT();
  return (
    <div className="cosmic-head">
      {/* navigate(-1) rather than a fixed destination: a page is reached from the directory,
          from the nav, or from a link inside another page, and "back" should mean whichever of
          those it was. */}
      <button className="back-circle" onClick={() => navigate(-1)} aria-label={t("back")}>‹</button>
      <h1 className="page-title" style={{ margin: 0, ...style }}>{children}</h1>
    </div>
  );
}
