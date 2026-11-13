const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function dollars(cents: number | null | undefined): string {
  return usd.format((cents ?? 0) / 100);
}

/** "$1,250.50" or "1250.5" -> 125050. Returns null for blank, throws on garbage. */
export function parseDollars(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = input.replace(/[$,\s]/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`"${input}" is not a valid dollar amount`);
  return Math.round(parseFloat(s) * 100);
}
