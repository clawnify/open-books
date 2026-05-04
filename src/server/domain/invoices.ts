import { get, query, run } from "../db";
import { getCompany } from "./company";
import { createFromInvoice as createJournalFromInvoice, deleteEntriesForInvoice } from "./journals";
import { getParty } from "./parties";
import { nextNumber, type NumberingScope } from "./numbering";
import { computeVat } from "./vat";

export type InvoiceType = "invoice" | "credit_note" | "quote";
export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "cancelled";

export interface Invoice {
  id: number;
  number: string | null;
  type: InvoiceType;
  status: InvoiceStatus;
  party_id: number;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  fx_rate: number;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  reverse_charge: number;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: number;
  invoice_id: number;
  position: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate: number;
  account_code: string | null;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
}

export interface InvoiceWithParty extends Invoice {
  party_name: string;
  party_country: string;
}

export async function listInvoices(filters: { type?: InvoiceType; status?: InvoiceStatus; party_id?: number } = {}): Promise<InvoiceWithParty[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.type) { where.push("i.type = ?"); params.push(filters.type); }
  if (filters.status) { where.push("i.status = ?"); params.push(filters.status); }
  if (filters.party_id) { where.push("i.party_id = ?"); params.push(filters.party_id); }
  return query<InvoiceWithParty>(
    `SELECT i.*, p.name AS party_name, p.country AS party_country
       FROM invoices i
       JOIN parties p ON p.id = i.party_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY COALESCE(i.issue_date, i.created_at) DESC, i.id DESC`,
    params,
  );
}

export async function getInvoice(id: number): Promise<Invoice | undefined> {
  return get<Invoice>("SELECT * FROM invoices WHERE id = ?", [id]);
}

export async function getLines(invoiceId: number): Promise<InvoiceLine[]> {
  return query<InvoiceLine>(
    "SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY position",
    [invoiceId],
  );
}

export interface CreateDraftInput {
  type?: InvoiceType;
  party_id: number;
  currency?: string;
  reference?: string;
  notes?: string;
}

export async function createDraft(input: CreateDraftInput): Promise<Invoice> {
  const result = await run(
    `INSERT INTO invoices (type, party_id, currency, reference, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.type ?? "invoice",
      input.party_id,
      input.currency ?? "EUR",
      input.reference ?? null,
      input.notes ?? null,
    ],
  );
  const created = await getInvoice(result.lastInsertRowid);
  if (!created) throw new Error("Failed to load created invoice");
  return created;
}

export async function deleteInvoice(id: number): Promise<void> {
  await deleteEntriesForInvoice(id);
  await run("DELETE FROM invoice_lines WHERE invoice_id = ?", [id]);
  await run("DELETE FROM invoices WHERE id = ?", [id]);
}

const SCOPE_FOR_TYPE: Record<InvoiceType, NumberingScope> = {
  invoice: "invoice",
  credit_note: "credit_note",
  quote: "quote",
};

export async function issueInvoice(id: number): Promise<Invoice | undefined> {
  const inv = await getInvoice(id);
  if (!inv) return undefined;
  if (inv.status !== "draft") return inv;
  const number = await nextNumber(SCOPE_FOR_TYPE[inv.type]);
  const today = new Date().toISOString().slice(0, 10);
  await run(
    `UPDATE invoices
       SET number = ?,
           status = 'issued',
           issue_date = COALESCE(issue_date, ?),
           updated_at = datetime('now')
     WHERE id = ?`,
    [number, today, id],
  );
  await createJournalFromInvoice(id);
  return getInvoice(id);
}

export async function setStatus(id: number, status: InvoiceStatus): Promise<Invoice | undefined> {
  await run(
    `UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, id],
  );
  if (status === "cancelled") {
    await deleteEntriesForInvoice(id);
  }
  return getInvoice(id);
}

export async function updateInvoice(
  id: number,
  input: Partial<Pick<Invoice, "party_id" | "currency" | "issue_date" | "due_date" | "reference" | "notes">>,
): Promise<Invoice | undefined> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of ["party_id", "currency", "issue_date", "due_date", "reference", "notes"] as const) {
    const value = (input as Record<string, unknown>)[col];
    if (value !== undefined) {
      sets.push(`${col} = ?`);
      params.push(value);
    }
  }
  if (sets.length === 0) return getInvoice(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  await run(`UPDATE invoices SET ${sets.join(", ")} WHERE id = ?`, params);
  await recomputeTotals(id);
  return getInvoice(id);
}

