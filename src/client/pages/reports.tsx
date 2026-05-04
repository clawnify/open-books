import { useEffect, useState } from "react";

interface ReportLine {
  account_code: string;
  name: string;
  amount_cents: number;
}

interface ProfitLoss {
  period: { from: string | null; to: string | null };
  revenue: ReportLine[];
  expenses: ReportLine[];
  total_revenue_cents: number;
  total_expenses_cents: number;
  profit_cents: number;
}

interface BalanceSheet {
  as_of: string;
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  profit_ytd_cents: number;
  total_assets_cents: number;
  total_liabilities_equity_cents: number;
  difference_cents: number;
}

export function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = today.slice(0, 4) + "-01-01";

  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [pl, setPl] = useState<ProfitLoss | null>(null);
  const [bs, setBs] = useState<BalanceSheet | null>(null);

  async function loadPl() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/reports/profit-loss?${params}`);
    setPl(await res.json());
  }

  async function loadBs() {
    const params = new URLSearchParams();
    if (asOf) params.set("as_of", asOf);
    const res = await fetch(`/api/reports/balance-sheet?${params}`);
    setBs(await res.json());
  }

  useEffect(() => { loadPl(); }, [from, to]);
  useEffect(() => { loadBs(); }, [asOf]);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Reports</h2>
      <p className="text-sm text-gray-500 mb-6">
        Derived from posted journal entries. Filter by date to drill in.
      </p>

      <section className="mb-10">
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <h3 className="text-base font-semibold">Profit &amp; Loss</h3>
          <div className="flex items-center gap-2 text-xs text-gray-500 ml-auto">
            <label className="flex items-center gap-1">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateCls} /></label>
            <label className="flex items-center gap-1">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateCls} /></label>
          </div>
        </div>
        {pl && (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <SectionRows title="Revenue" lines={pl.revenue} total={pl.total_revenue_cents} />
            <SectionRows title="Expenses" lines={pl.expenses} total={pl.total_expenses_cents} />
            <div className="px-3 py-2 bg-gray-50 border-t-2 border-gray-200 flex items-baseline">
              <span className="text-sm font-semibold text-gray-800">Net profit</span>
              <span className={`ml-auto text-sm font-mono font-semibold ${pl.profit_cents >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {formatMoney(pl.profit_cents)}
              </span>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <h3 className="text-base font-semibold">Balance Sheet</h3>
          <div className="flex items-center gap-2 text-xs text-gray-500 ml-auto">
            <label className="flex items-center gap-1">As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={dateCls} /></label>
          </div>
        </div>
        {bs && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wide">Assets</div>
              <Lines lines={bs.assets} />
              <TotalRow label="Total assets" amount={bs.total_assets_cents} />
            </div>
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wide">Liabilities &amp; Equity</div>
              <Lines lines={bs.liabilities} />
              <Lines lines={bs.equity} />
              {bs.profit_ytd_cents !== 0 && (
                <div className="px-3 py-1.5 text-xs flex items-baseline border-t border-gray-50">
                  <span className="font-mono text-gray-500 w-20">—</span>
                  <span className="text-gray-700 italic">Profit YTD</span>
                  <span className="ml-auto font-mono">{formatMoney(bs.profit_ytd_cents)}</span>
                </div>
              )}
              <TotalRow label="Total liab. &amp; equity" amount={bs.total_liabilities_equity_cents} />
            </div>
          </div>
        )}
        {bs && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${bs.difference_cents === 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
            {bs.difference_cents === 0
              ? `Balanced. Assets = Liabilities + Equity = ${formatMoney(bs.total_assets_cents)}`
              : `Imbalanced by ${formatMoney(Math.abs(bs.difference_cents))} — investigate before relying on these numbers.`}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionRows({ title, lines, total }: { title: string; lines: ReportLine[]; total: number }) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="px-3 py-2 bg-gray-50/60 text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</div>
      {lines.length === 0 ? (
        <div className="px-3 py-3 text-xs text-gray-400 italic">No activity</div>
      ) : (
        <Lines lines={lines} />
      )}
      <div className="px-3 py-1.5 flex items-baseline border-t border-gray-100 bg-gray-50/30">
        <span className="text-xs font-medium text-gray-600">Total {title.toLowerCase()}</span>
        <span className="ml-auto text-xs font-mono font-medium text-gray-800">{formatMoney(total)}</span>
      </div>
    </div>
  );
}

function Lines({ lines }: { lines: ReportLine[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((line) => (
        <div key={line.account_code} className="px-3 py-1.5 text-xs flex items-baseline border-t border-gray-50 first:border-t-0">
          <span className="font-mono text-gray-500 w-20">{line.account_code}</span>
          <span className="text-gray-700">{line.name}</span>
          <span className="ml-auto font-mono">{formatMoney(line.amount_cents)}</span>
        </div>
      ))}
    </>
  );
}

function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-baseline">
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      <span className="ml-auto text-sm font-mono font-semibold text-gray-900">{formatMoney(amount)}</span>
    </div>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const dateCls = "px-2 py-1 rounded border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black";
