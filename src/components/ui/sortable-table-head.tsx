import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";
import type { SortState } from "@/lib/tableSort";

type SortableTableHeadProps = {
  children: React.ReactNode;
  sortKey: string;
  sort: SortState<string>;
  onSort: (key: string) => void;
  className?: string;
  /** Use for numeric / right-aligned / centered columns */
  align?: "left" | "right" | "center";
};

export function SortableTableHead({
  children,
  sortKey,
  sort,
  onSort,
  className,
  align = "left",
}: SortableTableHeadProps) {
  const active = sort?.key === sortKey;
  const dir = active ? sort!.dir : null;

  return (
    <TableHead
      className={cn(
        className,
        align === "right" && "text-right [&>button]:ml-auto [&>button]:flex-row-reverse",
        align === "center" && "text-center [&>button]:mx-auto",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1.5 -mx-1 px-1 py-0.5 rounded-md font-medium text-muted-foreground hover:text-foreground transition-colors select-none",
          align === "right" && "flex-row-reverse",
          align === "center" && "justify-center",
        )}
        aria-sort={
          active ? (dir === "asc" ? "ascending" : "descending") : "none"
        }
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
    </TableHead>
  );
}
