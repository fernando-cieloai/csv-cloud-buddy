import { useMemo, useState, useEffect } from "react";
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
import { cycleSort, compareText, type SortState } from "@/lib/tableSort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Pencil, Trash2, Eye, Plus, MoreVertical, ChevronLeft, ChevronRight } from "lucide-react";

type Client = {
  id: string;
  name: string;
  description: string | null;
};

const PAGE_SIZE = 10;

const AjustesClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [mode, setMode] = useState<"crear" | "editar" | "ver">("crear");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [clientSort, setClientSort] = useState<SortState<"name" | "description">>(null);

  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, description")
      .order("name");
    if (!error && data) setClients(data as Client[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [clientSort]);

  const sortedClients = useMemo(() => {
    if (!clientSort) return clients;
    const { key, dir } = clientSort;
    const m = dir === "asc" ? 1 : -1;
    return [...clients].sort((a, b) => {
      const c =
        key === "name"
          ? compareText(a.name, b.name)
          : compareText(a.description, b.description);
      return c * m;
    });
  }, [clients, clientSort]);

  const totalPages = Math.max(1, Math.ceil(sortedClients.length / PAGE_SIZE));
  const paginatedClients = sortedClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const isReadOnly = mode === "ver";
  const dialogTitle = useMemo(() => {
    if (mode === "crear") return "Create client";
    if (mode === "editar") return "Edit client";
    return "Client details";
  }, [mode]);

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setSelectedClient(null);
    setMode("crear");
  };

  const openCreateDialog = () => {
    resetForm();
    setMode("crear");
    setIsDialogOpen(true);
  };

  const openViewDialog = (client: Client) => {
    setSelectedClient(client);
    setFormName(client.name);
    setFormDescription(client.description ?? "");
    setMode("ver");
    setIsDialogOpen(true);
  };

  const openEditDialog = (client: Client) => {
    setSelectedClient(client);
    setFormName(client.name);
    setFormDescription(client.description ?? "");
    setMode("editar");
    setIsDialogOpen(true);
  };

  const handleDelete = async (client: Client) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the client "${client.name}"?`,
    );
    if (!confirmDelete) return;

    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      alert(`Error deleting: ${error.message}`);
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== client.id));
    if (selectedClient?.id === client.id) {
      resetForm();
      setIsDialogOpen(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formName.trim()) {
      alert("Name is required.");
      return;
    }

    setSaving(true);
    if (mode === "crear") {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: formName.trim(),
          description: formDescription.trim() || null,
        })
        .select("id, name, description")
        .single();
      if (error) {
        alert(`Error creating: ${error.message}`);
        setSaving(false);
        return;
      }
      if (data) setClients((prev) => [data as Client, ...prev]);
    } else if (mode === "editar" && selectedClient) {
      const { error } = await supabase
        .from("clients")
        .update({
          name: formName.trim(),
          description: formDescription.trim() || null,
        })
        .eq("id", selectedClient.id);
      if (error) {
        alert(`Error saving: ${error.message}`);
        setSaving(false);
        return;
      }
      setClients((prev) =>
        prev.map((c) =>
          c.id === selectedClient.id
            ? {
                ...c,
                name: formName.trim(),
                description: formDescription.trim() || null,
              }
            : c,
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
          <div />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 px-4 rounded-lg" onClick={openCreateDialog} aria-label="Create client">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  required
                  readOnly={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">
                  Description{" "}
                  <span className="text-muted-foreground text-xs">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  id="description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Additional information about the client"
                  rows={3}
                  readOnly={isReadOnly}
                />
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
                      {saving
                        ? "Saving…"
                        : mode === "crear"
                          ? "Create"
                          : "Save changes"}
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
                sortKey="name"
                sort={clientSort}
                onSort={(k) => setClientSort((s) => cycleSort(s, k as "name" | "description"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Name
              </SortableTableHead>
              <SortableTableHead
                sortKey="description"
                sort={clientSort}
                onSort={(k) => setClientSort((s) => cycleSort(s, k as "name" | "description"))}
                className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
              >
                Description
              </SortableTableHead>
              <TableHead className="w-12 text-right bg-muted/50"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={3} className="text-center py-12 text-muted-foreground px-6">
                  <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                  Loading clients…
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableCell colSpan={3} className="text-center py-12 text-muted-foreground px-6">
                  No clients yet. Create the first one with the + button.
                </TableCell>
              </TableRow>
            ) : (
              paginatedClients.map((client) => (
                <TableRow key={client.id} className="border-b border-border">
                  <TableCell className="font-medium px-6 py-4">{client.name}</TableCell>
                  <TableCell className="text-muted-foreground px-6 py-4">
                    {client.description ?? (
                      <span className="italic text-xs text-muted-foreground">
                        No description
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right px-6 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Actions">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openViewDialog(client)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(client)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(client)} className="text-destructive focus:text-destructive">
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
        {sortedClients.length > 0 && (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
            <span>{Math.min(page * PAGE_SIZE, sortedClients.length) - (page - 1) * PAGE_SIZE} of {sortedClients.length} items</span>
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

export default AjustesClients;
