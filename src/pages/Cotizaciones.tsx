import ComparacionCotizaciones from "@/components/ComparacionCotizaciones";
import CotizacionesGuardadas from "@/components/CotizacionesGuardadas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitCompare, BookOpen } from "lucide-react";

const Cotizaciones = () => {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-card p-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Quotations</h1>
        <p className="text-sm text-muted-foreground">
          Select the countries and vendors you want to compare. Save quotations
          and review them later.
        </p>
      </div>

      <Tabs defaultValue="compare" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="compare" className="gap-2">
            <GitCompare className="w-3.5 h-3.5" />
            Compare
          </TabsTrigger>
          <TabsTrigger value="saved" className="gap-2">
            <BookOpen className="w-3.5 h-3.5" />
            Saved
          </TabsTrigger>
        </TabsList>
        <TabsContent value="compare">
          <ComparacionCotizaciones />
        </TabsContent>
        <TabsContent value="saved">
          <CotizacionesGuardadas />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Cotizaciones;

