import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Eye, FileDown } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RATE_TYPES = ["International", "Origin Based", "Local"];

type CellByType = Record<string, { prefixes: string[]; rate: number; ratePlusExtra: number | null }>;

interface SavedQuotation {
  id: string;
  name: string | null;
  vendor_ids: string[];
  snapshot: {
    vendors: { id: string; nombre: string }[];
    rateTypes?: string[];
    rows: {
      country: string;
      type?: string;
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

export default function CotizacionesGuardadas() {
  const [quotations, setQuotations] = useState<SavedQuotation[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVendorId, setFilterVendorId] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [viewingQuotation, setViewingQuotation] = useState<SavedQuotation | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [quotationsRes, vendorsRes] = await Promise.all([
      supabase
        .from("saved_quotations")
        .select("id, name, vendor_ids, snapshot, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("vendors").select("id, nombre").order("nombre"),
    ]);
    if (!quotationsRes.error && quotationsRes.data) setQuotations(quotationsRes.data as SavedQuotation[]);
    if (!vendorsRes.error && vendorsRes.data) setVendors(vendorsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredQuotations = useMemo(() => {
    return quotations.filter((q) => {
      if (filterVendorId !== "all" && !(q.vendor_ids ?? []).includes(filterVendorId)) return false;
      const createdAt = new Date(q.created_at);
      if (filterDateFrom && createdAt < new Date(filterDateFrom + "T00:00:00")) return false;
      if (filterDateTo && createdAt > new Date(filterDateTo + "T23:59:59")) return false;
      return true;
    });
  }, [quotations, filterVendorId, filterDateFrom, filterDateTo]);

  const vendorById = useMemo(() => {
    const m = new Map<string, Vendor>();
    for (const v of vendors) m.set(v.id, v);
    return m;
  }, [vendors]);

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

    const headerRow = useNewFormat ? ["Country"] : ["Country", "Type"];
    for (const v of vendors) {
      headerRow.push(`${v.nombre} - prefix`);
      for (const t of types) headerRow.push(`${v.nombre} - ${t} rate`);
    }
    const dataRows = rows.map((row) => {
      const r: (string | number)[] = useNewFormat ? [row.country] : [row.country, row.type ?? ""];
      for (const v of vendors) {
        const cell = row.byVendor?.[v.id];
        if (useNewFormat && cell && "International" in cell) {
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
      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <h3 className="text-sm font-semibold text-foreground">Saved quotations</h3>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label className="text-xs">Vendor</Label>
            <Select value={filterVendorId} onValueChange={setFilterVendorId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vendors</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">From date</Label>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-[140px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">To date</Label>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-[140px]"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Vendors</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                  Loading…
                </TableCell>
              </TableRow>
            ) : filteredQuotations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                  No saved quotations. Create one in the Compare tab.
                </TableCell>
              </TableRow>
            ) : (
              filteredQuotations.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">
                    {q.name ?? <span className="italic text-muted-foreground">—</span>}
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
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(q.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setViewingQuotation(q)}
                      aria-label="View quotation"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
                    {!isNewSnapshotFormat(viewingQuotation.snapshot) && (
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
                    {!isNewSnapshotFormat(viewingQuotation.snapshot) && (
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
                      {!isNewSnapshotFormat(viewingQuotation.snapshot) && (
                        <td className="px-4 py-2">{row.type ?? "—"}</td>
                      )}
                      {viewingQuotation.snapshot.vendors.map((v) => {
                        const cell = row.byVendor[v.id];
                        const useNew = isNewSnapshotFormat(viewingQuotation.snapshot) && cell && "International" in cell;
                        if (useNew && cell) {
                          const byType = cell as CellByType;
                          const types = viewingQuotation.snapshot.rateTypes ?? RATE_TYPES;
                          const allPrefixes = types.flatMap((t) => (byType[t]?.prefixes ?? []));
                          return (
                            <React.Fragment key={v.id}>
                              <td className="px-4 py-2 border-l border-border font-mono text-xs">
                                {[...new Set(allPrefixes)].join(", ") || "—"}
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
                        return (
                          <React.Fragment key={v.id}>
                            <td className="px-4 py-2 border-l border-border font-mono text-xs">
                              {c?.prefixes?.join(", ") ?? "—"}
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
