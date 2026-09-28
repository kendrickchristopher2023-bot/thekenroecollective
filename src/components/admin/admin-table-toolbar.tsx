/**
 * Shared toolbar + pagination bar for the owner/admin console tables.
 *
 * One component so Events, Projects, Users, Feedback and Issues all get the
 * same search box, filter chips, sort control, page size, result count and
 * filter-aware CSV export button.
 */
import { useEffect, useState, type ReactNode } from "react";
import { pageLabel, type PageMath } from "@/lib/admin-table";

export type ChipGroup<V extends string = string> = {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
};

export type SortControl<V extends string = string> = {
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
};

function DebouncedInput({
  value,
  onChange,
  placeholder,
  className,
  delay = 300,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  delay?: number;
  ariaLabel: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, delay]);
  return (
    <input
      value={local}
      aria-label={ariaLabel}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      className={className ?? "w-full rounded-md border px-3 py-2 text-sm sm:w-64"}
    />
  );
}

export function AdminTableToolbar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  secondarySearch,
  chips = [],
  sort,
  pageSize,
  onPageSize,
  onExport,
  exportLabel = "Export CSV",
  exportDisabled,
  extra,
  busy,
  onRefresh,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  secondarySearch?: { value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string };
  chips?: ChipGroup<any>[];
  sort?: SortControl<any>;
  pageSize?: number;
  onPageSize?: (n: number) => void;
  onExport?: () => void;
  exportLabel?: string;
  exportDisabled?: boolean;
  extra?: ReactNode;
  busy?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-white/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <DebouncedInput
          value={search}
          onChange={onSearch}
          placeholder={searchPlaceholder}
          ariaLabel="Search"
        />
        {secondarySearch && (
          <DebouncedInput
            value={secondarySearch.value}
            onChange={secondarySearch.onChange}
            placeholder={secondarySearch.placeholder}
            ariaLabel={secondarySearch.ariaLabel}
          />
        )}
        {sort && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Sort
            <select
              aria-label="Sort"
              value={sort.value}
              onChange={(e) => sort.onChange(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
            >
              {sort.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {typeof pageSize === "number" && onPageSize && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Per page
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="rounded-md border px-2 py-1.5 text-sm"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {busy ? "Loading…" : "Refresh"}
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              disabled={exportDisabled}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              title="Exports exactly the rows matching the current filters"
            >
              {exportLabel}
            </button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {chips.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
              {group.options.map((o) => {
                const active = o.value === group.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => group.onChange(o.value)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      active
                        ? "bg-velvet text-white"
                        : "border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {extra}
    </div>
  );
}

export function AdminPaginationBar({
  math,
  noun = "rows",
  onPrev,
  onNext,
  busy,
  note,
}: {
  math: PageMath;
  noun?: string;
  onPrev: () => void;
  onNext: () => void;
  busy?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {pageLabel(math, noun)}
        {math.total > 0 ? ` · page ${math.page} of ${math.pageCount}` : ""}
      </span>
      <span className="flex items-center gap-2">
        {note}
        <button
          type="button"
          onClick={onPrev}
          disabled={!math.canPrev || busy}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!math.canNext || busy}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </span>
    </div>
  );
}
