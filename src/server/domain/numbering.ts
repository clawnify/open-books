import { query, run } from "../db";

export type NumberingScope = "invoice" | "credit_note" | "quote";

const DEFAULT_PREFIX: Record<NumberingScope, string> = {
  invoice: "INV",
  credit_note: "CN",
  quote: "Q",
};

export async function nextNumber(scope: NumberingScope, year = new Date().getFullYear()): Promise<string> {
  await run(
    `INSERT OR IGNORE INTO numbering_sequences (scope, year, next_number, prefix) VALUES (?, ?, 1, ?)`,
    [scope, year, DEFAULT_PREFIX[scope]],
  );
  const rows = await query<{ assigned: number; prefix: string }>(
    `UPDATE numbering_sequences
       SET next_number = next_number + 1
     WHERE scope = ? AND year = ?
     RETURNING (next_number - 1) AS assigned, prefix`,
    [scope, year],
  );
  if (rows.length === 0) throw new Error(`Failed to assign ${scope} number for ${year}`);
  const { assigned, prefix } = rows[0];
  return `${prefix}-${year}-${String(assigned).padStart(4, "0")}`;
}

export async function peekSequence(scope: NumberingScope, year = new Date().getFullYear()): Promise<{ next_number: number; prefix: string } | undefined> {
  const rows = await query<{ next_number: number; prefix: string }>(
    `SELECT next_number, prefix FROM numbering_sequences WHERE scope = ? AND year = ?`,
    [scope, year],
  );
  return rows[0];
}
