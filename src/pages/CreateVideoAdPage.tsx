// Create a video ad — the web port of iOS's CreateVideoAdView (Steve, 2026-09-30: "Build it the
// same way it works on ios").
//
// Same flow, same order: level picker (city/state/country) -> country picker, built from the real
// pricing tiers rather than a full country list because a country with no active tier can't be
// targeted at all -> state picker from the bundled countryStates data -> for city level, a city
// list fetched per scoping state. Each confirmed selection becomes a target row; the server caps
// at 25 and so does this.
//
// One deliberate addition over iOS: the running monthly total. Submitting charges the member's
// Cash Account immediately, so the price they are agreeing to is on screen before the button —
// Android already shows this (CreateVideoAdActivity's tv_total_price) and it is the better of the
// two behaviours to copy.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { post } from "../lib/api";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { videoDuration, videoThumbnail } from "../lib/upload";
import {
  createVideoAd, fetchAdPricingTiers, fetchCitiesForState, MAX_AD_VIDEO_SECONDS, MAX_TARGETS_PER_AD,
  priceForTarget, sameTarget, splitMainMarkets, targetLabel, tierFor, totalMonthlyPrice,
  type AdPricingTier, type GeoLevel, type PendingTarget,
} from "../lib/videoads";

/** countryStates.json rows. iso2 and state_code are both in the payload — UploadVideoPage just
 *  never needed them; the ad targeter does, to match tier country_code and look up cities. */
