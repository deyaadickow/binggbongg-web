// "Pay with: FBBs | BBs" — the small gold two-option switch (Steve, 2026-11-10, BBs + FBBs spec).
// Shown in the gift panels and on the Wallet; one app-wide choice kept by lib/payWith.ts.
import { usePayWith } from "../lib/payWith";
import { useT } from "../lib/i18n";

export function PayWithSwitch({ hint = false }: { hint?: boolean }) {
  const { t } = useT();
  const [payWith, setPayWith] = usePayWith();
  return (
    <div className="pay-with">
      <div className="pay-with-row" role="radiogroup" aria-label={t("pay_with")}>
        <span className="pay-with-label">{t("pay_with")}</span>
        {/* i18n-exempt: FBBs / BBs are brand words, the same in every language. */}
        <button type="button" role="radio" aria-checked={payWith === "pbb"} className={payWith === "pbb" ? "on" : ""}
          onClick={() => setPayWith("pbb")}>FBBs</button>
        <button type="button" role="radio" aria-checked={payWith === "bb"} className={payWith === "bb" ? "on" : ""}
          onClick={() => setPayWith("bb")}>BBs</button>
      </div>
      {hint && <div className="pay-with-hint">{t(payWith === "bb" ? "pay_with_bbs_hint" : "pay_with_pbbs_hint")}</div>}
    </div>
  );
}
