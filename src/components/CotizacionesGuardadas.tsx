import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Eye, FileDown, Plus, Search, Pencil, Archive, ArchiveRestore, MoreVertical, ChevronLeft, ChevronRight, X } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { SortableNativeTh } from "@/components/ui/sortable-native-th";
import { cycleSort, compareText, compareNumber, type SortState } from "@/lib/tableSort";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  QUOTATION_EXPORT_HEADERS,
  QUOTATION_DEFAULTS,
} from "@/lib/vendorTemplate";
import { formatRate, roundUpTo3Decimals } from "@/lib/utils";

const RATE_TYPES = ["International", "Origin Based", "Local"];

type CellByType = Record<string, { prefixes: string[]; rate: number; ratePlusExtra: number | null }>;

interface SavedQuotation {
  id: string;
  name: string | null;
  vendor_ids: string[];
  client_id: string | null;
  status: string;
  snapshot: {
    vendors: { id: string; nombre: string }[];
    rateTypes?: string[];
    extra?: { countries: string[]; value: number };
    marginFee?: { value: number; mode: "percentage" | "fixed" };
    psfFee?: { value: number; mode: "percentage" | "fixed" };
    markupFee?: { value: number; mode: "percentage" | "fixed" };
    displayRateTypes?: string[];
    displayColumns?: { vendorId: string; rateType: string }[];
    effectiveDate?: string;
    initialIncrement?: number;
    nextIncrement?: number;
    rows: {
      country: string;
      type?: string;
      lineType?: string;
      byVendor: Record<
        string,
        | { prefixes: string[]; rate: number; ratePlusExtra: number | null }
        | CellByType
      >;
    }[];
  };
  created_at: string;
}

interface Vendor {
  id: string;
  nombre: string;
}

interface Client {
  id: string;
  name: string;
}

