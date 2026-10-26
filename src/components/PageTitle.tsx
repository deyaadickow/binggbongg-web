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

/** `backTo` fixes where the arrow goes. The directory uses it (Steve, 2026-10-25: its back arrow
 *  must always lead to For You, whatever page was open before it). */
/** [right]: an optional control on the far side of the bar, across from the back arrow (the
 *  Features page puts its language bullseye there — Steve, 2026-10-26). */
export function PageTitle({ children, style, backTo, right }: { children: ReactNode; style?: CSSProperties; backTo?: string; right?: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useT();
  return (
    <div className="cosmic-head">
      {/* navigate(-1) rather than a fixed destination: a page is reached from the directory,
          from the nav, or from a link inside another page, and "back" should mean whichever of
          those it was. */}
      <button className="back-circle" onClick={() => (backTo ? navigate(backTo) : navigate(-1))} aria-label={t("back")}>‹</button>
      <h1 className="page-title" style={{ margin: 0, ...style }}>{children}</h1>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}
