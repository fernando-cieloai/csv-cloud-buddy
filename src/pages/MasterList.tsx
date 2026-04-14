import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { cycleSort, type SortState } from "@/lib/tableSort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Plus, Upload, MoreVertical, ChevronLeft, ChevronRight, Eye, Trash2 } from "lucide-react";
import CountriesFileUploader from "@/components/CountriesFileUploader";

type MasterListRow = {
  id: string;
  country_name: string;
  region: string;
  region_code: string;
  effective_date: string | null;
  valid_to: string | null;
  date_added: string | null;
};

const PAGE_SIZE = 20;

const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

/** Avoid breaking PostgREST `.or()` (commas/parens are reserved). */
function sanitizeSearchTerm(raw: string): string {
  return raw.trim().slice(0, 200).replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
}

function isMissingMasterListViewError(err: { message?: string; code?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("master_list_flat") || m.includes("does not exist") || m.includes("schema cache") || err?.code === "42P01";
}

type MasterSortKeyInner = "country_name" | "region" | "region_code" | "effective_date" | "valid_to" | "date_added";

function applyMasterListSort<T extends { order: (...args: unknown[]) => T }>(
  query: T,
  rowSort: SortState<MasterSortKeyInner> | null,
  countrySortMode: "column" | "fallback_region",
): T {
  if (!rowSort) {
    return query.order("region", { ascending: true }).order("region_code", { ascending: true }) as T;
  }
  const { key, dir } = rowSort;
  const asc = dir === "asc";
  if (key === "country_name") {
    if (countrySortMode === "column") {
      return query
        .order("country_name", { ascending: asc, nullsFirst: true })
        .order("region", { ascending: true })
        .order("region_code", { ascending: true }) as T;
    }
    return query.order("region", { ascending: true }).order("region_code", { ascending: true }) as T;
  }
  if (key === "region") {
    return query.order("region", { ascending: asc }).order("region_code", { ascending: true }) as T;
  }
  if (key === "region_code") {
    return query.order("region_code", { ascending: asc }).order("region", { ascending: true }) as T;
  }
  if (key === "effective_date" || key === "valid_to" || key === "date_added") {
    return query.order(key, { ascending: asc, nullsFirst: false }).order("region", { ascending: true }) as T;
  }
  return query as T;
}

const MasterList = () => {
  const [rows, setRows] = useState<MasterListRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [listRefreshNonce, setListRefreshNonce] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<MasterListRow | null>(null);
  const [rowSort, setRowSort] = useState<SortState<MasterSortKeyInner>>(null);
  const fetchSeq = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [rowSort]);

  useEffect(() => {
    const seq = ++fetchSeq.current;

    (async () => {
      setLoading(true);
      setLoadError(null);
      const term = sanitizeSearchTerm(debouncedSearch);
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      try {
        let query = supabase
          .from("master_list_flat")
          .select("id, region, region_code, effective_date, valid_to, date_added, country_name", {
            count: "exact",
          });

        if (term) {
          const p = `%${term}%`;
          query = query.or(`region.ilike.${p},region_code.ilike.${p},country_name.ilike.${p}`);
        }

        query = applyMasterListSort(query, rowSort, "column");

        let { data, error, count } = await query.range(from, to);

        if (error && isMissingMasterListViewError(error)) {
          let legacy = supabase
            .from("country_regions")
            .select("id, region, region_code, effective_date, valid_to, date_added, countries(nombre)", {
              count: "exact",
            });

          if (term) {
            const p = `%${term}%`;
            let countryIds: string[] = [];
            const { data: countries } = await supabase
              .from("countries")
              .select("id")
              .ilike("nombre", `%${term}%`)
              .limit(200);
            countryIds = (countries ?? []).map((c) => c.id);
            const parts = [`region.ilike.${p}`, `region_code.ilike.${p}`];
            if (countryIds.length > 0) {
              parts.push(`country_id.in.(${countryIds.join(",")})`);
            }
            legacy = legacy.or(parts.join(","));
          }

          legacy = applyMasterListSort(legacy, rowSort, "fallback_region");
          const res2 = await legacy.range(from, to);
          data = res2.data;
          error = res2.error;
          count = res2.count;
          if (!error) {
            data = (data ?? []).map((r) => ({
              ...r,
              country_name: (r.countries as { nombre: string } | null)?.nombre ?? null,
            }));
          }
        }

        if (seq !== fetchSeq.current) return;

        if (error) {
          console.error(error);
          setLoadError(error.message);
          setRows([]);
          setTotalCount(0);
        } else {
          setTotalCount(count ?? 0);
          setRows(
            (data ?? []).map((r) => ({
              id: r.id,
              country_name: (r as { country_name?: string | null }).country_name ?? "",
              region: r.region,
              region_code: r.region_code,
              effective_date: r.effective_date,
              valid_to: r.valid_to,
              date_added: r.date_added,
            }))
          );
        }
      } catch (e) {
        if (seq === fetchSeq.current) {
          console.error(e);
          setLoadError(e instanceof Error ? e.message : "Failed to load master list.");
          setRows([]);
          setTotalCount(0);
        }
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    })();
  }, [page, debouncedSearch, rowSort, listRefreshNonce]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleDelete = async (row: MasterListRow) => {
    if (!window.confirm(`Delete "${row.region}" (${row.region_code})?`)) return;
    const { error } = await supabase.from("country_regions").delete().eq("id", row.id);
    if (error) alert(`Error: ${error.message}`);
    else setListRefreshNonce((n) => n + 1);
  };

  const openView = (row: MasterListRow) => setSelectedRow(row);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search country, region, code…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 max-w-xs"
            />
          </div>
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 px-4 rounded-lg" onClick={() => setIsImportDialogOpen(true)} aria-label="Import from file">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Import Master List
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                CSV or XLSX: either <span className="font-mono">Country, Region, RegionCode</span> or two columns{" "}
                <span className="font-mono">Region, Prefix</span> (no Country column). Labels like{" "}
                <span className="font-mono">NAME-CELLULAR</span> map to country <span className="font-mono">NAME</span>.
                Optional: EffectiveDate, ValidTo, DateAdded.
              </p>
              <CountriesFileUploader
                onSuccess={() => {
                  setPage(1);
                  setListRefreshNonce((n) => n + 1);
                  setIsImportDialogOpen(false);
                }}
                compact
              />
            </DialogContent>
          </Dialog>
        </div>

        {loadError && (
          <div className="mx-6 mt-4 mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <strong className="font-semibold">Could not load Master List.</strong>{" "}
            <span className="opacity-90">{loadError}</span>
            {(loadError.toLowerCase().includes("master_list_flat") || loadError.includes("does not exist")) && (
              <span className="block mt-2 text-xs opacity-80">
                Apply pending Supabase migrations so the view <code className="font-mono">master_list_flat</code> exists
                (e.g. <code className="font-mono">supabase db push</code>).
              </span>
            )}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <SortableTableHead
                sortKey="country_name"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKeyInner))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Country
              </SortableTableHead>
              <SortableTableHead
                sortKey="region"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKeyInner))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Region
              </SortableTableHead>
              <SortableTableHead
                sortKey="region_code"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKeyInner))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                RegionCode
              </SortableTableHead>
              <SortableTableHead
                sortKey="effective_date"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKeyInner))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                EffectiveDate
              </SortableTableHead>
              <SortableTableHead
                sortKey="valid_to"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKeyInner))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                ValidTo
              </SortableTableHead>
              <SortableTableHead
                sortKey="date_added"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKeyInner))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                DateAdded
              </SortableTableHead>
              <TableHead className="w-12 text-right bg-muted/50"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground px-6">
                  <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                  Loading…
                </TableCell>
              </TableRow>
            ) : !loadError && totalCount === 0 ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground px-6">
                  {debouncedSearch
                    ? "No matching records. Try a different search."
                    : "No records yet. Use the + button to import a file."}
                </TableCell>
              </TableRow>
            ) : loadError ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground px-6">
                  Fix the error above, then refresh the page.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="border-b border-border">
                  <TableCell className="font-medium px-6 py-4">{row.country_name}</TableCell>
                  <TableCell className="px-6 py-4">{row.region}</TableCell>
                  <TableCell className="font-mono px-6 py-4">{row.region_code}</TableCell>
                  <TableCell className="px-6 py-4 text-muted-foreground">{formatDate(row.effective_date)}</TableCell>
                  <TableCell className="px-6 py-4 text-muted-foreground">{formatDate(row.valid_to)}</TableCell>
                  <TableCell className="px-6 py-4 text-muted-foreground">{formatDate(row.date_added)}</TableCell>
                  <TableCell className="text-right px-6 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Actions">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openView(row)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(row)} className="text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalCount > 0 && (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <span className="min-w-[4rem] text-center">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record details</DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Country</span>
                <span className="font-medium">{selectedRow.country_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Region</span>
                <span>{selectedRow.region}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">RegionCode</span>
                <span className="font-mono">{selectedRow.region_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">EffectiveDate</span>
                <span>{formatDate(selectedRow.effective_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ValidTo</span>
                <span>{formatDate(selectedRow.valid_to)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DateAdded</span>
                <span>{formatDate(selectedRow.date_added)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MasterList;
