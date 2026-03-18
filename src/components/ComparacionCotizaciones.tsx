import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Search, ChevronDown, ChevronLeft, ChevronRight, Building2, Save, FileDown, DollarSign } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Client {
  id: string;
  name: string;
}
interface Vendor {
  id: string;
  nombre: string;
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
  line_type: string;
  rate_type: string;
  prefixes: string[];
  rate: number;
}

const RATE_TYPES = ["International", "Origin Based", "Local"] as const;
type RateType = (typeof RATE_TYPES)[number];

const LINE_TYPES = ["mobile", "landline", "others"] as const;
type LineType = (typeof LINE_TYPES)[number];

function getRateType(rate_type: string | null): RateType {
  if (!rate_type) return "International";
  const normalized = rate_type.trim();
  if (RATE_TYPES.includes(normalized as RateType)) return normalized as RateType;
  // Case-insensitive fallback for DB/snapshot variations (e.g. "local" -> "Local")
  const lower = normalized.toLowerCase();
  const match = RATE_TYPES.find((rt) => rt.toLowerCase() === lower);
  return (match as RateType) ?? "International";
}

function getLineType(line_type: string | null): LineType {
  if (!line_type) return "others";
  const normalized = line_type.trim().toLowerCase();
  if (LINE_TYPES.includes(normalized as LineType)) return normalized as LineType;
  return "others";
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
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [selectedColumnPairs, setSelectedColumnPairs] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [marginFeeInput, setMarginFeeInput] = useState("");
  const [marginFeeMode, setMarginFeeMode] = useState<"percentage" | "fixed">("percentage");
  const [psfFeeInput, setPsfFeeInput] = useState("");
  const [psfFeeMode, setPsfFeeMode] = useState<"percentage" | "fixed">("percentage");
  const [appliedFees, setAppliedFees] = useState<{
    marginFee: { value: number; mode: "percentage" | "fixed" } | null;
    psfFee: { value: number; mode: "percentage" | "fixed" } | null;
  } | null>(null);
  const [countriesFromDb, setCountriesFromDb] = useState<{ id: string; nombre: string; region_id: string | null }[]>([]);
  const [countriesFromRates, setCountriesFromRates] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveClientId, setSaveClientId] = useState<string>("__none__");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalCountries, setTotalCountries] = useState(0);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [exportingOrSaving, setExportingOrSaving] = useState(false);
  const [countriesSearch, setCountriesSearch] = useState("");
  const [columnsSearch, setColumnsSearch] = useState("");
  const [selectedColumnKeyPerRow, setSelectedColumnKeyPerRow] = useState<Record<string, string>>({});
  const [hasApplied, setHasApplied] = useState(false);

  const countriesRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (countriesRef.current?.contains(target)) return;
      if (columnsRef.current?.contains(target)) return;
      setCountriesOpen(false);
      setColumnsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [vendorsRes, uploadsRes, countriesRes, clientsRes] = await Promise.all([
        supabase.from("vendors").select("id, nombre").order("nombre"),
        supabase
          .from("csv_uploads")
          .select("id, vendor_id, created_at")
          .not("vendor_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase.from("countries").select("id, nombre, region_id").order("nombre"),
        supabase.from("clients").select("id, name").order("name"),
      ]);

      if (vendorsRes.error) throw new Error(vendorsRes.error.message);
      if (uploadsRes.error) throw new Error(uploadsRes.error.message);
      if (countriesRes.error) throw new Error(countriesRes.error.message);
      if (clientsRes.error) throw new Error(clientsRes.error.message);

      setVendors(vendorsRes.data ?? []);
      setUploads(uploadsRes.data ?? []);
      setClients((clientsRes.data ?? []) as { id: string; name: string }[]);
      setRates([]);
      setCountriesFromDb(countriesRes.data ?? []);
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

  const vendorsWithUploads = useMemo(() => {
    const seen = new Set<string>();
    for (const u of uploads) {
      if (u.vendor_id) seen.add(u.vendor_id);
    }
    return vendors.filter((v) => seen.has(v.id));
  }, [vendors, uploads]);

  const allCountries = useMemo(() => {
    const fromDb = new Set(countriesFromDb.map((c) => c.nombre));
    for (const c of countriesFromRates) if (c?.trim()) fromDb.add(c.trim());
    return Array.from(fromDb).sort((a, b) => a.localeCompare(b));
  }, [countriesFromDb, countriesFromRates]);

  const filteredCountries = useMemo(() => {
    const q = countriesSearch.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter((c) => c.toLowerCase().includes(q));
  }, [allCountries, countriesSearch]);

  const columnOptions = useMemo(
    () =>
      vendorsWithUploads.flatMap((v) =>
        RATE_TYPES.map((t) => ({ vendor: v, rateType: t, key: `${v.id}\t${t}` }))
      ),
    [vendorsWithUploads]
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

  const effectiveCountryFilter = useMemo(() => selectedCountries, [selectedCountries]);

  const applyFeesToRate = (rate: number): number => {
    if (!appliedFees) return rate;
    let r = rate;
    const m = appliedFees.marginFee;
    const p = appliedFees.psfFee;
    if (m && m.value !== 0) {
      r = m.mode === "percentage" ? r * (1 + m.value / 100) : r + m.value;
    }
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
        ? vendorsWithUploads.filter((v) => selectedVendorIdsForFetch.has(v.id))
        : vendorsWithUploads;
    return uploads
      .filter((u) => u.vendor_id && vendorList.some((v) => v.id === u.vendor_id))
      .map((u) => u.id);
  }, [uploads, selectedVendorIdsForFetch, vendorsWithUploads]);

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
    setRatesLoading(true);
    try {
      const countryFilterArr =
        effectiveCountryFilter.size > 0 ? Array.from(effectiveCountryFilter) : null;
      const searchVal = search.trim() || null;

      const [{ data: countData, error: countErr }, { data: ratesData, error: ratesErr }] =
        await Promise.all([
          supabase.rpc("get_quotation_countries_count", {
            p_upload_ids: uploadIds,
            p_country_filter: countryFilterArr,
            p_search: searchVal,
          }),
          supabase.rpc("get_quotation_rates_page", {
            p_upload_ids: uploadIds,
            p_country_filter: countryFilterArr,
            p_search: searchVal,
            p_limit: pageSize,
            p_offset: (page - 1) * pageSize,
          }),
        ]);

      if (countErr) throw new Error(countErr.message);
      if (ratesErr) throw new Error(ratesErr.message);

      setTotalCountries(Number(countData ?? 0));
      setRates((ratesData ?? []) as AggregatedRateRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading rates");
      setRates([]);
      setTotalCountries(0);
    } finally {
      setRatesLoading(false);
    }
  }, [
    getUploadIdsForRates,
    effectiveCountryFilter,
    search,
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
      if (snap.marginFee) {
        setMarginFeeInput(String(snap.marginFee.value));
        setMarginFeeMode(snap.marginFee.mode);
      }
      if (snap.psfFee) {
        setPsfFeeInput(String(snap.psfFee.value));
        setPsfFeeMode(snap.psfFee.mode);
      }
      if (snap.marginFee || snap.psfFee) {
        setAppliedFees({
          marginFee: snap.marginFee ?? null,
          psfFee: snap.psfFee ?? null,
        });
      }
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
      setCountriesFromRates(uniqueCountries);
      setHasApplied(true);
    })();
    return () => { cancelled = true; };
  }, [editQuotationId]);

  useEffect(() => {
    setPage(1);
  }, [effectiveCountryFilter, search, selectedColumnPairs]);

  useEffect(() => {
    if (editQuotationId || !hasApplied) return;
    if (!loading && uploads.length > 0) {
      fetchRates();
    }
  }, [loading, uploads.length, fetchRates, editQuotationId, hasApplied]);

  useEffect(() => {
    const loadCountriesFromRates = async () => {
      const ids = getUploadIdsForRates;
      if (ids.length === 0) {
        setCountriesFromRates([]);
        return;
      }
      const { data } = await supabase.rpc("get_quotation_countries_list", {
        p_upload_ids: ids,
      });
      setCountriesFromRates((data ?? []).map((r: { country: string }) => r.country));
    };
    if (!loading && !editQuotationId) loadCountriesFromRates();
  }, [loading, getUploadIdsForRates, editQuotationId]);

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
    const marginVal = parseFloat(marginFeeInput.replace(",", "."));
    const psfVal = parseFloat(psfFeeInput.replace(",", "."));
    const hasMargin = !Number.isNaN(marginVal) && marginVal !== 0;
    const hasPsf = !Number.isNaN(psfVal) && psfVal !== 0;
    if (!hasMargin) {
      toast.error("Margin fee is required");
      return;
    }
    if (selectedColumnPairs.size === 0 || selectedCountries.size === 0) {
      toast.error("Select at least one country and one vendor-rate comparison");
      return;
    }
    setAppliedFees({
      marginFee: hasMargin ? { value: marginVal, mode: marginFeeMode } : null,
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
    searchQ: string
  ) => {
    const countryFilterLower = new Set([...countryFilter].map((c) => c.trim().toLowerCase()));
    const countryMatches = (country: string) =>
      countryFilter.size === 0 ? true : countryFilterLower.has(country?.trim().toLowerCase());
    const keyToRow = new Map<
      string,
      { country: string; lineType: LineType; byVendor: Map<string, Partial<Record<RateType, VendorCellByType>>> }
    >();
    for (const row of r) {
      if (!countryMatches(row.country)) continue;
      const u = uploadById.get(row.upload_id);
      if (!u?.vendor_id || !vendorList.some((v) => v.id === u.vendor_id)) continue;
      const rateType = getRateType(row.rate_type ?? null);
      const lineType = getLineType(row.line_type ?? null);
      const rowKey = `${row.country}\t${lineType}`;
      if (!keyToRow.has(rowKey))
        keyToRow.set(rowKey, { country: row.country, lineType, byVendor: new Map() });
      const tr = keyToRow.get(rowKey)!;
      if (!tr.byVendor.has(u.vendor_id)) tr.byVendor.set(u.vendor_id, {});
      const byType = tr.byVendor.get(u.vendor_id)!;
      if (!byType[rateType]) byType[rateType] = { prefixes: [], rate: 0 };
      const cell = byType[rateType]!;
      cell.prefixes = [...new Set([...cell.prefixes, ...(row.prefixes ?? [])])];
      if (row.rate > cell.rate) cell.rate = row.rate;
    }
    let list = Array.from(keyToRow.values()).filter((row) => row.byVendor.size > 0);
    if (searchQ)
      list = list.filter((x) => x.country.toLowerCase().includes(searchQ));
    list.sort((a, b) => a.country.localeCompare(b.country) || LINE_TYPES.indexOf(a.lineType) - LINE_TYPES.indexOf(b.lineType));
    return list;
  };

  interface VendorCellByType {
    prefixes: string[];
    rate: number;
    ratePlusExtra?: number | null;
  }

  const buildTableRowsFromSnapshot = (
    snapshot: SavedQuotation["snapshot"],
    searchQ: string
  ): { country: string; lineType: LineType; byVendor: Map<string, Partial<Record<RateType, VendorCellByType>>> }[] => {
    const rateTypes = (snapshot.rateTypes ?? RATE_TYPES) as readonly string[];
    const rows = snapshot.rows ?? [];
    const list = rows.map((row) => {
      const lineType = getLineType(row.lineType ?? row.type ?? null);
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
      return { country: row.country, lineType, byVendor };
    });
    let filtered = list.filter((row) => row.byVendor.size > 0);
    if (searchQ) filtered = filtered.filter((x) => x.country.toLowerCase().includes(searchQ));
    filtered.sort((a, b) => a.country.localeCompare(b.country) || LINE_TYPES.indexOf(a.lineType) - LINE_TYPES.indexOf(b.lineType));
    return filtered;
  };

  const fetchAllRatesForExport = async () => {
    if (editQuotation) {
      return buildTableRowsFromSnapshot(editQuotation.snapshot, search.toLowerCase().trim());
    }
    const uploadIds = getUploadIdsForRates;
    if (uploadIds.length === 0) return [];
      const vendorList =
      selectedVendorIdsForFetch.size > 0
        ? vendorsWithUploads.filter((v) => selectedVendorIdsForFetch.has(v.id))
        : vendorsWithUploads;
    const countryFilterArr =
      effectiveCountryFilter.size > 0 ? Array.from(effectiveCountryFilter) : null;
    const searchVal = search.trim() || null;
    let allAggregated: AggregatedRateRow[] = [];
    const pages = Math.ceil(totalCountries / pageSize) || 1;
    for (let i = 0; i < pages; i++) {
      const { data } = await supabase.rpc("get_quotation_rates_page", {
        p_upload_ids: uploadIds,
        p_country_filter: countryFilterArr,
        p_search: searchVal,
        p_limit: pageSize,
        p_offset: i * pageSize,
      });
      allAggregated = allAggregated.concat((data ?? []) as AggregatedRateRow[]);
    }
    return buildTableRowsFromAggregated(
      allAggregated,
      effectiveCountryFilter,
      vendorList,
      search.toLowerCase().trim()
    );
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
      const headerRow = [
        "Country",
        "Type",
        ...selectedColumnsList.map((c) => `${c.vendor.nombre} - ${c.rateType}`),
        "LCR Vendor",
        "LCR Rate",
        "Vendor Selected",
        "Vendor Selected Rate",
        "Margin",
        "PSF",
        "Total",
      ];

      const dataRows = rowsToExport.map((row) => {
        const rowKey = getRowKey(row);
        const { vendorId: bestVendorId, rateType: bestRateType, rate: bestRate, vendorName: bestVendorName } = getBestVendorAndRateForRow(row);
        const bestVendorLabel = bestVendorName && bestRateType ? `${bestVendorName} - ${bestRateType}` : "";
        const bestKey = bestVendorId && bestRateType ? `${bestVendorId}\t${bestRateType}` : "";
        const selectedKey = selectedColumnKeyPerRow[rowKey] ?? bestKey ?? "";
        const selectedCol = selectedColumnsList.find((c) => `${c.vendor.id}\t${c.rateType}` === selectedKey);
        const selectedLabel = selectedCol ? `${selectedCol.vendor.nombre} - ${selectedCol.rateType}` : "";
        const selectedRate = selectedKey ? getRateForColumnKey(row, selectedKey) : null;
        const marginAmount = selectedRate != null ? getMarginAmount(selectedRate) : null;
        const psfAmount = selectedRate != null ? getPsfAmount(selectedRate) : null;
        const total =
          selectedRate != null && marginAmount != null && psfAmount != null
            ? selectedRate + marginAmount + psfAmount
            : null;
        const r: (string | number)[] = [row.country, row.lineType];
        for (const col of selectedColumnsList) {
          const vByType = row.byVendor.get(col.vendor.id);
          const cell = vByType?.[col.rateType];
          const rate = cell?.rate;
          r.push(rate != null ? rate : "");
        }
        r.push(bestVendorLabel || "", bestRate ?? "");
        r.push(selectedLabel || "", selectedRate ?? "");
        r.push(marginAmount ?? "", psfAmount ?? "", total ?? "");
        return r;
      });
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Quotation");
      XLSX.writeFile(wb, `quotation-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Exportado como XLSX");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingOrSaving(false);
    }
  };

  const handleSaveQuotation = async () => {
    if (selectedColumnsList.length === 0 || totalCountries === 0) return;
    setSaving(true);
    setExportingOrSaving(true);
    toast.info("Preparing save…");
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
                  const baseRate = c.rate ?? 0;
                  byVendor[vendorId][t] = {
                    prefixes: c.prefixes ?? [],
                    rate: baseRate,
                    ratePlusExtra: appliedFees ? applyFeesToRate(baseRate) : null,
                  };
                }
              }
            } else {
              const leg = cell as { prefixes?: string[]; rate?: number };
              const baseRate = leg?.rate ?? 0;
              byVendor[vendorId] = {
                International: {
                  prefixes: leg?.prefixes ?? [],
                  rate: baseRate,
                  ratePlusExtra: appliedFees ? applyFeesToRate(baseRate) : null,
                },
              };
            }
          }
          return { ...row, byVendor };
        });
        const { extra: _extra, ...snapRest } = snap;
        const snapshot = {
          ...snapRest,
          rows,
          displayColumns: selectedColumnsList.map((c) => ({ vendorId: c.vendor.id, rateType: c.rateType })),
          ...(appliedFees && (appliedFees.marginFee || appliedFees.psfFee)
            ? {
                marginFee: appliedFees.marginFee ?? undefined,
                psfFee: appliedFees.psfFee ?? undefined,
              }
            : {}),
        };
        const { error } = await supabase
          .from("saved_quotations")
          .update({
            name: saveName.trim() || null,
            vendor_ids: editQuotation.vendor_ids,
            snapshot,
            client_id: saveClientId === "__none__" || !saveClientId.trim() ? null : saveClientId,
          })
          .eq("id", editQuotationId);
        if (error) throw error;
        setSaveDialogOpen(false);
        toast.success("Cotización actualizada");
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
        lineTypes: [...LINE_TYPES],
        displayColumns: selectedColumnsList.map((c) => ({ vendorId: c.vendor.id, rateType: c.rateType })),
        ...(appliedFees && (appliedFees.marginFee || appliedFees.psfFee)
          ? {
              marginFee: appliedFees.marginFee ?? undefined,
              psfFee: appliedFees.psfFee ?? undefined,
            }
          : {}),
        rows: rowsToSave.map((row) => ({
          country: row.country,
          lineType: row.lineType,
          byVendor: Object.fromEntries(
            Array.from(row.byVendor.entries()).map(([vendorId, byType]) => {
              const cells: Record<string, { prefixes: string[]; rate: number; ratePlusExtra: number | null }> = {};
              for (const t of RATE_TYPES) {
                const cell = byType[t];
                if (cell) {
                  cells[t] = {
                    prefixes: cell.prefixes,
                    rate: cell.rate,
                    ratePlusExtra: appliedFees ? applyFeesToRate(cell.rate) : null,
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
        client_id: saveClientId === "__none__" || !saveClientId.trim() ? null : saveClientId,
        status: "active",
      });
      if (error) throw error;
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveClientId("__none__");
      toast.success("Cotización guardada");
      onSaved?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar");
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
            return vendorsWithUploads.filter((v) => vendorIds.has(v.id));
          })(),
    [editQuotation, selectedColumnsList, vendorsWithUploads]
  );

  const vendorListForTable = useMemo(
    () =>
      editQuotation?.snapshot?.vendors?.length
        ? (editQuotation.snapshot.vendors as Vendor[])
        : selectedVendorsList.length > 0
          ? selectedVendorsList
          : vendorsWithUploads,
    [editQuotation, selectedVendorsList, vendorsWithUploads]
  );

  const tableRows = useMemo(
    () =>
      editQuotation?.snapshot?.rows?.length
        ? buildTableRowsFromSnapshot(editQuotation.snapshot, search.toLowerCase().trim())
        : buildTableRowsFromAggregated(
            rates,
            effectiveCountryFilter,
            vendorListForTable,
            search.toLowerCase().trim()
          ),
    [editQuotation, rates, effectiveCountryFilter, vendorListForTable, search, uploadById]
  );

  const totalPages = Math.max(1, Math.ceil(totalCountries / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  /** Best = vendor + rate type with lowest rate among all selected columns. */
  const getBestVendorAndRateForRow = useCallback(
    (
      row: { country: string; lineType: LineType; byVendor: RowByVendorMap }
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
    (row: { country: string; lineType: LineType; byVendor: RowByVendorMap }, key: string): number | null => {
      const [vendorId, rateType] = key.split("\t");
      if (!vendorId || !rateType) return null;
      const byType = row.byVendor.get(vendorId);
      const rate = byType?.[rateType]?.rate;
      return rate != null && rate >= 0 ? rate : null;
    },
    []
  );

  const getMarginAmount = (rate: number): number => {
    if (!appliedFees?.marginFee || appliedFees.marginFee.value === 0) return 0;
    const m = appliedFees.marginFee;
    return m.mode === "percentage" ? rate * (m.value / 100) : m.value;
  };

  const getPsfAmount = (rate: number): number => {
    if (!appliedFees?.psfFee || appliedFees.psfFee.value === 0) return 0;
    const p = appliedFees.psfFee;
    return p.mode === "percentage" ? rate * (p.value / 100) : p.value;
  };

  const getRowKey = (row: { country: string; lineType: LineType }) => `${row.country}\t${row.lineType}`;

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
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <h3 className="text-sm font-semibold text-foreground">Choose what to compare</h3>

        <div className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Countries</Label>
            <div ref={countriesRef} className="relative">
            <Collapsible
              open={countriesOpen}
              onOpenChange={(open) => {
                setCountriesOpen(open);
                if (open) {
                  setColumnsOpen(false);
                }
              }}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal"
                  size="sm"
                >
                  <span className="text-muted-foreground">
                    {selectedCountries.size === 0
                      ? "Select countries"
                      : `${selectedCountries.size} country(ies)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto space-y-2">
                  <input
                    type="text"
                    placeholder="Search…"
                    value={countriesSearch}
                    onChange={(e) => setCountriesSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background mb-2"
                  />
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
                    <p className="text-xs text-muted-foreground">{countriesSearch ? "No matches." : "No country data. Add countries in Settings."}</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vendors - Rate</Label>
            <div ref={columnsRef} className="relative">
            <Collapsible
              open={columnsOpen}
              onOpenChange={(open) => {
                setColumnsOpen(open);
                if (open) {
                  setCountriesOpen(false);
                }
              }}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal"
                  size="sm"
                >
                  <span className="text-muted-foreground">
                    {selectedColumnPairs.size === 0
                      ? "Select comparisons"
                      : `${selectedColumnPairs.size} comparison(s)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto space-y-2">
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
              </CollapsibleContent>
            </Collapsible>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-start-1">
            <div className="flex items-center justify-between gap-2">
              <Label>Margin fee</Label>
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMarginFeeMode("percentage")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    marginFeeMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setMarginFeeMode("fixed")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-border flex items-center justify-center ${
                    marginFeeMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                  title="Fixed"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={marginFeeInput}
              onChange={(e) => handleFeeInputChange(setMarginFeeInput, e)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
          <div className="space-y-2 sm:col-start-2">
            <div className="flex items-center justify-between gap-2">
              <Label>PSF fee</Label>
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPsfFeeMode("percentage")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    psfFeeMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setPsfFeeMode("fixed")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-border flex items-center justify-center ${
                    psfFeeMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                  title="Fixed"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={psfFeeInput}
              onChange={(e) => handleFeeInputChange(setPsfFeeInput, e)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
        </div>
        <Button onClick={handleApply} size="sm" className="mt-2">
          Apply
        </Button>
        {appliedFees && (appliedFees.marginFee || appliedFees.psfFee) && (
          <p className="text-xs text-muted-foreground">
            {appliedFees.marginFee && (
              <>Margin: {appliedFees.marginFee.mode === "percentage" ? `${appliedFees.marginFee.value}%` : `+${appliedFees.marginFee.value.toFixed(4)}`}</>
            )}
            {appliedFees.marginFee && appliedFees.psfFee && " · "}
            {appliedFees.psfFee && (
              <>PSF: {appliedFees.psfFee.mode === "percentage" ? `${appliedFees.psfFee.value}%` : `+${appliedFees.psfFee.value.toFixed(4)}`}</>
            )}
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by country or type (International/Origin Based/Local)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExportXlsx()}
            disabled={selectedColumnsList.length === 0 || totalCountries === 0 || exportingOrSaving}
          >
            <FileDown className="w-3.5 h-3.5 mr-1.5" />
            Export XLSX
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            disabled={selectedColumnsList.length === 0 || totalCountries === 0 || exportingOrSaving}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {editQuotationId ? "Update quotation" : "Save quotation"}
          </Button>
        </div>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editQuotationId ? "Update quotation" : "Save quotation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Client (optional)</Label>
              <Select value={saveClientId} onValueChange={setSaveClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              ? "Select countries, vendor-rate comparisons, enter margin fee (required), and click Apply to load the table."
              : "Select at least one country and one comparison to see the table."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col max-h-[32rem] relative">
          {ratesLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-20 rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r border-border w-[6rem] min-w-[6rem]"
                  >
                    Country
                  </th>
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r-2 border-border w-[5rem] min-w-[5rem]"
                  >
                    Type
                  </th>
                  {columnsGroupedByVendor.map((g) => (
                    <th
                      key={g.vendor.id}
                      colSpan={g.rateTypes.length}
                      className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/80 border-l-2 border-border min-w-[8rem]"
                    >
                      {g.vendor.nombre}
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-l-2 border-border min-w-[6rem]"
                  >
                    LCR Vendor
                  </th>
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-l border-border min-w-[5rem]"
                  >
                    LCR Rate
                  </th>
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-l border-border min-w-[6rem]"
                  >
                    Vendor Selected
                  </th>
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-l border-border min-w-[5rem]"
                  >
                    Vendor Selected Rate
                  </th>
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/50 border-l border-border min-w-[4rem]"
                  >
                    Margin
                  </th>
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/50 border-l border-border min-w-[4rem]"
                  >
                    PSF
                  </th>
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground bg-muted/50 border-l border-border min-w-[5rem]"
                  >
                    Total
                  </th>
                </tr>
                <tr className="border-b border-border">
                  {columnsGroupedByVendor.map((g) =>
                    g.rateTypes.map((t) => (
                      <th
                        key={`${g.vendor.id}-${t}`}
                        className="text-left px-4 py-1.5 text-[10px] font-normal text-muted-foreground bg-muted/50 border-l border-border min-w-[5.5rem]"
                      >
                        {t}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2 + selectedColumnsList.length + 7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      {search ? "No records match the filter." : "No records for selection."}
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row, idx) => {
                    const countryStart = idx === 0 || tableRows[idx - 1].country !== row.country;
                    const countrySpan = countryStart
                      ? tableRows.filter((r) => r.country === row.country).length
                      : 0;
                    return (
                      <tr key={idx} className="border-b border-border hover:bg-muted/20">
                        {countryStart ? (
                          <td
                            rowSpan={countrySpan}
                            className="px-4 py-2.5 text-foreground align-middle bg-muted/30 border-r border-border font-medium"
                          >
                            {row.country}
                          </td>
                        ) : null}
                        <td
                          className="px-4 py-2.5 text-muted-foreground align-top bg-muted/20 border-r-2 border-border text-xs font-medium"
                        >
                          {row.lineType}
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
                                <span className="font-mono text-foreground">{rate.toFixed(4)}</span>
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
                          const selectedCol = selectedColumnsList.find((c) => `${c.vendor.id}\t${c.rateType}` === selectedKey);
                          const selectedRate = selectedKey ? getRateForColumnKey(row, selectedKey) : null;
                          const marginAmount = selectedRate != null ? getMarginAmount(selectedRate) : null;
                          const psfAmount = selectedRate != null ? getPsfAmount(selectedRate) : null;
                          const total =
                            selectedRate != null && marginAmount != null && psfAmount != null
                              ? selectedRate + marginAmount + psfAmount
                              : null;
                          return (
                            <>
                              <td className="px-4 py-2.5 border-l-2 border-border bg-card/50 font-medium">
                                {bestVendorName && bestRateType ? `${bestVendorName} - ${bestRateType}` : "—"}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-card/50 min-w-[5rem]">
                                {bestRate != null ? (
                                  <span className="text-foreground">{bestRate.toFixed(4)}</span>
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
                                  <span className="text-foreground">{selectedRate.toFixed(4)}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-muted/30 min-w-[4rem]">
                                {marginAmount != null ? (
                                  <span className="text-foreground">{marginAmount.toFixed(4)}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-muted/30 min-w-[4rem]">
                                {psfAmount != null ? (
                                  <span className="text-foreground">{psfAmount.toFixed(4)}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono border-l border-border bg-muted/40 min-w-[5rem] font-medium">
                                {total != null ? (
                                  <span className="text-foreground">{total.toFixed(4)}</span>
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
            <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-border bg-muted/30 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages} ({totalCountries} countries)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev || ratesLoading}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={!canNext || ratesLoading}
                  className="h-8 w-8 p-0"
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