export default function CotizacionesGuardadas() {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<SavedQuotation[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameSearch, setNameSearch] = useState("");
  const [filterClientId, setFilterClientId] = useState<string>("__all__");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [viewingQuotation, setViewingQuotation] = useState<SavedQuotation | null>(null);
  const [viewRowsSort, setViewRowsSort] = useState<SortState<"country" | "type">>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [quotListSort, setQuotListSort] = useState<SortState<"name" | "client" | "vendor" | "status" | "created">>(null);

  const fetchData = async () => {
    setLoading(true);
    const [quotationsRes, vendorsRes, clientsRes] = await Promise.all([
      supabase
        .from("saved_quotations")
        .select("id, name, vendor_ids, client_id, status, snapshot, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("vendors").select("id, nombre").order("nombre"),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    if (!quotationsRes.error && quotationsRes.data) setQuotations(quotationsRes.data as SavedQuotation[]);
    if (!vendorsRes.error && vendorsRes.data) setVendors(vendorsRes.data);
    if (!clientsRes.error && clientsRes.data) setClients(clientsRes.data as Client[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredQuotations = useMemo(() => {
    const searchLower = nameSearch.toLowerCase().trim();
    return quotations.filter((q) => {
      if (searchLower && !(q.name ?? "").toLowerCase().includes(searchLower)) return false;
      if (filterClientId !== "__all__" && q.client_id !== filterClientId) return false;
      if (filterStatus !== "all") {
        const s = q.status ?? "active";
        if (filterStatus === "active" && s !== "active") return false;
        if (filterStatus === "archived" && s !== "archived") return false;
      }
      const createdAt = new Date(q.created_at);
      if (filterDateFrom && createdAt < new Date(filterDateFrom + "T00:00:00")) return false;
      if (filterDateTo && createdAt > new Date(filterDateTo + "T23:59:59")) return false;
      return true;
    });
  }, [quotations, nameSearch, filterClientId, filterStatus, filterDateFrom, filterDateTo]);

  const isFiltering = nameSearch.trim() || filterClientId !== "__all__" || filterStatus !== "all" || filterDateFrom || filterDateTo;
  const clearFilters = () => {
    setNameSearch("");
    setFilterClientId("__all__");
    setFilterStatus("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [nameSearch, filterClientId, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => {
    setPage(1);
  }, [quotListSort]);

  useEffect(() => {
    setViewRowsSort(null);
  }, [viewingQuotation?.id]);

  const vendorById = useMemo(() => {
    const m = new Map<string, Vendor>();
    for (const v of vendors) m.set(v.id, v);
    return m;
  }, [vendors]);

  const clientById = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const sortedQuotations = useMemo(() => {
    if (!quotListSort) {
      return [...filteredQuotations].sort((a, b) => {
        const aArchived = (a.status ?? "active") === "archived";
        const bArchived = (b.status ?? "active") === "archived";
        if (aArchived !== bArchived) return aArchived ? 1 : -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    const { key, dir } = quotListSort;
    const m = dir === "asc" ? 1 : -1;
    const vendorLabel = (q: SavedQuotation) =>
      [...q.vendor_ids]
        .map((vid) => vendorById.get(vid)?.nombre ?? "")
        .sort()
        .join(", ");
    return [...filteredQuotations].sort((a, b) => {
      let c = 0;
      if (key === "name") c = compareText(a.name, b.name);
      else if (key === "client")
        c = compareText(
          a.client_id ? (clientById.get(a.client_id)?.name ?? "") : "",
          b.client_id ? (clientById.get(b.client_id)?.name ?? "") : "",
        );
      else if (key === "vendor") c = compareText(vendorLabel(a), vendorLabel(b));
      else if (key === "status") c = compareText(a.status ?? "active", b.status ?? "active");
      else c = compareNumber(new Date(a.created_at).getTime(), new Date(b.created_at).getTime());
      return c * m;
    });
  }, [filteredQuotations, quotListSort, clientById, vendorById]);

  const totalPages = Math.max(1, Math.ceil(sortedQuotations.length / pageSize));
  const paginatedQuotations = useMemo(
    () => sortedQuotations.slice((page - 1) * pageSize, page * pageSize),
    [sortedQuotations, page, pageSize],
  );

  const handleArchive = async (q: SavedQuotation) => {
    const newStatus = (q.status ?? "active") === "archived" ? "active" : "archived";
    const { error } = await supabase.from("saved_quotations").update({ status: newStatus }).eq("id", q.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setQuotations((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: newStatus } : x)));
    toast.success(newStatus === "archived" ? "Archived" : "Restored");
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  };

  const isNewSnapshotFormat = (snap: SavedQuotation["snapshot"]) =>
    Array.isArray(snap.rateTypes) && snap.rateTypes.length > 0;

  const viewDialogSortedRows = useMemo(() => {
    const snap = viewingQuotation?.snapshot;
    if (!snap?.rows?.length) return [];
    const rows = [...snap.rows];
    if (!viewRowsSort) return rows;
    const { key, dir } = viewRowsSort;
    const m = dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (key === "country") return compareText(a.country, b.country) * m;
      const ta = String(a.lineType ?? a.type ?? "");
      const tb = String(b.lineType ?? b.type ?? "");
      return compareText(ta, tb) * m;
    });
  }, [viewingQuotation, viewRowsSort]);

  const EXCEL_CELL_MAX = 32767;
  const truncateForExcel = (s: string) =>
    s.length > EXCEL_CELL_MAX ? s.slice(0, EXCEL_CELL_MAX - 20) + "… (truncated)" : s;

  const getBestVendorForRow = (
    row: { byVendor: Record<string, CellByType | { prefixes?: string[]; rate?: number; ratePlusExtra?: number | null }> },
    vendors: { id: string; nombre: string }[],
    types: string[],
    displayColumns?: { vendorId: string; rateType: string }[]
  ) => {
    const vendorById = Object.fromEntries(vendors.map((v) => [v.id, v]));
    const candidates: { id: string; nombre: string; count: number; minRate: number }[] = [];
    const vendorIdsToCheck = displayColumns
      ? [...new Set(displayColumns.map((c) => c.vendorId))]
      : vendors.map((v) => v.id);
    for (const vid of vendorIdsToCheck) {
      const v = vendorById[vid];
      if (!v) continue;
      const cell = row.byVendor?.[vid];
      if (!cell) continue;
      const hasMultiType = cell && ((cell as CellByType)["International"] !== undefined || (cell as CellByType)["mobile"] !== undefined);
      const rateTypesToUse = displayColumns
        ? displayColumns.filter((c) => c.vendorId === vid).map((c) => c.rateType)
        : hasMultiType
          ? types
          : ["International"];
      if (rateTypesToUse.length === 0) continue;
      const rates = rateTypesToUse
        .map((t) => (hasMultiType ? (cell as CellByType)[t]?.rate : (cell as { rate?: number }).rate))
        .filter((r): r is number => r != null && r >= 0);
      if (rates.length === 0) continue;
      candidates.push({ id: v.id, nombre: v.nombre, count: rates.length, minRate: Math.min(...rates) });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.minRate - b.minRate;
    });
    return candidates[0];
  };

  const handleExportXlsx = (q: SavedQuotation) => {
    const { vendors, rows, rateTypes } = q.snapshot;
    if (!vendors?.length || !rows?.length) return;
    const displayColumns = q.snapshot.displayColumns;
    const displayTypes = displayColumns?.length
      ? [...new Set(displayColumns.map((c) => c.rateType))]
      : q.snapshot.displayRateTypes?.length
        ? q.snapshot.displayRateTypes
        : (rateTypes ?? RATE_TYPES);
    const effectiveDate = q.snapshot.effectiveDate ?? QUOTATION_DEFAULTS.getEffectiveDate();
    const initialIncrement = q.snapshot.initialIncrement ?? QUOTATION_DEFAULTS.initialIncrement;
    const nextIncrement = q.snapshot.nextIncrement ?? QUOTATION_DEFAULTS.nextIncrement;

    const headerRow = [...QUOTATION_EXPORT_HEADERS];
    const dataRows = rows.map((row) => {
      let bestRate: number | null = null;
      let bestRateType: string = "";
      const colsToCheck = displayColumns?.length
        ? displayColumns
        : vendors.flatMap((v) => displayTypes.map((t) => ({ vendorId: v.id, rateType: t })));
      for (const col of colsToCheck) {
        const cell = row.byVendor?.[col.vendorId] as CellByType | undefined;
        const hasMultiType = cell && (cell["International"] !== undefined || cell["mobile"] !== undefined);
        const c = hasMultiType && cell ? cell[col.rateType] : cell ? { rate: (cell as { rate?: number }).rate, ratePlusExtra: (cell as { ratePlusExtra?: number | null }).ratePlusExtra } : undefined;
        const rateVal = c?.ratePlusExtra ?? c?.rate;
        if (typeof rateVal === "number" && rateVal >= 0 && (bestRate == null || rateVal < bestRate)) {
          bestRate = rateVal;
          bestRateType = col.rateType;
        }
      }
      const type = row.lineType ?? row.type ?? "";
      return [
        (row.country ?? "").toUpperCase(),
        type,
        bestRate != null ? roundUpTo3Decimals(bestRate) : "",
        effectiveDate,
        initialIncrement,
        nextIncrement,
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quotation");
    const name = q.name?.replace(/[^\w\s-]/g, "") || "quotation";
    XLSX.writeFile(wb, `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exported as XLSX");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Filter & action bar */}
        <div className="px-6 py-4 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filterClientId} onValueChange={setFilterClientId}>
              <SelectTrigger className="h-9 w-[130px] rounded-lg">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-[115px] rounded-lg">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker
              from={filterDateFrom}
              to={filterDateTo}
              onChange={(from, to) => {
                setFilterDateFrom(from ?? "");
                setFilterDateTo(to ?? "");
              }}
              placeholder="Created"
              className="h-9 rounded-lg"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-48 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search…"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                className="pl-9 h-9 rounded-lg border-border"
              />
            </div>
            {isFiltering && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Clear filters"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
            <Button asChild size="sm" className="h-9 px-4 rounded-lg">
              <Link to="/quotations/create" className="inline-flex items-center gap-2" aria-label="Create quotation">
                <Plus className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <SortableTableHead
                sortKey="name"
                sort={quotListSort}
                onSort={(k) => setQuotListSort((s) => cycleSort(s, k as "name" | "client" | "vendor" | "status" | "created"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Name
              </SortableTableHead>
              <SortableTableHead
                sortKey="client"
                sort={quotListSort}
                onSort={(k) => setQuotListSort((s) => cycleSort(s, k as "name" | "client" | "vendor" | "status" | "created"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Client
              </SortableTableHead>
              <SortableTableHead
                sortKey="vendor"
                sort={quotListSort}
                onSort={(k) => setQuotListSort((s) => cycleSort(s, k as "name" | "client" | "vendor" | "status" | "created"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Vendor
              </SortableTableHead>
              <SortableTableHead
                sortKey="status"
                sort={quotListSort}
                onSort={(k) => setQuotListSort((s) => cycleSort(s, k as "name" | "client" | "vendor" | "status" | "created"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Status
              </SortableTableHead>
              <SortableTableHead
                sortKey="created"
                sort={quotListSort}
                onSort={(k) => setQuotListSort((s) => cycleSort(s, k as "name" | "client" | "vendor" | "status" | "created"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Created
              </SortableTableHead>
              <TableHead className="w-12 text-right bg-muted/50"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground px-6">
                  <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                  Loading…
                </TableCell>
              </TableRow>
            ) : sortedQuotations.length === 0 ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground px-6">
                  {isFiltering ? "No quotations match the filters." : "No saved quotations. Use the + button to add one."}
                </TableCell>
              </TableRow>
            ) : (
              paginatedQuotations.map((q) => (
                <TableRow key={q.id} className="border-b border-border">
                  <TableCell className="font-medium px-6 py-4">
                    {q.name ?? <span className="italic text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm px-6 py-4">
                    {q.client_id ? (clientById.get(q.client_id)?.name ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {q.vendor_ids.map((vid) => (
                        <Badge key={vid} variant="secondary" className="text-xs font-normal">
                          {vendorById.get(vid)?.nombre ?? vid.slice(0, 8)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <Badge variant={(q.status ?? "active") === "archived" ? "outline" : "secondary"} className="text-xs">
                      {(q.status ?? "active") === "archived" ? "Archived" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm px-6 py-4">
                    {formatDate(q.created_at)}
                  </TableCell>
                  <TableCell className="text-right px-6 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Actions">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewingQuotation(q)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/quotations/${q.id}/edit`)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportXlsx(q)}>
                          <FileDown className="w-4 h-4 mr-2" />
                          Download XLSX
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleArchive(q)}>
                          {(q.status ?? "active") === "archived" ? (
                            <ArchiveRestore className="w-4 h-4 mr-2" />
                          ) : (
                            <Archive className="w-4 h-4 mr-2" />
                          )}
                          {(q.status ?? "active") === "archived" ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {sortedQuotations.length > 0 && (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
            <span>{Math.min(page * pageSize, sortedQuotations.length) - (page - 1) * pageSize} of {sortedQuotations.length} items</span>
            <div className="flex items-center gap-2">
            <span className="min-w-[4rem] text-center">{page} / {totalPages}</span>
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

      <Dialog open={viewingQuotation !== null} onOpenChange={(open) => !open && setViewingQuotation(null)}>
        <DialogContent className="max-w-[90vw] max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-row items-center justify-between gap-4">
            <DialogTitle>
              {viewingQuotation?.name ?? "Quotation"} — {viewingQuotation && formatDate(viewingQuotation.created_at)}
            </DialogTitle>
            {viewingQuotation?.snapshot?.vendors?.length && viewingQuotation.snapshot?.rows?.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportXlsx(viewingQuotation)}
              >
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                Export XLSX
              </Button>
            )}
          </DialogHeader>
          <div className="overflow-auto flex-1 min-h-0 -mx-6 px-6">
            {viewingQuotation?.snapshot?.vendors && viewingQuotation.snapshot.rows && (
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="border-b border-border">
                    <SortableNativeTh
                      rowSpan={viewingQuotation.snapshot.displayColumns?.length ? 2 : 1}
                      sortKey="country"
                      sort={viewRowsSort}
                      onSort={(k) => setViewRowsSort((s) => cycleSort(s, k as "country" | "type"))}
                      className="text-left px-4 py-2 text-xs font-semibold"
                    >
                      Country
                    </SortableNativeTh>
                    {(!isNewSnapshotFormat(viewingQuotation.snapshot) || viewingQuotation.snapshot.rows.some((r) => r.lineType != null)) && (
                      <SortableNativeTh
                        rowSpan={viewingQuotation.snapshot.displayColumns?.length ? 2 : 1}
                        sortKey="type"
                        sort={viewRowsSort}
                        onSort={(k) => setViewRowsSort((s) => cycleSort(s, k as "country" | "type"))}
                        className="text-left px-4 py-2 text-xs font-semibold"
                      >
                        Type
                      </SortableNativeTh>
                    )}
                    {viewingQuotation.snapshot.displayColumns?.length ? (
                      (() => {
                        const cols = viewingQuotation.snapshot.displayColumns!;
                        const grouped = new Map<string, { vendor: { id: string; nombre: string }; rateTypes: string[] }>();
                        for (const col of cols) {
                          const v = viewingQuotation.snapshot.vendors.find((x) => x.id === col.vendorId);
                          const existing = grouped.get(col.vendorId);
                          if (existing) {
                            if (!existing.rateTypes.includes(col.rateType)) existing.rateTypes.push(col.rateType);
                          } else {
                            grouped.set(col.vendorId, {
                              vendor: v ?? { id: col.vendorId, nombre: col.vendorId },
                              rateTypes: [col.rateType],
                            });
                          }
                        }
                        const groups = Array.from(grouped.values());
                        return (
                          <>
                            {groups.map((g) => (
                              <th
                                key={g.vendor.id}
                                colSpan={g.rateTypes.length}
                                className="text-center px-4 py-2 text-xs font-semibold border-l border-border"
                              >
                                {g.vendor.nombre}
                              </th>
                            ))}
                          </>
                        );
                      })()
                    ) : viewingQuotation.snapshot.displayRateTypes?.length ? (
                      viewingQuotation.snapshot.vendors.flatMap((v) =>
                        viewingQuotation.snapshot.displayRateTypes!.map((t) => (
                          <th key={`${v.id}-${t}`} className="text-left px-4 py-2 text-xs font-semibold border-l border-border">
                            {v.nombre} - {t}
                          </th>
                        ))
                      )
                    ) : (
                      viewingQuotation.snapshot.vendors.map((v) => {
                        const useNew = isNewSnapshotFormat(viewingQuotation.snapshot);
                        const types = useNew ? (viewingQuotation.snapshot.rateTypes ?? RATE_TYPES) : null;
                        const colCount = useNew && types ? 1 + types.length : 3;
                        return (
                          <th key={v.id} colSpan={colCount} className="text-center px-4 py-2 text-xs font-semibold border-l border-border">
                            {v.nombre}
                          </th>
                        );
                      })
                    )}
                  </tr>
                  {viewingQuotation.snapshot.displayColumns?.length ? (
                    <tr className="border-b border-border">
                      {((): React.ReactNode => {
                        const cols = viewingQuotation.snapshot.displayColumns!;
                        const grouped = new Map<string, { vendor: { id: string; nombre: string }; rateTypes: string[] }>();
                        for (const col of cols) {
                          const v = viewingQuotation.snapshot.vendors.find((x) => x.id === col.vendorId);
                          const existing = grouped.get(col.vendorId);
                          if (existing) {
                            if (!existing.rateTypes.includes(col.rateType)) existing.rateTypes.push(col.rateType);
                          } else {
                            grouped.set(col.vendorId, {
                              vendor: v ?? { id: col.vendorId, nombre: col.vendorId },
                              rateTypes: [col.rateType],
                            });
                          }
                        }
                        return Array.from(grouped.values()).flatMap((g) =>
                          g.rateTypes.map((t) => (
                            <th
                              key={`${g.vendor.id}-${t}`}
                              className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground border-l border-border"
                            >
                              {t}
                            </th>
                          ))
                        );
                      })()}
                    </tr>
                  ) : !viewingQuotation.snapshot.displayRateTypes?.length && (
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground"> </th>
                      {(!isNewSnapshotFormat(viewingQuotation.snapshot) || viewingQuotation.snapshot.rows.some((r) => r.lineType != null)) && (
                        <th className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground"> </th>
                      )}
                      {viewingQuotation.snapshot.vendors.flatMap((v) => {
                        const useNew = isNewSnapshotFormat(viewingQuotation.snapshot);
                        const types = useNew ? (viewingQuotation.snapshot.rateTypes ?? RATE_TYPES) : null;
                        if (useNew && types) {
                          return [
                            <th key={`${v.id}-p`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground border-l border-border">prefix</th>,
                            ...types.map((t) => (
                              <th key={`${v.id}-${t}`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground">{t}</th>
                            )),
                          ];
                        }
                        return [
                          <th key={`${v.id}-p`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground border-l border-border">prefix</th>,
                          <th key={`${v.id}-r`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground">rate</th>,
                          <th key={`${v.id}-e`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground">rate+extra</th>,
                        ];
                      })}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {viewDialogSortedRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">{row.country}</td>
                      {(!isNewSnapshotFormat(viewingQuotation.snapshot) || viewingQuotation.snapshot.rows.some((r) => r.lineType != null)) && (
                        <td className="px-4 py-2">{row.lineType ?? row.type ?? "—"}</td>
                      )}
                      {viewingQuotation.snapshot.displayColumns?.length ? (
                        viewingQuotation.snapshot.displayColumns!.map((col) => {
                          const cell = row.byVendor[col.vendorId] as CellByType | undefined;
                          const c = cell?.[col.rateType];
                          const display = c?.rate ?? "";
                          return (
                            <td key={`${col.vendorId}-${col.rateType}`} className="px-4 py-2 border-l border-border font-mono text-xs">
                              {typeof display === "number" ? formatRate(display) : "—"}
                            </td>
                          );
                        })
                      ) : viewingQuotation.snapshot.displayRateTypes?.length ? (
                        viewingQuotation.snapshot.vendors.flatMap((v) => {
                          const cell = row.byVendor[v.id] as CellByType | undefined;
                          return viewingQuotation.snapshot.displayRateTypes!.map((t) => {
                            const c = cell?.[t];
                            const display = c?.rate ?? "";
                            return (
                              <td key={`${v.id}-${t}`} className="px-4 py-2 border-l border-border font-mono text-xs">
                                {typeof display === "number" ? formatRate(display) : "—"}
                              </td>
                            );
                          });
                        })
                      ) : (
                        viewingQuotation.snapshot.vendors.map((v) => {
                        const cell = row.byVendor[v.id];
                        const useNew = isNewSnapshotFormat(viewingQuotation.snapshot) && cell && ((cell as CellByType)["International"] !== undefined || (cell as CellByType)["mobile"] !== undefined);
                        if (useNew && cell) {
                          const byType = cell as CellByType;
                          const types = viewingQuotation.snapshot.rateTypes ?? RATE_TYPES;
                          const allPrefixes = types.flatMap((t) => (byType[t]?.prefixes ?? []));
                          const uniquePrefixes = [...new Set(allPrefixes)];
                          const prefixDisplay =
                            uniquePrefixes.length <= 3
                              ? uniquePrefixes.join(", ")
                              : uniquePrefixes.slice(0, 3).join(", ") + ` (+${uniquePrefixes.length - 3} prefixes)`;
                          return (
                            <React.Fragment key={v.id}>
                              <td className="px-4 py-2 border-l border-border font-mono text-xs">
                                {uniquePrefixes.length ? (
                                  uniquePrefixes.length > 3 ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-help underline decoration-dotted">{prefixDisplay}</span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <ul className="max-h-48 overflow-y-auto list-disc list-inside text-left space-y-0.5 font-mono text-xs">
                                          {[...uniquePrefixes].sort().map((p, i) => (
                                            <li key={i}>{p}</li>
                                          ))}
                                        </ul>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    prefixDisplay
                                  )
                                ) : (
                                  "—"
                                )}
                              </td>
                              {types.map((t) => {
                                const c = byType[t];
                                const display = c?.ratePlusExtra ?? c?.rate;
                                return (
                                  <td key={t} className="px-4 py-2 font-mono">
                                    {display != null ? formatRate(display) : "—"}
                                  </td>
                                );
                              })}
                            </React.Fragment>
                          );
                        }
                        const c = cell as { prefixes?: string[]; rate?: number; ratePlusExtra?: number | null } | undefined;
                        const legacyPrefixes = c?.prefixes ?? [];
                        const legacyUnique = [...new Set(legacyPrefixes)];
                        const legacyDisplay =
                          legacyUnique.length <= 3
                            ? legacyUnique.join(", ")
                            : legacyUnique.slice(0, 3).join(", ") + ` (+${legacyUnique.length - 3} prefixes)`;
                        return (
                          <React.Fragment key={v.id}>
                            <td className="px-4 py-2 border-l border-border font-mono text-xs">
                              {legacyUnique.length ? (
                                legacyUnique.length > 3 ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help underline decoration-dotted">{legacyDisplay}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <ul className="max-h-48 overflow-y-auto list-disc list-inside text-left space-y-0.5 font-mono text-xs">
                                        {[...legacyUnique].sort().map((p, i) => (
                                          <li key={i}>{p}</li>
                                        ))}
                                      </ul>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  legacyDisplay
                                )
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-2 font-mono">
                              {c?.rate != null ? formatRate(c.rate) : "—"}
                            </td>
                            <td className="px-4 py-2 font-mono">
                              {c?.ratePlusExtra != null ? formatRate(c.ratePlusExtra) : "—"}
                            </td>
                          </React.Fragment>
                        );
                      })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {viewingQuotation && (!viewingQuotation.snapshot?.vendors || !viewingQuotation.snapshot?.rows) && (
              <p className="text-sm text-muted-foreground py-4">Invalid quotation data.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
