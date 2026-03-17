import CsvUploader from "@/components/CsvUploader";

const AjustesCsv = () => {
  return (
    <div className="space-y-12">
      <div>
        <div className="mb-8 text-center space-y-2">
          <h2 className="text-3xl font-bold text-foreground">
            Import rates from CSV
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Upload a CSV with columns{" "}
            <span className="font-mono text-primary text-sm">country</span>,{" "}
            <span className="font-mono text-primary text-sm">network</span>,{" "}
            <span className="font-mono text-primary text-sm">prefix</span> and{" "}
            <span className="font-mono text-primary text-sm">rate</span> (saved as-is to the database).
          </p>
        </div>

        <CsvUploader />

        {/* Instructions */}
        <div className="mt-8 rounded-2xl bg-card border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Expected format (CSV or XLSX)
          </h3>
          <div className="rounded-lg bg-muted p-4 overflow-x-auto">
            <pre className="text-xs font-mono text-muted-foreground leading-relaxed">{`country,network,prefix,rate
Mexico,Telcel,+52,0.0250
USA,AT&T,+1,0.0180
Spain,Movistar,+34,0.0320
Colombia,Claro,+57,0.0290`}</pre>
          </div>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              The first row must be the header (column names). For XLSX, the first sheet is used.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Headers <span className="font-mono">phone company</span> and{" "}
              <span className="font-mono">price</span> are also accepted (saved as network and rate).
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span className="font-mono">rate</span> must be a decimal number (e.g. 0.0250).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AjustesCsv;

