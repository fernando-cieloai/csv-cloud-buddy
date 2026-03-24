import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortState } from "@/lib/tableSort";

type SortableNativeThProps = {
  children: React.ReactNode;
  sortKey: string;
  sort: SortState<string>;
  onSort: (key: string) => void;
  className?: string;
  scope?: React.ThHTMLAttributes<HTMLTableCellElement>["scope"];
  rowSpan?: number;
  colSpan?: number;
  align?: "left" | "right" | "center";
};

export function SortableNativeTh({
  children,
  sortKey,
  sort,
  onSort,
  className,
  scope = "col",
  rowSpan,
  colSpan,
  align = "left",
}: SortableNativeThProps) {
  const active = sort?.key === sortKey;
  const dir = active ? sort.dir : null;

  return (
    <th
      scope={scope}
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={cn(className, align === "right" && "text-right")}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1.5 w-full font-semibold text-muted-foreground hover:text-foreground transition-colors select-none",
          align === "center" && "justify-center",
          align === "right" && "flex-row-reverse justify-end",
        )}
      >
        <span>{children}</span>
        {active && dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />
        ) : active && dir === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}
