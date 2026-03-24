import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Search, ChevronDown, ChevronLeft, ChevronRight, Building2, Save, FileDown, DollarSign, AlertCircle, FolderPlus, Plus } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { QUOTATION_EXPORT_HEADERS, QUOTATION_DEFAULTS } from "@/lib/vendorTemplate";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { roundUpTo3Decimals, formatRate, formatPercent } from "@/lib/utils";
import { SortableNativeTh } from "@/components/ui/sortable-native-th";
import { cycleSort, compareText, compareNumber, type SortState } from "@/lib/tableSort";

interface Client {
  id: string;
  name: string;
}
interface Vendor {
  id: string;
  nombre: string;
  estado: string;
}

interface Upload {
  id: string;
  vendor_id: string | null;
  created_at: string;
}

interface RateRow {
  upload_id: string;
  country: string;
  network: string;
  prefix: string;
  rate: number;
  rate_type: string | null;
}

interface AggregatedRateRow {
  upload_id: string;
  country: string;
  network: string;
  rate_type: string;
  prefixes: string[];
  rate: number;
  from_master_list?: boolean;
}

const RATE_TYPES = ["International", "Origin Based", "Local"] as const;
type RateType = (typeof RATE_TYPES)[number];

function getRateType(rate_type: string | null): RateType {
  if (!rate_type) return "International";
  const normalized = rate_type.trim();
  if (RATE_TYPES.includes(normalized as RateType)) return normalized as RateType;
  // Case-insensitive fallback for DB/snapshot variations (e.g. "local" -> "Local")
  const lower = normalized.toLowerCase();
  const match = RATE_TYPES.find((rt) => rt.toLowerCase() === lower);
  return (match as RateType) ?? "International";
}

interface SnapshotRow {
  country: string;
  lineType?: string;
  type?: string;
  byVendor: Record<string, Record<string, { prefixes: string[]; rate: number; ratePlusExtra: number | null }> | { prefixes?: string[]; rate?: number; ratePlusExtra?: number | null }>;
}

export interface ComparacionCotizacionesProps {
  editQuotationId?: string;
  onSaved?: () => void;
}

interface SavedQuotationRow {
  country: string;
  lineType?: string;
  type?: string;
  byVendor: Record<
    string,
    | { prefixes: string[]; rate: number; ratePlusExtra: number | null }
    | Record<string, { prefixes: string[]; rate: number; ratePlusExtra: number | null }>
  >;
}

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
    displayRateTypes?: string[];
    displayColumns?: { vendorId: string; rateType: string }[];
    effectiveDate?: string;
    initialIncrement?: number;
    nextIncrement?: number;
    rows: SavedQuotationRow[];
  };
}

