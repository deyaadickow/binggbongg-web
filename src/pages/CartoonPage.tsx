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
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { currentAuthHeaders } from "../lib/api";
import { useSession } from "../lib/session";
import { fetchCartoonSettings, makeCartoon } from "../lib/photos";
import { Notice } from "../components/Common";

export function CartoonPage() {
  const { user, isLoggedIn } = useSession();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [coins, setCoins] = useState(25);
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
    });
  }, [user]);

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
    if (!window.confirm(`This costs ${coins} coins. If you try again later, that's another ${coins} coins.`)) return;
    setBusy(true);
    setError("");
    try {
      const result = await makeCartoon(user.id, picked, currentAuthHeaders());
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
        <h1 className="page-title">Cartoon Me</h1>
        <Notice>Please <Link to="/login">sign in</Link> to make a cartoon.</Notice>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Cartoon Me</h1>
      <p className="soft">Take a selfie or pick a photo, and get yourself back as a cartoon character.</p>

      <div style={{ background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 280, overflow: "hidden" }}>
        {cartoonUrl ? (
          <img src={cartoonUrl} alt="Your cartoon" style={{ width: "100%", maxHeight: 460, objectFit: "contain", display: "block" }} />
        ) : pickedUrl ? (
          <img src={pickedUrl} alt="" style={{ width: "100%", maxHeight: 460, objectFit: "contain", display: "block" }} />
        ) : (
          <span className="muted">No photo chosen yet.</span>
        )}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden
             onChange={(e) => choose(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden
             onChange={(e) => choose(e.target.files?.[0])} />

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => cameraRef.current?.click()} disabled={busy}>Take a selfie</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => galleryRef.current?.click()} disabled={busy}>Choose a photo</button>
      </div>

      {enabled ? (
        <button className="btn primary" style={{ width: "100%", marginTop: 12 }}
                onClick={run} disabled={!picked || busy}>
          {busy ? "Drawing your cartoon…" : `Make my cartoon · ${coins} coins`}
        </button>
      ) : (
        <div style={{ marginTop: 12 }}><Notice>Cartoons aren't switched on yet. Please check back soon.</Notice></div>
      )}

      {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}

      {cartoonUrl && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "var(--gold)", fontWeight: 700, textAlign: "center" }}>
            Saved to your <Link to="/photos">Photos</Link> ▸ {folderName}
          </div>
          <a className="btn" href={cartoonUrl} download style={{ display: "block", textAlign: "center", marginTop: 10 }}>
            Save to my computer
          </a>
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, marginTop: 18 }}>
        Each try costs {coins} coins, including trying again. Your cartoon is saved in Photos ▸ Cartoons,
        and you can delete it there whenever you like.
      </div>
    </div>
  );
}
