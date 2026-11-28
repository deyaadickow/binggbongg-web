// /partnership — Bingg Bongg Partnership Program (Steve, 2026-11-27). Black page, gold text and borders.
// One route that shows what fetchMyPartnership says this member should see (contract §2):
//  - none, or declined/ended with can_apply: Become a Partner — the terms (the % and the days come from the
//    server, never hard-coded; Steve: the money is shown "at signup or before signup"), the five account rows
//    (follower count + profile link) and Submit.
//  - pending: the status card and the accounts they sent.
//  - approved (a partner): My Partnership — status, start/end dates, days left, Your people (up to max_people,
//    add by username, Remove sends member_user_id).
//  - member: My Partnership with their partner's name and no people section.
// /become-a-partner and /my-partnership open the same page.
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading, Notice } from "../components/Common";
import { showGoldConfirm } from "../components/GoldToast";
import { requireVerified } from "../lib/verifyEmail";
import { displayName, post, type UserSummary } from "../lib/api";
import {
  addPartnerMember, applyPartnerProgram, fetchMyPartnership, forgetMyPartnership, parseFollowers, partnerDate,
  partnerDaysLeft, partnerError, partnerNumber, partnerStatusLine, removePartnerMember, PARTNER_IDENTITY, PARTNER_PLATFORMS,
  type MyPartnership, type PartnerFailure, type PartnerIdentityField, type PartnerPerson, type PartnerPlatform,
} from "../lib/partnership";

const GOLD = "#F0C420";
const box: CSSProperties = { background: "#000", border: `2px solid ${GOLD}`, borderRadius: 16, padding: 14, color: GOLD, marginTop: 14 };
const label: CSSProperties = { fontSize: 13, fontWeight: 700, opacity: 0.85 };
const goldInput: CSSProperties = { background: "#000", color: GOLD, borderColor: GOLD };
const errText: CSSProperties = { color: "#FF6B5B", fontWeight: 700, fontSize: 14, marginTop: 10 };

export function PartnershipPage() {
  const { t, lang } = useT();
  const { user, isLoggedIn } = useSession();
  const myId = user?.id ?? 0;
  const [data, setData] = useState<MyPartnership | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!myId) return;
    try {
      const d = await fetchMyPartnership(myId);
      setError(d ? null : t("try_again"));
      setData(d);
    } catch (e) { setError((e as Error).message); setData(null); }
  }, [myId, t]);
  useEffect(() => { void load(); }, [load]);

  const changed = (d: MyPartnership | undefined) => { forgetMyPartnership(); if (d) setData(d); else void load(); };

  const mine = !!data && (data.status === "approved" || data.status === "member");
  const page = (body: ReactNode) => (
    <div className="page" dir={lang === "ar" ? "rtl" : undefined} style={{ maxWidth: 640, background: "#000", color: GOLD, borderRadius: 18, paddingBottom: 40 }}>
      <PageTitle>{t(mine ? "pt_my_title" : "pt_become_title")}</PageTitle>
      {body}
    </div>
  );

  if (!isLoggedIn) return page(<Notice><Link to="/login" state={{ from: "/partnership" }}>{t("sign_in")}</Link></Notice>);
  if (data === undefined) return page(<Loading />);
  if (data === null) return page(<><Notice error>{error}</Notice><button className="btn" style={{ marginTop: 12 }} onClick={() => void load()}>{t("try_again")}</button></>);

  // The switch is off: say so, keep nothing else on screen (contract: hide Apply).
  if (!data.program_enabled) return page(<div style={box}><p style={{ margin: 0, fontWeight: 700 }}>{t("pt_program_off")}</p></div>);

  const showForm = data.can_apply && (data.status === "none" || data.status === "declined" || data.phase === "ended");
  return page(<>
    {data.status !== "none" && <StatusCard d={data} />}
    {data.status === "pending" && data.application && <ApplicationCard d={data} />}
    {data.status === "member" && data.partner && <PartnerCard d={data} />}
    {data.status === "approved" && data.phase !== "ended" && <PeopleCard d={data} myId={myId} onChanged={changed} />}
    {showForm && <BecomeForm d={data} myId={myId} onDone={() => { forgetMyPartnership(); void load(); }} />}
  </>);
}

