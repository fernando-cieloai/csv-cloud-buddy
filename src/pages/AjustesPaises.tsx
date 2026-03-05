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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Globe, MapPin } from "lucide-react";

type Region = {
  id: string;
  nombre: string;
  descripcion: string | null;
};

type Country = {
  id: string;
  nombre: string;
  region_id: string | null;
  region?: Region | null;
};

const AjustesPaises = () => {
  const [regions, setRegions] = useState<Region[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);

  // Regions dialog
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [regionMode, setRegionMode] = useState<"crear" | "editar" | "ver">("crear");
  const [isRegionDialogOpen, setIsRegionDialogOpen] = useState(false);
  const [regionSaving, setRegionSaving] = useState(false);
  const [formRegionNombre, setFormRegionNombre] = useState("");
  const [formRegionDescripcion, setFormRegionDescripcion] = useState("");

  // Countries dialog
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [countryMode, setCountryMode] = useState<"crear" | "editar" | "ver">("crear");
  const [isCountryDialogOpen, setIsCountryDialogOpen] = useState(false);
  const [countrySaving, setCountrySaving] = useState(false);
  const [formCountryNombre, setFormCountryNombre] = useState("");
  const [formCountryRegionId, setFormCountryRegionId] = useState<string>("__none__");

  const fetchData = async () => {
    setLoading(true);
    const [regionsRes, countriesRes] = await Promise.all([
      supabase.from("regions").select("id, nombre, descripcion").order("nombre"),
      supabase
        .from("countries")
        .select("id, nombre, region_id, regions(id, nombre, descripcion)")
        .order("nombre"),
    ]);
    if (!regionsRes.error && regionsRes.data) setRegions(regionsRes.data);
    if (!countriesRes.error && countriesRes.data) {
      setCountries(
        countriesRes.data.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          region_id: c.region_id,
          region: Array.isArray(c.regions) ? c.regions[0] : (c.regions as Region | null),
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const regionById = useMemo(() => {
    const m = new Map<string, Region>();
    for (const r of regions) m.set(r.id, r);
    return m;
  }, [regions]);

  // --- Regions CRUD ---
  const regionDialogTitle = useMemo(() => {
    if (regionMode === "crear") return "Create region";
    if (regionMode === "editar") return "Edit region";
    return "Region details";
  }, [regionMode]);

  const resetRegionForm = () => {
    setFormRegionNombre("");
    setFormRegionDescripcion("");
    setSelectedRegion(null);
    setRegionMode("crear");
  };

  const openCreateRegion = () => {
    resetRegionForm();
    setRegionMode("crear");
    setIsRegionDialogOpen(true);
  };

  const openViewRegion = (r: Region) => {
    setSelectedRegion(r);
    setFormRegionNombre(r.nombre);
    setFormRegionDescripcion(r.descripcion ?? "");
    setRegionMode("ver");
    setIsRegionDialogOpen(true);
  };

  const openEditRegion = (r: Region) => {
    setSelectedRegion(r);
    setFormRegionNombre(r.nombre);
    setFormRegionDescripcion(r.descripcion ?? "");
    setRegionMode("editar");
    setIsRegionDialogOpen(true);
  };

  const handleDeleteRegion = async (r: Region) => {
    if (!window.confirm(`Delete region "${r.nombre}"? Countries will be unassigned.`)) return;
    const { error } = await supabase.from("regions").delete().eq("id", r.id);
    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    setRegions((prev) => prev.filter((x) => x.id !== r.id));
    if (selectedRegion?.id === r.id) {
      resetRegionForm();
      setIsRegionDialogOpen(false);
    }
    fetchData();
  };

  const handleRegionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRegionNombre.trim()) {
      alert("Name is required.");
      return;
    }
    setRegionSaving(true);
    if (regionMode === "crear") {
      const { data, error } = await supabase
        .from("regions")
        .insert({ nombre: formRegionNombre.trim(), descripcion: formRegionDescripcion.trim() || null })
        .select("id, nombre, descripcion")
        .single();
      if (error) {
        alert(`Error: ${error.message}`);
      } else if (data) setRegions((prev) => [data, ...prev]);
    } else if (regionMode === "editar" && selectedRegion) {
      const { error } = await supabase
        .from("regions")
        .update({
          nombre: formRegionNombre.trim(),
          descripcion: formRegionDescripcion.trim() || null,
        })
        .eq("id", selectedRegion.id);
      if (error) alert(`Error: ${error.message}`);
      else
        setRegions((prev) =>
          prev.map((x) =>
            x.id === selectedRegion.id
              ? { ...x, nombre: formRegionNombre.trim(), descripcion: formRegionDescripcion.trim() || null }
              : x,
          ),
        );
    }
    setRegionSaving(false);
    setIsRegionDialogOpen(false);
    resetRegionForm();
  };

  // --- Countries CRUD ---
  const countryDialogTitle = useMemo(() => {
    if (countryMode === "crear") return "Create country";
    if (countryMode === "editar") return "Edit country";
    return "Country details";
  }, [countryMode]);

  const resetCountryForm = () => {
    setFormCountryNombre("");
    setFormCountryRegionId("__none__");
    setSelectedCountry(null);
    setCountryMode("crear");
  };

  const openCreateCountry = () => {
    resetCountryForm();
    setCountryMode("crear");
    setIsCountryDialogOpen(true);
  };

  const openViewCountry = (c: Country) => {
    setSelectedCountry(c);
    setFormCountryNombre(c.nombre);
    setFormCountryRegionId(c.region_id ?? "__none__");
    setCountryMode("ver");
    setIsCountryDialogOpen(true);
  };

  const openEditCountry = (c: Country) => {
    setSelectedCountry(c);
    setFormCountryNombre(c.nombre);
    setFormCountryRegionId(c.region_id ?? "__none__");
    setCountryMode("editar");
    setIsCountryDialogOpen(true);
  };

  const handleDeleteCountry = async (c: Country) => {
    if (!window.confirm(`Delete country "${c.nombre}"?`)) return;
    const { error } = await supabase.from("countries").delete().eq("id", c.id);
    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    setCountries((prev) => prev.filter((x) => x.id !== c.id));
    if (selectedCountry?.id === c.id) {
      resetCountryForm();
      setIsCountryDialogOpen(false);
    }
  };

  const handleCountrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCountryNombre.trim()) {
      alert("Name is required.");
      return;
    }
    setCountrySaving(true);
    const regionId = formCountryRegionId && formCountryRegionId !== "__none__" ? formCountryRegionId : null;
    if (countryMode === "crear") {
      const { data, error } = await supabase
        .from("countries")
        .insert({ nombre: formCountryNombre.trim(), region_id: regionId })
        .select("id, nombre, region_id")
        .single();
      if (error) {
        alert(`Error: ${error.message}`);
      } else if (data) {
        const region = regionById.get(data.region_id ?? "");
        setCountries((prev) => [{ ...data, region }, ...prev]);
      }
    } else if (countryMode === "editar" && selectedCountry) {
      const { error } = await supabase
        .from("countries")
        .update({ nombre: formCountryNombre.trim(), region_id: regionId })
        .eq("id", selectedCountry.id);
      if (error) alert(`Error: ${error.message}`);
      else {
        const region = regionById.get(regionId ?? "");
        setCountries((prev) =>
          prev.map((x) =>
            x.id === selectedCountry.id ? { ...x, nombre: formCountryNombre.trim(), region_id: regionId, region } : x,
          ),
        );
      }
    }
    setCountrySaving(false);
    setIsCountryDialogOpen(false);
    resetCountryForm();
  };

  const isRegionReadOnly = regionMode === "ver";
  const isCountryReadOnly = countryMode === "ver";

  return (
    <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Settings · Countries & Regions</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Manage regions and countries. Assign each country to a region. Create regions first, then add countries.
        </p>
      </div>

      <Tabs defaultValue="regions" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="regions" className="gap-2">
            <MapPin className="w-3.5 h-3.5" />
            Regions
          </TabsTrigger>
          <TabsTrigger value="countries" className="gap-2">
            <Globe className="w-3.5 h-3.5" />
            Countries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="regions" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isRegionDialogOpen} onOpenChange={setIsRegionDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openCreateRegion}>
                  Create region
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{regionDialogTitle}</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleRegionSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="region-nombre">Name *</Label>
                    <Input
                      id="region-nombre"
                      value={formRegionNombre}
                      onChange={(e) => setFormRegionNombre(e.target.value)}
                      placeholder="e.g. North America"
                      required
                      readOnly={isRegionReadOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region-descripcion">Description (optional)</Label>
                    <Textarea
                      id="region-descripcion"
                      value={formRegionDescripcion}
                      onChange={(e) => setFormRegionDescripcion(e.target.value)}
                      placeholder="Additional info"
                      rows={3}
                      readOnly={isRegionReadOnly}
                    />
                  </div>
                  <DialogFooter>
                    {isRegionReadOnly ? (
                      <Button type="button" variant="secondary" onClick={() => setIsRegionDialogOpen(false)}>
                        Close
                      </Button>
                    ) : (
                      <>
                        <Button type="button" variant="outline" onClick={() => setIsRegionDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={regionSaving}>
                          {regionSaving ? "Saving…" : regionMode === "crear" ? "Create" : "Save"}
                        </Button>
                      </>
                    )}
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-xl border border-border bg-background/40">
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
                    <TableCell colSpan={3} className="text-center py-12 text-sm text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : regions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                      No regions. Create the first one.
                    </TableCell>
                  </TableRow>
                ) : (
                  regions.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.descripcion ?? <span className="italic text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openViewRegion(r)} aria-label={`View ${r.nombre}`}>
                          👁
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditRegion(r)} aria-label={`Edit ${r.nombre}`}>
                          ✏️
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteRegion(r)} aria-label={`Delete ${r.nombre}`}>
                          🗑
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="countries" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isCountryDialogOpen} onOpenChange={setIsCountryDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openCreateCountry}>
                  Create country
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{countryDialogTitle}</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleCountrySubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="country-nombre">Name *</Label>
                    <Input
                      id="country-nombre"
                      value={formCountryNombre}
                      onChange={(e) => setFormCountryNombre(e.target.value)}
                      placeholder="e.g. Mexico"
                      required
                      readOnly={isCountryReadOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country-region">Region</Label>
                    <Select value={formCountryRegionId} onValueChange={setFormCountryRegionId} disabled={isCountryReadOnly}>
                      <SelectTrigger id="country-region">
                        <SelectValue placeholder="Select region (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {regions.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    {isCountryReadOnly ? (
                      <Button type="button" variant="secondary" onClick={() => setIsCountryDialogOpen(false)}>
                        Close
                      </Button>
                    ) : (
                      <>
                        <Button type="button" variant="outline" onClick={() => setIsCountryDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={countrySaving}>
                          {countrySaving ? "Saving…" : countryMode === "crear" ? "Create" : "Save"}
                        </Button>
                      </>
                    )}
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-xl border border-border bg-background/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-12 text-sm text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : countries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                      No countries. Create the first one.
                    </TableCell>
                  </TableRow>
                ) : (
                  countries.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>
                        {c.region ? (
                          <Badge variant="secondary" className="font-normal">
                            {c.region.nombre}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openViewCountry(c)} aria-label={`View ${c.nombre}`}>
                          👁
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditCountry(c)} aria-label={`Edit ${c.nombre}`}>
                          ✏️
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteCountry(c)} aria-label={`Delete ${c.nombre}`}>
                          🗑
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AjustesPaises;
