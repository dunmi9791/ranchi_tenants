/** Strip spaces, dashes, dots and brackets; keep an optional leading +. Null if it can't be a phone number. */
export function cleanPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().replace(/[\s\-().]/g, "");
  return /^\+?\d{7,15}$/.test(s) ? s : null;
}

/**
 * International digits without "+" (e.g. 2348012345678), which is what most gateways want.
 * Local numbers starting with 0 get the country code; "+234…" and "00234…" are kept.
 */
export function normalizePhone(input: string | null | undefined, countryCode = "234"): string | null {
  const s = cleanPhone(input);
  if (!s) return null;
  if (s.startsWith("+")) return s.slice(1);
  if (s.startsWith("00")) return s.slice(2);
  if (s.startsWith("0")) return countryCode.replace(/\D/g, "") + s.slice(1);
  return s;
}

/** Split a comma / semicolon / newline separated list, dropping blanks. */
export function splitList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}