/** Status, start/end dates and days left (or the pending / declined line). */
function StatusCard({ d }: { d: MyPartnership }) {
  const { t, lang } = useT();
  const stateKey: StringKey =
    d.phase === "ended" ? "pt_label_ended"
    : d.status === "pending" ? "pt_label_pending"
    : d.status === "declined" ? "pt_label_declined"
    : d.phase === "upcoming" ? "pt_label_upcoming"
    : d.status === "member" ? "pt_label_member" : "pt_label_partner";
  const hasDates = (d.status === "approved" || d.status === "member") && !!d.start_date;
  const left = partnerDaysLeft(d.days_left, d.phase, lang);
  const row = (k: StringKey, v: ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid rgba(240,196,32,.35)" }}>
      <span style={label}>{t(k)}</span><span style={{ fontWeight: 800, textAlign: "end" }}>{v}</span>
    </div>
  );
  return (
    <div style={{ ...box, boxShadow: "0 0 16px rgba(240,196,32,.18)" }}>
      <p style={{ margin: "0 0 10px", fontWeight: 700, lineHeight: 1.45 }}>{partnerStatusLine(d, lang)}</p>
      {row("pt_status", t(stateKey))}
      {hasDates && row("pt_start", partnerDate(d.start_date, lang))}
      {hasDates && row("pt_end", partnerDate(d.end_date, lang))}
      {hasDates && d.phase === "active" && row("pt_days", left)}
    </div>
  );
}

function ApplicationCard({ d }: { d: MyPartnership }) {
  const { t, lang } = useT();
  const a = d.application!;
  return (
    <div style={box}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("pt_your_application")}</div>
      {a.accounts.map((acc) => (
        <div key={acc.platform} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: "1px solid rgba(240,196,32,.35)", fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{acc.label}</span>
          <span style={{ minWidth: 0, overflowWrap: "anywhere", textAlign: "end" }}>
            {partnerNumber(acc.followers, lang)} · <a href={acc.url} target="_blank" rel="noopener noreferrer" style={{ color: GOLD }}>{acc.url.replace(/^https?:\/\/(www\.)?/, "")}</a>
          </span>
        </div>
      ))}
    </div>
  );
}

function PartnerCard({ d }: { d: MyPartnership }) {
  const { t } = useT();
  const p = d.partner!;
  return (
    <div style={box}>
      <div style={{ ...label, marginBottom: 8 }}>{t("pt_your_partner")}</div>
      <PersonRow person={{ user_id: p.user_id, username: p.username, fullname: p.fullname, profile_image: p.profile_image }} />
    </div>
  );
}

function PersonRow({ person, trailing, sub }: { person: PartnerPerson; trailing?: ReactNode; sub?: string }) {
  const u = { id: person.user_id, username: person.username, fullname: person.fullname, profile_image: person.profile_image ?? undefined };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      <Link to={`/profile/${person.user_id}`} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, color: GOLD, textDecoration: "none" }}>
        <Avatar user={u} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(u)}</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}><bdi>@{person.username ?? ""}</bdi>{sub ? ` · ${sub}` : ""}</div>
        </div>
      </Link>
      {trailing}
    </div>
  );
}

