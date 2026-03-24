import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { cycleSort, compareText, compareNumber, type SortState } from "@/lib/tableSort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Plus, Upload, MoreVertical, ChevronLeft, ChevronRight, Eye, Pencil, Trash2 } from "lucide-react";
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

/** PostgREST/Supabase returns at most this many rows per request unless paginated. */
const FETCH_CHUNK = 1000;

const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

const MasterList = () => {
  const [rows, setRows] = useState<MasterListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<MasterListRow | null>(null);
  type MasterSortKey = "country_name" | "region" | "region_code" | "effective_date" | "valid_to" | "date_added";
  const [rowSort, setRowSort] = useState<SortState<MasterSortKey>>(null);

  const fetchData = async () => {
    setLoading(true);
    const accumulated: {
      id: string;
      region: string;
      region_code: string;
      effective_date: string | null;
      valid_to: string | null;
      date_added: string | null;
      countries: { nombre: string } | null;
    }[] = [];

    let from = 0;
    let fetchError: Error | null = null;

    while (true) {
      const { data, error } = await supabase
        .from("country_regions")
        .select("id, region, region_code, effective_date, valid_to, date_added, countries(nombre)")
        .order("region")
        .order("region_code")
        .range(from, from + FETCH_CHUNK - 1);

      if (error) {
        fetchError = new Error(error.message);
        break;
      }
      const batch = data ?? [];
      accumulated.push(...batch);
      if (batch.length < FETCH_CHUNK) break;
      from += FETCH_CHUNK;
    }

    if (fetchError) {
      setRows([]);
    } else {
      setRows(
        accumulated.map((r) => ({
          id: r.id,
          country_name: (r.countries as { nombre: string } | null)?.nombre ?? "",
          region: r.region,
          region_code: r.region_code,
          effective_date: r.effective_date,
          valid_to: r.valid_to,
          date_added: r.date_added,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.country_name.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q) ||
        r.region_code.toLowerCase().includes(q)
    );
  }, [rows, search]);

  useEffect(() => {
    setPage(1);
  }, [rowSort]);

  const sortedFilteredRows = useMemo(() => {
    if (!rowSort) return filteredRows;
    const { key, dir } = rowSort;
    const m = dir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      if (key === "effective_date" || key === "valid_to" || key === "date_added") {
        const ta = a[key] ? new Date(a[key]!).getTime() : null;
        const tb = b[key] ? new Date(b[key]!).getTime() : null;
        return compareNumber(ta, tb) * m;
      }
      const ta = String(a[key] ?? "");
      const tb = String(b[key] ?? "");
      return compareText(ta, tb) * m;
    });
  }, [filteredRows, rowSort]);

  const totalPages = Math.max(1, Math.ceil(sortedFilteredRows.length / PAGE_SIZE));
  const paginatedRows = sortedFilteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (row: MasterListRow) => {
    if (!window.confirm(`Delete "${row.region}" (${row.region_code})?`)) return;
    const { error } = await supabase.from("country_regions").delete().eq("id", row.id);
    if (error) alert(`Error: ${error.message}`);
    else setRows((prev) => prev.filter((r) => r.id !== row.id));
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
                Upload a CSV or XLSX with columns: Country, Region, RegionCode. Optional: EffectiveDate, ValidTo, DateAdded.
              </p>
              <CountriesFileUploader
                onSuccess={() => {
                  fetchData();
                  setIsImportDialogOpen(false);
                }}
                compact
              />
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <SortableTableHead
                sortKey="country_name"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKey))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Country
              </SortableTableHead>
              <SortableTableHead
                sortKey="region"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKey))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Region
              </SortableTableHead>
              <SortableTableHead
                sortKey="region_code"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKey))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                RegionCode
              </SortableTableHead>
              <SortableTableHead
                sortKey="effective_date"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKey))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                EffectiveDate
              </SortableTableHead>
              <SortableTableHead
                sortKey="valid_to"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKey))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                ValidTo
              </SortableTableHead>
              <SortableTableHead
                sortKey="date_added"
                sort={rowSort}
                onSort={(k) => setRowSort((s) => cycleSort(s, k as MasterSortKey))}
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
            ) : sortedFilteredRows.length === 0 ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground px-6">
                  No records yet. Use the + button to import a file.
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row) => (
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

        {sortedFilteredRows.length > 0 && (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
            <span>
              {Math.min(page * PAGE_SIZE, sortedFilteredRows.length) - (page - 1) * PAGE_SIZE} of {sortedFilteredRows.length} items
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
