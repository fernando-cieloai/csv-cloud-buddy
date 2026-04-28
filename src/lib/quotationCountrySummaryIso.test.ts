import { describe, expect, it } from "vitest";
import {
  expandCountryLabelsForMatching,
  isoAlpha2ForQuotationCountryBase,
  quotationCountryCanonicalKey,
  quotationCountryCanonicalToken,
  quotationCountryPickerLabel,
  quotationSummaryCountryBaseKey,
} from "./quotationCountrySummaryIso";

describe("quotationCountryCanonicalToken", () => {
  it("takes segment before hyphen", () => {
    expect(quotationCountryCanonicalToken("ARGENTINA-CORDOBA")).toBe("ARGENTINA");
    expect(quotationCountryCanonicalToken("MX-TELCEL")).toBe("MX");
  });

  it("takes leading ISO when followed by space (vendor rate files)", () => {
    expect(quotationCountryCanonicalToken("AD FIXED")).toBe("AD");
    expect(quotationCountryCanonicalToken("AE DU MOBILE")).toBe("AE");
  });

  it("takes first word when no ISO prefix pattern", () => {
    expect(quotationCountryCanonicalToken("COLOMBIA MOBILE")).toBe("COLOMBIA");
  });

  it("handles empty malformed", () => {
    expect(quotationCountryCanonicalToken("-argentina-x")).toBe("");
  });
});

describe("quotationCountryCanonicalKey / quotationSummaryCountryBaseKey", () => {
  it("collapses to ISO alpha-2 when English name known", () => {
    expect(quotationCountryCanonicalKey("ARGENTINA-CORDOBA")).toBe("AR");
    expect(quotationCountryCanonicalKey("ARGENTINA")).toBe("AR");
    expect(quotationCountryCanonicalKey("United States")).toBe("US");
    expect(quotationCountryCanonicalKey("France")).toBe("FR");
    expect(quotationCountryCanonicalKey("MÉXICO-YUCATAN")).toBe("MX");
    expect(quotationCountryCanonicalKey("MEXICO-CELLULAR TELCEL")).toBe("MX");
    expect(quotationCountryCanonicalKey("Mexico")).toBe("MX");
  });

  it("aliases quotationSummaryCountryBaseKey", () => {
    expect(quotationSummaryCountryBaseKey("ARGENTINA")).toBe("AR");
  });

  it("keeps ISO prefix tokens as ISO keys", () => {
    expect(quotationCountryCanonicalKey("AD FIXED")).toBe("AD");
    expect(quotationCountryCanonicalKey("MX")).toBe("MX");
  });
});

describe("quotationCountryPickerLabel", () => {
  it("shows country name for ISO codes", () => {
    expect(quotationCountryPickerLabel("AD")).toBe("ANDORRA");
    expect(quotationCountryPickerLabel("AR")).toBe("ARGENTINA");
    expect(quotationCountryPickerLabel("MX")).toBe("MEXICO");
  });
});

describe("isoAlpha2ForQuotationCountryBase", () => {
  it("resolves ISO from uppercase English names", () => {
    expect(isoAlpha2ForQuotationCountryBase("ARGENTINA")).toBe("AR");
    expect(isoAlpha2ForQuotationCountryBase("MEXICO")).toBe("MX");
  });

  it("handles common aliases", () => {
    expect(isoAlpha2ForQuotationCountryBase("USA")).toBe("US");
    expect(isoAlpha2ForQuotationCountryBase("UAE")).toBe("AE");
  });

  it("maps 2-letter ISO tokens", () => {
    expect(isoAlpha2ForQuotationCountryBase("MX")).toBe("MX");
    expect(isoAlpha2ForQuotationCountryBase("AR")).toBe("AR");
  });
});

describe("expandCountryLabelsForMatching", () => {
  it("adds ISO codes for English country names (Mexico → mx)", () => {
    const s = expandCountryLabelsForMatching(new Set(["Mexico"]));
    expect(s.has("mexico")).toBe(true);
    expect(s.has("mx")).toBe(true);
  });

  it("adds English names when selecting ISO (MX)", () => {
    const s = expandCountryLabelsForMatching(new Set(["MX"]));
    expect(s.has("mx")).toBe(true);
    expect(s.has("mexico")).toBe(true);
  });
});
