import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Search, ChevronDown, ChevronLeft, ChevronRight, Building2, Save, FileDown } from "lucide-react";
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
//test
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
  return "International";
}

function getLineType(line_type: string | null): LineType {
  if (!line_type) return "others";
  const normalized = line_type.trim().toLowerCase();
  if (LINE_TYPES.includes(normalized as LineType)) return normalized as LineType;
  return "others";
}

export interface ComparacionCotizacionesProps {
  onSaved?: () => void;
}

export default function ComparacionCotizaciones({ onSaved }: ComparacionCotizacionesProps = {}) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [rates, setRates] = useState<AggregatedRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(new Set());
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [vendorsOpen, setVendorsOpen] = useState(false);
  const [extraCountriesOpen, setExtraCountriesOpen] = useState(false);
  const [extraCountries, setExtraCountries] = useState<Set<string>>(new Set());
  const [extraValueInput, setExtraValueInput] = useState("");
  const [appliedExtra, setAppliedExtra] = useState<{ countries: Set<string>; value: number } | null>(null);
  const [expandedPrefixes, setExpandedPrefixes] = useState<string[] | null>(null);
  const [countriesFromDb, setCountriesFromDb] = useState<{ id: string; nombre: string; region_id: string | null }[]>([]);
  const [countriesFromRates, setCountriesFromRates] = useState<string[]>([]);
  const [regionsFromDb, setRegionsFromDb] = useState<{ id: string; nombre: string }[]>([]);
  const [filterMode, setFilterMode] = useState<"country" | "region">("country");
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [extraFilterMode, setExtraFilterMode] = useState<"country" | "region">("country");
  const [selectedExtraRegions, setSelectedExtraRegions] = useState<Set<string>>(new Set());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalCountries, setTotalCountries] = useState(0);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [exportingOrSaving, setExportingOrSaving] = useState(false);
  const [countriesSearch, setCountriesSearch] = useState("");
  const [vendorsSearch, setVendorsSearch] = useState("");
  const [extraCountriesSearch, setExtraCountriesSearch] = useState("");

  const countriesRef = useRef<HTMLDivElement>(null);
  const vendorsRef = useRef<HTMLDivElement>(null);
  const extraCountriesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (countriesRef.current?.contains(target)) return;
      if (vendorsRef.current?.contains(target)) return;
      if (extraCountriesRef.current?.contains(target)) return;
      setCountriesOpen(false);
      setVendorsOpen(false);
      setExtraCountriesOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [vendorsRes, uploadsRes, countriesRes, regionsRes] = await Promise.all([
        supabase.from("vendors").select("id, nombre").order("nombre"),
        supabase
          .from("csv_uploads")
          .select("id, vendor_id, created_at")
          .not("vendor_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase.from("countries").select("id, nombre, region_id").order("nombre"),
        supabase.from("regions").select("id, nombre").order("nombre"),
      ]);

      if (vendorsRes.error) throw new Error(vendorsRes.error.message);
      if (uploadsRes.error) throw new Error(uploadsRes.error.message);
      if (countriesRes.error) throw new Error(countriesRes.error.message);
      if (regionsRes.error) throw new Error(regionsRes.error.message);

      setVendors(vendorsRes.data ?? []);
      setUploads(uploadsRes.data ?? []);
      setRates([]);
      setCountriesFromDb(countriesRes.data ?? []);
      setRegionsFromDb(regionsRes.data ?? []);
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

  const allRegions = useMemo(
    () => regionsFromDb.map((r) => r.nombre),
    [regionsFromDb]
  );

  const filteredCountries = useMemo(() => {
    const q = countriesSearch.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter((c) => c.toLowerCase().includes(q));
  }, [allCountries, countriesSearch]);

  const filteredRegions = useMemo(() => {
    const q = countriesSearch.trim().toLowerCase();
    if (!q) return allRegions;
    return allRegions.filter((r) => r.toLowerCase().includes(q));
  }, [allRegions, countriesSearch]);

  const filteredVendors = useMemo(() => {
    const q = vendorsSearch.trim().toLowerCase();
    if (!q) return vendorsWithUploads;
    return vendorsWithUploads.filter((v) => v.nombre.toLowerCase().includes(q));
  }, [vendorsWithUploads, vendorsSearch]);

  const filteredExtraCountries = useMemo(() => {
    const q = extraCountriesSearch.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter((c) => c.toLowerCase().includes(q));
  }, [allCountries, extraCountriesSearch]);

  const filteredExtraRegions = useMemo(() => {
    const q = extraCountriesSearch.trim().toLowerCase();
    if (!q) return allRegions;
    return allRegions.filter((r) => r.toLowerCase().includes(q));
  }, [allRegions, extraCountriesSearch]);

  const regionToCountryNames = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of regionsFromDb) m.set(r.nombre, []);
    for (const c of countriesFromDb) {
      if (c.region_id) {
        const region = regionsFromDb.find((x) => x.id === c.region_id);
        if (region) {
          const list = m.get(region.nombre) ?? [];
          list.push(c.nombre);
          m.set(region.nombre, list);
        }
      }
    }
    return m;
  }, [countriesFromDb, regionsFromDb]);

  const effectiveCountryFilter = useMemo(() => {
    if (filterMode === "country") {
      return selectedCountries;
    }
    if (selectedRegions.size === 0) return new Set<string>();
    const names = new Set<string>();
    for (const r of selectedRegions) {
      for (const c of regionToCountryNames.get(r) ?? []) names.add(c);
    }
    return names;
  }, [filterMode, selectedCountries, selectedRegions, regionToCountryNames]);

  const getUploadIdsForRates = useMemo(() => {
    const vendorList =
      selectedVendorIds.size > 0
        ? vendorsWithUploads.filter((v) => selectedVendorIds.has(v.id))
        : vendorsWithUploads;
    return uploads
      .filter((u) => u.vendor_id && vendorList.some((v) => v.id === u.vendor_id))
      .map((u) => u.id);
  }, [uploads, selectedVendorIds, vendorsWithUploads]);

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
    setPage(1);
  }, [effectiveCountryFilter, search, selectedVendorIds]);

  useEffect(() => {
    if (!loading && uploads.length > 0) {
      fetchRates();
    }
  }, [loading, uploads.length, fetchRates]);

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
    if (!loading) loadCountriesFromRates();
  }, [loading, getUploadIdsForRates]);

  const effectiveExtraCountries = useMemo(() => {
    if (extraFilterMode === "country") return extraCountries;
    if (selectedExtraRegions.size === 0) return new Set<string>();
    const names = new Set<string>();
    for (const r of selectedExtraRegions) {
      for (const c of regionToCountryNames.get(r) ?? []) names.add(c);
    }
    return names;
  }, [extraFilterMode, extraCountries, selectedExtraRegions, regionToCountryNames]);

  const toggleCountry = (country: string) => {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  };

  const toggleVendor = (vendorId: string) => {
    setSelectedVendorIds((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
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

  const toggleRegion = (region: string) => {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  const selectAllRegions = () => {
    const list = filteredRegions;
    const allSelected = list.length > 0 && list.every((r) => selectedRegions.has(r));
    if (allSelected) {
      setSelectedRegions((prev) => {
        const next = new Set(prev);
        for (const r of list) next.delete(r);
        return next;
      });
    } else {
      setSelectedRegions((prev) => new Set([...prev, ...list]));
    }
  };

  const toggleExtraRegion = (region: string) => {
    setSelectedExtraRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  const selectAllExtraRegions = () => {
    const list = filteredExtraRegions;
    const allSelected = list.length > 0 && list.every((r) => selectedExtraRegions.has(r));
    if (allSelected) {
      setSelectedExtraRegions((prev) => {
        const next = new Set(prev);
        for (const r of list) next.delete(r);
        return next;
      });
    } else {
      setSelectedExtraRegions((prev) => new Set([...prev, ...list]));
    }
  };

  const selectAllVendors = () => {
    const list = filteredVendors;
    const allSelected = list.length > 0 && list.every((v) => selectedVendorIds.has(v.id));
    if (allSelected) {
      setSelectedVendorIds((prev) => {
        const next = new Set(prev);
        for (const v of list) next.delete(v.id);
        return next;
      });
    } else {
      setSelectedVendorIds((prev) => new Set([...prev, ...list.map((v) => v.id)]));
    }
  };

  const toggleExtraCountry = (country: string) => {
    setExtraCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  };

  const selectAllExtraCountries = () => {
    const list = extraFilterMode === "country" ? filteredExtraCountries : filteredExtraRegions.flatMap((r) => regionToCountryNames.get(r) ?? []);
    const allSelected = list.length > 0 && list.every((c) => extraCountries.has(c));
    if (allSelected) {
      setExtraCountries((prev) => {
        const next = new Set(prev);
        for (const c of list) next.delete(c);
        return next;
      });
    } else {
      setExtraCountries((prev) => new Set([...prev, ...list]));
    }
  };

  const handleApplyExtra = () => {
    if (effectiveExtraCountries.size === 0) {
      toast.error("Select at least one country or region first");
      return;
    }
    const val = parseFloat(extraValueInput.replace(",", "."));
    if (Number.isNaN(val)) {
      setAppliedExtra(null);
      return;
    }
    setAppliedExtra({ countries: new Set(effectiveExtraCountries), value: val });
  };

  const handleExtraValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "" || /^-?\d*\.?\d*$/.test(v)) setExtraValueInput(v);
  };

  const countryInExtra = (country: string) =>
    appliedExtra &&
    [...appliedExtra.countries].some(
      (c) => c.trim().toLowerCase() === country?.trim().toLowerCase()
    );

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

  const fetchAllRatesForExport = async () => {
    const uploadIds = getUploadIdsForRates;
    if (uploadIds.length === 0) return [];
    const vendorList =
      selectedVendorIds.size > 0
        ? vendorsWithUploads.filter((v) => selectedVendorIds.has(v.id))
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
    if (selectedVendorsList.length === 0 || totalCountries === 0) return;
    setExportingOrSaving(true);
    toast.info("Preparing export…");
    try {
      const rowsToExport = await fetchAllRatesForExport();
      if (rowsToExport.length === 0) {
        toast.error("No data to export");
        return;
      }
      const headerRow = ["Country", "Type"];
      for (const v of selectedVendorsList) {
        headerRow.push(`${v.nombre} - prefix`);
        for (const t of RATE_TYPES) headerRow.push(`${v.nombre} - ${t} rate`);
      }
      const EXCEL_CELL_MAX = 32767;
      const truncateForExcel = (s: string) =>
        s.length > EXCEL_CELL_MAX ? s.slice(0, EXCEL_CELL_MAX - 20) + "… (truncated)" : s;

      const dataRows = rowsToExport.map((row) => {
        const r: (string | number)[] = [row.country, row.lineType];
        for (const v of selectedVendorsList) {
          const byType = row.byVendor.get(v.id);
          const allPrefixes = RATE_TYPES.flatMap((t) => byType?.[t]?.prefixes ?? []);
          r.push(truncateForExcel([...new Set(allPrefixes)].join(", ")));
          for (const t of RATE_TYPES) {
            const cell = byType?.[t];
            const rate = cell?.rate;
            const val =
              rate != null && countryInExtra(row.country)
                ? rate + (appliedExtra?.value ?? 0)
                : rate ?? "";
            r.push(typeof val === "number" ? val : val);
          }
        }
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
    if (selectedVendorsList.length === 0 || totalCountries === 0) return;
    setSaving(true);
    setExportingOrSaving(true);
    toast.info("Preparing save…");
    try {
      const rowsToSave = await fetchAllRatesForExport();
      if (rowsToSave.length === 0) {
        toast.error("No data to save");
        return;
      }
      const snapshot = {
        vendors: selectedVendorsList.map((v) => ({ id: v.id, nombre: v.nombre })),
        rateTypes: [...RATE_TYPES],
        lineTypes: [...LINE_TYPES],
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
                    ratePlusExtra: countryInExtra(row.country)
                      ? cell.rate + (appliedExtra?.value ?? 0)
                      : null,
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
      });
      if (error) throw error;
      setSaveDialogOpen(false);
      setSaveName("");
      toast.success("Cotización guardada");
      onSaved?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
      setExportingOrSaving(false);
    }
  };

  interface VendorCellByType {
    prefixes: string[];
    rate: number;
  }

  const vendorListForTable = useMemo(
    () =>
      selectedVendorIds.size > 0
        ? vendorsWithUploads.filter((v) => selectedVendorIds.has(v.id))
        : vendorsWithUploads,
    [selectedVendorIds, vendorsWithUploads]
  );

  const tableRows = useMemo(
    () =>
      buildTableRowsFromAggregated(
        rates,
        effectiveCountryFilter,
        vendorListForTable,
        search.toLowerCase().trim()
      ),
    [rates, effectiveCountryFilter, vendorListForTable, search, uploadById]
  );

  const selectedVendorsList = useMemo(
    () =>
      selectedVendorIds.size > 0
        ? vendorsWithUploads.filter((v) => selectedVendorIds.has(v.id))
        : [],
    [selectedVendorIds, vendorsWithUploads]
  );

  const totalPages = Math.max(1, Math.ceil(totalCountries / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

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

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Filter by</Label>
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode("country");
                    setSelectedRegions(new Set());
                  }}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    filterMode === "country" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Country
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode("region");
                    setSelectedCountries(new Set());
                  }}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-border ${
                    filterMode === "region" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Region
                </button>
              </div>
            </div>
            <div ref={countriesRef} className="relative">
            <Collapsible
              open={countriesOpen}
              onOpenChange={(open) => {
                setCountriesOpen(open);
                if (open) {
                  setVendorsOpen(false);
                  setExtraCountriesOpen(false);
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
                    {filterMode === "country"
                      ? selectedCountries.size === 0
                        ? "Select countries"
                        : `${selectedCountries.size} country(ies)`
                      : selectedRegions.size === 0
                        ? "Select regions"
                        : `${selectedRegions.size} region(s)`}
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
                  {filterMode === "country" ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={filteredRegions.length > 0 && filteredRegions.every((r) => selectedRegions.has(r))}
                          onCheckedChange={selectAllRegions}
                        />
                        <span className="text-muted-foreground">All</span>
                      </label>
                      {filteredRegions.map((r) => (
                        <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selectedRegions.has(r)}
                            onCheckedChange={() => toggleRegion(r)}
                          />
                          {r}
                        </label>
                      ))}
                      {filteredRegions.length === 0 && (
                        <p className="text-xs text-muted-foreground">{countriesSearch ? "No matches." : "No regions. Add regions in Settings."}</p>
                      )}
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vendors</Label>
            <div ref={vendorsRef} className="relative">
            <Collapsible
              open={vendorsOpen}
              onOpenChange={(open) => {
                setVendorsOpen(open);
                if (open) {
                  setCountriesOpen(false);
                  setExtraCountriesOpen(false);
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
                    {selectedVendorIds.size === 0
                      ? "Select vendors"
                      : `${selectedVendorIds.size} vendor(s)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto space-y-2">
                  <input
                    type="text"
                    placeholder="Search…"
                    value={vendorsSearch}
                    onChange={(e) => setVendorsSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background mb-2"
                  />
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={
                        filteredVendors.length > 0 &&
                        filteredVendors.every((v) => selectedVendorIds.has(v.id))
                      }
                      onCheckedChange={selectAllVendors}
                    />
                    <span className="text-muted-foreground">All</span>
                  </label>
                  {filteredVendors.map((v) => (
                    <label
                      key={v.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedVendorIds.has(v.id)}
                        onCheckedChange={() => toggleVendor(v.id)}
                      />
                      {v.nombre}
                    </label>
                  ))}
                  {filteredVendors.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {vendorsSearch ? "No matches." : "No vendors with uploaded files. Assign a vendor when uploading a CSV."}
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Apply extra to</Label>
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setExtraFilterMode("country");
                    setSelectedExtraRegions(new Set());
                  }}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    extraFilterMode === "country" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Country
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExtraFilterMode("region");
                    setExtraCountries(new Set());
                  }}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-border ${
                    extraFilterMode === "region" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Region
                </button>
              </div>
            </div>
            <div ref={extraCountriesRef} className="relative">
            <Collapsible
              open={extraCountriesOpen}
              onOpenChange={(open) => {
                setExtraCountriesOpen(open);
                if (open) {
                  setCountriesOpen(false);
                  setVendorsOpen(false);
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
                    {extraFilterMode === "country"
                      ? extraCountries.size === 0
                        ? "Select countries"
                        : `${extraCountries.size} country(ies)`
                      : selectedExtraRegions.size === 0
                        ? "Select regions"
                        : `${selectedExtraRegions.size} region(s)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto space-y-2">
                  <input
                    type="text"
                    placeholder="Search…"
                    value={extraCountriesSearch}
                    onChange={(e) => setExtraCountriesSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background mb-2"
                  />
                  {extraFilterMode === "country" ? (
                    <>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={filteredExtraCountries.length > 0 && filteredExtraCountries.every((c) => extraCountries.has(c))}
                          onCheckedChange={selectAllExtraCountries}
                        />
                        <span className="text-muted-foreground">All</span>
                      </label>
                      {filteredExtraCountries.map((c) => (
                        <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={extraCountries.has(c)}
                            onCheckedChange={() => toggleExtraCountry(c)}
                          />
                          {c}
                        </label>
                      ))}
                      {filteredExtraCountries.length === 0 && (
                        <p className="text-xs text-muted-foreground">{extraCountriesSearch ? "No matches." : "No country data."}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={filteredExtraRegions.length > 0 && filteredExtraRegions.every((r) => selectedExtraRegions.has(r))}
                          onCheckedChange={selectAllExtraRegions}
                        />
                        <span className="text-muted-foreground">All</span>
                      </label>
                      {filteredExtraRegions.map((r) => (
                        <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selectedExtraRegions.has(r)}
                            onCheckedChange={() => toggleExtraRegion(r)}
                          />
                          {r}
                        </label>
                      ))}
                      {filteredExtraRegions.length === 0 && (
                        <p className="text-xs text-muted-foreground">{extraCountriesSearch ? "No matches." : "No regions."}</p>
                      )}
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Extra amount (numeric)</Label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 0.005"
                value={extraValueInput}
                onChange={handleExtraValueChange}
                disabled={effectiveExtraCountries.size === 0}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleApplyExtra}
                disabled={effectiveExtraCountries.size === 0}
                title={effectiveExtraCountries.size === 0 ? "Select at least one country or region first" : undefined}
              >
                Apply
              </Button>
            </div>
            {appliedExtra && (
              <p className="text-xs text-muted-foreground">
                Applied +{appliedExtra.value.toFixed(4)} to {appliedExtra.countries.size} country(ies)
              </p>
            )}
          </div>
        </div>

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
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExportXlsx()}
            disabled={selectedVendorsList.length === 0 || totalCountries === 0 || exportingOrSaving}
          >
            <FileDown className="w-3.5 h-3.5 mr-1.5" />
            Export XLSX
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            disabled={selectedVendorsList.length === 0 || totalCountries === 0 || exportingOrSaving}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save quotation
          </Button>
        </div>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save quotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveQuotation} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {selectedVendorsList.length === 0 || effectiveCountryFilter.size === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 rounded-2xl border border-border bg-card">
          <Building2 className="w-8 h-8 opacity-30" />
          <p className="text-sm">
            Select at least one country (or region), one vendor with data, and then you can see the comparison.
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
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r border-border w-[6rem] min-w-[6rem] align-bottom"
                  >
                    Country
                  </th>
                  <th
                    rowSpan={2}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r-2 border-border w-[5rem] min-w-[5rem] align-bottom"
                  >
                    Type
                  </th>
                  {selectedVendorsList.map((v) => (
                    <th
                      key={v.id}
                      colSpan={1 + RATE_TYPES.length}
                      className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/70 border-l-2 border-border min-w-[10rem]"
                    >
                      <span className="truncate block" title={v.nombre}>
                        {v.nombre}
                      </span>
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  {selectedVendorsList.flatMap((v) => [
                    <th
                      key={`${v.id}-prefix`}
                      className="text-left px-4 py-1.5 text-[10px] font-normal normal-case text-muted-foreground bg-muted/50 border-l-2 border-border min-w-[6rem]"
                    >
                      prefix
                    </th>,
                    ...RATE_TYPES.map((t) => (
                      <th
                        key={`${v.id}-${t}`}
                        className="text-left px-4 py-1.5 text-[10px] font-normal normal-case text-muted-foreground bg-muted/50 border-l border-border min-w-[5rem]"
                      >
                        {t} rate
                      </th>
                    )),
                  ])}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2 + selectedVendorsList.length * (1 + RATE_TYPES.length)}
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
                        {selectedVendorsList.map((v) => {
                          const byType = row.byVendor.get(v.id);
                          const allPrefixes = RATE_TYPES.flatMap((t) => byType?.[t]?.prefixes ?? []);
                          const uniquePrefixes = [...new Set(allPrefixes)];
                          const fullText = uniquePrefixes.join(", ");
                          const showPreviewOnly = fullText.length > 50 || uniquePrefixes.length > 6;
                          const displayText = showPreviewOnly
                            ? uniquePrefixes.slice(0, 4).join(", ") + (uniquePrefixes.length > 4 ? ` (+${uniquePrefixes.length - 4} more)` : "")
                            : fullText;
                          return (
                            <React.Fragment key={v.id}>
                              <td
                                className="px-4 py-2.5 border-l-2 border-border bg-card/50 font-mono text-xs align-top min-w-[6rem] max-w-[16rem]"
                              >
                                {uniquePrefixes.length ? (
                                  <div className="flex items-start gap-1 w-full min-w-0">
                                    <span className="break-words whitespace-normal flex-1 min-w-0">
                                      {displayText}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setExpandedPrefixes([...uniquePrefixes]);
                                      }}
                                      className="flex-shrink-0 text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-ring rounded px-1.5 py-1 min-w-[1.5rem] min-h-[1.5rem] inline-flex items-center justify-center"
                                      title="Open full list"
                                    >
                                      …
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              {RATE_TYPES.map((t) => {
                                const cell = byType?.[t];
                                const rate = cell?.rate;
                                const withExtra =
                                  rate != null &&
                                  countryInExtra(row.country)
                                    ? rate + appliedExtra.value
                                    : rate;
                                return (
                                  <td
                                    key={`${v.id}-${t}`}
                                    className="px-4 py-2.5 border-l border-border bg-card/50"
                                    title={
                                      withExtra != null && countryInExtra(row.country)
                                        ? `rate + ${appliedExtra?.value.toFixed(4)}`
                                        : undefined
                                    }
                                  >
                                    {withExtra != null ? (
                                      <span
                                        className={`font-mono ${countryInExtra(row.country) ? "font-medium text-foreground" : "text-foreground"}`}
                                      >
                                        {withExtra.toFixed(4)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground italic">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
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

      <Dialog open={expandedPrefixes !== null} onOpenChange={(open) => !open && setExpandedPrefixes(null)}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>All prefixes</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 min-h-0 rounded-lg bg-muted p-4">
            {expandedPrefixes && (
              <ul className="list-disc list-inside font-mono text-sm space-y-1">
                {expandedPrefixes.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
