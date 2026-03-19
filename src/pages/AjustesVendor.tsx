import { useMemo, useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Eye, Pencil, Trash2, Plus, Upload, Download } from "lucide-react";
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

  const totalPages = Math.max(1, Math.ceil(vendors.length / PAGE_SIZE));
  const paginatedVendors = vendors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fetchVendors = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendors")
      .select("id, nombre, descripcion, estado")
      .order("nombre");
    if (!error && data) setVendors(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchVendors();
  }, []);

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
    <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            Settings · Vendors
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Manage vendors that provide phone rates. You can create, edit, view
            details, or delete records. Description is optional and status can be
            enabled or disabled.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 shrink-0 inline-flex items-center gap-2" onClick={openCreateDialog}>
              <Plus className="w-3.5 h-3.5" />
              Create vendor
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
                  placeholder="Ej. Telco MX"
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

      {/* Download vendor template - for vendors without a specific format */}
      <div className="mx-4 mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Vendor rate template</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use this template for vendors that don&apos;t have a specific format. Contains 3 sheets: International, Origin Based, Local.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 inline-flex items-center gap-2"
            onClick={downloadVendorTemplate}
          >
            <Download className="w-4 h-4" />
            Download template
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background/40 mx-4 mt-4 mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-24 text-center">File</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-sm text-muted-foreground"
                >
                  <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                  Loading vendors…
                </TableCell>
              </TableRow>
            ) : vendors.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  No vendors yet. Create the first one with the
                  &quot;Create vendor&quot; button.
                </TableCell>
              </TableRow>
            ) : (
              paginatedVendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">
                    {vendor.nombre}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vendor.descripcion ?? (
                      <span className="italic text-xs text-muted-foreground">
                        No description
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
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
                  <TableCell className="text-center">
                    <Dialog open={uploadDialogVendor?.id === vendor.id} onOpenChange={(open) => !open && setUploadDialogVendor(null)}>
                      <DialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setUploadDialogVendor(vendor)}
                          aria-label={`Upload file for ${vendor.nombre}`}
                          disabled={vendor.estado === "desactivado"}
                        >
                          <Upload className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Upload rates for {vendor.nombre}</DialogTitle>
                        </DialogHeader>
                        <CsvUploader
                          vendorId={vendor.id}
                          compact
                          onSuccess={() => setUploadDialogVendor(null)}
                        />
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openViewDialog(vendor)}
                      aria-label={`View vendor ${vendor.nombre}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(vendor)}
                      aria-label={`Edit vendor ${vendor.nombre}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(vendor)}
                      aria-label={`Delete vendor ${vendor.nombre}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {vendors.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50 rounded-b-xl text-sm text-muted-foreground">
            <span>
              Showing {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, vendors.length)} of {vendors.length}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Previous
              </Button>
              <span className="text-xs">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AjustesVendor;

