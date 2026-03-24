import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RefreshCw, Globe, MapPin, Eye, Pencil, Trash2, Plus, MoreVertical, ChevronLeft, ChevronRight, Search } from "lucide-react";

type Group = {
  id: string;
  nombre: string;
  descripcion: string | null;
};

type Country = {
  id: string;
  nombre: string;
  groupIds: string[];
};

const PAGE_SIZE = 10;

const AjustesPaises = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupPage, setGroupPage] = useState(1);
  const [countryPage, setCountryPage] = useState(1);
  const [mainTab, setMainTab] = useState<"groups" | "countries">("groups");
  const [groupTableSearch, setGroupTableSearch] = useState("");
  const [countryTableSearch, setCountryTableSearch] = useState("");
  const [groupSort, setGroupSort] = useState<SortState<"nombre" | "descripcion" | "countries">>(null);
  const [countrySort, setCountrySort] = useState<SortState<"country" | "groups">>(null);

  // Groups dialog
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMode, setGroupMode] = useState<"crear" | "editar" | "ver">("crear");
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [formGroupNombre, setFormGroupNombre] = useState("");
  const [formGroupDescripcion, setFormGroupDescripcion] = useState("");
  /** Country IDs to include in the group (create / edit). */
  const [formGroupCountryIds, setFormGroupCountryIds] = useState<Set<string>>(new Set());
  const [groupCountrySearch, setGroupCountrySearch] = useState("");

  // Country view-only dialog
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [isCountryDialogOpen, setIsCountryDialogOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [groupsRes, countriesRes, cgRes] = await Promise.all([
      supabase.from("groups").select("id, nombre, descripcion").order("nombre"),
      supabase.from("countries").select("id, nombre").order("nombre"),
      supabase.from("country_groups").select("country_id, group_id"),
    ]);
    if (!groupsRes.error && groupsRes.data) setGroups(groupsRes.data);
    if (!countriesRes.error && countriesRes.data && !cgRes.error && cgRes.data) {
      const cgMap = new Map<string, string[]>();
      for (const row of cgRes.data) {
        const list = cgMap.get(row.country_id) ?? [];
        list.push(row.group_id);
        cgMap.set(row.country_id, list);
      }
      setCountries(
        countriesRes.data.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          groupIds: cgMap.get(c.id) ?? [],
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const groupById = useMemo(() => {
    const m = new Map<string, Group>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);

  const countriesInGroup = useMemo(() => {
    const m = new Map<string, Country[]>();
    for (const c of countries) {
      for (const gid of c.groupIds) {
        const list = m.get(gid) ?? [];
        list.push(c);
        m.set(gid, list);
      }
    }
    return m;
  }, [countries]);

  const filteredGroups = useMemo(() => {
    const q = groupTableSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.nombre.toLowerCase().includes(q) ||
        (g.descripcion ?? "").toLowerCase().includes(q),
    );
  }, [groups, groupTableSearch]);

  const filteredCountries = useMemo(() => {
    const q = countryTableSearch.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => {
      if (c.nombre.toLowerCase().includes(q)) return true;
      return c.groupIds.some((gid) => {
        const g = groupById.get(gid);
        return g?.nombre.toLowerCase().includes(q);
      });
    });
  }, [countries, countryTableSearch, groupById]);

  useEffect(() => {
    setGroupPage(1);
  }, [groupTableSearch]);

  useEffect(() => {
    setCountryPage(1);
  }, [countryTableSearch]);

  useEffect(() => {
    setGroupPage(1);
  }, [groupSort]);

  useEffect(() => {
    setCountryPage(1);
  }, [countrySort]);

  const sortedFilteredGroups = useMemo(() => {
    if (!groupSort) return filteredGroups;
    const { key, dir } = groupSort;
    const m = dir === "asc" ? 1 : -1;
    return [...filteredGroups].sort((a, b) => {
      let c = 0;
      if (key === "nombre") c = compareText(a.nombre, b.nombre);
      else if (key === "descripcion") c = compareText(a.descripcion, b.descripcion);
      else
        c = compareNumber(
          (countriesInGroup.get(a.id) ?? []).length,
          (countriesInGroup.get(b.id) ?? []).length,
        );
      return c * m;
    });
  }, [filteredGroups, groupSort, countriesInGroup]);

  const sortedFilteredCountries = useMemo(() => {
    if (!countrySort) return filteredCountries;
    const { key, dir } = countrySort;
    const m = dir === "asc" ? 1 : -1;
    return [...filteredCountries].sort((a, b) => {
      if (key === "country") return compareText(a.nombre, b.nombre) * m;
      const groupsA = [...a.groupIds]
        .map((gid) => groupById.get(gid)?.nombre ?? "")
        .sort()
        .join("|");
      const groupsB = [...b.groupIds]
        .map((gid) => groupById.get(gid)?.nombre ?? "")
        .sort()
        .join("|");
      return compareText(groupsA, groupsB) * m;
    });
  }, [filteredCountries, countrySort, groupById]);

  const groupTotalPages = Math.max(1, Math.ceil(sortedFilteredGroups.length / PAGE_SIZE));
  const paginatedGroups = sortedFilteredGroups.slice((groupPage - 1) * PAGE_SIZE, groupPage * PAGE_SIZE);
  const countryTotalPages = Math.max(1, Math.ceil(sortedFilteredCountries.length / PAGE_SIZE));
  const paginatedCountries = sortedFilteredCountries.slice((countryPage - 1) * PAGE_SIZE, countryPage * PAGE_SIZE);

  // --- Groups CRUD ---
  const groupDialogTitle = useMemo(() => {
    if (groupMode === "crear") return "Create group";
    if (groupMode === "editar") return "Edit group";
    return "Group details";
  }, [groupMode]);

  const resetGroupForm = () => {
    setFormGroupNombre("");
    setFormGroupDescripcion("");
    setFormGroupCountryIds(new Set());
    setGroupCountrySearch("");
    setSelectedGroup(null);
    setGroupMode("crear");
  };

  const openCreateGroup = () => {
    resetGroupForm();
    setGroupMode("crear");
    setIsGroupDialogOpen(true);
  };

  const openViewGroup = (g: Group) => {
    setSelectedGroup(g);
    setFormGroupNombre(g.nombre);
    setFormGroupDescripcion(g.descripcion ?? "");
    setGroupCountrySearch("");
    setGroupMode("ver");
    setIsGroupDialogOpen(true);
  };

  const openEditGroup = (g: Group) => {
    setSelectedGroup(g);
    setFormGroupNombre(g.nombre);
    setFormGroupDescripcion(g.descripcion ?? "");
    setGroupCountrySearch("");
    const ids = new Set(countries.filter((c) => c.groupIds.includes(g.id)).map((c) => c.id));
    setFormGroupCountryIds(ids);
    setGroupMode("editar");
    setIsGroupDialogOpen(true);
  };

  const handleDeleteGroup = async (g: Group) => {
    if (!window.confirm(`Delete group "${g.nombre}"? Countries will be unassigned.`)) return;
    const { error } = await supabase.from("groups").delete().eq("id", g.id);
    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    setGroups((prev) => prev.filter((x) => x.id !== g.id));
    if (selectedGroup?.id === g.id) {
      resetGroupForm();
      setIsGroupDialogOpen(false);
    }
    fetchData();
  };

  const toggleFormGroupCountry = (countryId: string) => {
    setFormGroupCountryIds((prev) => {
      const next = new Set(prev);
      if (next.has(countryId)) next.delete(countryId);
      else next.add(countryId);
      return next;
    });
  };

  const countriesFilteredForGroupForm = useMemo(() => {
    const q = groupCountrySearch.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.nombre.toLowerCase().includes(q));
  }, [countries, groupCountrySearch]);

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formGroupNombre.trim();
    if (!trimmedName) {
      alert("Name is required.");
      return;
    }
    const nameNorm = trimmedName.toLowerCase();
    const nameTaken = groups.some(
      (g) =>
        g.nombre.trim().toLowerCase() === nameNorm &&
        (groupMode === "crear" || g.id !== selectedGroup?.id),
    );
    if (nameTaken) {
      alert("A group with this name already exists. Choose a different name.");
      return;
    }
    if (groupMode === "crear" && formGroupCountryIds.size < 2) {
      alert("Select at least 2 countries to create a group.");
      return;
    }
    setGroupSaving(true);
    if (groupMode === "crear") {
      const { data, error } = await supabase
        .from("groups")
        .insert({ nombre: trimmedName, descripcion: formGroupDescripcion.trim() || null })
        .select("id, nombre, descripcion")
        .single();
      if (error) {
        alert(`Error: ${error.message}`);
        setGroupSaving(false);
        return;
      }
      if (data) {
        const { error: cgError } = await supabase.from("country_groups").insert(
          Array.from(formGroupCountryIds).map((country_id) => ({ country_id, group_id: data.id })),
        );
        if (cgError) {
          alert(`Group created but countries failed: ${cgError.message}`);
          setGroupSaving(false);
          await fetchData();
          setIsGroupDialogOpen(false);
          resetGroupForm();
          return;
        }
      }
      if (data) setGroups((prev) => [data, ...prev]);
      await fetchData();
    } else if (groupMode === "editar" && selectedGroup) {
      const { error } = await supabase
        .from("groups")
        .update({
          nombre: trimmedName,
          descripcion: formGroupDescripcion.trim() || null,
        })
        .eq("id", selectedGroup.id);
      if (error) {
        alert(`Error: ${error.message}`);
        setGroupSaving(false);
        return;
      }
      await supabase.from("country_groups").delete().eq("group_id", selectedGroup.id);
      if (formGroupCountryIds.size > 0) {
        const { error: cgError } = await supabase.from("country_groups").insert(
          Array.from(formGroupCountryIds).map((country_id) => ({
            country_id,
            group_id: selectedGroup.id,
          })),
        );
        if (cgError) {
          alert(`Group saved but countries failed: ${cgError.message}`);
          setGroupSaving(false);
          await fetchData();
          setIsGroupDialogOpen(false);
          resetGroupForm();
          return;
        }
      }
      setGroups((prev) =>
        prev.map((x) =>
          x.id === selectedGroup.id
            ? { ...x, nombre: trimmedName, descripcion: formGroupDescripcion.trim() || null }
            : x,
        ),
      );
      await fetchData();
    }
    setGroupSaving(false);
    setIsGroupDialogOpen(false);
    resetGroupForm();
  };

  const openViewCountry = (c: Country) => {
    setSelectedCountry(c);
    setIsCountryDialogOpen(true);
  };

  const closeCountryDialog = () => {
    setIsCountryDialogOpen(false);
    setSelectedCountry(null);
  };

  const isGroupReadOnly = groupMode === "ver";
  const countriesForSelectedGroup = selectedGroup ? (countriesInGroup.get(selectedGroup.id) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Countries & Groups</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Manage groups and assign countries when creating or editing a group. Countries are read-only on this page; they can only be added or edited from{" "}
            <Link to="/master-list" className="text-primary font-medium underline-offset-4 hover:underline">
              Master List
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Dialog
            open={isGroupDialogOpen}
            onOpenChange={(open) => {
              setIsGroupDialogOpen(open);
              if (!open) resetGroupForm();
            }}
          >
            <Button variant="outline" size="sm" className="h-9 shrink-0 inline-flex items-center gap-2" onClick={openCreateGroup} type="button">
              <Plus className="w-3.5 h-3.5" />
              Group
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{groupDialogTitle}</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleGroupSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="group-nombre">Name *</Label>
                  <Input
                    id="group-nombre"
                    value={formGroupNombre}
                    onChange={(e) => setFormGroupNombre(e.target.value)}
                    placeholder="e.g. North America"
                    required
                    readOnly={isGroupReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="group-descripcion">Description (optional)</Label>
                  <Textarea
                    id="group-descripcion"
                    value={formGroupDescripcion}
                    onChange={(e) => setFormGroupDescripcion(e.target.value)}
                    placeholder="Additional info"
                    rows={3}
                    readOnly={isGroupReadOnly}
                  />
                </div>
                {groupMode === "ver" && selectedGroup && (
                  <div className="space-y-2">
                    <Label>Countries in this group ({countriesForSelectedGroup.length})</Label>
                    {countriesForSelectedGroup.length > 0 ? (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-40 overflow-y-auto space-y-1">
                        {countriesForSelectedGroup.map((c) => (
                          <div key={c.id} className="text-sm flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {c.nombre}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No countries in this group.</p>
                    )}
                  </div>
                )}
                {(groupMode === "crear" || groupMode === "editar") && (
                  <div className="space-y-2">
                    <Label>
                      Countries ({formGroupCountryIds.size} selected)
                      {groupMode === "crear" && (
                        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                          At least 2 countries are required to create a group.
                        </span>
                      )}
                    </Label>
                    <Input
                      value={groupCountrySearch}
                      onChange={(e) => setGroupCountrySearch(e.target.value)}
                      placeholder="Search countries…"
                      className="text-sm"
                    />
                    <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto space-y-2">
                      {countriesFilteredForGroupForm.length > 0 ? (
                        countriesFilteredForGroupForm.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={formGroupCountryIds.has(c.id)}
                              onCheckedChange={() => toggleFormGroupCountry(c.id)}
                            />
                            <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {c.nombre}
                          </label>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {countries.length === 0 ? (
                            <>
                              No countries yet. Add them from{" "}
                              <Link to="/master-list" className="text-primary font-medium underline-offset-2 hover:underline">
                                Master List
                              </Link>
                              .
                            </>
                          ) : (
                            "No matches."
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {isGroupReadOnly ? (
                    <Button type="button" variant="secondary" onClick={() => setIsGroupDialogOpen(false)}>
                      Close
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={() => setIsGroupDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={groupSaving}>
                        {groupSaving ? "Saving…" : groupMode === "crear" ? "Create" : "Save"}
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={isCountryDialogOpen} onOpenChange={(open) => !open && closeCountryDialog()}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Country details</DialogTitle>
              </DialogHeader>
              {selectedCountry && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <p className="text-sm font-medium text-foreground">{selectedCountry.nombre}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Groups</Label>
                    {selectedCountry.groupIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/30 p-3">
                        {selectedCountry.groupIds.map((gid) => {
                          const g = groupById.get(gid);
                          return g ? (
                            <Badge key={gid} variant="secondary" className="font-normal">
                              {g.nombre}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not assigned to any group.</p>
                    )}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={closeCountryDialog}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "groups" | "countries")} className="px-6 py-4 space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="groups" className="gap-2">
            <MapPin className="w-3.5 h-3.5" />
            Groups
          </TabsTrigger>
          <TabsTrigger value="countries" className="gap-2">
            <Globe className="w-3.5 h-3.5" />
            Countries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search groups…"
              value={groupTableSearch}
              onChange={(e) => setGroupTableSearch(e.target.value)}
              aria-label="Search groups"
            />
          </div>
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <SortableTableHead
                    sortKey="nombre"
                    sort={groupSort}
                    onSort={(k) => setGroupSort((s) => cycleSort(s, k as "nombre" | "descripcion" | "countries"))}
                    className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
                  >
                    Name
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="descripcion"
                    sort={groupSort}
                    onSort={(k) => setGroupSort((s) => cycleSort(s, k as "nombre" | "descripcion" | "countries"))}
                    className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
                  >
                    Description
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="countries"
                    sort={groupSort}
                    onSort={(k) => setGroupSort((s) => cycleSort(s, k as "nombre" | "descripcion" | "countries"))}
                    className="h-11 w-28 px-6 font-medium text-muted-foreground bg-muted/50 tabular-nums"
                    align="right"
                  >
                    Countries
                  </SortableTableHead>
                  <TableHead className="w-12 text-right bg-muted/50"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground px-6">
                      <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : groups.length === 0 ? (
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground px-6">
                      No groups. Create the first one.
                    </TableCell>
                  </TableRow>
                ) : sortedFilteredGroups.length === 0 ? (
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground px-6">
                      No groups match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedGroups.map((g) => (
                    <TableRow key={g.id} className="border-b border-border">
                      <TableCell className="font-medium px-6 py-4">{g.nombre}</TableCell>
                      <TableCell className="text-muted-foreground px-6 py-4">
                        {g.descripcion ?? <span className="italic text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-right px-6 py-4 tabular-nums text-muted-foreground">
                        {(countriesInGroup.get(g.id) ?? []).length}
                      </TableCell>
                      <TableCell className="text-right px-6 py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Actions">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openViewGroup(g)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditGroup(g)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteGroup(g)} className="text-destructive focus:text-destructive">
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
            {sortedFilteredGroups.length > 0 && (
              <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
                <span>{Math.min(groupPage * PAGE_SIZE, sortedFilteredGroups.length) - (groupPage - 1) * PAGE_SIZE} of {sortedFilteredGroups.length} items</span>
                <div className="flex items-center gap-2">
                <span className="min-w-[4rem] text-center">{groupPage} / {groupTotalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setGroupPage((p) => Math.max(1, p - 1))} disabled={groupPage <= 1} aria-label="Previous page">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setGroupPage((p) => Math.min(groupTotalPages, p + 1))} disabled={groupPage >= groupTotalPages} aria-label="Next page">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="countries" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search by country or group name…"
              value={countryTableSearch}
              onChange={(e) => setCountryTableSearch(e.target.value)}
              aria-label="Search countries"
            />
          </div>
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <SortableTableHead
                    sortKey="country"
                    sort={countrySort}
                    onSort={(k) => setCountrySort((s) => cycleSort(s, k as "country" | "groups"))}
                    className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
                  >
                    Country
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="groups"
                    sort={countrySort}
                    onSort={(k) => setCountrySort((s) => cycleSort(s, k as "country" | "groups"))}
                    className="h-11 px-6 font-medium text-muted-foreground bg-muted/50"
                  >
                    Group
                  </SortableTableHead>
                  <TableHead className="w-12 text-right bg-muted/50"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableCell colSpan={3} className="text-center py-12 text-muted-foreground px-6">
                      <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : countries.length === 0 ? (
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableCell colSpan={3} className="text-center py-12 text-muted-foreground px-6">
                      No countries yet. Add them from{" "}
                      <Link to="/master-list" className="text-primary font-medium underline-offset-2 hover:underline">
                        Master List
                      </Link>
                      .
                    </TableCell>
                  </TableRow>
                ) : sortedFilteredCountries.length === 0 ? (
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableCell colSpan={3} className="text-center py-12 text-muted-foreground px-6">
                      No countries match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCountries.map((c) => (
                    <TableRow key={c.id} className="border-b border-border">
                      <TableCell className="font-medium px-6 py-4">{c.nombre}</TableCell>
                      <TableCell className="px-6 py-4">
                        {c.groupIds.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {c.groupIds.map((gid) => {
                              const g = groupById.get(gid);
                              return g ? (
                                <Badge key={gid} variant="secondary" className="font-normal">
                                  {g.nombre}
                                </Badge>
                              ) : null;
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">—</span>
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
                            <DropdownMenuItem onClick={() => openViewCountry(c)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {sortedFilteredCountries.length > 0 && (
              <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
                <span>{Math.min(countryPage * PAGE_SIZE, sortedFilteredCountries.length) - (countryPage - 1) * PAGE_SIZE} of {sortedFilteredCountries.length} items</span>
                <div className="flex items-center gap-2">
                <span className="min-w-[4rem] text-center">{countryPage} / {countryTotalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCountryPage((p) => Math.max(1, p - 1))} disabled={countryPage <= 1} aria-label="Previous page">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCountryPage((p) => Math.min(countryTotalPages, p + 1))} disabled={countryPage >= countryTotalPages} aria-label="Next page">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

export default AjustesPaises;
