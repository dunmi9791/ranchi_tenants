/** Free-text search for the admin lists (`?q=`). */

type Contains = { contains: string; mode: "insensitive" };

/** The trimmed search text from a search param, or null when blank. */
export function searchText(v: string | string[] | undefined): string | null {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 100) : null;
}

/**
 * Prisma where-clause: every word must match at least one of the fields, so
 * "ada flat 3" finds Ada's lease on Flat 3. `fields` builds the OR list for one word.
 */
export function wordsWhere<W>(q: string | null, fields: (c: Contains) => W[]): { AND?: { OR: W[] }[] } {
  if (!q) return {};
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  return { AND: words.map((w) => ({ OR: fields({ contains: w, mode: "insensitive" }) })) };
}
