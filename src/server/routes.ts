import { Hono } from "hono";
import { clearAccounts, getAccount, getTree, listAccounts, loadStarter } from "./domain/rgs";
import { createParty, deleteParty, getParty, listParties, updateParty, type PartyKind } from "./domain/parties";
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "./domain/products";
import {
  addLine,
  createDraft,
  deleteInvoice,
  deleteLine,
  getInvoice,
  getLines,
  issueInvoice,
  listInvoices,
  setStatus,
  updateInvoice,
  updateLine,
  type InvoiceStatus,
  type InvoiceType,
} from "./domain/invoices";
import { getCompany, updateCompany } from "./domain/company";
import { COUNTRY_VAT, computeVat, EU_MEMBER_STATES } from "./domain/vat";
import { renderInvoiceHTML } from "./exports/invoice-html";
import { PdfRenderError, renderPDF, type PdfEnv } from "./exports/pdf";
import { renderInvoiceUBL } from "./exports/ubl";

const api = new Hono();

api.get("/api/accounts", async (c) => {
  const bw = c.req.query("bw");
  const nivoStr = c.req.query("nivo");
  const parent = c.req.query("parent");
  const accounts = await listAccounts({
    bw: bw || undefined,
    nivo: nivoStr ? Number(nivoStr) : undefined,
    parent: parent === undefined ? undefined : parent,
  });
  return c.json(accounts);
});

api.get("/api/accounts/tree", async (c) => {
  return c.json(await getTree());
});

api.get("/api/accounts/:code", async (c) => {
  const account = await getAccount(c.req.param("code"));
  if (!account) return c.json({ error: "Not found" }, 404);
  return c.json(account);
});

api.post("/api/accounts/seed", async (c) => {
  return c.json(await loadStarter());
});

api.delete("/api/accounts", async (c) => {
  await clearAccounts();
  return c.json({ ok: true });
});

api.get("/api/parties", async (c) => {
  const kind = c.req.query("kind") as PartyKind | undefined;
  const q = c.req.query("q") || undefined;
  return c.json(await listParties({ kind, q }));
});

api.post("/api/parties", async (c) => {
  const body = await c.req.json();
  if (!body?.name?.trim()) return c.json({ error: "Name required" }, 400);
  if (!body.kind || !["customer", "supplier", "both"].includes(body.kind)) {
    return c.json({ error: "Valid kind required (customer | supplier | both)" }, 400);
  }
  return c.json(await createParty(body), 201);
});

api.get("/api/parties/:id", async (c) => {
  const party = await getParty(Number(c.req.param("id")));
  if (!party) return c.json({ error: "Not found" }, 404);
  return c.json(party);
});

api.patch("/api/parties/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const party = await updateParty(id, body);
  if (!party) return c.json({ error: "Not found" }, 404);
  return c.json(party);
});

api.delete("/api/parties/:id", async (c) => {
  await deleteParty(Number(c.req.param("id")));
  return c.json({ ok: true });
});

api.get("/api/products", async (c) => {
  const q = c.req.query("q") || undefined;
  const activeStr = c.req.query("active");
  const active = activeStr === undefined ? undefined : activeStr === "true" || activeStr === "1";
  return c.json(await listProducts({ q, active }));
});

api.post("/api/products", async (c) => {
  const body = await c.req.json();
  if (!body?.name?.trim()) return c.json({ error: "Name required" }, 400);
  return c.json(await createProduct(body), 201);
});

api.get("/api/products/:id", async (c) => {
  const p = await getProduct(Number(c.req.param("id")));
  if (!p) return c.json({ error: "Not found" }, 404);
  return c.json(p);
});

api.patch("/api/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const p = await updateProduct(id, body);
  if (!p) return c.json({ error: "Not found" }, 404);
  return c.json(p);
});

api.delete("/api/products/:id", async (c) => {
  await deleteProduct(Number(c.req.param("id")));
  return c.json({ ok: true });
});

api.get("/api/invoices", async (c) => {
  const type = c.req.query("type") as InvoiceType | undefined;
  const status = c.req.query("status") as InvoiceStatus | undefined;
  const partyStr = c.req.query("party_id");
  return c.json(await listInvoices({
    type,
    status,
    party_id: partyStr ? Number(partyStr) : undefined,
  }));
});

api.post("/api/invoices", async (c) => {
  const body = await c.req.json();
  if (!body?.party_id) return c.json({ error: "party_id required" }, 400);
  return c.json(await createDraft(body), 201);
});

api.get("/api/invoices/:id", async (c) => {
  const inv = await getInvoice(Number(c.req.param("id")));
  if (!inv) return c.json({ error: "Not found" }, 404);
  const lines = await getLines(inv.id);
  return c.json({ ...inv, lines });
});