/** A partner's 1–3 people: the list with Remove, then Add by username (searchUser for the picker). */
function PeopleCard({ d, myId, onChanged }: { d: MyPartnership; myId: number; onChanged: (d: MyPartnership | undefined) => void }) {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const takenIds = new Set([myId, ...d.people.map((p) => p.user_id)]);

  useEffect(() => {
    const kw = q.trim().replace(/^@+/, "");
    if (!kw || !d.can_add_people) { setResults([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      post<UserSummary[]>("searchUser", { keyword: kw, start: 0, count: 8, my_user_id: myId })
        .then((r) => { if (live) setResults((r.data ?? []).filter((u) => !takenIds.has(u.id)).slice(0, 6)); })
        .catch(() => undefined);
    }, 300);
    return () => { live = false; window.clearTimeout(timer); };
    // takenIds is rebuilt each render from d.people; the list only needs to refresh when the query or the team changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, myId, d.can_add_people, d.people.length]);

  async function add(username: string) {
    const name = username.trim().replace(/^@+/, "");
    if (!name || busy) return;
    if (!requireVerified()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await addPartnerMember(myId, name);
      if (!r.status) { setMsg({ text: partnerError(r as PartnerFailure, d, lang), error: true }); return; }
      setQ(""); setResults([]);
      setMsg({ text: t("pt_people_added", name) });
      onChanged(r.data);
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); } finally { setBusy(false); }
  }

  async function remove(p: PartnerPerson) {
    if (busy) return;
    const ok = await showGoldConfirm({ message: t("pt_remove_confirm", p.username ?? displayName(p as Partial<UserSummary>)), confirmLabel: t("pt_people_remove"), cancelLabel: t("cancel"), danger: true });
    if (!ok) return;
    setBusy(true); setMsg(null);
    try {
      const r = await removePartnerMember(myId, p.user_id);
      if (!r.status) { setMsg({ text: partnerError(r as PartnerFailure, d, lang), error: true }); return; }
      onChanged(r.data);
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); } finally { setBusy(false); }
  }

  const full = d.people.length >= d.max_people;
  return (
    <div style={box}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>{t("pt_people_title")} <span style={{ opacity: 0.75, fontWeight: 700 }}>({d.people.length}/{d.max_people})</span></div>
      <p style={{ margin: "6px 0 4px", fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>{t("pt_people_hint", d.max_people, d.payout_percent)}</p>
      {d.people.length === 0 && <p style={{ margin: "8px 0", fontSize: 14 }}>{t("pt_people_empty")}</p>}
      {d.people.map((p) => (
        <div key={p.user_id} style={{ borderTop: "1px solid rgba(240,196,32,.35)" }}>
          <PersonRow person={p} sub={partnerDaysLeft(p.days_left, p.phase, lang) || undefined}
            trailing={<button className="btn small" style={{ background: "#000", borderColor: GOLD, color: GOLD, flexShrink: 0 }} disabled={busy} onClick={() => void remove(p)}>{t("pt_people_remove")}</button>} />
        </div>
      ))}
      {full ? (
        <p style={{ margin: "10px 0 0", fontWeight: 700 }}>{t("pt_people_full", d.max_people)}</p>
      ) : d.can_add_people && (
        <div style={{ marginTop: 12 }}>
          <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); void add(q); }}>
            <input className="input" style={{ ...goldInput, flex: 1, minWidth: 0 }} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t("pt_people_search")} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={t("pt_people_search")} />
            <button type="submit" className="btn gold" disabled={busy || !q.trim()} style={{ flexShrink: 0 }}>{t("pt_people_add")}</button>
          </form>
          {results.length > 0 && (
            <div style={{ marginTop: 6, border: `1px solid ${GOLD}`, borderRadius: 12, padding: "0 10px" }}>
              {results.map((u, i) => (
                <div key={u.id} style={{ borderTop: i ? "1px solid rgba(240,196,32,.25)" : undefined }}>
                  <PersonRow person={{ user_id: u.id, username: u.username, fullname: u.fullname, profile_image: u.profile_image }}
                    trailing={<button className="btn small gold" style={{ flexShrink: 0 }} disabled={busy || !u.username} onClick={() => void add(u.username ?? "")}>{t("pt_people_add")}</button>} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {msg && <p role="status" style={msg.error ? errText : { fontWeight: 700, fontSize: 14, marginTop: 10 }}>{msg.text}</p>}
    </div>
  );
}

type Row = { followers: string; url: string };
const emptyRows = (): Record<PartnerPlatform, Row> =>
  Object.fromEntries(PARTNER_PLATFORMS.map((p) => [p.key, { followers: "", url: "" }])) as Record<PartnerPlatform, Row>;

/** "YYYY-MM-DD" for the day someone born on it turns 18 today — the date picker's latest day. */
function adultMax(): string {
  const n = new Date();
  const d = new Date(n.getFullYear() - 18, n.getMonth(), n.getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The terms, then About you (who they are, Steve 2026-11-27), then TikTok / Instagram / Snapchat / YouTube / Facebook (followers + profile link), a note, Submit. */
function BecomeForm({ d, myId, onDone }: { d: MyPartnership; myId: number; onDone: () => void }) {
  const { t, lang } = useT();
  const [rows, setRows] = useState(emptyRows);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<Record<PartnerIdentityField, string>>(() =>
    Object.fromEntries(PARTNER_IDENTITY.map((k) => [k, String(d.prefill?.[k] ?? "").trim()])) as Record<PartnerIdentityField, string>);
  const [err, setErr] = useState<{ text: string; platform?: PartnerPlatform; field?: PartnerIdentityField } | null>(null);
  const min = partnerNumber(d.min_followers, lang);
  const maxDob = adultMax();

  // A row's error shows inside that row (an About you field: under that field), scrolled into view;
  // any other error shows above Submit.
  const showErr = (e: { text: string; platform?: PartnerPlatform; field?: PartnerIdentityField }) => {
    setErr(e);
    const id = e.field ? `pt-field-${e.field}` : e.platform ? `pt-row-${e.platform}` : "pt-form-error";
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
  };
  const asField = (f?: string): PartnerIdentityField | undefined =>
    (PARTNER_IDENTITY as readonly string[]).includes(f ?? "") ? (f as PartnerIdentityField) : undefined;
  const set = (k: PartnerPlatform, f: keyof Row, v: string) => setRows((r) => ({ ...r, [k]: { ...r[k], [f]: v } }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // The same checks the server makes first, so the obvious ones answer at once; the server decides the rest.
    const need: [PartnerIdentityField, string][] = [
      ["full_name", "missing_name"], ["email", "bad_email"], ["phone_number", "bad_phone"],
      ["country", "missing_country"], ["date_of_birth", "bad_birthdate"],
    ];
    const blank = need.find(([k]) => !who[k].trim());
    if (blank) { showErr({ text: partnerError({ status: false, code: blank[1] }, d, lang), field: blank[0] }); return; }
    if (who.date_of_birth > maxDob) { showErr({ text: partnerError({ status: false, code: "too_young" }, d, lang), field: "date_of_birth" }); return; }
    const filled = PARTNER_PLATFORMS.filter((p) => rows[p.key].followers.trim() || rows[p.key].url.trim());
    const noLink = filled.find((p) => rows[p.key].followers.trim() && !rows[p.key].url.trim());
    if (noLink) { showErr({ text: partnerError({ status: false, code: "missing_link", platform: noLink.key }, d, lang), platform: noLink.key }); return; }
    if (!filled.some((p) => rows[p.key].followers.trim() && rows[p.key].url.trim())) {
      showErr({ text: partnerError({ status: false, code: "not_enough_followers" }, d, lang) });
      return;
    }
    if (!requireVerified()) return;
    const fields: Record<string, string> = {};
    for (const k of PARTNER_IDENTITY) if (who[k].trim()) fields[k] = who[k].trim();
    for (const p of filled) {
      if (rows[p.key].url.trim()) fields[`${p.key}_url`] = rows[p.key].url.trim();
      if (rows[p.key].followers.trim()) fields[`${p.key}_followers`] = parseFollowers(rows[p.key].followers);
    }
    if (note.trim()) fields.note = note.trim().slice(0, 2000);
    setBusy(true); setErr(null);
    try {
      const r = await applyPartnerProgram(myId, fields);
      if (!r.status) { showErr({ text: partnerError(r, d, lang), platform: r.platform, field: asField(r.field) }); return; }
      onDone();
    } catch (ex) { setErr({ text: (ex as Error).message }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div style={{ ...box, boxShadow: "0 0 16px rgba(240,196,32,.18)" }}>
        <div style={{ fontSize: 34, lineHeight: 1, textAlign: "center" }} aria-hidden>🤝</div>
        <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.5, fontWeight: 700 }}>{t("pt_become_body", d.payout_percent, d.default_days)}</p>
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.5 }}>{t("pt_become_requirement", min)}</p>
        {/* Steve, 2026-11-27: "you will have to be approved by the Administration to become a Partner." */}
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.5, fontWeight: 800 }}>{t("pt_approval")}</p>
      </div>
      <div style={{ ...box, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("pt_about_title")}</div>
        <div style={{ display: "grid", gap: 10 }}>
          {([
            ["full_name", "pt_full_name", { type: "text", autoComplete: "name" }],
            ["email", "pt_email", { type: "email", inputMode: "email", autoComplete: "email", autoCapitalize: "none", spellCheck: false, dir: "ltr" }],
            ["phone_number", "pt_phone", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "+63 912 345 6789", dir: "ltr" }],
            ["country", "pt_country", { type: "text", autoComplete: "country-name" }],
            ["city", "pt_city", { type: "text", autoComplete: "address-level2" }],
            ["date_of_birth", "pt_dob", { type: "date", max: maxDob, min: "1900-01-01", autoComplete: "bday" }],
          ] as [PartnerIdentityField, StringKey, React.InputHTMLAttributes<HTMLInputElement>][]).map(([k, lab, extra]) => {
            const bad = err?.field === k;
            return (
              <label key={k} id={`pt-field-${k}`} style={{ display: "grid", gap: 4 }}>
                <span style={label}>{t(lab)}{k === "city" ? ` (${t("pt_optional")})` : " *"}</span>
                <input className="input" style={{ ...goldInput, borderColor: bad ? "#FF6B5B" : GOLD, colorScheme: "dark" }} {...extra}
                  aria-required={k !== "city"} aria-invalid={bad || undefined}
                  value={who[k]} onChange={(e) => setWho((w) => ({ ...w, [k]: e.target.value }))} />
                {bad && <span role="alert" style={{ ...errText, marginTop: 2 }}>{err.text}</span>}
              </label>
            );
          })}
        </div>
      </div>
      {PARTNER_PLATFORMS.map((p) => {
        const bad = err?.platform === p.key;
        const border = bad ? "#FF6B5B" : GOLD;
        return (
          <div key={p.key} id={`pt-row-${p.key}`} style={{ ...box, borderColor: border, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{p.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)", gap: 8 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={label}>{t("pt_followers")}</span>
                <input className="input" style={{ ...goldInput, borderColor: border }} inputMode="numeric" placeholder={min}
                  value={rows[p.key].followers} onChange={(e) => set(p.key, "followers", e.target.value)} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={label}>{t("pt_link")}</span>
                <input className="input" style={{ ...goldInput, borderColor: border }} type="text" inputMode="url" placeholder={p.host}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr"
                  value={rows[p.key].url} onChange={(e) => set(p.key, "url", e.target.value)} />
              </label>
            </div>
            {bad && <p role="alert" style={{ ...errText, marginBottom: 0 }}>{err.text}</p>}
          </div>
        );
      })}
      <div style={{ ...box, padding: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={label}>{t("pt_note")}</span>
          <textarea className="input" style={{ ...goldInput, minHeight: 72, padding: 10, resize: "vertical" }} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {err && !err.platform && !err.field && <p id="pt-form-error" role="alert" style={errText}>{err.text}</p>}
      <button type="submit" className="btn gold block" disabled={busy} style={{ marginTop: 16, minHeight: 50, fontSize: 17 }}>
        {busy ? t("pt_sending") : t("pt_submit")}
      </button>
    </form>
  );
}
