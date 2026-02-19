import CsvUploader from "@/components/CsvUploader";
import { PhoneCall } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <PhoneCall className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Tarifas Telefónicas</h1>
            <p className="text-xs text-muted-foreground">Importador de datos CSV</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10 text-center space-y-2">
          <h2 className="text-3xl font-bold text-foreground">Importar tarifas desde CSV</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Sube un archivo CSV con las columnas <span className="font-mono text-primary text-sm">country</span>,{" "}
            <span className="font-mono text-primary text-sm">phone company</span>,{" "}
            <span className="font-mono text-primary text-sm">prefix</span> y{" "}
            <span className="font-mono text-primary text-sm">price</span> y los datos se guardarán automáticamente.
          </p>
        </div>

        <CsvUploader />

        {/* Instructions */}
        <div className="mt-10 rounded-2xl bg-card border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Formato esperado del CSV</h3>
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
              La primera fila debe ser el encabezado con los nombres de columnas.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              El campo <span className="font-mono">price</span> debe ser un número decimal (ej: 0.0250).
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Separador de columnas: coma (<span className="font-mono">,</span>).
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default Index;
