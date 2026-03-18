-- Document snapshot JSONB structure for saved_quotations
-- snapshot may include:
--   marginFee: { value: number, mode: "percentage" | "fixed" }
--   psfFee: { value: number, mode: "percentage" | "fixed" }
--   displayRateTypes: string[] -- which rate types (International, Origin Based, Local) to display
--   vendors, rateTypes, rows, lineTypes (existing)
COMMENT ON COLUMN public.saved_quotations.snapshot IS 'JSONB: vendors, rateTypes, rows, lineTypes, marginFee, psfFee, displayRateTypes';
