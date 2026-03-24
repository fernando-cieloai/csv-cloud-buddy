import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database, RefreshCw, Search, FileStack } from "lucide-react";
import { formatRate } from "@/lib/utils";
import { SortableNativeTh } from "@/components/ui/sortable-native-th";
import { cycleSort, compareText, compareNumber, type SortState } from "@/lib/tableSort";

interface PhoneRate {
  id: string;
  country: string;
  network: string;
  prefix: string;
  rate: number;
  rate_type?: string | null;
  created_at: string;
  upload_id: string;
}

interface CsvUpload {
  id: string;
  file_name: string;
  created_at: string;
  phone_rates: PhoneRate[] | null;
}

type RowKey = string;

function rowKey(country: string, network: string, prefix: string, rateType: string): RowKey {
  return `${country}\t${network}\t${prefix}\t${rateType}`;
}

export default function PhoneRatesTable() {
  const [uploads, setUploads] = useState<CsvUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phoneRatesSort, setPhoneRatesSort] = useState<SortState<string>>(null);

  const fetchUploads = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: uploadsData, error: uploadsError } = await supabase
        .from("csv_uploads")
        .select("id, file_name, created_at")
        .order("created_at", { ascending: false });

      if (uploadsError) {
        setError(`Could not load files: ${uploadsError.message}`);
        setUploads([]);
        setLoading(false);
        return;
      }

      const list = uploadsData ?? [];
      if (list.length === 0) {
        setUploads([]);
        setLoading(false);
        return;
      }

      const { data: ratesData, error: ratesError } = await supabase
        .from("phone_rates")
        .select("id, country, network, prefix, rate, rate_type, created_at, upload_id")
        .in("upload_id", list.map((u) => u.id));

      if (ratesError) {
        setError(`Error loading rates: ${ratesError.message}`);
        setUploads([]);
        setLoading(false);
        return;
      }

      const ratesByUpload = new Map<string, PhoneRate[]>();
      if (ratesData) {
        for (const r of ratesData) {
          const arr = ratesByUpload.get(r.upload_id) ?? [];
          arr.push(r);
          ratesByUpload.set(r.upload_id, arr);
        }
      }

      const combined: CsvUpload[] = list.map((u) => ({
        ...u,
        phone_rates: ratesByUpload.get(u.id) ?? [],
      }));
      setUploads(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error loading data");
      setUploads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  const baseRows = useMemo(() => {
    const keyToRow = new Map<
      RowKey,
      { country: string; network: string; prefix: string; rateType: string; ratesByUploadId: Map<string, number> }
    >();
    for (const upload of uploads) {
      const rates = upload.phone_rates ?? [];
      for (const r of rates) {
        const rateType = r.rate_type ?? "International";
        const key = rowKey(r.country, r.network, r.prefix, rateType);
        if (!keyToRow.has(key)) {
          keyToRow.set(key, {
            country: r.country,
            network: r.network,
            prefix: r.prefix,
            rateType,
            ratesByUploadId: new Map(),
          });
        }
        keyToRow.get(key)!.ratesByUploadId.set(r.upload_id, r.rate);
      }
    }
    let list = Array.from(keyToRow.values());
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (x) =>
          x.country.toLowerCase().includes(q) ||
          x.network.toLowerCase().includes(q) ||
          x.prefix.toLowerCase().includes(q) ||
          x.rateType.toLowerCase().includes(q)
      );
    }
    return list;
  }, [uploads, search]);

  const rows = useMemo(() => {
    if (!phoneRatesSort) {
      return [...baseRows].sort((a, b) =>
        [a.country, a.network, a.prefix, a.rateType].join("\t").localeCompare(
          [b.country, b.network, b.prefix, b.rateType].join("\t"),
          undefined,
          { numeric: true, sensitivity: "base" },
        ),
      );
    }
    const { key, dir } = phoneRatesSort;
    const m = dir === "asc" ? 1 : -1;
    return [...baseRows].sort((a, b) => {
      let c = 0;
      if (key === "country") c = compareText(a.country, b.country);
      else if (key === "network") c = compareText(a.network, b.network);
      else if (key === "type") c = compareText(a.rateType, b.rateType);
      else if (key === "prefix") c = compareText(a.prefix, b.prefix);
      else if (key.startsWith("upload:")) {
        const id = key.slice("upload:".length);
        c = compareNumber(a.ratesByUploadId.get(id), b.ratesByUploadId.get(id));
      }
      return c * m;
    });
  }, [baseRows, phoneRatesSort]);

  const useCountryRowSpan = phoneRatesSort === null;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileStack className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              File comparison
              {!loading && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({uploads.length} file{uploads.length !== 1 ? "s" : ""})
                </span>
              )}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground hidden sm:inline">Search by country, network, type or prefix</p>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Country, network, type, prefix…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-64"
                />
              </div>
              {search && (
                <span className="text-xs text-primary font-medium">Filtering</span>
              )}
            </div>
            <button
              onClick={fetchUploads}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm rounded-2xl border border-border bg-card">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          Loading…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-border bg-card border-destructive/50 bg-destructive/5">
          <p className="text-sm text-destructive font-medium">Database connection error</p>
          <p className="text-xs text-muted-foreground text-center max-w-md px-4">{error}</p>
          <p className="text-xs text-muted-foreground">Check that VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env point to your project and that csv_uploads and phone_rates tables exist with read policies.</p>
          <button
            type="button"
            onClick={fetchUploads}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : uploads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 rounded-2xl border border-border bg-card">
          <Database className="w-8 h-8 opacity-30" />
          <p className="text-sm">No files yet. Upload a CSV under Vendors to see the comparison.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col max-h-[28rem]">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <SortableNativeTh
                    sortKey="country"
                    sort={phoneRatesSort}
                    onSort={(k) => setPhoneRatesSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r-2 border-border w-[6rem] min-w-[6rem]"
                  >
                    Country
                  </SortableNativeTh>
                  <SortableNativeTh
                    sortKey="network"
                    sort={phoneRatesSort}
                    onSort={(k) => setPhoneRatesSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r border-border w-[5rem] min-w-[5rem]"
                  >
                    Network
                  </SortableNativeTh>
                  <SortableNativeTh
                    sortKey="type"
                    sort={phoneRatesSort}
                    onSort={(k) => setPhoneRatesSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r border-border w-[5rem] min-w-[5rem]"
                  >
                    Type
                  </SortableNativeTh>
                  <SortableNativeTh
                    sortKey="prefix"
                    sort={phoneRatesSort}
                    onSort={(k) => setPhoneRatesSort((s) => cycleSort(s, k))}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted border-r-2 border-border w-[4rem] min-w-[4rem]"
                  >
                    Prefix
                  </SortableNativeTh>
                  {uploads.map((u) => (
                    <SortableNativeTh
                      key={u.id}
                      sortKey={`upload:${u.id}`}
                      sort={phoneRatesSort}
                      onSort={(k) => setPhoneRatesSort((s) => cycleSort(s, k))}
                      className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/70 border-l-2 border-border min-w-[8rem] w-40"
                    >
                      <span className="font-mono truncate block" title={u.file_name}>
                        {u.file_name}
                      </span>
                    </SortableNativeTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4 + uploads.length} className="px-4 py-8 text-center text-muted-foreground">
                      {search ? "No records match the filter." : "No records."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    let showCountry = true;
                    let countrySpan = 1;
                    if (useCountryRowSpan) {
                      const prevSameCountry = idx > 0 && rows[idx - 1].country === row.country;
                      showCountry = !prevSameCountry;
                      if (showCountry) {
                        for (let i = idx + 1; i < rows.length && rows[i].country === row.country; i++)
                          countrySpan++;
                      }
                    }
                    return (
                      <tr key={idx} className="border-b border-border hover:bg-muted/20">
                        {showCountry ? (
                          <td
                            rowSpan={useCountryRowSpan ? countrySpan : undefined}
                            className="px-4 py-2.5 text-foreground align-top bg-muted/30 border-r-2 border-border font-medium"
                          >
                            {row.country}
                          </td>
                        ) : null}
                        <td className="px-4 py-2.5 text-foreground bg-muted/20 border-r border-border">
                          {row.network}
                        </td>
                        <td className="px-4 py-2.5 text-foreground bg-muted/20 border-r border-border">
                          {row.rateType}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-primary bg-muted/20 border-r-2 border-border">
                          {row.prefix}
                        </td>
                        {uploads.map((u) => {
                          const rate = row.ratesByUploadId.get(u.id);
                          return (
                            <td
                              key={u.id}
                              className="px-4 py-2.5 border-l-2 border-border bg-card/50"
                            >
                              {rate != null ? (
                                <span className="font-mono text-foreground">{formatRate(rate)}</span>
                              ) : (
                                <span className="text-muted-foreground italic">no data</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
