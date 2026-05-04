import type { Company } from "../domain/company";
import type { Invoice, InvoiceLine } from "../domain/invoices";
import type { Party } from "../domain/parties";
import { computeVat } from "../domain/vat";

export interface UblContext {
  company: Company;
  party: Party;
  invoice: Invoice;
  lines: InvoiceLine[];
}

const PEPPOL_BIS_30_CUSTOMIZATION =
  "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
const PEPPOL_BIS_30_PROFILE = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

const UNIT_MAP: Record<string, string> = {
  unit: "EA",
  hour: "HUR",
  day: "DAY",
  month: "MON",
  kg: "KGM",
  m: "MTR",
  "m²": "MTK",
  license: "EA",
};

// Peppol participant identifier ICD codes per country.
// TODO: verify against the current Peppol Authority code list before production submission.
const ENDPOINT_SCHEME: Record<string, string> = {
  NL: "9944",
  BE: "9925",
  DE: "9930",
  IT: "9906",
  FR: "9957",
  ES: "9920",
  AT: "9914",
  IE: "9935",
  PL: "9945",
  PT: "9946",
  GB: "9932",
  LU: "9937",
  DK: "9944",
  SE: "9955",
  FI: "9931",
};

const TYPE_CODE: Record<Invoice["type"], string> = {
  invoice: "380",
  credit_note: "381",
  quote: "380",
};

type TaxCategory = "S" | "AE" | "G" | "Z" | "E";

interface LineTax {
  category: TaxCategory;
  rate: number;
  exemptionReasonCode?: string;
  exemptionReason?: string;
}

function lineTax(line: InvoiceLine, ctx: { sellerCountry: string; buyerCountry: string; buyerHasVatId: boolean }): LineTax {
  const v = computeVat({
    sellerCountry: ctx.sellerCountry,
    buyerCountry: ctx.buyerCountry,
    buyerHasVatId: ctx.buyerHasVatId,
    lineRate: line.vat_rate,
  });
  if (v.reverseCharge) {
    return {
      category: "AE",
      rate: 0,
      exemptionReasonCode: "VATEX-EU-AE",
      exemptionReason: "Reverse charge — VAT to be accounted for by the recipient (Art. 196 EU VAT Directive 2006/112/EC)",
    };
  }
  if (v.exempt) {
    return {
      category: "G",
      rate: 0,
      exemptionReasonCode: "VATEX-EU-G",
      exemptionReason: "Export outside the European Union — zero-rated",
    };
  }
  if (v.effectiveRate === 0 && line.vat_rate === 0) return { category: "Z", rate: 0 };
  return { category: "S", rate: v.effectiveRate };
}

