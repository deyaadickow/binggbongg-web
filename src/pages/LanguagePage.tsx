// Settings -> Change Language (Steve, 2026-10-18).
//
// This route used to be a Coming Soon card reading "The web app is in English for now. The phone
// apps speak 53 languages." It is a real picker now.
//
// Only the languages that actually have a dictionary are listed. Offering all 53, as the phones
// do, would be worse than offering four: fifty of those rows would change nothing on screen, and
// a member would reasonably conclude the setting was broken. The list grows as the translations
// land, four at a time.
import { LANGUAGES, useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { PageTitle } from "../components/PageTitle";

export function LanguagePage() {
  const { lang, setLang, t } = useT();
  useSession(); // the page works signed out too; the choice lives in this browser either way

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageTitle>{t("change_language")}</PageTitle>
      <p className="muted" style={{ marginTop: -4 }}>{t("language_note")}</p>

      <div className="card" style={{ borderColor: "var(--gold-border)", overflow: "hidden" }}>
        {LANGUAGES.map((l, i) => {
          const chosen = l.code === lang;
          return (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              aria-current={chosen ? "true" : undefined}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "14px 16px", textAlign: "left", cursor: "pointer",
                background: chosen ? "rgba(212,175,55,0.12)" : "transparent",
                border: "none", borderTop: i === 0 ? "none" : "1px solid var(--gold-border)",
                color: "var(--gold)", font: "inherit",
              }}
            >
              <span>
                {/* The native name first: it is the one a member looking for their own language
                    can actually read. The English name is the hint, not the label. */}
                <strong style={{ fontSize: 16 }}>{l.native}</strong>
                {l.native !== l.english && (
                  <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>{l.english}</span>
                )}
              </span>
              {/* Rendered, not faded out: an opacity-0 tick is still in the accessibility
                  tree, so a screen reader announced every language as the chosen one. The
                  fixed width keeps the rows from shifting as the choice moves. */}
              <span aria-hidden style={{ fontSize: 18, width: 18, textAlign: "right" }}>{chosen ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>

      {/* Honest about the state of it: the four languages are not finished to the last string,
          and a member who picks one and then sees English should know why. */}
      {lang !== "en" && (
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{t("language_partly_done")}</p>
      )}
    </div>
  );
}
