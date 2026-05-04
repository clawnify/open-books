import { useEffect, useState } from "react";

interface Company {
  id: number;
  name: string;
  vat_number: string | null;
  chamber_number: string | null;
  country: string;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  email: string | null;
  iban: string | null;
  default_currency: string;
  default_due_days: number;
  updated_at: string;
}

const COUNTRIES = ["NL", "BE", "DE", "FR", "IT", "ES", "PT", "AT", "DK", "SE", "FI", "IE", "PL", "GB", "LU"];
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "DKK", "NOK", "PLN"];

export function SettingsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [form, setForm] = useState<Partial<Company>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/company");
    const data: Company = await res.json();
    setCompany(data);
    setForm(data);
  }

  useEffect(() => { load(); }, []);

  function update<K extends keyof Company>(key: K, value: Company[K]) {
    setForm({ ...form, [key]: value });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { setError("Company name is required"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Failed to save");
      return;
    }
    const next: Company = await res.json();
    setCompany(next);
    setForm(next);
    setSavedAt(new Date().toISOString());
    setTimeout(() => setSavedAt(null), 2500);
  }

  if (!company) return <div className="text-sm text-gray-400">Loading…</div>;

  const dirty = JSON.stringify(form) !== JSON.stringify(company);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-xl font-semibold">Settings</h2>
        {savedAt && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Your company details. These appear on every invoice (HTML preview, PDF, UBL export) and are used to
        compute cross-border VAT logic — e.g., a buyer in a different EU country with a VAT id triggers reverse charge.
      </p>

      <form onSubmit={save} className="space-y-6">
        <Section title="Company" subtitle="Identity shown on invoices.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legal name *" full>
              <input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} className={inputCls} required />
            </Field>
            <Field label="VAT number">
              <input value={form.vat_number ?? ""} onChange={(e) => update("vat_number", e.target.value || null)} className={`${inputCls} font-mono`} placeholder="NL864312001B01" />
            </Field>
            <Field label="Chamber / KVK / CoC">
              <input value={form.chamber_number ?? ""} onChange={(e) => update("chamber_number", e.target.value || null)} className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Country">
              <select value={form.country ?? "NL"} onChange={(e) => update("country", e.target.value)} className={inputCls}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Email">
              <input type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value || null)} className={inputCls} placeholder="hello@yourcompany.example" />
            </Field>
            <Field label="Address" full>
              <input value={form.address_line1 ?? ""} onChange={(e) => update("address_line1", e.target.value || null)} className={inputCls} />
            </Field>
            <Field label="Postal code">
              <input value={form.postal_code ?? ""} onChange={(e) => update("postal_code", e.target.value || null)} className={inputCls} />
            </Field>
            <Field label="City">
              <input value={form.city ?? ""} onChange={(e) => update("city", e.target.value || null)} className={inputCls} />
            </Field>
          </div>
        </Section>

        <Section title="Banking" subtitle="Shown in the payment block on invoices.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="IBAN" full>
              <input value={form.iban ?? ""} onChange={(e) => update("iban", e.target.value || null)} className={`${inputCls} font-mono`} placeholder="NL12RABO0123456789" />
            </Field>
          </div>
        </Section>

        <Section title="Defaults" subtitle="Applied to new invoices unless overridden.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default currency">
              <select value={form.default_currency ?? "EUR"} onChange={(e) => update("default_currency", e.target.value)} className={inputCls}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Default payment terms (days)">
              <input type="number" min={0} value={form.default_due_days ?? 30} onChange={(e) => update("default_due_days", Number(e.target.value))} className={inputCls} />
            </Field>
          </div>
        </Section>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-white/90 backdrop-blur border-t border-gray-100 flex gap-2 items-center">
          <button
            type="submit"
            disabled={saving || !dirty}
            className="px-3 py-1.5 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {dirty && !saving && <span className="text-xs text-amber-600">Unsaved changes</span>}
          {!dirty && (
            <span className="text-xs text-gray-400 ml-auto">
              Last updated {company.updated_at}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`text-xs text-gray-500 ${full ? "col-span-2" : ""}`}>
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full px-2 py-1.5 rounded-md border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black";
