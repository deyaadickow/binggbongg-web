/**
 * Steve, 2026-10-06: "On these 2 pages add a download and a print button."
 *
 * One statement, two ways out: a PDF file to keep, and the browser's print dialog. Both are
 * built from the same rows, so what a member prints and what they download always agree.
 *
 * The PDF is written by hand rather than with a library. A statement is a title, a column of
 * rows and a total — a few hundred bytes of PDF — and the smallest library that does this adds
 * a few hundred KB to every page load for a button most members press once a year.
 */

export interface StatementDoc {
  /** "Monthly earnings statement" */
  title: string;
  /** "December 2025" or "All months" */
  subtitle: string;
  /** Who it belongs to, printed under the title so a saved file says whose it is. */
  owner?: string;
  rows: { left: string; note?: string; right: string }[];
  totalLabel: string;
  total: string;
}

// ---- PDF ------------------------------------------------------------------------------------

const PAGE_W = 612;   // US Letter at 72dpi, the same page Android's generator uses
const PAGE_H = 792;
const MARGIN = 48;
const LINE = 20;

/** The built-in PDF fonts speak Latin-1. Anything outside it would be written as mojibake, so
 *  it is replaced rather than corrupting the file — and the on-screen page still shows it. */
function latin1(text: string): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    out += c <= 0xff ? ch : "?";
  }
  return out;
}

function esc(text: string): string {
  return latin1(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Helvetica is close enough to monospaced-at-a-glance for right-aligning money: these are the
 *  Adobe widths for the characters a statement actually contains. */
const WIDTHS: Record<string, number> = { " ": 278, "$": 556, ".": 278, ",": 278, "-": 333, "/": 278 };
function textWidth(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of latin1(text)) {
    if (ch >= "0" && ch <= "9") units += 556;
    else if (WIDTHS[ch] !== undefined) units += WIDTHS[ch];
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) units += bold ? 722 : 667;
    else units += bold ? 556 : 500;
  }
  return (units / 1000) * size;
}

function show(text: string, x: number, y: number, size: number, bold: boolean): string {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(text)}) Tj ET\n`;
}

function showRight(text: string, rightX: number, y: number, size: number, bold: boolean): string {
  return show(text, rightX - textWidth(text, size, bold), y, size, bold);
}

/** Lays the rows out over as many pages as they need. */
function pageStreams(doc: StatementDoc): string[] {
  const right = PAGE_W - MARGIN;
  const pages: string[] = [];
  let s = "";
  let y = PAGE_H - MARGIN;

  const header = (first: boolean) => {
    let h = "";
    h += show("Bingg Bongg", MARGIN, y, 20, true); y -= 24;
    h += show(doc.title, MARGIN, y, 13, false); y -= 18;
    h += show(doc.subtitle, MARGIN, y, 15, true);
    if (first && doc.owner) { h += showRight(doc.owner, right, y, 11, false); }
    y -= 10;
    h += `${MARGIN} ${y.toFixed(2)} m ${right} ${y.toFixed(2)} l S\n`;
    y -= 22;
    return h;
  };

  s += header(true);

  for (const row of doc.rows) {
    if (y < MARGIN + 60) {
      pages.push(s);
      s = ""; y = PAGE_H - MARGIN;
      s += header(false);
    }
    s += show(row.left, MARGIN, y, 11, false);
    if (row.note) s += show(row.note, MARGIN + textWidth(row.left, 11, false) + 6, y, 10, false);
    s += showRight(row.right, right, y, 11, true);
    y -= LINE;
  }

  y -= 8;
  s += `${MARGIN} ${y.toFixed(2)} m ${right} ${y.toFixed(2)} l S\n`;
  y -= 22;
  s += show(doc.totalLabel, MARGIN, y, 13, true);
  s += showRight(doc.total, right, y, 13, true);

  y -= 30;
  s += show(`Generated ${new Date().toLocaleDateString()}`, MARGIN, y, 9, false);

  pages.push(s);
  return pages;
}

/** A complete, valid single- or multi-page PDF as bytes. */
export function statementPdf(doc: StatementDoc): Blob {
  const streams = pageStreams(doc);
  const n = streams.length;

  // Object numbers: 1 catalog, 2 pages, then per page a page object and its content stream,
  // then the two fonts.
  const pageObj = (i: number) => 3 + i * 2;
  const contentObj = (i: number) => 4 + i * 2;
  const fontRegular = 3 + n * 2;
  const fontBold = fontRegular + 1;

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${streams.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${n} >>`;
  streams.forEach((body, i) => {
    objects[pageObj(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
      `/Contents ${contentObj(i)} 0 R >>`;
    objects[contentObj(i)] = `<< /Length ${body.length} >>\nstream\n${body}endstream`;
  });
  objects[fontRegular] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[fontBold] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Every byte written above is Latin-1, so the string's length IS the byte count the xref
  // table and /Length promise. Writing it any other way would make those offsets lie.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

export function downloadStatement(doc: StatementDoc, filename: string) {
  const url = URL.createObjectURL(statementPdf(doc));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: Safari has not finished reading the blob when click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---- Print ----------------------------------------------------------------------------------

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Prints through a hidden iframe rather than a popup window: a popup is what blockers stop, and
 * the member clicked Print on purpose. Black on white — printing the app's black background
 * would empty an ink cartridge for one page of numbers.
 */
export function printStatement(doc: StatementDoc) {
  const rows = doc.rows.map((r) => `
    <tr>
      <td>${escHtml(r.left)}${r.note ? ` <span class="note">${escHtml(r.note)}</span>` : ""}</td>
      <td class="amt">${escHtml(r.right)}</td>
    </tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(doc.subtitle)} — ${escHtml(doc.title)}</title>
  <style>
    @page { margin: 18mm; }
    body { font: 13px/1.5 Helvetica, Arial, sans-serif; color: #000; background: #fff; margin: 0; }
    h1 { font-size: 20px; margin: 0; }
    .sub { font-size: 12px; margin: 2px 0 0; }
    .period { font-size: 16px; font-weight: 700; margin: 10px 0 0; }
    .owner { float: right; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    td { padding: 7px 0; border-bottom: 1px solid #ddd; }
    .amt { text-align: right; font-weight: 700; white-space: nowrap; }
    .note { color: #666; font-size: 11px; }
    tfoot td { border-top: 2px solid #000; border-bottom: none; font-size: 15px; font-weight: 700; padding-top: 10px; }
    .gen { margin-top: 18px; font-size: 10px; color: #666; }
  </style></head><body>
    ${doc.owner ? `<div class="owner">${escHtml(doc.owner)}</div>` : ""}
    <h1>Bingg Bongg</h1>
    <p class="sub">${escHtml(doc.title)}</p>
    <p class="period">${escHtml(doc.subtitle)}</p>
    <table>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>${escHtml(doc.totalLabel)}</td><td class="amt">${escHtml(doc.total)}</td></tr></tfoot>
    </table>
    <p class="gen">Generated ${escHtml(new Date().toLocaleDateString())}</p>
  </body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  if (!w) { frame.remove(); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // The dialog is modal, so the frame can only be torn down once it has been dismissed.
  const go = () => { w.focus(); w.print(); setTimeout(() => frame.remove(), 1000); };
  if (w.document.readyState === "complete") go(); else frame.onload = go;
}
