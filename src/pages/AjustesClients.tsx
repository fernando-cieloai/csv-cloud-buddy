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
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Pencil, Trash2, Eye, Plus } from "lucide-react";

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

  const totalPages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const paginatedClients = clients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            Settings · Clients
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Manage clients. Each client can have many quotations. Create, edit,
            view, or delete records.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 shrink-0 inline-flex items-center gap-2" onClick={openCreateDialog}>
              <Plus className="w-3.5 h-3.5" />
              Create client
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

      <div className="rounded-xl border border-border bg-background/40 mx-4 mt-4 mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center py-12 text-sm text-muted-foreground"
                >
                  <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                  Loading clients…
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  No clients yet. Create the first one with the "Create client"
                  button.
                </TableCell>
              </TableRow>
            ) : (
              paginatedClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.description ?? (
                      <span className="italic text-xs text-muted-foreground">
                        No description
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openViewDialog(client)}
                      aria-label={`View client ${client.name}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(client)}
                      aria-label={`Edit client ${client.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(client)}
                      aria-label={`Delete client ${client.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {clients.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50 rounded-b-xl text-sm text-muted-foreground">
            <span>
              Showing {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, clients.length)} of {clients.length}
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

export default AjustesClients;
