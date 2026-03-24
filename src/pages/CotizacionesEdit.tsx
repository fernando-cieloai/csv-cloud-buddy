import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ComparacionCotizaciones from "@/components/ComparacionCotizaciones";

const CotizacionesEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="p-6 text-muted-foreground">
        Quotation ID not specified
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/quotations")}>
          <ArrowLeft className="w-3.5 h-3.5 mr-2" />
          Back to history
        </Button>
      </div>
      <ComparacionCotizaciones editQuotationId={id} onSaved={() => navigate("/quotations")} />
    </div>
  );
};

export default CotizacionesEdit;