export function renderInvoiceUBL(ctx: UblContext): string {
  const { company, party, invoice, lines } = ctx;
  const isCreditNote = invoice.type === "credit_note";
  const root = isCreditNote ? "CreditNote" : "Invoice";
  const rootNs = isCreditNote
    ? "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
    : "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
  const lineEl = isCreditNote ? "CreditNoteLine" : "InvoiceLine";
  const qtyEl = isCreditNote ? "CreditedQuantity" : "InvoicedQuantity";
  const typeCodeEl = isCreditNote ? "CreditNoteTypeCode" : "InvoiceTypeCode";

  const sellerCountry = company.country;
  const buyerCountry = party.country;
  const buyerHasVatId = !!party.vat_number;
  const txCtx = { sellerCountry, buyerCountry, buyerHasVatId };

  const currency = invoice.currency;
  const issueDate = invoice.issue_date ?? new Date().toISOString().slice(0, 10);
  const number = invoice.number ?? `DRAFT-${invoice.id}`;

  const linesXml = lines.map((line, i) => renderLine(line, i + 1, lineEl, qtyEl, currency, txCtx)).join("\n");

  const grouped = groupTaxes(lines, txCtx);
  const taxSubtotalsXml = grouped.map((g) => renderTaxSubtotal(g, currency)).join("\n");
  const totalTax = grouped.reduce((sum, g) => sum + g.taxAmountCents, 0);

  const supplierEndpoint = ENDPOINT_SCHEME[sellerCountry];
  const customerEndpoint = ENDPOINT_SCHEME[buyerCountry];

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${rootNs}"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${PEPPOL_BIS_30_CUSTOMIZATION}</cbc:CustomizationID>
  <cbc:ProfileID>${PEPPOL_BIS_30_PROFILE}</cbc:ProfileID>
  <cbc:ID>${esc(number)}</cbc:ID>
  <cbc:IssueDate>${esc(issueDate)}</cbc:IssueDate>${invoice.due_date ? `
  <cbc:DueDate>${esc(invoice.due_date)}</cbc:DueDate>` : ""}
  <cbc:${typeCodeEl}>${TYPE_CODE[invoice.type]}</cbc:${typeCodeEl}>${invoice.notes ? `
  <cbc:Note>${esc(invoice.notes)}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>${invoice.reference ? `
  <cbc:BuyerReference>${esc(invoice.reference)}</cbc:BuyerReference>` : ""}

  <cac:AccountingSupplierParty>
    <cac:Party>
${renderPartyEndpoint(company.vat_number, supplierEndpoint, "    ")}
${renderPartyName(company.name, "    ")}
${renderPostalAddress(company.address_line1, null, company.postal_code, company.city, company.country, "    ")}
${renderPartyTaxScheme(company.vat_number, "    ")}
${renderPartyLegalEntity(company.name, company.chamber_number, "    ")}${company.email ? `
      <cac:Contact>
        <cbc:ElectronicMail>${esc(company.email)}</cbc:ElectronicMail>
      </cac:Contact>` : ""}
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
${renderPartyEndpoint(party.vat_number, customerEndpoint, "    ")}
${renderPartyName(party.name, "    ")}
${renderPostalAddress(party.address_line1, party.address_line2, party.postal_code, party.city, party.country, "    ")}
${renderPartyTaxScheme(party.vat_number, "    ")}
${renderPartyLegalEntity(party.name, party.chamber_number, "    ")}${party.email ? `
      <cac:Contact>
        <cbc:ElectronicMail>${esc(party.email)}</cbc:ElectronicMail>
      </cac:Contact>` : ""}
    </cac:Party>
  </cac:AccountingCustomerParty>${company.iban ? `

  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>${invoice.due_date ? `
    <cbc:PaymentDueDate>${esc(invoice.due_date)}</cbc:PaymentDueDate>` : ""}
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(company.iban)}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : ""}

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(currency)}">${money(totalTax)}</cbc:TaxAmount>
${taxSubtotalsXml}
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(invoice.subtotal_cents)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(currency)}">${money(invoice.subtotal_cents)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(currency)}">${money(invoice.total_cents)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${esc(currency)}">${money(invoice.total_cents)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${linesXml}
</${root}>`;
}

function renderLine(
  line: InvoiceLine,
  position: number,
  lineEl: string,
  qtyEl: string,
  currency: string,
  ctx: { sellerCountry: string; buyerCountry: string; buyerHasVatId: boolean },
): string {
  const tax = lineTax(line, ctx);
  const unitCode = UNIT_MAP[line.unit] ?? "EA";
  return `  <cac:${lineEl}>
    <cbc:ID>${position}</cbc:ID>
    <cbc:${qtyEl} unitCode="${unitCode}">${formatQuantity(line.quantity)}</cbc:${qtyEl}>
    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(line.subtotal_cents)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(line.description || "Item")}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${tax.category}</cbc:ID>
        <cbc:Percent>${formatRate(tax.rate)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${esc(currency)}">${money(line.unit_price_cents)}</cbc:PriceAmount>
    </cac:Price>
  </cac:${lineEl}>`;
}

interface TaxGroup {
  category: TaxCategory;
  rate: number;
  taxableAmountCents: number;
  taxAmountCents: number;
  exemptionReasonCode?: string;
  exemptionReason?: string;
}

function groupTaxes(lines: InvoiceLine[], ctx: { sellerCountry: string; buyerCountry: string; buyerHasVatId: boolean }): TaxGroup[] {
  const groups = new Map<string, TaxGroup>();
  for (const line of lines) {
    const t = lineTax(line, ctx);
    const key = `${t.category}-${t.rate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.taxableAmountCents += line.subtotal_cents;
      existing.taxAmountCents += line.vat_cents;
    } else {
      groups.set(key, {
        category: t.category,
        rate: t.rate,
        taxableAmountCents: line.subtotal_cents,
        taxAmountCents: line.vat_cents,
        exemptionReasonCode: t.exemptionReasonCode,
        exemptionReason: t.exemptionReason,
      });
    }
  }
  return [...groups.values()];
}

