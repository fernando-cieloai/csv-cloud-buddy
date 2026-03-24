import { Outlet } from "react-router-dom";
import Navbar from "@/components/Navbar";
import AppBreadcrumbs from "@/components/AppBreadcrumbs";
import { PhoneCall } from "lucide-react";

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-tight">
                Phone Rates
              </h1>
              <p className="text-xs text-muted-foreground">CSV Data Importer</p>
            </div>
          </div>
          <Navbar />
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-12">
        <AppBreadcrumbs className="mb-6" />
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;

