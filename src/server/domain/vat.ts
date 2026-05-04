export const EU_MEMBER_STATES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
] as const;

export type EuCountry = typeof EU_MEMBER_STATES[number];

export function isEu(country: string): boolean {
  return (EU_MEMBER_STATES as readonly string[]).includes(country);
}

export interface CountryVat {
  standard: number;
  reduced: number[];
  zero: boolean;
}

export const COUNTRY_VAT: Record<string, CountryVat> = {
  NL: { standard: 21, reduced: [9], zero: true },
  BE: { standard: 21, reduced: [12, 6], zero: true },
  FR: { standard: 20, reduced: [10, 5.5, 2.1], zero: false },
  DE: { standard: 19, reduced: [7], zero: true },
  IT: { standard: 22, reduced: [10, 5, 4], zero: false },
  ES: { standard: 21, reduced: [10, 5, 4], zero: false },
  PT: { standard: 23, reduced: [13, 6], zero: false },
  AT: { standard: 20, reduced: [13, 10], zero: false },
  IE: { standard: 23, reduced: [13.5, 9, 4.8], zero: true },
  LU: { standard: 17, reduced: [14, 8, 3], zero: false },
  DK: { standard: 25, reduced: [], zero: true },
  SE: { standard: 25, reduced: [12, 6], zero: false },
  FI: { standard: 25.5, reduced: [14, 10], zero: false },
  PL: { standard: 23, reduced: [8, 5], zero: true },
};

export interface ComputeVatInput {
  sellerCountry: string;
  buyerCountry: string;
  buyerHasVatId: boolean;
  lineRate: number;
}

export interface ComputeVatResult {
  effectiveRate: number;
  reverseCharge: boolean;
  exempt: boolean;
  note: string;
}

export function computeVat({ sellerCountry, buyerCountry, buyerHasVatId, lineRate }: ComputeVatInput): ComputeVatResult {
  if (sellerCountry === buyerCountry) {
    return { effectiveRate: lineRate, reverseCharge: false, exempt: false, note: "" };
  }
  const sellerEu = isEu(sellerCountry);
  const buyerEu = isEu(buyerCountry);
  if (sellerEu && buyerEu && buyerHasVatId) {
    return {
      effectiveRate: 0,
      reverseCharge: true,
      exempt: false,
      note: "Reverse charge — VAT to be accounted for by recipient (Art. 196 EU VAT Directive)",
    };
  }
  if (sellerEu && !buyerEu) {
    return {
      effectiveRate: 0,
      reverseCharge: false,
      exempt: true,
      note: "Export outside EU — zero-rated",
    };
  }
  return { effectiveRate: lineRate, reverseCharge: false, exempt: false, note: "" };
}

export function standardRate(country: string): number | undefined {
  return COUNTRY_VAT[country]?.standard;
}
