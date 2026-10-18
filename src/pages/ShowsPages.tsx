// Your own live Bingg Bongg show (Steve, 2026-10-17):
//
//   "You can have your own live Bingg Bongg show. Your cost $99.00 per month for as many hours
//    as you want every day. Minimum 2 hours per day. If you bring your own advertisers you will
//    earn 30% of the profit. The advertisers will be on your show and the main feed for a 60
//    seconds video." … "Earn an extra 5% from all the gifts you receive on your show."
//
// Two pages: the Shows tab everyone sees, and My Show where a host applies and runs it.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import {
  applyForShow, cancelShow, fetchMyShow, fetchShows, startShow,
  type MyShowResponse, type ShowListing, type ShowOffer,
} from "../lib/shows";
import { useT } from "../lib/i18n";

const money = (v: number) => "$" + Number(v ?? 0).toFixed(2);

// ---- The Shows tab --------------------------------------------------------------------------

export function ShowsPage() {
  const { t } = useT();
  const [rows, setRows] = useState<ShowListing[] | null>(null);
  const [offer, setOffer] = useState<ShowOffer | null>(null);
  const [error, setError] = useState("");
  // Steve, 2026-10-17: the two pages linked to each other, so every click stacked another
  // history entry and getting out took as many backs as clicks. Arriving FROM the other page
  // means the only way out is back — no second door. The sidebar still reaches both directly.
  const cameFromMyShow = useLocation().state?.from === "my-show";
  const [query, setQuery] = useState("");

  // Steve, 2026-10-17: "with search on top". Asks the SERVER rather than filtering what was
  // already fetched, so it finds a show by its host too and keeps working once the list
  // outgrows one response. Debounced — a request per keystroke would be for nothing.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      fetchShows(query.trim())
        .then((r) => { if (live) { setRows(r.rows); if (r.offer) setOffer(r.offer); setError(""); } })
        .catch(() => { if (live) { setRows([]); setError("Couldn't load the shows."); } });
    }, query ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 className="page-title">{t("shows")}</h1>
        {!cameFromMyShow && (
          <Link to="/my-show" state={{ from: "shows" }} className="btn small" style={{ background: "transparent", color: "var(--gold)", borderColor: "var(--gold-border)" }}>
            {t("my_show")}</Link>
        )}
      </div>

      {/* Steve, 2026-10-17: "Please organize this text and add it to All shows on top of main
          feed page." The run-on paragraph from My Show, turned into five lines that each say
          one thing: what it costs, what it asks of you, what you pay today, and the two ways it
          pays you back. Every figure is the server's, so changing one in admin changes it here. */}
      {offer && <ShowOfferCard offer={offer} />}

      <input
        className="input"
        value={query}
        placeholder={t("search_shows_or_hosts")}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", margin: "10px 0 14px" }}
      />

      {error && <Notice>{error}</Notice>}
      {rows === null && <Loading />}
      {rows !== null && rows.length === 0 && !error && (
        query.trim()
          ? <p className="soft">Nothing matches “{query.trim()}”.</p>
          : <p className="soft">No shows yet. <Link to="/my-show" style={{ color: "var(--gold)" }}>{t("start_your_own")}</Link></p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {(rows ?? []).map((s) => (
          <div key={s.id} className="card pad" style={{ borderColor: s.is_live_now ? "var(--gold-border)" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar user={{ fullname: s.host_name ?? s.name, profile_image: s.host_image ?? undefined }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ color: "var(--gold)" }}>{s.name}</strong>
                  {s.is_live_now && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#000", background: "var(--gold-border)", borderRadius: 999, padding: "2px 8px" }}>
                      {t("live_now_2")}</span>
                  )}
                </div>
                {s.tagline && <div className="muted" style={{ fontSize: 13 }}>{s.tagline}</div>}
                <div className="soft" style={{ fontSize: 12 }}>{s.host_name}</div>
              </div>
              {s.is_live_now && s.live_stream_id && (
                <Link to={`/live/${s.live_stream_id}`} className="btn small"
                      style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
                  {t("watch")}</Link>
              )}
            </div>
            {s.description && <p className="soft" style={{ marginBottom: 0, marginTop: 10, whiteSpace: "pre-wrap" }}>{s.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ShowOfferCard({ offer }: { offer: ShowOffer }) {
  const { t } = useT();
  const hours = offer.min_hours_per_day % 1 === 0 ? offer.min_hours_per_day : offer.min_hours_per_day.toFixed(1);
  const lines = [
    [`${money(offer.monthly_price)} a month`, "for as many hours a day as you want"],
    [`Minimum ${hours} hours a day`, "every day your show is running"],
    ["Nothing to pay to start", "your first month comes out of your earnings as you earn it"],
    [`Earn ${offer.ad_share_percent}% of what your advertisers pay`, "every month they stay"],
    [`Earn an extra ${offer.gift_bonus_percent}% on gifts`, "on every gift you receive on your show"],
  ];

  return (
    <div className="card pad" style={{ borderColor: "var(--gold-border)" }}>
      <div style={{ fontWeight: 900, color: "var(--gold)", fontSize: 18, marginBottom: 10 }}>
        {t("your_own_live_bingg_bongg_show")}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {lines.map(([head, tail]) => (
          <div key={head} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ color: "var(--gold)" }}>•</span>
            <span>
              <strong style={{ color: "var(--gold)" }}>{head}</strong>
              <span className="muted"> — {tail}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
        The fee comes out of your earnings first, then your Cash Account. If neither covers it we'll
        ask you to top up, and the show pauses after {offer.grace_days} days if it stays unpaid.
      </p>
      <Link to="/my-show" state={{ from: "shows" }} className="btn small"
            style={{ marginTop: 12, background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
        {t("start_your_show")}</Link>
    </div>
  );
}

// ---- My Show --------------------------------------------------------------------------------

export function MyShowPage() {
  const { t } = useT();
  const { user } = useSession();
  const [data, setData] = useState<MyShowResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", tagline: "", description: "" });
  const cameFromShows = useLocation().state?.from === "shows";

  const userId = user?.id ?? 0;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchMyShow(userId)
      .then((r) => { if (live) setData(r); })
      .catch(() => { if (live) setError("Couldn't load your show."); });
    // Keyed on the id, not the user object: a session object that is replaced on every gift
    // would re-run this and wipe what is on screen.
  }, [userId]);

  if (!user) return <div className="page"><p className="soft">{t("sign_in_to_start_a_show")}</p></div>;
  if (data === null) return <div className="page">{error ? <Notice>{error}</Notice> : <Loading />}</div>;

  if (!data.shows_enabled) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <h1 className="page-title">{t("my_show")}</h1>
        <p className="soft">{t("shows_aren_t_open_yet_check_back_soon")}</p>
      </div>
    );
  }

  const show = data.show;

  async function run(fn: () => Promise<{ message: string; show: MyShowResponse["show"] }>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fn();
      setNotice(r.message);
      setData((d) => (d === null ? d : { ...d, show: r.show ?? d.show }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const offer = (
    <div className="card pad" style={{ marginBottom: 12, borderColor: "var(--gold-border)" }}>
      <div style={{ fontWeight: 900, color: "var(--gold)", marginBottom: 8 }}>{t("your_own_live_bingg_bongg_show")}</div>
      <ul className="soft" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>{money(data.monthly_price)} a month, for as many hours a day as you want.</li>
        <li>Minimum {data.min_hours_per_day} hours a day.</li>
        <li>Bring your own advertisers and earn {data.ad_share_percent}% of what they pay — every month they stay.</li>
        <li>Earn an extra {data.gift_bonus_percent}% on every gift you receive on your show.</li>
        <li><strong>{t("nothing_to_pay_to_start")}</strong> The first month comes out of your earnings as you earn it.</li>
      </ul>
      <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
        The fee comes out of your earnings first, then your Cash Account. If neither covers it we'll
        ask you to top up, and the show pauses after {data.grace_days} days if it stays unpaid.
      </p>
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 className="page-title">{t("my_show")}</h1>
        {!cameFromShows && (
          <Link to="/shows" state={{ from: "my-show" }} className="btn small" style={{ background: "transparent", color: "var(--gold)", borderColor: "var(--gold-border)" }}>{t("all_shows_2")}</Link>
        )}
      </div>

      {notice && <div className="card pad" style={{ marginBottom: 12, borderColor: "var(--gold-border)" }}><p style={{ margin: 0, color: "var(--gold)" }}>{notice}</p></div>}
      {error && <Notice>{error}</Notice>}

      {offer}

      {show === null || show.status === "rejected" || show.status === "cancelled" ? (
        <div className="card pad">
          {show?.status === "rejected" && show.rejected_reason && (
            <p style={{ color: "#f55", fontSize: 13 }}>Your last application wasn't approved: {show.rejected_reason}</p>
          )}
          <label className="soft" style={{ fontSize: 13 }}>{t("what_is_your_show_called")}</label>
          <input className="input" value={form.name} maxLength={120} placeholder={t("the_name_of_your_show")}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%", marginBottom: 10 }} />
          <label className="soft" style={{ fontSize: 13 }}>{t("one_line_about_it")}</label>
          <input className="input" value={form.tagline} maxLength={191} placeholder={t("every_night_live_from_manila")}
                 onChange={(e) => setForm({ ...form, tagline: e.target.value })} style={{ width: "100%", marginBottom: 10 }} />
          <label className="soft" style={{ fontSize: 13 }}>{t("tell_people_what_to_expect")}</label>
          <textarea className="input" rows={4} value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: "100%", marginBottom: 10 }} />
          <button className="btn" disabled={busy || !form.name.trim()}
                  onClick={() => run(() => applyForShow(userId, form))}
                  style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
            {busy ? "Sending…" : "Apply for a show"}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            {t("nothing_is_charged_now_we_ll_look_at_it")}</p>
        </div>
      ) : (
        <ShowDashboard data={data} busy={busy} onStart={() => run(() => startShow(userId))} onCancel={() => run(() => cancelShow(userId))} />
      )}
    </div>
  );
}

function ShowDashboard({ data, busy, onStart, onCancel }: {
  data: MyShowResponse; busy: boolean; onStart: () => void; onCancel: () => void;
}) {
  const { t } = useT();
  const show = data.show!;
  const onAir = show.status === "active" || show.status === "past_due";
  const metToday = show.hours_today >= show.min_hours_per_day;

  const statusLine: Record<string, string> = {
    pending_review: "Waiting for us to look at it.",
    approved: "Approved — put it on the air when you're ready.",
    active: "On the air.",
    past_due: "On the air, with the fee still owing.",
    suspended: "Paused.",
  };

  return (
    <>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, color: "var(--gold)", fontSize: 18 }}>{show.name}</div>
            {show.tagline && <div className="muted" style={{ fontSize: 13 }}>{show.tagline}</div>}
          </div>
          <div className="soft" style={{ fontSize: 13 }}>{statusLine[show.status] ?? show.status}</div>
        </div>

        {show.status === "approved" && (
          <div style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={onStart}
                    style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
              {busy ? "Starting…" : "Put my show on the air — nothing to pay now"}
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              The first month ({money(show.monthly_price)}) comes out of your earnings as you earn it.
            </p>
          </div>
        )}

        {show.status === "suspended" && (
          <div style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={onStart}
                    style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
              {busy ? "Starting…" : `Start it up again — ${money(show.monthly_price + show.balance_due)}`}
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              {money(show.balance_due)} owed plus one month in advance. You have {money(data.available)}
              {" "}between your earnings and your Cash Account.
            </p>
          </div>
        )}
      </div>

      {onAir && (
        <>
          <div className="card pad" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("today")}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 30, fontWeight: 900, color: metToday ? "var(--gold)" : "#f55" }}>{show.hours_today}</span>
              <span className="muted" style={{ fontSize: 13 }}>of {show.min_hours_per_day} hours</span>
            </div>
            {show.last_7_days.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                {show.last_7_days.map((d) => (
                  <div key={d.date} style={{
                    border: "1px solid " + (d.met_minimum ? "var(--gold-border)" : "#633"),
                    borderRadius: 8, padding: "6px 10px", minWidth: 78, textAlign: "center",
                  }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{d.date.slice(5)}</div>
                    <div style={{ fontWeight: 800, color: d.met_minimum ? "var(--gold)" : "#f55" }}>{d.hours}h</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card pad" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("what_the_show_has_earned_you")}</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Your advertisers ({data.ad_share_percent}%)</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "var(--gold)" }}>{money(show.ad_earnings_total)}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Extra on gifts ({data.gift_bonus_percent}%)</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "var(--gold)" }}>{money(show.gift_bonus_total)}</div>
              </div>
            </div>
            {data.my_referral_code && (
              <p className="soft" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
                Give an advertiser your code <strong style={{ color: "var(--gold)" }}>{data.my_referral_code}</strong> when
                they buy their ad and you earn {data.ad_share_percent}% of what they pay, every month they stay.
              </p>
            )}
          </div>

          <div className="card pad" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("the_fee")}</div>
            <p className="soft" style={{ margin: 0, fontSize: 13 }}>
              {money(show.monthly_price)} a month, out of your earnings first and then your Cash Account.
              {show.paid_until ? ` Covers you to ${show.paid_until}.` : ""}
              {show.balance_due > 0
                ? ` ${money(show.balance_due)} owing — it comes out as you earn. Top up your Cash Account if you'd rather clear it now.`
                : ""}
            </p>
            {show.charges.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {show.charges.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: i ? "1px solid rgba(255,255,255,0.08)" : undefined }}>
                    <span className="soft">{c.note ?? c.type}</span>
                    <span style={{ color: c.amount < 0 ? "#f99" : "var(--gold)" }}>{money(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn small" disabled={busy} onClick={onCancel}
                  style={{ background: "transparent", color: "#f77", borderColor: "#633" }}>
            {t("stop_my_show")}</button>
        </>
      )}
    </>
  );
}
