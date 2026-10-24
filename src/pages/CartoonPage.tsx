// Cartoon Me — Steve, 2026-10-12: "only signed member are able to do both take a selfie or upload
// an image to get best quality cartoon looking images. Cost will be 25 coins for each image. No
// free bees.. the image can go in his photo library. Or he can download it to his phone. He can
// delete from his photo library anytime."
//
// The browser's half of the same rules the phones follow:
//  - signed in only, enforced here for the UI and again by the server's authorizeUser middleware;
//  - the price comes from the server, so 25 can change without a deploy of three clients;
//  - one confirmation naming the price, and the button dead from the moment it is clicked until
//    the server answers, because a double click would be two cartoons and 50 coins.
//
// "Take a selfie" is capture="user" on the file input: on a phone browser that opens the camera
// straight onto the front lens, and on a desktop it falls back to the normal file picker, which
// is the right thing there — a laptop user picking a photo is the same action.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { currentAuthHeaders } from "../lib/api";
import { useSession } from "../lib/session";
import { fetchCartoonSettings, makeCartoon, type CartoonStyle } from "../lib/photos";
import { Notice } from "../components/Common";
import { tt, useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";

export function CartoonPage() {
  const { t, tn } = useT();
  const { user, isLoggedIn } = useSession();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [coins, setCoins] = useState(25);
  // The style shelf comes from the server, so a style Steve adds in admin shows up here with no
  // deploy. Until it answers there is nothing to pick, which is why the grid renders off `styles`
  // rather than a hardcoded list.
  const [styles, setStyles] = useState<CartoonStyle[]>([]);
  const [styleId, setStyleId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [picked, setPicked] = useState<File | null>(null);
  const [pickedUrl, setPickedUrl] = useState("");
  const [cartoonUrl, setCartoonUrl] = useState("");
  const [folderName, setFolderName] = useState("Cartoons");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    fetchCartoonSettings(user.id).then((s) => {
      setCoins(s.coins ?? 25);
      setEnabled(s.enabled !== false);
      const shelf = s.styles ?? [];
      setStyles(shelf);
      // Pre-select the first style so the button is never "make what?", and so a member who
      // ignores the grid entirely gets the same thing this page did before styles existed.
      setStyleId((prev) => prev ?? shelf[0]?.id ?? null);
    });
  }, [user]);

  // Price follows the chosen style, because a style may carry its own. Everything that quotes
  // a number — the confirm, the button, the footnote — reads this one value, so they cannot
  // disagree with each other or with what the server actually charges.
  const chosenStyle = useMemo(() => styles.find((s) => s.id === styleId) ?? null, [styles, styleId]);
  const price = chosenStyle?.coins ?? coins;

  // An object URL is a live handle to the file; letting them pile up leaks memory on a page
  // somebody might make several cartoons from.
  useEffect(() => () => { if (pickedUrl) URL.revokeObjectURL(pickedUrl); }, [pickedUrl]);

  const choose = useCallback((file: File | undefined) => {
    if (!file) return;
    if (pickedUrl) URL.revokeObjectURL(pickedUrl);
    setPicked(file);
    setPickedUrl(URL.createObjectURL(file));
    // A new photo clears the last result, so "Save to my phone" can never point at a cartoon
    // that is no longer the one on screen.
    setCartoonUrl("");
    setError("");
  }, [pickedUrl]);

  async function run() {
    if (!user || !picked || busy) return;
    if (!window.confirm(tt("cartoon_confirm_cost", price, price))) return;
    setBusy(true);
    setError("");
    try {
      const result = await makeCartoon(user.id, picked, currentAuthHeaders(), styleId ?? undefined);
      setCartoonUrl(result.downloadUrl);
      setFolderName(result.folderName);
      // They pick again to pay again — the button must not stay live on a finished cartoon.
      setPicked(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="page">
        <PageTitle>{t("photo_styles")}</PageTitle>
        <Notice>{tn("please_sign_in_to_make_a_cartoon", <Link to="/login">{t("sign_in_2")}</Link>)}</Notice>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("photo_styles")}</PageTitle>
      <p className="soft">{t("take_a_selfie_or_pick_a_photo_and_get_yo")}</p>

      <div style={{ background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 280, overflow: "hidden" }}>
        {cartoonUrl ? (
          <img src={cartoonUrl} alt={t("your_cartoon")} style={{ width: "100%", maxHeight: 460, objectFit: "contain", display: "block" }} />
        ) : pickedUrl ? (
          <img src={pickedUrl} alt="" style={{ width: "100%", maxHeight: 460, objectFit: "contain", display: "block" }} />
        ) : chosenStyle?.sample ? (
          /* Steve, 2026-10-19: "give them an example of what that character will look like."
             Thirty style NAMES mean nothing — "Tiny Planet" is a guess until you have seen one.
             The example goes in the empty picture box and changes as you pick along the shelf. */
          <div style={{ position: "relative", display: "inline-block" }}>
            <img src={chosenStyle.sample} alt="" style={{ maxWidth: "100%", maxHeight: 420, borderRadius: 12 }} />
            <span style={{
              position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
              background: "var(--gold)", color: "#000", fontWeight: 700, fontSize: 12,
              padding: "4px 12px", borderRadius: 999,
            }}>{t("example")}</span>
          </div>
        ) : (
          <span className="muted">{t("no_photo_chosen_yet")}</span>
        )}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden
             onChange={(e) => choose(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden
             onChange={(e) => choose(e.target.files?.[0])} />

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => cameraRef.current?.click()} disabled={busy}>{t("take_a_selfie")}</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => galleryRef.current?.click()} disabled={busy}>{t("choose_a_photo")}</button>
      </div>

      {/* The shelf. Scrolls rather than paginates: the whole point is that Steve can keep
          adding, so this must not need redesigning at the twentieth style. */}
      {styles.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{t("pick_a_style")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
            {styles.map((s) => {
              const chosen = s.id === styleId;
              return (
                <button key={s.id} onClick={() => setStyleId(s.id)} disabled={busy}
                        aria-pressed={chosen}
                        style={{
                          padding: "10px 6px", borderRadius: 12, cursor: busy ? "default" : "pointer",
                          background: chosen ? "rgba(212,175,55,0.16)" : "transparent",
                          border: `1.5px solid ${chosen ? "var(--gold)" : "var(--gold-border)"}`,
                          color: "var(--gold)", font: "inherit", textAlign: "center",
                        }}>
                  <div style={{ fontSize: 22, lineHeight: 1.1 }} aria-hidden>{s.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{s.name}</div>
                  {/* Only shown when this style is not the usual price, so 30 identical
                      "25 coins" labels do not become noise. */}
                  {s.coins !== coins && (
                    <div className="muted" style={{ fontSize: 11 }}>{t("n_coins", s.coins)}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {enabled ? (
        <button className="btn primary" style={{ width: "100%", marginTop: 12 }}
                onClick={run} disabled={!picked || busy}>
          {busy ? t("drawing_your_picture") : t("f_make_my_cartoon_looking_photo", String(price))}
        </button>
      ) : (
        <div style={{ marginTop: 12 }}><Notice>{t("cartoons_aren_t_switched_on_yet_please_c")}</Notice></div>
      )}

      {/* Steve, 2026-10-12: "we need a message to let them know while the wheel is turning."
          A real number, not "a few seconds" — a silent wait reads as a hang. */}
      {busy && (
        <div className="muted" style={{ textAlign: "center", marginTop: 8 }}>
          {t("this_cartoon_image_creation_will_take_be")}</div>
      )}

      {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}

      {cartoonUrl && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "var(--gold)", fontWeight: 700, textAlign: "center" }}>
            {tn("saved_to_your_photos_folder", <Link to="/photos">{t("photos")}</Link>, folderName)}
          </div>
          <a className="btn" href={cartoonUrl} download style={{ display: "block", textAlign: "center", marginTop: 10 }}>
            {t("save_to_my_computer")}</a>
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, marginTop: 18 }}>
        {t("cartoon_cost_note", price)}
      </div>
    </div>
  );
}
