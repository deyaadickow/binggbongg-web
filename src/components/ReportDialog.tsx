import { useEffect, useState } from "react";
import { fetchReportReasons, reportPost, reportUser, type ReportReason } from "../lib/api";

/**
 * Reporting a member, with a reason and an explanation.
 *
 * Steve, 2026-10-20: "Please add explanation so they can explain exactly what is wrong."
 *
 * Both phones have had a reason list and an explanation box since the app shipped. The web had
 * neither: Report was a single click that sent reason "Reported from web" and no description
 * at all — and the server REQUIRES a description, so the report was rejected and the member
 * thanked regardless. It also named the wrong person (see reportUser in lib/api).
 *
 * The explanation is required here as well as on the server, because a reason on its own —
 * "Copyright", "Harassment" — tells an admin nothing about what actually happened.
 */
export function ReportDialog({
  reportedUserId,
  reportedName,
  postId,
  onClose,
  onDone,
}: {
  /** The member being reported. Omitted when reporting a video — the post carries its author. */
  reportedUserId?: number;
  reportedName: string;
  /**
   * The video the complaint is about. When this is set the report is filed as a POST report,
   * the same kind both phones file from the feed, so the reported clip is recorded against the
   * report and an admin can watch it.
   */
  postId?: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void fetchReportReasons().then(setReasons);
  }, []);

  async function submit() {
    if (!reason) {
      setError("Choose a reason first.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Explain what is wrong — a sentence or two.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = postId
        ? await reportPost({ postId, reason, description: description.trim() })
        : await reportUser({ reportedUserId: reportedUserId!, reason, description: description.trim() });
      // The server's own wording when it has one — it knows which rule was hit.
      onDone(res.message ?? "Thank you. Our team will look at this.");
      onClose();
    } catch {
      setError("Couldn't send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card" style={{ maxWidth: 440, margin: "auto", padding: 18 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: "var(--gold)", marginTop: 0 }}>Report {reportedName}</h3>

        <label style={{ color: "var(--gold)", fontSize: 13 }}>Reason</label>
        <select value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} style={{ width: "100%", marginBottom: 12 }}>
          <option value="">Select a reason</option>
          {reasons.map((r) => (
            <option key={r.id} value={r.reason}>{r.reason}</option>
          ))}
        </select>

        <label style={{ color: "var(--gold)", fontSize: 13 }}>What is wrong?</label>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); setError(null); }}
          rows={5}
          maxLength={555}
          placeholder="Explain exactly what is wrong, so our team knows what to look for."
          style={{ width: "100%", marginBottom: 6 }}
        />
        <div style={{ fontSize: 12, color: "var(--gold)", opacity: 0.7, marginBottom: 10 }}>
          {description.length}/555
        </div>

        {error && <div className="notice" style={{ marginBottom: 10 }}>{error}</div>}

        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="btn gold" onClick={() => void submit()} disabled={sending}>
            {sending ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
