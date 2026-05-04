import { get, run } from "../db";

export interface Company {
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

const COLUMNS = [
  "name", "vat_number", "chamber_number", "country", "address_line1",
  "postal_code", "city", "email", "iban", "default_currency", "default_due_days",
] as const;

export async function getCompany(): Promise<Company> {
  const c = await get<Company>("SELECT * FROM company WHERE id = 1");
  if (!c) throw new Error("Company row missing — schema not initialised");
  return c;
}

export async function updateCompany(input: Partial<Company>): Promise<Company> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of COLUMNS) {
    const value = (input as Record<string, unknown>)[col];
    if (value !== undefined) {
      sets.push(`${col} = ?`);
      params.push(value);
    }
  }
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    await run(`UPDATE company SET ${sets.join(", ")} WHERE id = 1`, params);
  }
  return getCompany();
}
