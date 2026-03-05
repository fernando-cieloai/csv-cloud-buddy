const Index = () => {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
      <h2 className="text-2xl font-bold text-foreground">
        Welcome to Phone Rates
      </h2>
      <p className="text-sm text-muted-foreground max-w-xl">
        Use the top navigation to access each section: view quotations, manage
        vendors, or upload CSV/XLSX files with phone rates under &quot;Settings → Upload CSV&quot;.
      </p>
    </div>
  );
};

export default Index;
