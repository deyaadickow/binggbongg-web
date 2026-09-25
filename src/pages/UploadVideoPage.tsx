// Upload a video from the browser. Same pipeline the phones use since AWS keys were pulled out
// of the clients (2026-09-24): ask for a pre-signed url, PUT to S3 from here, then tell the
// backend the key. The thumbnail uploadPost requires is taken from the video itself rather than
// asked for separately.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "../lib/api";
import { useSession } from "../lib/session";
import { createUploadUrls, putToSignedUrl, videoDuration, videoThumbnail } from "../lib/upload";
import { Notice } from "../components/Common";

interface ContestCat { id: number; name?: string | null }
interface CountryRow { name?: string | null; states?: { name?: string | null }[] }

/** A sanity ceiling only — the server has the real say. Catches a wrong file before any bytes move. */
const MAX_MB = 512;

export function UploadVideoPage() {
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [cats, setCats] = useState<ContestCat[]>([]);
  const [countries, setCountries] = useState<CountryRow[]>([]);

  const [catId, setCatId] = useState<string>("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [link, setLink] = useState("");
  const [canComment, setCanComment] = useState(true);
  const [canSave, setCanSave] = useState(true);
  const [allowRepost, setAllowRepost] = useState(true);

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    post<{ contestCats?: ContestCat[]; countryStates?: { data?: CountryRow[] } }>("fetchSettings", { x: 1 })
      .then((r) => {
        setCats((r.data?.contestCats ?? []).slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")));
        setCountries(r.data?.countryStates?.data ?? []);
      })
      .catch(() => undefined);
  }, []);

  // Prefill the member's own country so most people never touch these two.
  useEffect(() => {
    if (user?.country && !country) setCountry(user.country);
  }, [user?.country, country]);

  const states = useMemo(
    () => countries.find((c) => c.name === country)?.states ?? [],
    [countries, country],
  );

  const pick = useCallback(async (f: File) => {
    setError("");
    setDuration(null);
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(0)}MB — the limit is ${MAX_MB}MB.`);
      return;
    }
    setFile(f);
    try {
      setDuration(await videoDuration(f));
    } catch (e) {
      setError((e as Error).message);
      setFile(null);
    }
  }, []);

  async function upload() {
    if (!user || !file || busy) return;
    if (!catId) { setError("Pick a category."); return; }
    setBusy(true);
    setError("");
    try {
      setStage("Making a thumbnail…");
      const thumb = await videoThumbnail(file);

      setStage("Preparing the upload…");
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const slots = await createUploadUrls(user.id, [
        { file_name: safe, content_type: file.type || "video/mp4" },
        { file_name: safe.replace(/\.[^.]+$/, "") + "-thumb.jpg", content_type: "image/jpeg" },
      ]);
      const [videoSlot, thumbSlot] = slots;
      if (!videoSlot || !thumbSlot) throw new Error("Couldn't prepare the upload. Please try again.");

      setStage("Uploading your video…");
      await putToSignedUrl(videoSlot, file, setProgress);

      setStage("Uploading the thumbnail…");
      await putToSignedUrl(thumbSlot, new File([thumb], "thumb.jpg", { type: "image/jpeg" }));

      setStage("Publishing…");
      const res = await post("uploadPost", {
        user_id: user.id,
        video: videoSlot.key,
        thumbnail: thumbSlot.key,
        can_comment: canComment ? 1 : 0,
        can_save: canSave ? 1 : 0,
        allow_repost: allowRepost ? 1 : 0,
        contest_cat_id: catId,
        ...(link.trim() ? { link: link.trim() } : {}),
        ...(country ? { country } : {}),
        ...(state ? { state } : {}),
      });
      if (!res.status) throw new Error(res.message ?? "Couldn't publish that video.");
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStage("");
      setProgress(0);
    }
  }

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>Sign in to upload a video.</Notice></div>;
  }

  if (done) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <h1 className="page-title">Upload video</h1>
        <div className="card pad">
          <p className="soft" style={{ marginTop: 0 }}>Uploaded. It will appear on your profile and in the feed.</p>
          <div className="row">
            <button className="btn" onClick={() => navigate(`/profile/${user.id}`)}>See my profile</button>
            <button className="btn ghost" onClick={() => { setDone(false); setFile(null); setDuration(null); setLink(""); }}>Upload another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Upload video</h1>

      <div className="card pad" style={{ marginBottom: 12 }}>
        <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
        {!file ? (
          <>
            <p className="soft" style={{ marginTop: 0 }}>Choose a video from this device. Up to {MAX_MB}MB.</p>
            <button className="btn" onClick={() => fileRef.current?.click()}>Choose video</button>
          </>
        ) : (
          <div className="row" style={{ alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</b>
              <span className="muted" style={{ fontSize: 12 }}>
                {(file.size / 1024 / 1024).toFixed(1)}MB{duration ? ` · ${Math.round(duration)}s` : ""}
              </span>
            </div>
            <button className="btn small ghost" disabled={busy} onClick={() => fileRef.current?.click()}>Change</button>
          </div>
        )}
      </div>

      <div className="card pad" style={{ marginBottom: 12 }}>
        <label className="soft" style={{ fontSize: 13 }}>Category</label>
        <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)} style={{ width: "100%", marginBottom: 10 }}>
          <option value="">Choose a category…</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label className="soft" style={{ fontSize: 13 }}>Description</label>
        <textarea className="input" rows={3} value={link} onChange={(e) => setLink(e.target.value)}
          placeholder="Say something about this video…" style={{ width: "100%", marginBottom: 10 }} />

        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="soft" style={{ fontSize: 13 }}>Country</label>
            <select className="input" value={country} onChange={(e) => { setCountry(e.target.value); setState(""); }} style={{ width: "100%" }}>
              <option value="">—</option>
              {countries.map((c) => <option key={c.name ?? ""} value={c.name ?? ""}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="soft" style={{ fontSize: 13 }}>State</label>
            <select className="input" value={state} onChange={(e) => setState(e.target.value)} disabled={!states.length} style={{ width: "100%" }}>
              <option value="">—</option>
              {states.map((s) => <option key={s.name ?? ""} value={s.name ?? ""}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        {([
          ["Allow comments", canComment, setCanComment],
          ["Allow saving", canSave, setCanSave],
          ["Allow reposting", allowRepost, setAllowRepost],
        ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
          <label key={label} className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <div style={{ flex: 1, fontWeight: 700 }}>{label}</div>
            <input type="checkbox" className="switch" checked={val} onChange={(e) => set(e.target.checked)} />
          </label>
        ))}
      </div>

      {error && <p style={{ color: "#f55", fontSize: 13 }}>{error}</p>}

      {busy && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{stage}</div>
          <div style={{ height: 8, background: "var(--panel)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "var(--gold-border)", transition: "width .2s" }} />
          </div>
        </div>
      )}

      <button className="btn block" disabled={busy || !file} onClick={upload}
        style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
        {busy ? "Uploading…" : "Upload video"}
      </button>
    </div>
  );
}