interface CountryRow { name?: string | null; iso2?: string | null; states?: { name?: string | null; state_code?: string | null }[] }

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CreateVideoAdPage() {
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();

  const [tiers, setTiers] = useState<AdPricingTier[] | null>(null);
  const [countryData, setCountryData] = useState<CountryRow[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  const [level, setLevel] = useState<GeoLevel>("city");
  const [countryCode, setCountryCode] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [stateName, setStateName] = useState("");
  const [cities, setCities] = useState<string[] | null>(null);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [targets, setTargets] = useState<PendingTarget[]>([]);
  const [referralCode, setReferralCode] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdPricingTiers().then(setTiers).catch((e) => { setTiers([]); setError((e as Error).message); });
    post<{ countryStates?: { data?: CountryRow[] } }>("fetchSettings", { x: 1 })
      .then((r) => setCountryData(r.data?.countryStates?.data ?? []))
      .catch(() => setCountryData([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    // .data, not the envelope — see the note on AdvertisePage about this being read wrongly there.
    post<{ balance?: number }>("fetchMyAdCashAccount", { my_user_id: user.id })
      .then((r) => setBalance(Number(r.data?.balance ?? 0)))
      .catch(() => undefined);
  }, [user]);

  /** Only countries that actually have an active tier at the chosen level. */
  const countries = useMemo(() => {
    if (!tiers) return [];
    const seen = new Map<string, string>();
    for (const t of tiers) if (t.level === level) seen.set(t.country_code, t.country_name);
    return [...seen.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tiers, level]);

  /* Steve, 2026-09-30, once the list reached 192: "add a search box and put my main countries on
     top". Both groups are filtered by the same query, so a search never hides a main market. */
  const { main: mainMarkets, rest: otherCountries } = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    const match = (c: { code: string; name: string }) =>
      !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q;
    const { main, rest } = splitMainMarkets(countries);
    return { main: main.filter(match), rest: rest.filter(match) };
  }, [countries, countryQuery]);

  const states = useMemo(() => {
    const row = countryData.find((c) => (c.iso2 ?? "").toUpperCase() === countryCode.toUpperCase());
    return (row?.states ?? []).filter((s) => s.name);
  }, [countryData, countryCode]);

  const countryName = useMemo(
    () => countries.find((c) => c.code === countryCode)?.name ?? "",
    [countries, countryCode],
  );

  const levelPrice = useMemo(() => {
    if (!tiers || !countryCode) return null;
    return tierFor(tiers, countryCode, level)?.advertiser_monthly_price ?? null;
  }, [tiers, countryCode, level]);

  const total = useMemo(() => totalMonthlyPrice(tiers ?? [], targets), [tiers, targets]);
  const shortBy = balance != null && total > balance ? total - balance : 0;

  function addTarget(next: PendingTarget) {
    setError(null);
    if (targets.length >= MAX_TARGETS_PER_AD) {
      setError(`You can target at most ${MAX_TARGETS_PER_AD} locations on one ad.`);
      return;
    }
    if (targets.some((t) => sameTarget(t, next))) return; // already added — same as iOS, a silent no-op
    setTargets((prev) => [...prev, next]);
  }

  async function loadCities(stateCode: string, name: string) {
    setStateName(name);
    setCities(null);
    setCitiesError(null);
    if (!stateCode) return;
    try {
      setCities(await fetchCitiesForState(countryCode, stateCode));
    } catch (e) {
      setCities([]);
      setCitiesError((e as Error).message);
    }
  }

  async function onPickFile(f: File | null) {
    setFileError(null);
    setFile(null);
    setDuration(null);
    if (!f) return;
    try {
      const secs = await videoDuration(f);
      if (secs > MAX_AD_VIDEO_SECONDS) {
        setFileError(`That video is ${Math.round(secs)}s — ad videos can be up to ${MAX_AD_VIDEO_SECONDS}s.`);
        return;
      }
      setFile(f);
      setDuration(secs);
    } catch {
      setFileError("Couldn't read that video. Please try another file.");
    }
  }

  async function submit() {
    if (!user || !file) return;
    setError(null);
    setProgress(0);
    try {
      setStage("Making a thumbnail…");
      const thumb = await videoThumbnail(file);

      setStage("Uploading your video…");
      await createVideoAd({
        myUserId: user.id,
        targets,
        video: file,
        thumbnail: thumb,
        durationSeconds: duration,
        referralCode,
        onProgress: (fraction) => {
          setProgress(fraction);
          // The server reviews the video after the upload lands, before it charges anything,
          // so the wait after 100% is real and worth naming.
          if (fraction >= 1) setStage("Reviewing your video…");
        },
      });
      navigate("/settings/advertise");
    } catch (e) {
      setError((e as Error).message);
      setStage(null);
    }
  }

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>Sign in to open this page. <Link to="/login">Sign in</Link></Notice></div>;
  }

  const busy = stage != null;
  const canSubmit = targets.length > 0 && file != null && !busy;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Create a Video Ad</h1>

      {tiers === null ? <Loading /> : (
        <>
          {/* ---- Targets ------------------------------------------------------------------ */}
          <div className="card pad" style={{ marginBottom: 12 }}>
            <b style={{ color: "var(--gold)" }}>Target Locations ({targets.length}/{MAX_TARGETS_PER_AD})</b>

            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {(["city", "state", "country"] as GeoLevel[]).map((l) => (
                <button
                  key={l}
                  className={`btn small ${level === l ? "" : "ghost"}`}
                  onClick={() => { setLevel(l); setCountryCode(""); setStateName(""); setCities(null); }}
                >{l[0].toUpperCase() + l.slice(1)}</button>
              ))}
            </div>

            <label style={{ marginTop: 12 }}>Country</label>
            <input
              className="input"
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
              placeholder={`Search ${countries.length} countries…`}
              style={{ marginBottom: 8 }}
            />
            {/* Steve, 2026-09-30: "Make all countries black background with a gold border for each
                country." This was a <select>, whose options can't be styled per-row in any
                cross-browser way, so it's now a scrolling list of gold-bordered cards — the same
                thing the two apps' picker sheets show. */}
            <div style={{ maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
              {[{ label: "Main markets", list: mainMarkets }, { label: mainMarkets.length > 0 ? "All countries" : "Countries", list: otherCountries }]
                .filter((g) => g.list.length > 0)
                .map((group) => (
                  <div key={group.label}>
                    <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", margin: "8px 0 6px" }}>{group.label}</div>
                    {group.list.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => { setCountryCode(c.code); setStateName(""); setCities(null); }}
                        style={{
                          display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                          padding: "11px 14px", marginBottom: 8, borderRadius: 10,
                          background: "#101010", color: "var(--gold)",
                          border: `1.5px solid ${c.code === countryCode ? "var(--gold-bright)" : "var(--gold-border)"}`,
                          fontWeight: c.code === countryCode ? 800 : 500,
                        }}
                      >{c.name}</button>
                    ))}
                  </div>
                ))}
              {mainMarkets.length + otherCountries.length === 0 && (
                <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>No country matches “{countryQuery}”.</p>
              )}
            </div>
            {countryCode && levelPrice != null && (
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{money(levelPrice)} / month per {level} in {countryName}.</p>
            )}

            {/* Country level adds straight from here, exactly as iOS does. */}
            {level === "country" && countryCode && (
              <button
                className="btn"
                style={{ marginTop: 10 }}
                onClick={() => addTarget({ geo_level: "country", country_code: countryCode, country_name: countryName })}
              >Add {countryName} as a target</button>
            )}

            {level !== "country" && countryCode && (
              <>
                <label style={{ marginTop: 12 }}>{level === "city" ? "State (to look up cities in)" : "State"}</label>
                <select
                  className="input"
                  value={stateName}
                  onChange={(e) => {
                    const name = e.target.value;
                    const code = states.find((s) => s.name === name)?.state_code ?? "";
                    if (level === "city") void loadCities(code, name); else setStateName(name);
                  }}
                >
                  <option value="">—</option>
                  {states.map((s) => <option key={s.name ?? ""} value={s.name ?? ""}>{s.name}</option>)}
                </select>
              </>
            )}

            {level === "state" && countryCode && stateName && (
              <button
                className="btn"
                style={{ marginTop: 10 }}
                onClick={() => addTarget({ geo_level: "state", country_code: countryCode, country_name: countryName, state_name: stateName })}
              >Add {stateName} as a target</button>
            )}

            {level === "city" && stateName && (
              <div style={{ marginTop: 10 }}>
                {cities === null ? <Loading text="Loading cities…" />
                  : cities.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>{citiesError ?? `No cities listed for ${stateName}.`}</p>
                  : (
                    <div style={{ maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
                      {cities.map((city) => (
                        <button
                          key={city}
                          style={{
                            display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                            padding: "11px 14px", marginBottom: 8, borderRadius: 10,
                            background: "#101010", color: "var(--gold)",
                            border: "1.5px solid var(--gold-border)", fontWeight: 500,
                          }}
                          onClick={() => addTarget({ geo_level: "city", country_code: countryCode, country_name: countryName, state_name: stateName, city_name: city })}
                        >{city}</button>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {targets.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {targets.map((t) => (
                  <div key={targetLabel(t)} className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                    <div style={{ flex: 1 }}>
                      <div>{targetLabel(t)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{money(priceForTarget(tiers, t))} / month</div>
                    </div>
                    <button className="btn small ghost" onClick={() => setTargets((prev) => prev.filter((p) => !sameTarget(p, t)))}>Remove</button>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 4, fontWeight: 800, color: "var(--gold)" }}>
                  Total: {money(total)} / month across {targets.length} location{targets.length === 1 ? "" : "s"}
                </div>
                {balance != null && (
                  <p className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                    Cash Account balance {money(balance)}.{" "}
                    {shortBy > 0
                      ? <span style={{ color: "var(--red)" }}>You need {money(shortBy)} more — add money before creating this ad.</span>
                      : "The first month is charged when you create the ad."}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ---- Referral code ------------------------------------------------------------ */}
          <div className="card pad" style={{ marginBottom: 12 }}>
            <label>Referral Code (optional)</label>
            <input className="input" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="A member's referral code" />
          </div>

          {/* ---- Video -------------------------------------------------------------------- */}
          <div className="card pad" style={{ marginBottom: 12 }}>
            <b style={{ color: "var(--gold)" }}>Video (up to {MAX_AD_VIDEO_SECONDS} seconds)</b>
            <div style={{ marginTop: 10 }}>
              <input type="file" accept="video/*" className="input" disabled={busy} onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)} />
            </div>
            {file && <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>{file.name}{duration != null ? ` · ${Math.round(duration)}s` : ""}</p>}
            {fileError && <Notice error>{fileError}</Notice>}
          </div>

          {error && <Notice error>{error}</Notice>}

          {busy && (
            <div className="card pad" style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{stage}</div>
              <div style={{ height: 6, background: "var(--line)", borderRadius: 999 }}>
                <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: "var(--gold)", borderRadius: 999, transition: "width .2s" }} />
              </div>
            </div>
          )}

          <div className="center">
            <button className="btn" disabled={!canSubmit} onClick={() => void submit()}>Create Ad</button>
            <div style={{ marginTop: 10 }}>
              <Link className="btn ghost small" to="/settings/advertise">Cancel</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