export default function ComparacionCotizaciones({ editQuotationId, onSaved }: ComparacionCotizacionesProps = {}) {
  const [editQuotation, setEditQuotation] = useState<SavedQuotation | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [rates, setRates] = useState<AggregatedRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchBy, setSearchBy] = useState<"country" | "prefix" | "type">("country");
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [selectedColumnPairs, setSelectedColumnPairs] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [psfFeeInput, setPsfFeeInput] = useState("");
  const [psfFeeMode, setPsfFeeMode] = useState<"percentage" | "fixed">("percentage");
  const [appliedFees, setAppliedFees] = useState<{
    psfFee: { value: number; mode: "percentage" | "fixed" } | null;
  } | null>(null);
  const [countriesFromDb, setCountriesFromDb] = useState<{ id: string; nombre: string }[]>([]);
  const [countryGroupsFromDb, setCountryGroupsFromDb] = useState<{ country_id: string; group_id: string }[]>([]);
  const [groupsFromDb, setGroupsFromDb] = useState<{ id: string; nombre: string }[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveClientId, setSaveClientId] = useState<string>("__none__");
  const [saveClientSearch, setSaveClientSearch] = useState("");
  const [saveClientPickerOpen, setSaveClientPickerOpen] = useState(false);
  const [creatingClientInline, setCreatingClientInline] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalCountries, setTotalCountries] = useState(0);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [exportingOrSaving, setExportingOrSaving] = useState(false);
  const [countriesSearch, setCountriesSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"countries" | "groups">("countries");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [groupsSearch, setGroupsSearch] = useState("");
  const [columnsSearch, setColumnsSearch] = useState("");
  const [selectedColumnKeyPerRow, setSelectedColumnKeyPerRow] = useState<Record<string, string>>({});
  const [sellRatePerRow, setSellRatePerRow] = useState<Record<string, string>>({});
  const [quotationTableSort, setQuotationTableSort] = useState<SortState<string>>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [createGroupSource, setCreateGroupSource] = useState<"countries" | "groups">("countries");
  const [createGroupNombre, setCreateGroupNombre] = useState("");
  const [createGroupDescripcion, setCreateGroupDescripcion] = useState("");
  const [createGroupSaving, setCreateGroupSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [vendorsRes, uploadsRes, countriesRes, cgRes, groupsRes, clientsRes] = await Promise.all([
        supabase.from("vendors").select("id, nombre, estado").order("nombre"),
        supabase
          .from("csv_uploads")
          .select("id, vendor_id, created_at")
          .not("vendor_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase.from("countries").select("id, nombre").order("nombre"),
        supabase.from("country_groups").select("country_id, group_id"),
        supabase.from("groups").select("id, nombre").order("nombre"),
        supabase.from("clients").select("id, name").order("name"),
      ]);

      if (vendorsRes.error) throw new Error(vendorsRes.error.message);
      if (uploadsRes.error) throw new Error(uploadsRes.error.message);
      if (countriesRes.error) throw new Error(countriesRes.error.message);
      if (cgRes.error) throw new Error(cgRes.error.message);
      if (groupsRes.error) throw new Error(groupsRes.error.message);
      if (clientsRes.error) throw new Error(clientsRes.error.message);

      setVendors(vendorsRes.data ?? []);
      setUploads(uploadsRes.data ?? []);
      setClients((clientsRes.data ?? []) as { id: string; name: string }[]);
      setRates([]);
      setCountriesFromDb(countriesRes.data ?? []);
      setCountryGroupsFromDb(cgRes.data ?? []);
      setGroupsFromDb(groupsRes.data ?? []);
      setTotalCountries(0);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  };

  const uploadById = useMemo(() => {
    const m = new Map<string, Upload>();
    for (const u of uploads) m.set(u.id, u);
    return m;
  }, [uploads]);

  /** Vendors with at least one csv_upload (any status — used for rates + table). */
  const vendorsWithUploadRaw = useMemo(() => {
    const seen = new Set<string>();
    for (const u of uploads) {
      if (u.vendor_id) seen.add(u.vendor_id);
    }
    return vendors.filter((v) => seen.has(v.id));
  }, [vendors, uploads]);

  /**
   * Quotation column popover: enabled vendors only.
   * When editing, also keep disabled vendors that appear anywhere in the snapshot
   * (displayColumns, vendors[], or row byVendor keys) so selected columns and row Selects stay valid.
   */
  const vendorsForQuotationColumnPicker = useMemo(() => {
    const enabled = vendorsWithUploadRaw.filter(
      (v) => (v.estado ?? "activado") !== "desactivado",
    );
    const snap = editQuotation?.snapshot;
    if (!snap) return enabled;

    const snapVendorIds = new Set<string>();
    if (Array.isArray(snap.vendors)) {
      for (const x of snap.vendors) {
        if (x && typeof x === "object" && "id" in x && typeof (x as { id: string }).id === "string") {
          snapVendorIds.add((x as { id: string }).id);
        }
      }
    }
    if (Array.isArray(snap.displayColumns)) {
      for (const c of snap.displayColumns) {
        if (c && typeof c.vendorId === "string") snapVendorIds.add(c.vendorId);
      }
    }
    for (const row of snap.rows ?? []) {
      if (row?.byVendor && typeof row.byVendor === "object") {
        for (const vid of Object.keys(row.byVendor)) snapVendorIds.add(vid);
      }
    }

    const disabledInSnap = vendorsWithUploadRaw.filter(
      (v) =>
        snapVendorIds.has(v.id) && (v.estado ?? "activado") === "desactivado",
    );

    const byId = new Map<string, Vendor>();
    for (const v of enabled) byId.set(v.id, v);
    for (const v of disabledInSnap) byId.set(v.id, v);
    return Array.from(byId.values());
  }, [vendorsWithUploadRaw, editQuotation]);

  const allCountries = useMemo(() => {
    return countriesFromDb.map((c) => c.nombre).sort((a, b) => a.localeCompare(b));
  }, [countriesFromDb]);

  const countryIdToNombre = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of countriesFromDb) m.set(c.id, c.nombre);
    return m;
  }, [countriesFromDb]);

  const countriesByGroupId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const cg of countryGroupsFromDb) {
      const nombre = countryIdToNombre.get(cg.country_id);
      if (nombre) {
        const list = m.get(cg.group_id) ?? [];
        list.push(nombre);
        m.set(cg.group_id, list);
      }
    }
    return m;
  }, [countryGroupsFromDb, countryIdToNombre]);

  const handleCreateGroupFromSelection = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedGroupName = createGroupNombre.trim();
    if (!trimmedGroupName) {
      toast.error("Group name is required");
      return;
    }
    const nameNorm = trimmedGroupName.toLowerCase();
    if (groupsFromDb.some((g) => g.nombre.trim().toLowerCase() === nameNorm)) {
      toast.error("A group with this name already exists.");
      return;
    }
    setCreateGroupSaving(true);
    try {
      let countryIds: string[] = [];
      if (createGroupSource === "countries") {
        if (selectedCountries.size < 2) {
          toast.error("Select at least 2 countries to create a group");
          setCreateGroupSaving(false);
          return;
        }
        countryIds = countriesFromDb
          .filter((c) => selectedCountries.has(c.nombre))
          .map((c) => c.id);
      } else {
        if (selectedGroups.size < 2) {
          toast.error("Select at least 2 groups to combine");
          setCreateGroupSaving(false);
          return;
        }
        const countryNames = new Set<string>();
        for (const gid of selectedGroups) {
          for (const n of countriesByGroupId.get(gid) ?? []) countryNames.add(n);
        }
        countryIds = countriesFromDb.filter((c) => countryNames.has(c.nombre)).map((c) => c.id);
      }
      const { data: newGroup, error: insertError } = await supabase
        .from("groups")
        .insert({ nombre: trimmedGroupName, descripcion: createGroupDescripcion.trim() || null })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      if (!newGroup) throw new Error("Group not created");
      if (countryIds.length > 0) {
        const { error: cgError } = await supabase
          .from("country_groups")
          .insert(countryIds.map((cid) => ({ country_id: cid, group_id: newGroup.id })));
        if (cgError) throw new Error(cgError.message);
      }
      const msg = createGroupSource === "countries"
        ? `Group "${trimmedGroupName}" created with ${countryIds.length} countries`
        : `Group "${trimmedGroupName}" created combining ${selectedGroups.size} groups (${countryIds.length} countries)`;
      toast.success(msg);
      setCreateGroupDialogOpen(false);
      setCreateGroupNombre("");
      setCreateGroupDescripcion("");
      if (createGroupSource === "groups") {
        setSelectedGroups(new Set([newGroup.id]));
      }
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating group");
    } finally {
      setCreateGroupSaving(false);
    }
  };

  const filteredCountries = useMemo(() => {
    const q = countriesSearch.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter((c) => c.toLowerCase().includes(q));
  }, [allCountries, countriesSearch]);

  const groupsWithCount = useMemo(() => {
    return groupsFromDb.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      count: (countriesByGroupId.get(g.id) ?? []).length,
    }));
  }, [groupsFromDb, countriesByGroupId]);

  const filteredGroups = useMemo(() => {
    const q = groupsSearch.trim().toLowerCase();
    if (!q) return groupsWithCount;
    return groupsWithCount.filter((g) => g.nombre.toLowerCase().includes(q));
  }, [groupsWithCount, groupsSearch]);

  const effectiveCountryFilter = useMemo(() => {
    if (filterMode === "groups") {
      const names = new Set<string>();
      for (const gid of selectedGroups) {
        for (const n of countriesByGroupId.get(gid) ?? []) names.add(n);
      }
      return names;
    }
    return selectedCountries;
  }, [filterMode, selectedGroups, countriesByGroupId, selectedCountries]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const selectAllGroups = () => {
    const list = filteredGroups;
    const allSelected = list.length > 0 && list.every((g) => selectedGroups.has(g.id));
    if (allSelected) {
      setSelectedGroups((prev) => {
        const next = new Set(prev);
        for (const g of list) next.delete(g.id);
        return next;
      });
    } else {
      setSelectedGroups((prev) => new Set([...prev, ...list.map((g) => g.id)]));
    }
  };

  const handleFilterModeChange = (value: string) => {
    if (value !== "countries" && value !== "groups") return;
    if (value === filterMode) return;
    if (value === "groups") {
      const groupsToSelect = new Set<string>();
      for (const g of groupsWithCount) {
        const groupCountries = countriesByGroupId.get(g.id) ?? [];
        if (groupCountries.length > 0 && groupCountries.every((c) => selectedCountries.has(c))) {
          groupsToSelect.add(g.id);
        }
      }
      setSelectedGroups(groupsToSelect);
    } else {
      const countryNames = new Set<string>();
      for (const gid of selectedGroups) {
        for (const n of countriesByGroupId.get(gid) ?? []) countryNames.add(n);
      }
      setSelectedCountries(countryNames);
    }
    setFilterMode(value);
  };

  const columnOptions = useMemo(
    () =>
      vendorsForQuotationColumnPicker.flatMap((v) =>
        RATE_TYPES.map((t) => ({ vendor: v, rateType: t, key: `${v.id}\t${t}` }))
      ),
    [vendorsForQuotationColumnPicker]
  );

  const filteredColumnOptions = useMemo(() => {
    const q = columnsSearch.trim().toLowerCase();
    if (!q) return columnOptions;
    return columnOptions.filter(
      (opt) =>
        opt.vendor.nombre.toLowerCase().includes(q) ||
        opt.rateType.toLowerCase().includes(q)
    );
  }, [columnOptions, columnsSearch]);

  const selectedColumnsList = useMemo(
    () =>
      columnOptions
        .filter((opt) => selectedColumnPairs.has(opt.key))
        .map((opt) => ({ vendor: opt.vendor, rateType: opt.rateType })),
    [columnOptions, selectedColumnPairs]
  );

  const columnsGroupedByVendor = useMemo(() => {
    const map = new Map<string, { vendor: Vendor; rateTypes: string[] }>();
    for (const col of selectedColumnsList) {
      const existing = map.get(col.vendor.id);
      if (existing) {
        if (!existing.rateTypes.includes(col.rateType)) existing.rateTypes.push(col.rateType);
      } else {
        map.set(col.vendor.id, { vendor: col.vendor, rateTypes: [col.rateType] });
      }
    }
    return Array.from(map.values());
  }, [selectedColumnsList]);

  const selectedColumnsSig = useMemo(
    () => selectedColumnsList.map((c) => `${c.vendor.id}\t${c.rateType}`).sort().join("|"),
    [selectedColumnsList],
  );

  useEffect(() => {
    setQuotationTableSort(null);
  }, [selectedColumnsSig]);

  const applyFeesToRate = (rate: number): number => {
    if (!appliedFees) return rate;
    let r = rate;
    const p = appliedFees.psfFee;
    if (p && p.value !== 0) {
      r = p.mode === "percentage" ? r * (1 + p.value / 100) : r + p.value;
    }
    return r;
  };

  const selectedVendorIdsForFetch = useMemo(() => {
    const ids = new Set<string>();
    for (const key of selectedColumnPairs) {
      const [vendorId] = key.split("\t");
      if (vendorId) ids.add(vendorId);
    }
    return ids;
  }, [selectedColumnPairs]);

  const getUploadIdsForRates = useMemo(() => {
    const vendorList =
      selectedVendorIdsForFetch.size > 0
        ? vendorsWithUploadRaw.filter((v) => selectedVendorIdsForFetch.has(v.id))
        : vendorsWithUploadRaw;
    return uploads
      .filter((u) => u.vendor_id && vendorList.some((v) => v.id === u.vendor_id))
      .map((u) => u.id);
  }, [uploads, selectedVendorIdsForFetch, vendorsWithUploadRaw]);

  const fetchRatesRequestId = useRef(0);
  const fetchRates = React.useCallback(async () => {
    const uploadIds = getUploadIdsForRates;
    if (uploadIds.length === 0) {
      setRates([]);
      setTotalCountries(0);
      return;
    }
    if (effectiveCountryFilter.size === 0) {
      setRates([]);
      setTotalCountries(0);
      return;
    }
    const id = ++fetchRatesRequestId.current;
    setRatesLoading(true);
    try {
      const countryFilterArr =
        effectiveCountryFilter.size > 0 ? Array.from(effectiveCountryFilter) : null;
      const searchVal = debouncedSearch.trim() || null;

      const rpcOpts = {
        p_upload_ids: uploadIds,
        p_country_filter: countryFilterArr,
        p_search: searchVal,
        p_search_by: searchBy,
      };

      // Run sequentially when searching by type to avoid timeout (both queries are heavy)
      let countData: unknown;
      let ratesData: unknown;
      let countErr: { message: string } | null = null;
      let ratesErr: { message: string } | null = null;

      if (searchBy === "type") {
        const countRes = await supabase.rpc("get_quotation_countries_count", rpcOpts);
        countData = countRes.data;
        countErr = countRes.error;
        if (id !== fetchRatesRequestId.current) return;
        if (countErr) throw new Error(countErr.message);
        const ratesRes = await supabase.rpc("get_quotation_rates_page", {
          ...rpcOpts,
          p_limit: pageSize,
          p_offset: (page - 1) * pageSize,
        });
        ratesData = ratesRes.data;
        ratesErr = ratesRes.error;
      } else {
        const [countRes, ratesRes] = await Promise.all([
          supabase.rpc("get_quotation_countries_count", rpcOpts),
          supabase.rpc("get_quotation_rates_page", {
            ...rpcOpts,
            p_limit: pageSize,
            p_offset: (page - 1) * pageSize,
          }),
        ]);
        countData = countRes.data;
        countErr = countRes.error;
        ratesData = ratesRes.data;
        ratesErr = ratesRes.error;
      }

      if (id !== fetchRatesRequestId.current) return;
      if (countErr) throw new Error(countErr.message);
      if (ratesErr) throw new Error(ratesErr.message);

      setTotalCountries(Number(countData ?? 0));
      setRates((ratesData ?? []) as AggregatedRateRow[]);
    } catch (err) {
      if (id !== fetchRatesRequestId.current) return;
      setError(err instanceof Error ? err.message : "Error loading rates");
      setRates([]);
      setTotalCountries(0);
    } finally {
      if (id === fetchRatesRequestId.current) setRatesLoading(false);
    }
  }, [
    getUploadIdsForRates,
    effectiveCountryFilter,
    debouncedSearch,
    searchBy,
    page,
    pageSize,
  ]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!editQuotationId) return;
    let cancelled = false;
    (async () => {
      const { data, error: fetchErr } = await supabase
        .from("saved_quotations")
        .select("id, name, vendor_ids, client_id, status, snapshot")
        .eq("id", editQuotationId)
        .single();
      if (cancelled) return;
      if (fetchErr || !data) {
        setError(fetchErr?.message ?? "Quotation not found");
        setLoading(false);
        return;
      }
      const q = data as unknown as SavedQuotation;
      setEditQuotation(q);
      const snap = q.snapshot;
      setSaveName(q.name ?? "");
      setSaveClientId(q.client_id ?? "__none__");
      const uniqueCountries = [...new Set((snap.rows ?? []).map((r) => r.country))];
      setSelectedCountries(new Set(uniqueCountries));
      if (snap.psfFee) {
        setPsfFeeInput(String(snap.psfFee.value));
        setPsfFeeMode(snap.psfFee.mode);
      }
      setAppliedFees({ psfFee: snap.psfFee ?? null });
      if (snap.displayColumns?.length) {
        setSelectedColumnPairs(new Set(snap.displayColumns.map((c: { vendorId: string; rateType: string }) => `${c.vendorId}\t${c.rateType}`)));
      } else {
        const legacyVendors = snap.vendors ?? [];
        const legacyTypes = (snap.displayRateTypes ?? snap.rateTypes ?? RATE_TYPES) as readonly string[];
        if (legacyVendors.length > 0 && legacyTypes.length > 0) {
          setSelectedColumnPairs(
            new Set(legacyVendors.flatMap((v: { id: string }) => legacyTypes.map((t) => `${v.id}\t${t}`)))
          );
        }
      }
      setTotalCountries((snap.rows ?? []).length);
      setHasApplied(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [editQuotationId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [effectiveCountryFilter, debouncedSearch, searchBy, selectedColumnPairs]);

  useEffect(() => {
    if (editQuotationId || !hasApplied) return;
    if (!loading && uploads.length > 0) {
      fetchRates();
    }
  }, [loading, uploads.length, fetchRates, editQuotationId, hasApplied]);

  const toggleCountry = (country: string) => {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  };

  const toggleColumnPair = (key: string) => {
    setSelectedColumnPairs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllColumns = () => {
    const list = filteredColumnOptions;
    const allSelected = list.length > 0 && list.every((opt) => selectedColumnPairs.has(opt.key));
    if (allSelected) {
      setSelectedColumnPairs((prev) => {
        const next = new Set(prev);
        for (const opt of list) next.delete(opt.key);
        return next;
      });
    } else {
      setSelectedColumnPairs((prev) => new Set([...prev, ...list.map((opt) => opt.key)]));
    }
  };

  const selectAllCountries = () => {
    const list = filteredCountries;
    const allSelected = list.length > 0 && list.every((c) => selectedCountries.has(c));
    if (allSelected) {
      setSelectedCountries((prev) => {
        const next = new Set(prev);
        for (const c of list) next.delete(c);
        return next;
      });
    } else {
      setSelectedCountries((prev) => new Set([...prev, ...list]));
    }
  };

  const handleApply = () => {
    const psfVal = parseFloat(psfFeeInput.replace(",", "."));
    const hasPsf = !Number.isNaN(psfVal);
    if (selectedColumnPairs.size === 0 || effectiveCountryFilter.size === 0) {
      toast.error("Select at least one country (or group) and one vendor-rate comparison");
      return;
    }
    setAppliedFees({
      psfFee: hasPsf ? { value: psfVal, mode: psfFeeMode } : null,
    });
    setHasApplied(true);
    setPage(1);
  };

  const handleFeeInputChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const v = e.target.value;
    if (v === "" || /^-?\d*\.?\d*$/.test(v)) setter(v);
  };

  const buildTableRowsFromAggregated = (
    r: AggregatedRateRow[],
    countryFilter: Set<string>,
    vendorList: Vendor[],
  ) => {
    const countryFilterLower = new Set([...countryFilter].map((c) => c.trim().toLowerCase()));
    const countryMatches = (country: string) =>
      countryFilter.size === 0 ? true : countryFilterLower.has(country?.trim().toLowerCase());
    const keyToRow = new Map<
      string,
      { country: string; network: string; prefixKey: string; maxRate: number; fromMasterList: boolean; byVendor: Map<string, Partial<Record<RateType, VendorCellByType>>> }
    >();
    for (const row of r) {
      if (!countryMatches(row.country)) continue;
      const u = uploadById.get(row.upload_id);
      if (!u?.vendor_id || !vendorList.some((v) => v.id === u.vendor_id)) continue;
      const rateType = getRateType(row.rate_type ?? null);
      const network = (row.network ?? "").trim() || "Unknown";
      const prefixKey = [...new Set((row.prefixes ?? []).map((p) => p.trim()).filter(Boolean))].sort().join("|");
      const rowKey = `${row.country}\t${network}\t${prefixKey || "_empty"}`;
      if (!keyToRow.has(rowKey))
        keyToRow.set(rowKey, {
          country: row.country,
          network,
          prefixKey,
          maxRate: row.rate,
          fromMasterList: row.from_master_list !== false,
          byVendor: new Map(),
        });
      const tr = keyToRow.get(rowKey)!;
      if (row.rate > tr.maxRate) tr.maxRate = row.rate;
      if (row.from_master_list === false) tr.fromMasterList = false;
      if (!tr.byVendor.has(u.vendor_id)) tr.byVendor.set(u.vendor_id, {});
      const byType = tr.byVendor.get(u.vendor_id)!;
      if (!byType[rateType]) byType[rateType] = { prefixes: [], rate: 0 };
      const cell = byType[rateType]!;
      cell.prefixes = [...new Set([...cell.prefixes, ...(row.prefixes ?? [])])];
      if (row.rate > cell.rate) cell.rate = row.rate;
    }
    const list = Array.from(keyToRow.values()).filter((row) => row.byVendor.size > 0);
    list.sort((a, b) => a.country.localeCompare(b.country) || a.network.localeCompare(b.network) || a.maxRate - b.maxRate);
    const networkLabel = new Map<string, string>();
    const seenPerCountry = new Map<string, Map<string, number>>();
    for (const row of list) {
      const m = seenPerCountry.get(row.country) ?? new Map();
      const count = (m.get(`${row.network}\t${row.prefixKey}`) ?? 0) + 1;
      m.set(`${row.network}\t${row.prefixKey}`, count);
      seenPerCountry.set(row.country, m);
      networkLabel.set(`${row.country}\t${row.network}\t${row.prefixKey}`, count === 1 ? row.network : `${row.network} ${count}`);
    }
    return list.map((row) => ({
      ...row,
      rate: row.maxRate,
      networkLabel: networkLabel.get(`${row.country}\t${row.network}\t${row.prefixKey}`) ?? row.network,
      fromMasterList: row.fromMasterList,
    }));
  };

  interface VendorCellByType {
    prefixes: string[];
    rate: number;
    ratePlusExtra?: number | null;
  }

  const buildTableRowsFromSnapshot = (
    snapshot: SavedQuotation["snapshot"],
    searchQ: string,
    searchByMode: "country" | "prefix" | "type"
  ): { country: string; networkLabel: string; byVendor: Map<string, Partial<Record<RateType, VendorCellByType>>> }[] => {
    const rateTypes = (snapshot.rateTypes ?? RATE_TYPES) as readonly string[];
    const rows = snapshot.rows ?? [];
    const list = rows.map((row) => {
      const networkLabel = (row.lineType ?? row.type ?? "special").toString();
      const byVendor = new Map<string, Partial<Record<RateType, VendorCellByType>>>();
      for (const [vendorId, vendorCells] of Object.entries(row.byVendor ?? {})) {
        const cell = vendorCells as
          | Record<string, { prefixes: string[]; rate: number; ratePlusExtra: number | null }>
          | { prefixes?: string[]; rate?: number; ratePlusExtra?: number | null };
        const hasMulti = cell && (cell["International"] !== undefined || (cell as Record<string, unknown>)["mobile"] !== undefined);
        const byType: Partial<Record<RateType, VendorCellByType>> = {};
        if (hasMulti && typeof cell === "object") {
          for (const t of rateTypes) {
            const c = (cell as Record<string, { prefixes?: string[]; rate?: number; ratePlusExtra?: number | null }>)[t];
            if (c) {
              const rt = getRateType(t);
              byType[rt] = { prefixes: c.prefixes ?? [], rate: c.rate ?? 0, ratePlusExtra: c.ratePlusExtra ?? undefined };
            }
          }
        } else {
          const leg = cell as { prefixes?: string[]; rate?: number; ratePlusExtra?: number | null };
          byType["International" as RateType] = {
            prefixes: leg?.prefixes ?? [],
            rate: leg?.rate ?? 0,
            ratePlusExtra: leg?.ratePlusExtra ?? undefined,
          };
        }
        if (Object.keys(byType).length > 0) byVendor.set(vendorId, byType);
      }
      return { country: row.country, networkLabel, byVendor, fromMasterList: true as boolean };
    });
    let filtered = list.filter((row) => row.byVendor.size > 0);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      filtered = filtered.filter((x) => {
        if (searchByMode === "country") return x.country.toLowerCase().includes(q);
        if (searchByMode === "type") return x.networkLabel.toLowerCase().includes(q);
        if (searchByMode === "prefix") {
          const prefixes = getAllPrefixesForRow(x);
          return prefixes.some((p) => p.toLowerCase().includes(q));
        }
        return true;
      });
    }
    filtered.sort((a, b) => a.country.localeCompare(b.country) || a.networkLabel.localeCompare(b.networkLabel));
    return filtered;
  };

  const fetchAllRatesForExport = async () => {
    if (editQuotation) {
      return buildTableRowsFromSnapshot(editQuotation.snapshot, search.toLowerCase().trim(), searchBy);
    }
    const uploadIds = getUploadIdsForRates;
    if (uploadIds.length === 0) return [];
      const vendorList =
      selectedVendorIdsForFetch.size > 0
        ? vendorsWithUploadRaw.filter((v) => selectedVendorIdsForFetch.has(v.id))
        : vendorsWithUploadRaw;
    const countryFilterArr =
      effectiveCountryFilter.size > 0 ? Array.from(effectiveCountryFilter) : null;
    const searchVal = debouncedSearch.trim() || null;
    let allAggregated: AggregatedRateRow[] = [];
    const pages = Math.ceil(totalCountries / pageSize) || 1;
    for (let i = 0; i < pages; i++) {
      const { data } = await supabase.rpc("get_quotation_rates_page", {
        p_upload_ids: uploadIds,
        p_country_filter: countryFilterArr,
        p_search: searchVal,
        p_limit: pageSize,
        p_offset: i * pageSize,
        p_search_by: searchBy,
      });
      allAggregated = allAggregated.concat((data ?? []) as AggregatedRateRow[]);
    }
    return buildTableRowsFromAggregated(allAggregated, effectiveCountryFilter, vendorList);
  };

  const handleExportXlsx = async () => {
    if (selectedColumnsList.length === 0 || totalCountries === 0) return;
    setExportingOrSaving(true);
    toast.info("Preparing export…");
    try {
      const rowsToExport = await fetchAllRatesForExport();
      if (rowsToExport.length === 0) {
        toast.error("No data to export");
        return;
      }
      const effectiveDate =
        editQuotation?.snapshot?.effectiveDate ?? QUOTATION_DEFAULTS.getEffectiveDate();
      const initialIncrement =
        editQuotation?.snapshot?.initialIncrement ?? QUOTATION_DEFAULTS.initialIncrement;
      const nextIncrement =
        editQuotation?.snapshot?.nextIncrement ?? QUOTATION_DEFAULTS.nextIncrement;

      const headerRow = [...QUOTATION_EXPORT_HEADERS];

      const dataRows = rowsToExport.map((row) => {
        const rowKey = getRowKey(row);
        const { vendorId: bestVendorId, rateType: bestRateType } = getBestVendorAndRateForRow(row);
        const bestKey = bestVendorId && bestRateType ? `${bestVendorId}\t${bestRateType}` : "";
        const selectedKey = selectedColumnKeyPerRow[rowKey] ?? bestKey ?? "";
        const selectedRate = selectedKey ? getRateForColumnKey(row, selectedKey) : null;
        const psfAmount = selectedRate != null ? getPsfAmount(selectedRate) : null;
        const cost =
          selectedRate != null && psfAmount != null ? selectedRate + psfAmount : null;
        const rawSellRate = sellRatePerRow[rowKey];
        const effectiveSellRate =
          cost != null
            ? (() => {
                if (rawSellRate !== undefined && rawSellRate !== "") {
                  const n = parseFloat(rawSellRate.replace(",", "."));
                  if (!Number.isNaN(n)) return n;
                }
                return cost;
              })()
            : null;
        const network = row.networkLabel ?? "";
        return [
          row.country,
          network,
          effectiveSellRate != null ? roundUpTo3Decimals(effectiveSellRate) : "",
          effectiveDate,
          initialIncrement,
          nextIncrement,
        ];
      });
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Quotation");
      XLSX.writeFile(wb, `quotation-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Exported as XLSX");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingOrSaving(false);
    }
  };

  const saveDialogFilteredClients = useMemo(() => {
    const q = saveClientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, saveClientSearch]);

  const selectedSaveClientName = useMemo(() => {
    if (saveClientId === "__none__") return null;
    return clients.find((c) => c.id === saveClientId)?.name ?? null;
  }, [clients, saveClientId]);

  const handleCreateClientFromSaveSearch = async () => {
    const name = saveClientSearch.trim();
    if (!name) return;
    setCreatingClientInline(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name, description: null })
        .select("id, name")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data) return;
      const row = data as { id: string; name: string };
      setClients((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setSaveClientId(row.id);
      setSaveClientSearch("");
      setSaveClientPickerOpen(false);
      toast.success(`Client "${row.name}" added`);
    } finally {
      setCreatingClientInline(false);
    }
  };

  const handleSaveQuotation = async () => {
    if (selectedColumnsList.length === 0 || totalCountries === 0) return;
    setSaving(true);
    setExportingOrSaving(true);
    toast.info("Preparing save…");
    const clientIdToUse =
      saveClientId === "__none__" || !saveClientId.trim() ? null : saveClientId;
    try {
      if (editQuotationId && editQuotation) {
        const snap = editQuotation.snapshot;
        const rows = (snap.rows ?? []).map((row) => {
          const rateTypes = (snap.rateTypes ?? RATE_TYPES) as readonly string[];
          const byVendor: Record<string, Record<string, { prefixes: string[]; rate: number; ratePlusExtra: number | null }>> = {};
          for (const [vendorId, vendorCells] of Object.entries(row.byVendor ?? {})) {
            const cell = vendorCells as Record<string, { prefixes?: string[]; rate?: number; ratePlusExtra?: number | null }>;
            const hasMulti = rateTypes.some((t) => cell[t] != null);
            if (hasMulti) {
              byVendor[vendorId] = {};
              for (const t of rateTypes) {
                const c = cell[t];
                if (c) {
                  const baseRate = roundUpTo3Decimals(c.rate ?? 0);
                  byVendor[vendorId][t] = {
                    prefixes: c.prefixes ?? [],
                    rate: baseRate,
                    ratePlusExtra: appliedFees ? roundUpTo3Decimals(applyFeesToRate(baseRate)) : null,
                  };
                }
              }
            } else {
              const leg = cell as { prefixes?: string[]; rate?: number };
              const baseRate = roundUpTo3Decimals(leg?.rate ?? 0);
              byVendor[vendorId] = {
                International: {
                  prefixes: leg?.prefixes ?? [],
                  rate: baseRate,
                  ratePlusExtra: appliedFees ? roundUpTo3Decimals(applyFeesToRate(baseRate)) : null,
                },
              };
            }
          }
          return { ...row, byVendor };
        });
        const { extra: _extra, marginFee: _oldMargin, ...snapRest } = snap;
        const snapshot = {
          ...snapRest,
          rows,
          displayColumns: selectedColumnsList.map((c) => ({ vendorId: c.vendor.id, rateType: c.rateType })),
          effectiveDate: snap.effectiveDate ?? QUOTATION_DEFAULTS.getEffectiveDate(),
          initialIncrement: snap.initialIncrement ?? QUOTATION_DEFAULTS.initialIncrement,
          nextIncrement: snap.nextIncrement ?? QUOTATION_DEFAULTS.nextIncrement,
          ...(appliedFees?.psfFee ? { psfFee: appliedFees.psfFee } : {}),
        };
        const { error } = await supabase
          .from("saved_quotations")
          .update({
            name: saveName.trim() || null,
            vendor_ids: editQuotation.vendor_ids,
            snapshot,
            client_id: clientIdToUse,
          })
          .eq("id", editQuotationId);
        if (error) throw error;
        setSaveDialogOpen(false);
        setSaveClientSearch("");
        toast.success("Quotation updated");
        onSaved?.();
        return;
      }
      const rowsToSave = await fetchAllRatesForExport();
      if (rowsToSave.length === 0) {
        toast.error("No data to save");
        return;
      }
      const snapshot = {
        vendors: selectedVendorsList.map((v) => ({ id: v.id, nombre: v.nombre })),
        rateTypes: [...RATE_TYPES],
        displayColumns: selectedColumnsList.map((c) => ({ vendorId: c.vendor.id, rateType: c.rateType })),
        effectiveDate: QUOTATION_DEFAULTS.getEffectiveDate(),
        initialIncrement: QUOTATION_DEFAULTS.initialIncrement,
        nextIncrement: QUOTATION_DEFAULTS.nextIncrement,
        ...(appliedFees?.psfFee ? { psfFee: appliedFees.psfFee } : {}),
        rows: rowsToSave.map((row) => ({
          country: row.country,
          lineType: row.networkLabel,
          byVendor: Object.fromEntries(
            Array.from(row.byVendor.entries()).map(([vendorId, byType]) => {
              const cells: Record<string, { prefixes: string[]; rate: number; ratePlusExtra: number | null }> = {};
              for (const t of RATE_TYPES) {
                const cell = byType[t];
                if (cell) {
                  cells[t] = {
                    prefixes: cell.prefixes,
                    rate: roundUpTo3Decimals(cell.rate),
                    ratePlusExtra: appliedFees ? roundUpTo3Decimals(applyFeesToRate(cell.rate)) : null,
                  };
                }
              }
              return [vendorId, cells];
            })
          ),
        })),
      };
      const { error } = await supabase.from("saved_quotations").insert({
        name: saveName.trim() || null,
        vendor_ids: selectedVendorsList.map((v) => v.id),
        snapshot,
        client_id: clientIdToUse,
        status: "active",
      });
      if (error) throw error;
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveClientId(clientIdToUse ?? "__none__");
      setSaveClientSearch("");
      toast.success("Quotation saved");
      onSaved?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error saving");
    } finally {
      setSaving(false);
      setExportingOrSaving(false);
    }
  };

  type RowByVendorMap = Map<string, Partial<Record<RateType, VendorCellByType>>>;

  const selectedVendorsList = useMemo(
    () =>
      editQuotation?.snapshot?.vendors?.length
        ? (editQuotation.snapshot.vendors as Vendor[])
        : (() => {
            const vendorIds = new Set(selectedColumnsList.map((c) => c.vendor.id));
            return vendorsWithUploadRaw.filter((v) => vendorIds.has(v.id));
          })(),
    [editQuotation, selectedColumnsList, vendorsWithUploadRaw]
  );

  const vendorListForTable = useMemo(
    () =>
      editQuotation?.snapshot?.vendors?.length
        ? (editQuotation.snapshot.vendors as Vendor[])
        : selectedVendorsList.length > 0
          ? selectedVendorsList
          : vendorsWithUploadRaw,
    [editQuotation, selectedVendorsList, vendorsWithUploadRaw]
  );

  const tableRows = useMemo(
    () =>
      editQuotation?.snapshot?.rows?.length
        ? buildTableRowsFromSnapshot(editQuotation.snapshot, search.toLowerCase().trim(), searchBy)
        : buildTableRowsFromAggregated(rates, effectiveCountryFilter, vendorListForTable),
    [editQuotation, rates, effectiveCountryFilter, vendorListForTable, search, searchBy, uploadById]
  );

  const totalPages = Math.max(1, Math.ceil(totalCountries / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  /** Best = vendor + rate type with lowest rate among all selected columns. */
  const getBestVendorAndRateForRow = useCallback(
    (
      row: { country: string; networkLabel: string; byVendor: RowByVendorMap }
    ): { vendorId: string | null; rateType: string | null; rate: number | null; vendorName: string | null } => {
      let bestVendorId: string | null = null;
      let bestRateType: string | null = null;
      let bestRate: number | null = null;
      let bestVendorName: string | null = null;
      for (const col of selectedColumnsList) {
        const byType = row.byVendor.get(col.vendor.id);
        const rate = byType?.[col.rateType]?.rate;
        if (rate == null || rate < 0) continue;
        if (bestRate == null || rate < bestRate) {
          bestRate = rate;
          bestVendorId = col.vendor.id;
          bestRateType = col.rateType;
          bestVendorName = col.vendor.nombre;
        }
      }
      return { vendorId: bestVendorId, rateType: bestRateType, rate: bestRate, vendorName: bestVendorName };
    },
    [selectedColumnsList]
  );

  const getRateForColumnKey = useCallback(
    (row: { country: string; networkLabel: string; byVendor: RowByVendorMap }, key: string): number | null => {
      const [vendorId, rateType] = key.split("\t");
      if (!vendorId || !rateType) return null;
      const byType = row.byVendor.get(vendorId);
      const rate = byType?.[rateType]?.rate;
      return rate != null && rate >= 0 ? rate : null;
    },
    []
  );

  const getPsfAmount = (rate: number): number => {
    if (!appliedFees?.psfFee || appliedFees.psfFee.value === 0) return 0;
    const p = appliedFees.psfFee;
    return p.mode === "percentage" ? rate * (p.value / 100) : p.value;
  };

  const getRowKey = (row: { country: string; networkLabel: string }) => `${row.country}\t${row.networkLabel}`;

  const getAllPrefixesForRow = (row: { byVendor: Map<string, Partial<Record<RateType, VendorCellByType>>> }): string[] => {
    const all = new Set<string>();
    for (const byType of row.byVendor.values()) {
      for (const cell of Object.values(byType)) {
        if (cell?.prefixes) for (const p of cell.prefixes) all.add(p);
      }
    }
    return [...all].sort();
  };

  type QuotationTableRow = (typeof tableRows)[number];

  const compareQuotationRows = useCallback(
    (a: QuotationTableRow, b: QuotationTableRow, key: string): number => {
      if (key === "country") return compareText(a.country, b.country);
      if (key === "network") return compareText(a.networkLabel, b.networkLabel);
      if (key === "prefix")
        return compareText(getAllPrefixesForRow(a).join("\u0001"), getAllPrefixesForRow(b).join("\u0001"));
      const ratePrefix = "rate:\t";
      if (key.startsWith(ratePrefix)) {
        const rest = key.slice(ratePrefix.length);
        const tab = rest.indexOf("\t");
        const vendorId = tab >= 0 ? rest.slice(0, tab) : rest;
        const rateType = tab >= 0 ? rest.slice(tab + 1) : "";
        const ra = a.byVendor.get(vendorId)?.[rateType as RateType]?.rate;
        const rb = b.byVendor.get(vendorId)?.[rateType as RateType]?.rate;
        const na = ra != null && ra >= 0 ? ra : null;
        const nb = rb != null && rb >= 0 ? rb : null;
        return compareNumber(na, nb);
      }

      const derive = (row: QuotationTableRow) => {
        const rk = getRowKey(row);
        const best = getBestVendorAndRateForRow(row);
        const bestKey = best.vendorId && best.rateType ? `${best.vendorId}\t${best.rateType}` : "";
        const selectedKey = selectedColumnKeyPerRow[rk] ?? bestKey ?? "";
        const selectedRate = selectedKey ? getRateForColumnKey(row, selectedKey) : null;
        const psfAmount = selectedRate != null ? getPsfAmount(selectedRate) : null;
        const cost = selectedRate != null && psfAmount != null ? selectedRate + psfAmount : null;
        const rawSellRate = sellRatePerRow[rk];
        const effectiveSellRate =
          cost != null
            ? (() => {
                if (rawSellRate !== undefined && rawSellRate !== "") {
                  const n = parseFloat(rawSellRate.replace(",", "."));
                  if (!Number.isNaN(n)) return n;
                }
                return cost;
              })()
            : null;
        const netMargin =
          effectiveSellRate != null && cost != null ? effectiveSellRate - cost : null;
        const marginOnCostPct =
          netMargin != null && cost != null && cost > 0 ? (netMargin / cost) * 100 : null;
        const lcrLabel = best.vendorName && best.rateType ? `${best.vendorName} - ${best.rateType}` : "";
        let selectedLabel = "";
        if (selectedKey) {
          const tabI = selectedKey.indexOf("\t");
          const vid = tabI >= 0 ? selectedKey.slice(0, tabI) : "";
          const rt = tabI >= 0 ? selectedKey.slice(tabI + 1) : "";
          const v = vendorListForTable.find((x) => x.id === vid);
          selectedLabel = v && rt ? `${v.nombre} - ${rt}` : selectedKey;
        }
        return {
          lcrLabel,
          lcrRate: best.rate,
          selectedLabel,
          selectedRate,
          psfAmount,
          cost,
          netMargin,
          marginOnCostPct,
          effectiveSellRate,
        };
      };

      const da = derive(a);
      const db = derive(b);
      if (key === "lcrVendor") return compareText(da.lcrLabel, db.lcrLabel);
      if (key === "lcrRate") return compareNumber(da.lcrRate, db.lcrRate);
      if (key === "selVendor") return compareText(da.selectedLabel, db.selectedLabel);
      if (key === "selRate") return compareNumber(da.selectedRate, db.selectedRate);
      if (key === "psf") return compareNumber(da.psfAmount, db.psfAmount);
      if (key === "cost") return compareNumber(da.cost, db.cost);
      if (key === "margin") return compareNumber(da.netMargin, db.netMargin);
      if (key === "marginPct") return compareNumber(da.marginOnCostPct, db.marginOnCostPct);
      if (key === "sellRate") return compareNumber(da.effectiveSellRate, db.effectiveSellRate);
      return 0;
    },
    [
      getAllPrefixesForRow,
      getRowKey,
      getBestVendorAndRateForRow,
      getRateForColumnKey,
      selectedColumnKeyPerRow,
      sellRatePerRow,
      appliedFees,
      vendorListForTable,
    ],
  );

  const displayQuotationRows = useMemo(() => {
    if (!quotationTableSort) return tableRows;
    const { key, dir } = quotationTableSort;
    const m = dir === "asc" ? 1 : -1;
    return [...tableRows].sort((a, b) => compareQuotationRows(a, b, key) * m);
  }, [tableRows, quotationTableSort, compareQuotationRows]);

  const useQuotationCountryRowSpan = quotationTableSort === null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm rounded-2xl border border-border bg-card">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-border bg-card border-destructive/50 bg-destructive/5">
        <p className="text-sm text-destructive font-medium">Error</p>
        <p className="text-xs text-muted-foreground text-center max-w-md px-4">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchData}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 bg-muted/20 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Configure quotation</span>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex items-center gap-3 pr-6 border-r border-border">
            <div className="w-[160px] shrink-0">
            <Popover
              open={countriesOpen}
              onOpenChange={(open) => {
                setCountriesOpen(open);
                if (open) {
                  setColumnsOpen(false);
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal"
                  size="sm"
                  style={{ height: "32px" }}
                >
                  <span className="text-muted-foreground">
                    {effectiveCountryFilter.size === 0
                      ? `Select ${filterMode === "countries" ? "countries" : "groups"}`
                      : `${effectiveCountryFilter.size} country(ies)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[240px] min-w-[200px] p-0 border-border" sideOffset={4}>
                <div className="p-3 space-y-2">
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleFilterModeChange("countries")}
                      className={`flex-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                        filterMode === "countries" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Countries
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFilterModeChange("groups")}
                      className={`flex-1 px-2.5 py-1 text-xs font-medium transition-colors border-l border-border ${
                        filterMode === "groups" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Groups
                    </button>
                  </div>

                  {filterMode === "countries" ? (
                    <>
                      {selectedCountries.size >= 2 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2 h-8 min-h-8 text-xs min-w-0 overflow-hidden py-2"
                          onClick={() => {
                            setCreateGroupSource("countries");
                            setCreateGroupNombre("");
                            setCreateGroupDescripcion("");
                            setCreateGroupDialogOpen(true);
                          }}
                        >
                          <FolderPlus className="w-3.5 h-3.5 shrink-0 flex-shrink-0" />
                          <span className="min-w-0 text-left break-words">Create group (+{selectedCountries.size})</span>
                        </Button>
                      )}
                      <input
                        type="text"
                        placeholder="Search countries…"
                        value={countriesSearch}
                        onChange={(e) => setCountriesSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-2 border-t border-border pt-2 mt-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={filteredCountries.length > 0 && filteredCountries.every((c) => selectedCountries.has(c))}
                            onCheckedChange={selectAllCountries}
                          />
                          <span className="text-muted-foreground">All</span>
                        </label>
                        {filteredCountries.map((c) => (
                          <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={selectedCountries.has(c)}
                              onCheckedChange={() => toggleCountry(c)}
                            />
                            {c}
                          </label>
                        ))}
                        {filteredCountries.length === 0 && (
                          <p className="text-xs text-muted-foreground">{countriesSearch ? "No matches." : "No country data. Add countries in Countries."}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {selectedGroups.size >= 2 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2 h-8 min-h-8 text-xs min-w-0 overflow-hidden py-2"
                          onClick={() => {
                            setCreateGroupSource("groups");
                            setCreateGroupNombre("");
                            setCreateGroupDescripcion("");
                            setCreateGroupDialogOpen(true);
                          }}
                        >
                          <FolderPlus className="w-3.5 h-3.5 shrink-0 flex-shrink-0" />
                          <span className="min-w-0 text-left break-words">Combine groups (+{effectiveCountryFilter.size})</span>
                        </Button>
                      )}
                      <input
                        type="text"
                        placeholder="Search groups…"
                        value={groupsSearch}
                        onChange={(e) => setGroupsSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-2 border-t border-border pt-2 mt-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={filteredGroups.length > 0 && filteredGroups.every((g) => selectedGroups.has(g.id))}
                            onCheckedChange={selectAllGroups}
                          />
                          <span className="text-muted-foreground">All</span>
                        </label>
                        {filteredGroups.map((g) => (
                          <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={selectedGroups.has(g.id)}
                              onCheckedChange={() => toggleGroup(g.id)}
                            />
                            {g.nombre} ({g.count})
                          </label>
                        ))}
                        {filteredGroups.length === 0 && (
                          <p className="text-xs text-muted-foreground">{groupsSearch ? "No matches." : "No groups. Create groups in Countries."}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            </div>
            <div className="w-[160px] shrink-0">
            <Popover
              open={columnsOpen}
              onOpenChange={(open) => {
                setColumnsOpen(open);
                if (open) {
                  setCountriesOpen(false);
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal"
                  size="sm"
                  style={{ height: "32px" }}
                >
                  <span className="text-muted-foreground">
                    {selectedColumnPairs.size === 0
                      ? "Select vendors"
                      : `${selectedColumnPairs.size} vendor(s)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[240px] min-w-[160px] p-0 border-border" sideOffset={4}>
                <div className="p-3 space-y-2 max-h-[18rem] overflow-y-auto">
                  <input
                    type="text"
                    placeholder="Search vendor or rate type…"
                    value={columnsSearch}
                    onChange={(e) => setColumnsSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background mb-2"
                  />
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={
                        filteredColumnOptions.length > 0 &&
                        filteredColumnOptions.every((opt) => selectedColumnPairs.has(opt.key))
                      }
                      onCheckedChange={selectAllColumns}
                    />
                    <span className="text-muted-foreground">All</span>
                  </label>
                  {filteredColumnOptions.map((opt) => (
                    <label
                      key={opt.key}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedColumnPairs.has(opt.key)}
                        onCheckedChange={() => toggleColumnPair(opt.key)}
                      />
                      {opt.vendor.nombre} - {opt.rateType}
                    </label>
                  ))}
                  {filteredColumnOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {columnsSearch ? "No matches." : "No vendors with uploaded files. Assign a vendor when uploading a CSV."}
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            </div>
          </div>

          <div className="flex items-end gap-4 shrink-0 pr-6 border-r border-border">
            <div className="flex items-center gap-1.5 h-8">
              <Label className="text-xs shrink-0 whitespace-nowrap text-muted-foreground w-12 text-right">PSF</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={psfFeeInput}
                onChange={(e) => handleFeeInputChange(setPsfFeeInput, e)}
                className="w-16 h-8 text-xs font-mono px-2"
              />
              <div className="flex rounded-md border border-border overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setPsfFeeMode("percentage")}
                  className={`px-2 py-1 text-xs font-medium transition-colors ${
                    psfFeeMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setPsfFeeMode("fixed")}
                  className={`px-2 py-1 text-xs font-medium transition-colors border-l border-border flex items-center justify-center ${
                    psfFeeMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                  title="Fixed"
                >
                  <DollarSign className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          <Button onClick={handleApply} size="sm" className="h-8 shrink-0">
            Apply
          </Button>
        </div>
      </div>

      <Dialog open={createGroupDialogOpen} onOpenChange={setCreateGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createGroupSource === "countries" ? "Create group from countries" : "Combine groups into new group"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateGroupFromSelection}>
            <p className="text-sm text-muted-foreground">
              {createGroupSource === "countries"
                ? `Create a new group with the ${selectedCountries.size} selected countries.`
                : `Create a new group containing all countries from the ${selectedGroups.size} selected groups.`}
            </p>
            <div className="space-y-2">
              <Label htmlFor="create-group-nombre">Group name *</Label>
              <Input
                id="create-group-nombre"
                value={createGroupNombre}
                onChange={(e) => setCreateGroupNombre(e.target.value)}
                placeholder="e.g. North America"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-group-descripcion">Description (optional)</Label>
              <Textarea
                id="create-group-descripcion"
                value={createGroupDescripcion}
                onChange={(e) => setCreateGroupDescripcion(e.target.value)}
                placeholder="Additional info"
                rows={2}
                className="resize-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateGroupDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createGroupSaving}>
                {createGroupSaving ? "Creating…" : "Create group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          setSaveDialogOpen(open);
          if (!open) {
            setSaveClientSearch("");
            setSaveClientPickerOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editQuotationId ? "Update quotation" : "Save quotation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label id="save-client-label">Client (optional)</Label>
              <Popover
                modal={false}
                open={saveClientPickerOpen}
                onOpenChange={setSaveClientPickerOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal h-9 px-3"
                    aria-labelledby="save-client-label"
                  >
                    <span
                      className={
                        saveClientId === "__none__" || !selectedSaveClientName
                          ? "truncate text-muted-foreground"
                          : "truncate text-left"
                      }
                    >
                      {saveClientId === "__none__"
                        ? "No client"
                        : (selectedSaveClientName ?? "Client")}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={4}
                  collisionPadding={12}
                  className="z-[100] w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-2rem,18rem)] p-0 border-border"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="p-2 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        className="h-8 pl-8 text-sm"
                        placeholder="Search clients…"
                        value={saveClientSearch}
                        onChange={(e) => setSaveClientSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Search clients"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-popover divide-y divide-border">
                      <button
                        type="button"
                        onClick={() => {
                          setSaveClientId("__none__");
                          setSaveClientPickerOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-muted/60 ${
                          saveClientId === "__none__" ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        No client
                      </button>
                      {saveDialogFilteredClients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSaveClientId(c.id);
                            setSaveClientPickerOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-muted/60 truncate ${
                            saveClientId === c.id ? "bg-primary/10 font-medium text-foreground" : ""
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                    {saveClientSearch.trim() && saveDialogFilteredClients.length === 0 ? (
                      <div className="px-1 pb-1">
                        <p className="text-xs text-muted-foreground mb-2 px-1">No client matches this search.</p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="w-full gap-2 h-8"
                          onClick={() => void handleCreateClientFromSaveSearch()}
                          disabled={creatingClientInline}
                        >
                          {creatingClientInline ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          Add &quot;{saveClientSearch.trim()}&quot; as client
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="save-name">Name (optional)</Label>
              <Input
                id="save-name"
                type="text"
                placeholder="e.g. Mexico Q1"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveQuotation} disabled={saving}>
              {saving ? (editQuotationId ? "Updating…" : "Saving…") : (editQuotationId ? "Update quotation" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(!hasApplied || selectedColumnsList.length === 0 || effectiveCountryFilter.size === 0) && !(editQuotation && editQuotation.snapshot?.rows?.length) ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 rounded-2xl border border-border bg-card">
          <Building2 className="w-8 h-8 opacity-30" />
          <p className="text-sm">
            {!hasApplied
              ? "Select countries, vendor-rate comparisons, and click Apply to load the table."
              : "Select at least one country and one comparison to see the table."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col max-h-[32rem] relative">
          <div className="px-4 py-3 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
                <Select value={searchBy} onValueChange={(v) => setSearchBy(v as "country" | "prefix" | "type")}>
                  <SelectTrigger className="w-[6.5rem] shrink-0 text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="country">Country</SelectItem>
                    <SelectItem value="prefix">Prefix</SelectItem>
                    <SelectItem value="type">Network</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder={
                      searchBy === "country"
                        ? "Search by country…"
                        : searchBy === "prefix"
                          ? "Search by prefix (e.g. 52, 1)…"
                          : "Search by network…"
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full"
                  />
                </div>
                {search && (
                  <span className="text-xs text-primary font-medium shrink-0">Filtering</span>
                )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => void handleExportXlsx()}
                disabled={selectedColumnsList.length === 0 || totalCountries === 0 || exportingOrSaving}
                aria-label="Export XLSX"
              >
                <FileDown className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSaveDialogOpen(true)}
                disabled={selectedColumnsList.length === 0 || totalCountries === 0 || exportingOrSaving}
                aria-label={editQuotationId ? "Update quotation" : "Save quotation"}
              >
                <Save className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {ratesLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-20 rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="country"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r border-border w-[6rem] min-w-[6rem]"
                  >
                    Country
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="network"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r-2 border-border min-w-[14rem]"
                  >
                    Network
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="prefix"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r-2 border-border min-w-[6rem]"
                  >
                    Prefix
                  </SortableNativeTh>
                  {columnsGroupedByVendor.map((g) => (
                    <th
                      key={g.vendor.id}
                      colSpan={g.rateTypes.length}
                      className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/80 border-l-2 border-border min-w-[8rem]"
                    >
                      {g.vendor.nombre}
                    </th>
                  ))}
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="lcrVendor"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-l-2 border-border min-w-[6rem]"
                  >
                    LCR Vendor
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="lcrRate"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-l border-border min-w-[5rem]"
                  >
                    LCR Rate
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="selVendor"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-l border-border min-w-[6rem]"
                  >
                    Selected Vendor
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="selRate"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-l border-border min-w-[5rem]"
                  >
                    Rate
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="psf"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/50 border-l border-border min-w-[6rem]"
                  >
                    PSF
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="cost"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/50 border-l border-border min-w-[5rem]"
                  >
                    Cost
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="margin"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/50 border-l border-border min-w-[5rem]"
                  >
                    Margin
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="marginPct"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/50 border-l border-border min-w-[7rem] whitespace-nowrap"
                  >
                    Margin %
                  </SortableNativeTh>
                  <SortableNativeTh
                    rowSpan={2}
                    sortKey="sellRate"
                    sort={quotationTableSort}
                    onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/50 border-l border-border min-w-[8rem]"
                  >
                    Sell Rate
                  </SortableNativeTh>
                </tr>
                <tr className="border-b border-border">
                  {columnsGroupedByVendor.map((g) =>
                    g.rateTypes.map((t) => (
                      <SortableNativeTh
                        key={`${g.vendor.id}-${t}`}
                        sortKey={`rate:\t${g.vendor.id}\t${t}`}
                        sort={quotationTableSort}
                        onSort={(k) => setQuotationTableSort((s) => cycleSort(s, k))}
                        className="text-left px-4 py-1.5 text-[10px] font-normal text-muted-foreground bg-muted/50 border-l border-border min-w-[5.5rem]"
                      >
                        {t}
                      </SortableNativeTh>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {displayQuotationRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + selectedColumnsList.length + 9}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      {search ? (
                        <span>
                          No records match the filter.
                          {searchBy === "country" && (
                            <span className="block mt-1 text-xs">
                              Tip: If you&apos;re searching for a network (e.g. PA Fixed), select <strong>Network</strong> in the filter dropdown.
                            </span>
                          )}
                        </span>
                      ) : (
                        "No records for selection."
                      )}
                    </td>
                  </tr>
                ) : (
                  displayQuotationRows.map((row, idx) => {
                    let countryStart = true;
                    let countrySpan = 1;
                    if (useQuotationCountryRowSpan) {
                      countryStart = idx === 0 || displayQuotationRows[idx - 1].country !== row.country;
                      countrySpan = countryStart
                        ? displayQuotationRows.filter((r) => r.country === row.country).length
                        : 0;
                    }
                    return (
                      <tr key={idx} className="border-b border-border hover:bg-muted/20">
                        {countryStart ? (
                          <td
                            rowSpan={useQuotationCountryRowSpan ? countrySpan : undefined}
                            className="px-4 py-2.5 text-foreground align-middle bg-muted/30 border-r border-border font-medium"
                          >
                            {row.country}
                          </td>
                        ) : null}
                        <td
                          className="px-4 py-2.5 text-muted-foreground align-top bg-muted/20 border-r-2 border-border text-xs font-medium min-w-[14rem]"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {row.fromMasterList === false && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex text-amber-500 shrink-0" aria-label="Not in Master List">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  Not in Master List
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {row.networkLabel}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground align-top bg-muted/20 border-r-2 border-border text-xs min-w-[6rem]">
                          {(() => {
                            const prefixes = getAllPrefixesForRow(row);
                            if (prefixes.length === 0) return <span className="italic">—</span>;
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help underline decoration-dotted decoration-muted-foreground">
                                    (+{prefixes.length} more)
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs max-h-48 overflow-y-auto">
                                  <ul className="font-mono text-xs list-disc list-inside space-y-0.5">
                                    {prefixes.map((p) => (
                                      <li key={p}>{p}</li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </td>
                        {selectedColumnsList.map((col) => {
                          const byType = row.byVendor.get(col.vendor.id);
                          const cell = byType?.[col.rateType];
                          const rate = cell?.rate;
                          return (
                            <td
                              key={col.vendor.id + col.rateType}
                              className="px-4 py-2.5 border-l-2 border-border bg-card/50 min-w-[5.5rem]"
                            >
                              {rate != null ? (
                                <span className="font-mono text-foreground">{formatRate(rate)}</span>
                              ) : (
                                <span className="text-muted-foreground italic">—</span>
                              )}
                            </td>
                          );
                        })}
                        {(() => {
                          const rowKey = getRowKey(row);
                          const { vendorId: bestVendorId, rateType: bestRateType, rate: bestRate, vendorName: bestVendorName } = getBestVendorAndRateForRow(row);
                          const bestKey = bestVendorId && bestRateType ? `${bestVendorId}\t${bestRateType}` : "";
                          const selectedKey = selectedColumnKeyPerRow[rowKey] ?? bestKey ?? "";
                          const selectedRate = selectedKey ? getRateForColumnKey(row, selectedKey) : null;
                          const psfAmount = selectedRate != null ? getPsfAmount(selectedRate) : null;
                          const cost =
                            selectedRate != null && psfAmount != null
                              ? selectedRate + psfAmount
                              : null;
                          const rawSellRate = sellRatePerRow[rowKey];
                          const effectiveSellRate =
                            cost != null
                              ? (() => {
                                  if (rawSellRate !== undefined && rawSellRate !== "") {
                                    const n = parseFloat(rawSellRate.replace(",", "."));
                                    if (!Number.isNaN(n)) return n;
                                  }
                                  return cost;
                                })()
                              : null;
                          const netMargin =
                            effectiveSellRate != null && cost != null
                              ? effectiveSellRate - cost
                              : null;
                          const marginOnCostPct =
                            netMargin != null && cost != null && cost > 0
                              ? (netMargin / cost) * 100
                              : null;
                          return (
                            <>
                              <td className="px-4 py-2.5 border-l-2 border-border bg-card/50 font-medium">
                                {bestVendorName && bestRateType ? `${bestVendorName} - ${bestRateType}` : "—"}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-card/50 min-w-[5rem]">
                                {bestRate != null ? (
                                  <span className="text-foreground">{formatRate(bestRate)}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 border-l border-border bg-card/50 align-top">
                                <Select
                                  value={selectedKey || bestKey || ""}
                                  onValueChange={(val) =>
                                    setSelectedColumnKeyPerRow((prev) => ({ ...prev, [rowKey]: val }))
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs min-w-[8rem]">
                                    <SelectValue placeholder="Vendor - Rate" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {selectedColumnsList.map((col) => {
                                      const colKey = `${col.vendor.id}\t${col.rateType}`;
                                      return (
                                        <SelectItem key={colKey} value={colKey}>
                                          {col.vendor.nombre} - {col.rateType}
                                          {colKey === bestKey ? " (best)" : ""}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-card/50 min-w-[5rem]">
                                {selectedRate != null ? (
                                  <span className="text-foreground">{formatRate(selectedRate)}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-muted/30 min-w-[6rem]">
                                {psfAmount != null ? (
                                  <span className="text-foreground">{formatRate(psfAmount)}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-muted/30 min-w-[5rem]">
                                {cost != null ? (
                                  <span className="text-foreground">{formatRate(cost)}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-muted/30 min-w-[5rem]">
                                {netMargin != null ? (
                                  <span
                                    className={
                                      netMargin > 0
                                        ? "text-emerald-700 dark:text-emerald-400"
                                        : netMargin < 0
                                          ? "text-destructive"
                                          : "text-foreground"
                                    }
                                  >
                                    {formatRate(netMargin)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-muted/30 min-w-[7rem] text-xs whitespace-nowrap">
                                {marginOnCostPct != null ? (
                                  <span
                                    className={
                                      marginOnCostPct > 0
                                        ? "text-emerald-700 dark:text-emerald-400"
                                        : marginOnCostPct < 0
                                          ? "text-destructive"
                                          : "text-foreground"
                                    }
                                  >
                                    {formatPercent(marginOnCostPct)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2 border-l border-border bg-card/50 min-w-[8rem]">
                                {cost != null ? (
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={sellRatePerRow[rowKey] ?? formatRate(cost)}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v === "" || /^-?\d*[,.]?\d*$/.test(v)) {
                                        setSellRatePerRow((prev) => ({ ...prev, [rowKey]: v }));
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const v = e.target.value.trim();
                                      if (v === "") setSellRatePerRow((prev) => ({ ...prev, [rowKey]: formatRate(cost) }));
                                    }}
                                    className="h-8 text-xs font-mono w-full min-w-0"
                                  />
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {totalCountries > 0 && (
            <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-border bg-muted/30 text-sm text-muted-foreground">
              <span>{Math.min(page * pageSize, totalCountries) - (page - 1) * pageSize} of {totalCountries} items</span>
              <div className="flex items-center gap-2">
              <span className="min-w-[4rem] text-center">{page} / {totalPages}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev || ratesLoading}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={!canNext || ratesLoading}
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