export interface LineInput {
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price_cents?: number;
  vat_rate?: number;
  account_code?: string | null;
  product_id?: number | null;
  position?: number;
}

export async function addLine(invoiceId: number, input: LineInput): Promise<InvoiceLine | undefined> {
  const inv = await getInvoice(invoiceId);
  if (!inv) return undefined;
  const maxRow = await get<{ max_pos: number | null }>(
    "SELECT MAX(position) AS max_pos FROM invoice_lines WHERE invoice_id = ?",
    [invoiceId],
  );
  const position = input.position ?? ((maxRow?.max_pos ?? 0) + 1);
  const result = await run(
    `INSERT INTO invoice_lines
       (invoice_id, position, product_id, description, quantity, unit, unit_price_cents, vat_rate, account_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoiceId,
      position,
      input.product_id ?? null,
      input.description ?? "",
      input.quantity ?? 1,
      input.unit ?? "unit",
      input.unit_price_cents ?? 0,
      input.vat_rate ?? 21,
      input.account_code ?? null,
    ],
  );
  await recomputeTotals(invoiceId);
  return get<InvoiceLine>("SELECT * FROM invoice_lines WHERE id = ?", [result.lastInsertRowid]);
}

export async function updateLine(lineId: number, input: LineInput): Promise<InvoiceLine | undefined> {
  const owner = await get<{ invoice_id: number }>(
    "SELECT invoice_id FROM invoice_lines WHERE id = ?",
    [lineId],
  );
  if (!owner) return undefined;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of ["product_id", "description", "quantity", "unit", "unit_price_cents", "vat_rate", "account_code", "position"] as const) {
    const value = (input as Record<string, unknown>)[col];
    if (value !== undefined) {
      sets.push(`${col} = ?`);
      params.push(value);
    }
  }
  if (sets.length > 0) {
    params.push(lineId);
    await run(`UPDATE invoice_lines SET ${sets.join(", ")} WHERE id = ?`, params);
  }
  await recomputeTotals(owner.invoice_id);
  return get<InvoiceLine>("SELECT * FROM invoice_lines WHERE id = ?", [lineId]);
}

export async function deleteLine(lineId: number): Promise<void> {
  const owner = await get<{ invoice_id: number }>(
    "SELECT invoice_id FROM invoice_lines WHERE id = ?",
    [lineId],
  );
  if (!owner) return;
  await run("DELETE FROM invoice_lines WHERE id = ?", [lineId]);
  await recomputeTotals(owner.invoice_id);
}

export async function recomputeTotals(invoiceId: number): Promise<void> {
  const inv = await getInvoice(invoiceId);
  if (!inv) return;
  const party = await getParty(inv.party_id);
  const company = await getCompany();
  const sellerCountry = company.country;
  const buyerCountry = party?.country ?? sellerCountry;
  const buyerHasVatId = !!party?.vat_number;

  const lines = await getLines(invoiceId);
  let subtotal = 0;
  let vat = 0;
  let anyReverseCharge = false;

  for (const line of lines) {
    const v = computeVat({
      sellerCountry,
      buyerCountry,
      buyerHasVatId,
      lineRate: line.vat_rate,
    });
    const lineSubtotal = Math.round(line.quantity * line.unit_price_cents);
    const lineVat = Math.round((lineSubtotal * v.effectiveRate) / 100);
    const lineTotal = lineSubtotal + lineVat;
    if (v.reverseCharge) anyReverseCharge = true;
    await run(
      `UPDATE invoice_lines SET subtotal_cents = ?, vat_cents = ?, total_cents = ? WHERE id = ?`,
      [lineSubtotal, lineVat, lineTotal, line.id],
    );
    subtotal += lineSubtotal;
    vat += lineVat;
  }

  await run(
    `UPDATE invoices
       SET subtotal_cents = ?, vat_cents = ?, total_cents = ?, reverse_charge = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [subtotal, vat, subtotal + vat, anyReverseCharge ? 1 : 0, invoiceId],
  );
}