function renderTaxSubtotal(g: TaxGroup, currency: string): string {
  const exemption = g.exemptionReasonCode
    ? `\n        <cbc:TaxExemptionReasonCode>${g.exemptionReasonCode}</cbc:TaxExemptionReasonCode>\n        <cbc:TaxExemptionReason>${esc(g.exemptionReason ?? "")}</cbc:TaxExemptionReason>`
    : "";
  return `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${esc(currency)}">${money(g.taxableAmountCents)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${esc(currency)}">${money(g.taxAmountCents)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${g.category}</cbc:ID>
        <cbc:Percent>${formatRate(g.rate)}</cbc:Percent>${exemption}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
}

function renderPartyEndpoint(vat: string | null, scheme: string | undefined, indent: string): string {
  if (!vat) return `${indent}  <cbc:EndpointID schemeID="0088">unknown</cbc:EndpointID>`;
  const schemeID = scheme ?? "9944";
  return `${indent}  <cbc:EndpointID schemeID="${schemeID}">${esc(vat)}</cbc:EndpointID>`;
}

function renderPartyName(name: string, indent: string): string {
  return `${indent}  <cac:PartyName>
${indent}    <cbc:Name>${esc(name)}</cbc:Name>
${indent}  </cac:PartyName>`;
}

function renderPostalAddress(line1: string | null, line2: string | null, postalCode: string | null, city: string | null, country: string, indent: string): string {
  const parts: string[] = [];
  if (line1) parts.push(`${indent}    <cbc:StreetName>${esc(line1)}</cbc:StreetName>`);
  if (line2) parts.push(`${indent}    <cbc:AdditionalStreetName>${esc(line2)}</cbc:AdditionalStreetName>`);
  if (city) parts.push(`${indent}    <cbc:CityName>${esc(city)}</cbc:CityName>`);
  if (postalCode) parts.push(`${indent}    <cbc:PostalZone>${esc(postalCode)}</cbc:PostalZone>`);
  parts.push(`${indent}    <cac:Country>
${indent}      <cbc:IdentificationCode>${esc(country)}</cbc:IdentificationCode>
${indent}    </cac:Country>`);
  return `${indent}  <cac:PostalAddress>
${parts.join("\n")}
${indent}  </cac:PostalAddress>`;
}

function renderPartyTaxScheme(vat: string | null, indent: string): string {
  if (!vat) return `${indent}  <!-- no VAT number -->`;
  return `${indent}  <cac:PartyTaxScheme>
${indent}    <cbc:CompanyID>${esc(vat)}</cbc:CompanyID>
${indent}    <cac:TaxScheme>
${indent}      <cbc:ID>VAT</cbc:ID>
${indent}    </cac:TaxScheme>
${indent}  </cac:PartyTaxScheme>`;
}

function renderPartyLegalEntity(name: string, chamberNumber: string | null, indent: string): string {
  const chamber = chamberNumber ? `\n${indent}    <cbc:CompanyID>${esc(chamberNumber)}</cbc:CompanyID>` : "";
  return `${indent}  <cac:PartyLegalEntity>
${indent}    <cbc:RegistrationName>${esc(name)}</cbc:RegistrationName>${chamber}
${indent}  </cac:PartyLegalEntity>`;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatQuantity(q: number): string {
  return q % 1 === 0 ? String(q) : q.toFixed(4);
}

function formatRate(r: number): string {
  return r % 1 === 0 ? String(r) : r.toFixed(2);
}

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
