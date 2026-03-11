import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "@/components/MainLayout";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Cotizaciones from "./pages/Cotizaciones";
import AjustesVendor from "./pages/AjustesVendor";
import AjustesCsv from "./pages/AjustesCsv";
import AjustesPaises from "./pages/AjustesPaises";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/quotations" element={<Cotizaciones />} />
            <Route path="/settings/vendor" element={<AjustesVendor />} />
            <Route path="/settings/csv" element={<AjustesCsv />} />
            <Route path="/settings/countries" element={<AjustesPaises />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
