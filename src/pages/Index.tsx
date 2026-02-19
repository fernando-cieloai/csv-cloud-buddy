import CsvUploader from "@/components/CsvUploader";
import PhoneRatesTable from "@/components/PhoneRatesTable";
import { PhoneCall } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <PhoneCall className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Phone Rates</h1>
            <p className="text-xs text-muted-foreground">CSV Data Importer</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        {/* Upload section */}
        <div>
          <div className="mb-8 text-center space-y-2">
            <h2 className="text-3xl font-bold text-foreground">Import rates from CSV</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Upload a CSV file with columns{" "}
              <span className="font-mono text-primary text-sm">country</span>,{" "}
              <span className="font-mono text-primary text-sm">phone company</span>,{" "}
              <span className="font-mono text-primary text-sm">prefix</span> and{" "}
              <span className="font-mono text-primary text-sm">price</span> — records will be saved automatically.
            </p>
          </div>

          <CsvUploader />

          {/* Instructions */}
          <div className="mt-8 rounded-2xl bg-card border border-border p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Expected CSV format</h3>
            <div className="rounded-lg bg-muted p-4 overflow-x-auto">
              <pre className="text-xs font-mono text-muted-foreground leading-relaxed">{`country,phone company,prefix,price
Mexico,Telcel,+52,0.0250
USA,AT&T,+1,0.0180
Spain,Movistar,+34,0.0320
Colombia,Claro,+57,0.0290`}</pre>
            </div>
            <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                The first row must be the header with column names.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                The <span className="font-mono">price</span> field must be a decimal number (e.g. 0.0250).
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Column separator: comma (<span className="font-mono">,</span>).
              </li>
            </ul>
          </div>
        </div>

        {/* Existing data section */}
        <PhoneRatesTable />
      </main>
    </div>
  );
};

export default Index;
