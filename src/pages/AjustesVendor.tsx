import { useMemo, useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cycleSort, compareText, compareNumber, type SortState } from "@/lib/tableSort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  Plus,
  Upload,
  Download,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import CsvUploader from "@/components/CsvUploader";
import { downloadVendorTemplate } from "@/lib/vendorTemplate";

type VendorStatus = "activado" | "desactivado";

type Vendor = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  estado: VendorStatus;
};

const PAGE_SIZE = 10;

const AjustesVendor = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  /** Vendors that have at least one csv_upload with vendor_id set. */
  const [vendorIdsWithUpload, setVendorIdsWithUpload] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [mode, setMode] = useState<"crear" | "editar" | "ver">("crear");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploadDialogVendor, setUploadDialogVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);

  const [formNombre, setFormNombre] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formEstado, setFormEstado] = useState<VendorStatus>("activado");
  const [vendorSort, setVendorSort] = useState<SortState<"nombre" | "descripcion" | "estado" | "hasFile">>(null);

  const sortedVendors = useMemo(() => {
    if (!vendorSort) return vendors;
    const { key, dir } = vendorSort;
    const m = dir === "asc" ? 1 : -1;
    return [...vendors].sort((a, b) => {
      let c = 0;
      if (key === "nombre") c = compareText(a.nombre, b.nombre);
      else if (key === "descripcion") c = compareText(a.descripcion, b.descripcion);
      else if (key === "estado") c = compareText(a.estado, b.estado);
      else {
        const ha = vendorIdsWithUpload.has(a.id) ? 1 : 0;
        const hb = vendorIdsWithUpload.has(b.id) ? 1 : 0;
        c = compareNumber(ha, hb);
      }
      return c * m;
    });
  }, [vendors, vendorSort, vendorIdsWithUpload]);

  const totalPages = Math.max(1, Math.ceil(sortedVendors.length / PAGE_SIZE));
  const paginatedVendors = sortedVendors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const [vendorsRes, uploadsRes] = await Promise.all([
        supabase.from("vendors").select("id, nombre, descripcion, estado").order("nombre"),
        supabase.from("csv_uploads").select("vendor_id").not("vendor_id", "is", null),
      ]);
      if (!vendorsRes.error && vendorsRes.data) setVendors(vendorsRes.data);
      else if (vendorsRes.error) console.error(vendorsRes.error);
      const next = new Set<string>();
      if (!uploadsRes.error && uploadsRes.data) {
        for (const r of uploadsRes.data) {
          if (r.vendor_id) next.add(r.vendor_id);
        }
      } else if (uploadsRes.error) console.error(uploadsRes.error);
      setVendorIdsWithUpload(next);
    } finally {
      setLoading(false);
    }
  };

  const refreshVendorUploadIds = useCallback(async () => {
    const { data, error } = await supabase
      .from("csv_uploads")
      .select("vendor_id")
      .not("vendor_id", "is", null);
    if (error) return;
    const next = new Set<string>();
    for (const r of data ?? []) {
      if (r.vendor_id) next.add(r.vendor_id);
    }
    setVendorIdsWithUpload(next);
  }, []);

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [vendorSort]);

  const isReadOnly = mode === "ver";
  const dialogTitle = useMemo(() => {
    if (mode === "crear") return "Create vendor";
    if (mode === "editar") return "Edit vendor";
    return "Vendor details";
  }, [mode]);

  const resetForm = () => {
    setFormNombre("");
    setFormDescripcion("");
    setFormEstado("activado");
    setSelectedVendor(null);
    setMode("crear");
  };

  const openCreateDialog = () => {
    resetForm();
    setMode("crear");
    setIsDialogOpen(true);
  };

  const openViewDialog = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setFormNombre(vendor.nombre);
    setFormDescripcion(vendor.descripcion ?? "");
    setFormEstado(vendor.estado);
    setMode("ver");
    setIsDialogOpen(true);
  };

  const openEditDialog = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setFormNombre(vendor.nombre);
    setFormDescripcion(vendor.descripcion ?? "");
    setFormEstado(vendor.estado);
    setMode("editar");
    setIsDialogOpen(true);
  };

  const handleDelete = async (vendor: Vendor) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the vendor "${vendor.nombre}"?`,
    );
    if (!confirmDelete) return;

    const { error } = await supabase.from("vendors").delete().eq("id", vendor.id);
    if (error) {
      alert(`Error deleting: ${error.message}`);
      return;
    }
    setVendors((prev) => prev.filter((v) => v.id !== vendor.id));
    if (selectedVendor?.id === vendor.id) {
      resetForm();
      setIsDialogOpen(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formNombre.trim()) {
      alert("Name is required.");
      return;
    }

    setSaving(true);
    if (mode === "crear") {
      const { data, error } = await supabase
        .from("vendors")
        .insert({
          nombre: formNombre.trim(),
          descripcion: formDescripcion.trim() || null,
          estado: formEstado,
        })
        .select("id, nombre, descripcion, estado")
        .single();
      if (error) {
        alert(`Error creating: ${error.message}`);
        setSaving(false);
        return;
      }
      if (data) setVendors((prev) => [data, ...prev]);
    } else if (mode === "editar" && selectedVendor) {
      const { error } = await supabase
        .from("vendors")
        .update({
          nombre: formNombre.trim(),
          descripcion: formDescripcion.trim() || null,
          estado: formEstado,
        })
        .eq("id", selectedVendor.id);
      if (error) {
        alert(`Error saving: ${error.message}`);
        setSaving(false);
        return;
      }
      setVendors((prev) =>
        prev.map((v) =>
          v.id === selectedVendor.id
            ? {
                ...v,
                nombre: formNombre.trim(),
                descripcion: formDescripcion.trim() || null,
                estado: formEstado,
              }
            : v,
        ),
      );
    }
    setSaving(false);
    setIsDialogOpen(false);
    resetForm();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={downloadVendorTemplate}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download template
            </Button>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 px-4 rounded-lg" onClick={openCreateDialog} aria-label="Create vendor">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                  <Label htmlFor="nombre">
                      Vendor <span className="text-destructive">*</span>
                    </Label>
                <Input
                  id="nombre"
                  value={formNombre}
                  onChange={(event) => setFormNombre(event.target.value)}
                  placeholder="e.g. Telco MX"
                  required
                  readOnly={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="descripcion">
                      Description{" "}
                      <span className="text-muted-foreground text-xs">
                        (optional)
                      </span>
                    </Label>
                <Textarea
                  id="descripcion"
                  value={formDescripcion}
                  onChange={(event) => setFormDescripcion(event.target.value)}
                  placeholder="Additional information about the vendor"
                  rows={3}
                  readOnly={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="estado">Status</Label>
                <select
                  id="estado"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={formEstado}
                  onChange={(event) =>
                    setFormEstado(event.target.value as VendorStatus)
                  }
                  disabled={isReadOnly}
                >
                    <option value="activado">Enabled</option>
                    <option value="desactivado">Disabled</option>
                </select>
              </div>
              <DialogFooter>
                {isReadOnly ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Close
                  </Button>
                ) : (
                  <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : mode === "crear" ? "Create" : "Save changes"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <SortableTableHead
                sortKey="nombre"
                sort={vendorSort}
                onSort={(k) => setVendorSort((s) => cycleSort(s, k as "nombre" | "descripcion" | "estado" | "hasFile"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Vendor
              </SortableTableHead>
              <SortableTableHead
                sortKey="descripcion"
                sort={vendorSort}
                onSort={(k) => setVendorSort((s) => cycleSort(s, k as "nombre" | "descripcion" | "estado" | "hasFile"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Description
              </SortableTableHead>
              <SortableTableHead
                sortKey="estado"
                sort={vendorSort}
                onSort={(k) => setVendorSort((s) => cycleSort(s, k as "nombre" | "descripcion" | "estado" | "hasFile"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Status
              </SortableTableHead>
              <SortableTableHead
                sortKey="hasFile"
                sort={vendorSort}
                onSort={(k) => setVendorSort((s) => cycleSort(s, k as "nombre" | "descripcion" | "estado" | "hasFile"))}
                className="h-11 w-[4.5rem] px-2 font-medium text-muted-foreground bg-muted/50"
                align="center"
              >
                File
              </SortableTableHead>
              <TableHead className="w-12 text-right bg-muted/50"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground px-6">
                  <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                  Loading vendors…
                </TableCell>
              </TableRow>
            ) : vendors.length === 0 ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground px-6">
                  No vendors yet. Create the first one with the + button.
                </TableCell>
              </TableRow>
            ) : (
              paginatedVendors.map((vendor) => (
                <TableRow key={vendor.id} className="border-b border-border">
                  <TableCell className="font-medium px-6 py-4">
                    {vendor.nombre}
                  </TableCell>
                  <TableCell className="text-muted-foreground px-6 py-4">
                    {vendor.descripcion ?? (
                      <span className="italic text-xs text-muted-foreground">
                        No description
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <Badge
                      variant={
                        vendor.estado === "activado" ? "default" : "outline"
                      }
                      className={
                        vendor.estado === "activado"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30"
                          : ""
                      }
                    >
                      {vendor.estado === "activado"
                        ? "Enabled"
                        : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 py-4 text-center align-middle">
                    {vendorIdsWithUpload.has(vendor.id) ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex text-emerald-600 dark:text-emerald-400"
                            aria-label="Rate file uploaded"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Rate file uploaded</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex text-amber-600 dark:text-amber-500"
                            aria-label="No rate file uploaded"
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>No rate file uploaded</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="text-right px-6 py-4">
                    <Dialog open={uploadDialogVendor?.id === vendor.id} onOpenChange={(open) => !open && setUploadDialogVendor(null)}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Actions">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openViewDialog(vendor)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(vendor)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setUploadDialogVendor(vendor)}
                            disabled={vendor.estado === "desactivado"}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload file
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(vendor)} className="text-destructive focus:text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Upload rates for {vendor.nombre}</DialogTitle>
                        </DialogHeader>
                        <CsvUploader
                          vendorId={vendor.id}
                          vendorName={vendor.nombre}
                          compact
                          onSuccess={() => {
                            void refreshVendorUploadIds();
                          }}
                        />
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {sortedVendors.length > 0 && (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
            <span>{Math.min(page * PAGE_SIZE, sortedVendors.length) - (page - 1) * PAGE_SIZE} of {sortedVendors.length} items</span>
            <div className="flex items-center gap-2">
            <span className="min-w-[4rem] text-center">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="Next page">
              <ChevronRight className="w-4 h-4" />
            </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AjustesVendor;