api.get("/api/invoices/:id/preview", async (c) => {
  const inv = await getInvoice(Number(c.req.param("id")));
  if (!inv) return c.text("Invoice not found", 404);
  const [lines, party, company] = await Promise.all([
    getLines(inv.id),
    getParty(inv.party_id),
    getCompany(),
  ]);
  if (!party) return c.text("Party not found", 404);
  const html = renderInvoiceHTML({ company, party, invoice: inv, lines });
  return c.html(html);
});

api.get("/api/invoices/:id/ubl", async (c) => {
  const inv = await getInvoice(Number(c.req.param("id")));
  if (!inv) return c.text("Invoice not found", 404);
  if (inv.type === "quote") return c.json({ error: "UBL export is not supported for quotes" }, 400);
  const [lines, party, company] = await Promise.all([
    getLines(inv.id),
    getParty(inv.party_id),
    getCompany(),
  ]);
  if (!party) return c.text("Party not found", 404);
  const xml = renderInvoiceUBL({ company, party, invoice: inv, lines });
  const filename = (inv.number ?? `invoice-${inv.id}`).replace(/[^A-Za-z0-9_.-]/g, "_") + ".xml";
  const inline = c.req.query("inline") === "1";
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    },
  });
});

api.get("/api/invoices/:id/pdf", async (c) => {
  const inv = await getInvoice(Number(c.req.param("id")));
  if (!inv) return c.text("Invoice not found", 404);
  const [lines, party, company] = await Promise.all([
    getLines(inv.id),
    getParty(inv.party_id),
    getCompany(),
  ]);
  if (!party) return c.text("Party not found", 404);
  const html = renderInvoiceHTML({ company, party, invoice: inv, lines });

  try {
    const pdf = await renderPDF(c.env as PdfEnv, {
      html,
      format: "A4",
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
      print_background: true,
    });
    const filename = (inv.number ?? `invoice-${inv.id}`).replace(/[^A-Za-z0-9_.-]/g, "_") + ".pdf";
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof PdfRenderError) {
      if (e.code === "quota_exceeded") return c.json({ error: e.code, detail: e.detail }, 503);
      if (e.code === "no_backend") return c.json({ error: e.code, message: e.message }, 501);
      if (e.code === "rate_limited") return c.json({ error: e.code, detail: e.detail }, 429);
      return c.json({ error: e.code, detail: e.detail }, 502);
    }
    return c.json({ error: "pdf_render_failed", detail: String(e) }, 500);
  }
});

api.patch("/api/invoices/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const inv = await updateInvoice(id, body);
  if (!inv) return c.json({ error: "Not found" }, 404);
  return c.json(inv);
});

api.post("/api/invoices/:id/issue", async (c) => {
  const inv = await issueInvoice(Number(c.req.param("id")));
  if (!inv) return c.json({ error: "Not found" }, 404);
  return c.json(inv);
});

api.post("/api/invoices/:id/lines", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const line = await addLine(id, body);
  if (!line) return c.json({ error: "Not found" }, 404);
  return c.json(line, 201);
});

api.patch("/api/lines/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const line = await updateLine(id, body);
  if (!line) return c.json({ error: "Not found" }, 404);
  return c.json(line);
});

api.delete("/api/lines/:id", async (c) => {
  await deleteLine(Number(c.req.param("id")));
  return c.json({ ok: true });
});

api.get("/api/company", async (c) => c.json(await getCompany()));

api.patch("/api/company", async (c) => {
  const body = await c.req.json();
  return c.json(await updateCompany(body));
});

api.post("/api/invoices/:id/status", async (c) => {
  const id = Number(c.req.param("id"));
  const { status } = await c.req.json<{ status: InvoiceStatus }>();
  const inv = await setStatus(id, status);
  if (!inv) return c.json({ error: "Not found" }, 404);
  return c.json(inv);
});

api.delete("/api/invoices/:id", async (c) => {
  await deleteInvoice(Number(c.req.param("id")));
  return c.json({ ok: true });
});

api.get("/api/vat/countries", (c) => {
  return c.json({ eu: EU_MEMBER_STATES, rates: COUNTRY_VAT });
});

api.get("/api/vat/compute", (c) => {
  const sellerCountry = c.req.query("seller") || "NL";
  const buyerCountry = c.req.query("buyer") || "NL";
  const buyerHasVatId = c.req.query("buyer_vat") === "1" || c.req.query("buyer_vat") === "true";
  const lineRate = Number(c.req.query("rate") || COUNTRY_VAT[sellerCountry]?.standard || 21);
  return c.json(computeVat({ sellerCountry, buyerCountry, buyerHasVatId, lineRate }));
});

export default api;
