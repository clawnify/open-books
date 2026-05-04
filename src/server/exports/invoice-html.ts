import type { Company } from "../domain/company";
import type { Invoice, InvoiceLine } from "../domain/invoices";
import type { Party } from "../domain/parties";

export interface InvoiceHTMLContext {
  company: Company;
  party: Party;
  invoice: Invoice;
  lines: InvoiceLine[];
}

const TYPE_LABEL: Record<Invoice["type"], string> = {
  invoice: "Invoice",
  credit_note: "Credit Note",
  quote: "Quote",
};

export function renderInvoiceHTML(ctx: InvoiceHTMLContext): string {
  const { company, party, invoice, lines } = ctx;
  const fmt = (cents: number) => formatMoney(cents, invoice.currency);

  const ratesGrouped = groupByRate(lines);
  const heading = TYPE_LABEL[invoice.type];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escape(heading)} ${escape(invoice.number ?? `#${invoice.id}`)} · ${escape(company.name)}</title>
<style>
  @page { size: A4; margin: 20mm 15mm; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: #111;
    font-size: 11pt;
    line-height: 1.45;
    background: #f4f4f5;
  }
  .sheet {
    background: #fff;
    width: 210mm;
    min-height: 297mm;
    padding: 20mm 15mm;
    margin: 24px auto;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  @media print {
    body { background: #fff; }
    .sheet { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; }
  }
  header.top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 24px;
    border-bottom: 1px solid #e4e4e7;
  }
  .brand .name { font-size: 16pt; font-weight: 600; }
  .brand .meta { font-size: 9pt; color: #71717a; margin-top: 4px; line-height: 1.5; }
  .doc h1 {
    font-size: 22pt;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.5px;
    text-transform: uppercase;
    text-align: right;
  }
  .doc .number { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11pt; color: #52525b; margin-top: 4px; text-align: right; }
  .doc .status {
    display: inline-block;
    margin-top: 8px;
    padding: 2px 8px;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-radius: 3px;
    background: #f4f4f5;
    color: #52525b;
  }
  .doc .status.paid { background: #ecfdf5; color: #047857; }
  .doc .status.draft { background: #fef3c7; color: #92400e; }
  .parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    padding: 24px 0;
  }
  .party-block .label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #71717a;
    margin-bottom: 6px;
  }
  .party-block .name { font-weight: 600; }
  .party-block .lines { color: #52525b; font-size: 10pt; line-height: 1.6; }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    padding: 12px 0 24px;
    border-top: 1px solid #e4e4e7;
    border-bottom: 1px solid #e4e4e7;
    margin-bottom: 24px;
  }
  .meta-grid .cell .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; }
  .meta-grid .cell .value { font-size: 10pt; margin-top: 2px; }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  table.lines thead th {
    text-align: left;
    font-weight: 500;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #71717a;
    padding: 6px 4px;
    border-bottom: 1px solid #d4d4d8;
  }
  table.lines tbody td {
    padding: 8px 4px;
    border-bottom: 1px solid #f4f4f5;
    vertical-align: top;
  }
  table.lines .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.lines .desc { color: #18181b; }
  table.lines .desc .secondary { font-size: 9pt; color: #71717a; margin-top: 2px; }
  .totals {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
  }
  .totals table {
    border-collapse: collapse;
    min-width: 280px;
  }
  .totals td { padding: 4px 0; font-size: 10pt; }
  .totals td.label { color: #52525b; padding-right: 24px; }
  .totals td.value { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { border-top: 1px solid #d4d4d8; padding-top: 8px; font-weight: 600; font-size: 11pt; }
  .vat-note {
    margin-top: 16px;
    padding: 10px 12px;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 4px;
    color: #78350f;
    font-size: 9pt;
    line-height: 1.5;
  }
  .notes-block {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #e4e4e7;
  }
  .notes-block .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; margin-bottom: 6px; }
  .notes-block .body { font-size: 10pt; color: #3f3f46; white-space: pre-wrap; }
  footer.bottom {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #e4e4e7;
    font-size: 8pt;
    color: #71717a;
    line-height: 1.6;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  footer.bottom .col .label { text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
</style>
</head>
<body>
<div class="sheet">
  <header class="top">
    <div class="brand">
      <div class="name">${escape(company.name)}</div>
      <div class="meta">
        ${[
          company.address_line1,
          [company.postal_code, company.city].filter(Boolean).join(" "),
          company.country,
          company.vat_number ? `VAT ${escape(company.vat_number)}` : "",
          company.email,
        ].filter(Boolean).map((l) => `<div>${escape(String(l))}</div>`).join("")}
      </div>
    </div>
    <div class="doc">
      <h1>${escape(heading)}</h1>
      <div class="number">${escape(invoice.number ?? `Draft #${invoice.id}`)}</div>
      <div class="status ${invoice.status}">${escape(invoice.status)}</div>
    </div>
  </header>

  <section class="parties">
    <div class="party-block">
      <div class="label">From</div>
      <div class="name">${escape(company.name)}</div>
      <div class="lines">
        ${[company.address_line1, [company.postal_code, company.city].filter(Boolean).join(" "), company.country].filter(Boolean).map((l) => `<div>${escape(String(l))}</div>`).join("")}
        ${company.vat_number ? `<div>VAT ${escape(company.vat_number)}</div>` : ""}
        ${company.chamber_number ? `<div>CoC ${escape(company.chamber_number)}</div>` : ""}
      </div>
    </div>
    <div class="party-block">
      <div class="label">Bill to</div>
      <div class="name">${escape(party.name)}</div>
      <div class="lines">
        ${[party.address_line1, party.address_line2, [party.postal_code, party.city].filter(Boolean).join(" "), party.country].filter(Boolean).map((l) => `<div>${escape(String(l))}</div>`).join("")}
        ${party.vat_number ? `<div>VAT ${escape(party.vat_number)}</div>` : ""}
        ${party.email ? `<div>${escape(party.email)}</div>` : ""}
      </div>
    </div>
  </section>

  <section class="meta-grid">
    <div class="cell"><div class="label">Issue date</div><div class="value">${escape(invoice.issue_date ?? "—")}</div></div>
    <div class="cell"><div class="label">Due date</div><div class="value">${escape(invoice.due_date ?? "—")}</div></div>
    <div class="cell"><div class="label">Reference</div><div class="value">${escape(invoice.reference ?? "—")}</div></div>
    <div class="cell"><div class="label">Currency</div><div class="value">${escape(invoice.currency)}</div></div>
  </section>

  <table class="lines">
    <thead>
      <tr>
        <th style="width:55%">Description</th>
        <th class="num" style="width:10%">Qty</th>
        <th class="num" style="width:15%">Unit price</th>
        <th class="num" style="width:8%">VAT</th>
        <th class="num" style="width:12%">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lines.length === 0
        ? `<tr><td colspan="5" style="padding:24px 4px;color:#a1a1aa;text-align:center;font-style:italic">No lines</td></tr>`
        : lines.map((l) => `
        <tr>
          <td class="desc">
            ${escape(l.description || "—")}
            ${l.account_code ? `<div class="secondary">${escape(l.account_code)}</div>` : ""}
          </td>
          <td class="num">${formatNumber(l.quantity)}${l.unit && l.unit !== "unit" ? ` <span style="color:#a1a1aa">${escape(l.unit)}</span>` : ""}</td>
          <td class="num">${fmt(l.unit_price_cents)}</td>
          <td class="num">${formatPercent(l.vat_rate)}${effectiveRate(l) === 0 && l.vat_rate > 0 ? `<div style="font-size:8pt;color:#92400e">reverse</div>` : ""}</td>
          <td class="num">${fmt(l.subtotal_cents)}</td>
        </tr>
        `).join("")}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td class="label">Subtotal</td><td class="value">${fmt(invoice.subtotal_cents)}</td></tr>
      ${ratesGrouped.map(({ rate, vatCents }) => `
        <tr><td class="label">VAT ${formatPercent(rate)}${invoice.reverse_charge ? " (reverse charge)" : ""}</td><td class="value">${fmt(vatCents)}</td></tr>
      `).join("")}
      <tr class="grand"><td class="label">Total</td><td class="value">${fmt(invoice.total_cents)}</td></tr>
    </table>
  </div>

  ${invoice.reverse_charge ? `
  <div class="vat-note">
    <strong>Reverse charge applies.</strong> VAT is to be accounted for by the recipient
    in accordance with Article 196 of the EU VAT Directive (2006/112/EC).
  </div>` : ""}

  ${invoice.notes ? `
  <div class="notes-block">
    <div class="label">Notes</div>
    <div class="body">${escape(invoice.notes)}</div>
  </div>` : ""}

  <footer class="bottom">
    <div class="col">
      <div class="label">Issued by</div>
      <div>${escape(company.name)}</div>
      ${company.vat_number ? `<div>VAT ${escape(company.vat_number)}</div>` : ""}
      ${company.chamber_number ? `<div>CoC ${escape(company.chamber_number)}</div>` : ""}
    </div>
    <div class="col">
      <div class="label">Payment</div>
      ${company.iban ? `<div>IBAN ${escape(company.iban)}</div>` : `<div>—</div>`}
      ${invoice.due_date ? `<div>Due ${escape(invoice.due_date)}</div>` : ""}
      ${invoice.number ? `<div>Reference ${escape(invoice.number)}</div>` : ""}
    </div>
    <div class="col">
      <div class="label">Contact</div>
      ${company.email ? `<div>${escape(company.email)}</div>` : ""}
    </div>
  </footer>
</div>
</body>
</html>`;
}

function escape(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
}

function formatNumber(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function formatPercent(rate: number): string {
  return rate % 1 === 0 ? `${rate}%` : `${rate.toFixed(1)}%`;
}

function effectiveRate(line: InvoiceLine): number {
  return line.subtotal_cents > 0 ? (line.vat_cents / line.subtotal_cents) * 100 : line.vat_rate;
}

function groupByRate(lines: InvoiceLine[]): { rate: number; vatCents: number }[] {
  const map = new Map<number, number>();
  for (const line of lines) {
    const key = line.vat_rate;
    map.set(key, (map.get(key) ?? 0) + line.vat_cents);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, vatCents]) => ({ rate, vatCents }));
}
