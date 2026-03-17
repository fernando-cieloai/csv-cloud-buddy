import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Eye, FileDown, Plus, Search, Pencil, Archive, ArchiveRestore } from "lucide-react";
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
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

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
    const filtered = quotations.filter((q) => {
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
    return [...filtered].sort((a, b) => {
      const aArchived = (a.status ?? "active") === "archived";
      const bArchived = (b.status ?? "active") === "archived";
      if (aArchived !== bArchived) return aArchived ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [quotations, nameSearch, filterClientId, filterStatus, filterDateFrom, filterDateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredQuotations.length / pageSize));
  const paginatedQuotations = useMemo(
    () => filteredQuotations.slice((page - 1) * pageSize, page * pageSize),
    [filteredQuotations, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [nameSearch, filterClientId, filterStatus, filterDateFrom, filterDateTo]);

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

  const EXCEL_CELL_MAX = 32767;
  const truncateForExcel = (s: string) =>
    s.length > EXCEL_CELL_MAX ? s.slice(0, EXCEL_CELL_MAX - 20) + "… (truncated)" : s;

  const handleExportXlsx = (q: SavedQuotation) => {
    const { vendors, rows, rateTypes } = q.snapshot;
    if (!vendors?.length || !rows?.length) return;
    const useNewFormat = isNewSnapshotFormat(q.snapshot);
    const types = useNewFormat ? (rateTypes ?? RATE_TYPES) : ["rate"];
    const hasLineType = rows.some((r) => r.lineType != null);

    const headerRow = useNewFormat && hasLineType ? ["Country", "Type"] : useNewFormat ? ["Country"] : ["Country", "Type"];
    for (const v of vendors) {
      headerRow.push(`${v.nombre} - prefix`);
      for (const t of types) headerRow.push(`${v.nombre} - ${t} rate`);
    }
    const dataRows = rows.map((row) => {
      const typeCol = hasLineType ? (row.lineType ?? row.type ?? "") : (row.type ?? "");
      const r: (string | number)[] = useNewFormat && hasLineType ? [row.country, typeCol] : useNewFormat ? [row.country] : [row.country, typeCol];
      for (const v of vendors) {
        const cell = row.byVendor?.[v.id];
        const hasMultiType = cell && ((cell as CellByType)["International"] !== undefined || (cell as CellByType)["mobile"] !== undefined);
        if (useNewFormat && hasMultiType) {
          const byType = cell as CellByType;
          const allPrefixes = types.flatMap((t) => (byType[t]?.prefixes ?? []));
          r.push(truncateForExcel([...new Set(allPrefixes)].join(", ")));
          for (const t of types) {
            const c = (byType as CellByType)[t];
            const val = c?.ratePlusExtra ?? c?.rate ?? "";
            r.push(typeof val === "number" ? val : val);
          }
        } else {
          const c = cell as { prefixes?: string[]; rate?: number; ratePlusExtra?: number | null } | undefined;
          const prefixStr = truncateForExcel(c?.prefixes?.join(", ") ?? "");
          const rateVal = c?.ratePlusExtra != null ? c.ratePlusExtra : c?.rate ?? "";
          r.push(prefixStr, typeof rateVal === "number" ? rateVal : rateVal);
        }
      }
      return r;
    });
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quotation");
    const name = q.name?.replace(/[^\w\s-]/g, "") || "quotation";
    XLSX.writeFile(wb, `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado como XLSX");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="relative flex-1 min-w-[140px] max-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search by name…"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={filterClientId} onValueChange={setFilterClientId}>
              <SelectTrigger className="h-9 w-[140px] sm:w-[160px]">
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
              <SelectTrigger className="h-9 w-[100px] sm:w-[110px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
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
              className="h-9 min-w-[220px]"
            />
          </div>
          <Button asChild variant="outline" size="sm" className="h-9 shrink-0">
            <Link to="/quotations/create" className="inline-flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" />
              Create
            </Link>
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-background/40 mx-4 mt-4 mb-4">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Vendors</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                  Loading…
                </TableCell>
              </TableRow>
            ) : filteredQuotations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No saved quotations. Use the Create button to add one.
                </TableCell>
              </TableRow>
            ) : (
              paginatedQuotations.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">
                    {q.name ?? <span className="italic text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {q.client_id ? (clientById.get(q.client_id)?.name ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {q.vendor_ids.map((vid) => (
                        <Badge key={vid} variant="secondary" className="text-xs font-normal">
                          {vendorById.get(vid)?.nombre ?? vid.slice(0, 8)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={(q.status ?? "active") === "archived" ? "outline" : "secondary"} className="text-xs">
                      {(q.status ?? "active") === "archived" ? "Archived" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(q.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setViewingQuotation(q)}
                            aria-label="View quotation"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Ver cotización</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => navigate(`/quotations/${q.id}/edit`)}
                            aria-label="Edit quotation"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleExportXlsx(q)}
                            aria-label="Download XLSX"
                          >
                            <FileDown className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Descargar XLSX</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleArchive(q)}
                            aria-label={(q.status ?? "active") === "archived" ? "Restore quotation" : "Archive quotation"}
                          >
                            {(q.status ?? "active") === "archived" ? (
                              <ArchiveRestore className="w-4 h-4" />
                            ) : (
                              <Archive className="w-4 h-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {(q.status ?? "active") === "archived" ? "Restaurar" : "Archivar"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {filteredQuotations.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50 rounded-b-xl text-sm text-muted-foreground">
            <span>
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, filteredQuotations.length)} of {filteredQuotations.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
        </div>
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
                    <th className="text-left px-4 py-2 text-xs font-semibold">Country</th>
                    {(!isNewSnapshotFormat(viewingQuotation.snapshot) || viewingQuotation.snapshot.rows.some((r) => r.lineType != null)) && (
                      <th className="text-left px-4 py-2 text-xs font-semibold">Type</th>
                    )}
                    {viewingQuotation.snapshot.vendors.map((v) => {
                      const useNew = isNewSnapshotFormat(viewingQuotation.snapshot);
                      const types = useNew ? (viewingQuotation.snapshot.rateTypes ?? RATE_TYPES) : null;
                      const colCount = useNew && types ? 1 + types.length : 3;
                      return (
                        <th key={v.id} colSpan={colCount} className="text-center px-4 py-2 text-xs font-semibold border-l border-border">
                          {v.nombre}
                        </th>
                      );
                    })}
                  </tr>
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
                          <th key={`${v.id}-p`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground border-l border-border">
                            prefix
                          </th>,
                          ...types.map((t) => (
                            <th key={`${v.id}-${t}`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground">
                              {t}
                            </th>
                          )),
                        ];
                      }
                      return [
                        <th key={`${v.id}-p`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground border-l border-border">
                          prefix
                        </th>,
                        <th key={`${v.id}-r`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground">
                          rate
                        </th>,
                        <th key={`${v.id}-e`} className="text-left px-4 py-1 text-[10px] font-normal text-muted-foreground">
                          rate+extra
                        </th>,
                      ];
                    })}
                  </tr>
                </thead>
                <tbody>
                  {viewingQuotation.snapshot.rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">{row.country}</td>
                      {(!isNewSnapshotFormat(viewingQuotation.snapshot) || viewingQuotation.snapshot.rows.some((r) => r.lineType != null)) && (
                        <td className="px-4 py-2">{row.lineType ?? row.type ?? "—"}</td>
                      )}
                      {viewingQuotation.snapshot.vendors.map((v) => {
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
                                    {display != null ? display.toFixed(4) : "—"}
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
                              {c?.rate != null ? c.rate.toFixed(4) : "—"}
                            </td>
                            <td className="px-4 py-2 font-mono">
                              {c?.ratePlusExtra != null ? c.ratePlusExtra.toFixed(4) : "—"}
                            </td>
                          </React.Fragment>
                        );
                      })}
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
