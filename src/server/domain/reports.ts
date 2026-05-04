import { query } from "../db";

export interface ReportLine {
  account_code: string;
  name: string;
  amount_cents: number;
}

export interface ProfitLoss {
  period: { from: string | null; to: string | null };
  revenue: ReportLine[];
  expenses: ReportLine[];
  total_revenue_cents: number;
  total_expenses_cents: number;
  profit_cents: number;
}

export interface BalanceSheet {
  as_of: string;
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  profit_ytd_cents: number;
  total_assets_cents: number;
  total_liabilities_equity_cents: number;
  difference_cents: number;
}

interface PostedRow {
  account_code: string;
  name: string;
  dc: string | null;
  bw: string;
  debit: number;
  credit: number;
}

export async function profitLoss(opts: { from?: string; to?: string } = {}): Promise<ProfitLoss> {
  const where = ["e.status = 'posted'", "a.bw = 'W'"];
  const params: unknown[] = [];
  if (opts.from) { where.push("e.date >= ?"); params.push(opts.from); }
  if (opts.to) { where.push("e.date <= ?"); params.push(opts.to); }
  const rows = await query<PostedRow>(
    `SELECT
       l.account_code,
       a.omskort AS name,
       a.dc,
       a.bw,
       SUM(l.debit_cents) AS debit,
       SUM(l.credit_cents) AS credit
     FROM journal_lines l
     JOIN journal_entries e ON e.id = l.entry_id
     JOIN accounts a ON a.rgs_code = l.account_code
     WHERE ${where.join(" AND ")}
     GROUP BY l.account_code, a.omskort, a.dc, a.bw
     ORDER BY l.account_code`,
    params,
  );

  const revenue: ReportLine[] = [];
  const expenses: ReportLine[] = [];
  for (const row of rows) {
    const netCredit = row.credit - row.debit;
    if (row.dc === "D") {
      expenses.push({ account_code: row.account_code, name: row.name, amount_cents: -netCredit });
    } else {
      revenue.push({ account_code: row.account_code, name: row.name, amount_cents: netCredit });
    }
  }
  const total_revenue_cents = revenue.reduce((s, r) => s + r.amount_cents, 0);
  const total_expenses_cents = expenses.reduce((s, r) => s + r.amount_cents, 0);
  return {
    period: { from: opts.from ?? null, to: opts.to ?? null },
    revenue,
    expenses,
    total_revenue_cents,
    total_expenses_cents,
    profit_cents: total_revenue_cents - total_expenses_cents,
  };
}

export async function balanceSheet(opts: { as_of?: string } = {}): Promise<BalanceSheet> {
  const as_of = opts.as_of ?? new Date().toISOString().slice(0, 10);
  const rows = await query<PostedRow>(
    `SELECT
       l.account_code,
       a.omskort AS name,
       a.dc,
       a.bw,
       SUM(l.debit_cents) AS debit,
       SUM(l.credit_cents) AS credit
     FROM journal_lines l
     JOIN journal_entries e ON e.id = l.entry_id
     JOIN accounts a ON a.rgs_code = l.account_code
     WHERE e.status = 'posted' AND e.date <= ?
     GROUP BY l.account_code, a.omskort, a.dc, a.bw
     ORDER BY l.account_code`,
    [as_of],
  );

  const assets: ReportLine[] = [];
  const liabilities: ReportLine[] = [];
  const equity: ReportLine[] = [];
  let plNetCredit = 0;

  for (const row of rows) {
    const netDebit = row.debit - row.credit;
    if (row.bw === "B") {
      if (row.dc === "D") {
        assets.push({ account_code: row.account_code, name: row.name, amount_cents: netDebit });
      } else if (row.account_code === "BEiv" || row.account_code.startsWith("BEiv")) {
        equity.push({ account_code: row.account_code, name: row.name, amount_cents: -netDebit });
      } else {
        liabilities.push({ account_code: row.account_code, name: row.name, amount_cents: -netDebit });
      }
    } else {
      plNetCredit += row.credit - row.debit;
    }
  }

  const profit_ytd_cents = plNetCredit;
  const total_assets_cents = assets.reduce((s, r) => s + r.amount_cents, 0);
  const total_liabilities_equity_cents =
    liabilities.reduce((s, r) => s + r.amount_cents, 0) +
    equity.reduce((s, r) => s + r.amount_cents, 0) +
    profit_ytd_cents;

  return {
    as_of,
    assets,
    liabilities,
    equity,
    profit_ytd_cents,
    total_assets_cents,
    total_liabilities_equity_cents,
    difference_cents: total_assets_cents - total_liabilities_equity_cents,
  };
}
