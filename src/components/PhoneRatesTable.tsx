import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database, RefreshCw, Search } from "lucide-react";

interface PhoneRate {
  id: string;
  country: string;
  phone_company: string;
  prefix: string;
  price: number;
  created_at: string;
}

export default function PhoneRatesTable() {
  const [rates, setRates] = useState<PhoneRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const fetchRates = async () => {
    setLoading(true);
    const { data, count, error } = await supabase
      .from("phone_rates")
      .select("*", { count: "exact" })
      .order("country", { ascending: true })
      .limit(200);

    if (!error && data) {
      setRates(data);
      setTotal(count ?? data.length);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const filtered = rates.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.country.toLowerCase().includes(q) ||
      r.phone_company.toLowerCase().includes(q) ||
      r.prefix.toLowerCase().includes(q)
    );
  });

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Saved records
            {!loading && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({total.toLocaleString()} total)
              </span>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by country, company or prefix…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-64"
            />
          </div>
          {/* Refresh */}
          <button
            onClick={fetchRates}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Database className="w-8 h-8 opacity-30" />
          <p className="text-sm">{search ? "No results match your search." : "No records yet. Upload a CSV to get started."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted">
                {["Country", "Company", "Prefix", "Price", "Added"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                >
                  <td className="px-4 py-2.5 text-foreground">{row.country}</td>
                  <td className="px-4 py-2.5 text-foreground">{row.phone_company}</td>
                  <td className="px-4 py-2.5 font-mono text-primary">{row.prefix}</td>
                  <td className="px-4 py-2.5 text-foreground font-mono">{row.price.toFixed(4)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {total > 200 && (
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-center text-xs text-muted-foreground">
                    Showing first 200 of {total.toLocaleString()} records. Upload a new file to update.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
