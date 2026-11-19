import type { ReactNode } from "react";

/** Horizontal bars, one row each: label, bar, value. Hover a row for its details. */
export function BarList({
  rows,
  empty = "Nothing in these dates.",
}: {
  rows: { key: string; label: ReactNode; value: number; display: ReactNode; sub?: ReactNode; title?: string; tone?: "gold" | "maroon" | "red" }[];
  empty?: string;
}) {
  const top = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} title={r.title} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 rounded-full bg-cream">
            <span
              className={`block h-2.5 rounded-full ${r.tone === "maroon" ? "bg-maroon" : r.tone === "red" ? "bg-red-600" : "bg-gold"}`}
              style={{ width: `${Math.max(r.value ? 2 : 0, (Math.abs(r.value) / top) * 100)}%` }}
            />
          </span>
          <span className="whitespace-nowrap text-right font-medium">
            {r.display}
            {r.sub && <span className="block text-[10px] font-normal text-muted">{r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Vertical bars over time (or over hours / weekdays). Hover a bar for its value. */
export function Columns({
  points,
  height = 160,
  labelEvery = 1,
}: {
  points: { key: string; label: string; value: number; title: string; muted?: boolean }[];
  height?: number;
  labelEvery?: number;
}) {
  const top = Math.max(1, ...points.map((p) => p.value));
  if (!points.length) return <p className="text-sm text-muted">Nothing in these dates.</p>;
  return (
    <div>
      <div className="flex items-end gap-[2px] border-b border-stone-300" style={{ height }}>
        {points.map((p) => (
          <div key={p.key} title={p.title} className="group flex h-full min-w-0 flex-1 items-end">
            <div
              className={`w-full rounded-t-[4px] ${p.muted ? "bg-stone-300" : "bg-gold"} group-hover:bg-maroon`}
              style={{ height: `${p.value > 0 ? Math.max(2, (p.value / top) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted">
        {points.map((p, i) => (
          <span key={p.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
            {i % labelEvery === 0 ? p.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "▲ 12% vs previous" in green, or "▼ 8%" in red. */
export function Change({ now, before, label = "vs previous period" }: { now: number; before: number; label?: string }) {
  if (!before) return now ? <span>new · {label}</span> : null;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  return (
    <span className={pct >= 0 ? "text-green-700" : "text-red-700"}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% <span className="text-muted">{label}</span>
    </span>
  );
}
