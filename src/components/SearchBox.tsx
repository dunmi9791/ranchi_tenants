import Link from "next/link";

/**
 * GET search form for the admin lists. Works without JavaScript; other filters in
 * `keep` are carried along as hidden fields so searching doesn't reset them.
 */
export function SearchBox({
  action,
  q,
  placeholder,
  keep = {},
}: {
  action: string;
  q: string | null;
  placeholder: string;
  keep?: Record<string, string | null | undefined>;
}) {
  const kept = Object.entries(keep).filter((e): e is [string, string] => !!e[1]);
  const clearHref = kept.length ? `${action}?${new URLSearchParams(kept)}` : action;
  return (
    <form action={action} method="get" role="search" className="flex flex-wrap items-center gap-2">
      {kept.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        type="search"
        name="q"
        defaultValue={q ?? ""}
        placeholder={placeholder}
        aria-label="Search"
        className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
      />
      <button type="submit" className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
        Search
      </button>
      {q && (
        <Link href={clearHref} className="text-sm text-emerald-700 underline">
          Clear
        </Link>
      )}
    </form>
  );
}
