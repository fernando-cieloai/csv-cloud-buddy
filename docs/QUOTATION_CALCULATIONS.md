# Quotation calculations (`ComparacionCotizaciones`)

This document describes the quantities shown in the quotation table and their formulas as implemented in the code (`ComparacionCotizaciones.tsx`, `src/lib/utils.ts`).

**Notation:**

- \(R\) = **selected rate** (vendor/column rate for the row), in the same unit as the CSV data (e.g. USD/min).
- **PSF** and **markup** are fees configured in the top bar and applied according to the mode stored in the snapshot or on screen.

---

## 1. Selected rate (`selectedRate`)

Numeric value of the **vendor × rate-type** cell the user chose for that row (or the best rate among selected columns if there is no manual override in the row dropdown).

---

## 2. PSF (pass-through / fee on the rate)

The **PSF** amount shown in the column and included in cost **does not** use the same formula as the legacy snapshot “rate with fee”; for the current table:

### PSF amount (`getPsfAmount`)

- If there is no PSF or the value is `0`:  
  \(\text{PSF} = 0\)

- **Fixed mode** (current behaviour when saving):  
  \(\text{PSF} = v\)  
  where \(v\) is the numeric PSF field value.

- **Percentage mode** (legacy snapshots only, with `mode: "percentage"`):  
  \(\text{PSF} = R \times \dfrac{v}{100}\)

---

## 3. Cost (`cost`)

Purchase cost used for margin and default sell price:

\[
\text{cost} = R + \text{PSF}
\]

If the rate is missing or PSF does not apply, derived columns may be empty (`—`).

---

## 4. Markup (on **rate** \(R\), not on cost)

**Markup** in currency (same unit as the rate) is an increment on **\(R\)**, not on \(\text{cost}\).

### Markup amount (`getMarkupAmountOnRate`)

- No markup or value `0`: no amount shown.

- **Fixed:**  
  \(\text{markup} = m\)

- **Percentage:**  
  \(\text{markup} = R \times \dfrac{m}{100}\)

---

## 5. Default sell price (`defaultSellFromRate`)

If the user **does not** manually edit the sell cell:

- **No markup or markup 0:**  
  \(\text{sell}_{\text{default}} = \text{cost} = R + \text{PSF}\)

- **Fixed markup:**  
  \(\text{sell}_{\text{default}} = R + m\)  
  (same \(m\) as in the fixed markup amount.)

- **Markup %:**  
  \(\text{sell}_{\text{default}} = R \times \left(1 + \dfrac{m}{100}\right)\)

If the user **does** enter a manual sell price for the row, that value replaces \(\text{sell}_{\text{default}}\) for the calculations below.

---

## 6. Margin amount (`Margin` / `netMargin`)

\[
\text{margin} = \text{sell}_{\text{effective}} - \text{cost}
\]

where \(\text{sell}_{\text{effective}}\) is the manual sell price (if valid) or the value from the previous section.

---

## 7. Margin percentage (`Margin %` / `marginOnCostPct`)

Only if \(\text{cost} > 0\):

\[
\text{margin \%} = \dfrac{\text{margin}}{\text{cost}} \times 100
\]

If \(\text{cost} \le 0\), the percentage is not computed (shown as `—`).

---

## 8. Best rate (LCR across columns)

Among several selected columns, the best option uses the **minimum** valid \(R\) across the rate types/vendors visible for that row.

---

## 9. Applying PSF to the rate in snapshots (`applyFeesToRate`)

Used when saving **rate with fee** in the snapshot (`ratePlusExtra`), with logic **different** from the PSF amount column in the table:

- **PSF %:**  
  \(r' = r \times \left(1 + \dfrac{v}{100}\right)\)

- **PSF fixed:**  
  \(r' = r + v\)

New PSF snapshots usually use fixed mode in the data model; percentage remains for backward compatibility with old data.

---

## 10. Number formatting on screen (`utils.ts`)

| Helper | Behaviour |
|--------|-----------|
| `roundUpTo3Decimals` | **Round up** to 3 decimal places: \(\lceil 1000x \rceil / 1000\). |
| `formatRate` | Rate shown with 3 decimals after the rounding above. |
| `formatRateFull` | Intermediate quotation columns: **no** ceil; at least 3 decimal places, trailing zeros trimmed safely. |
| `formatMarginAmount` | Margin amount: **3 fixed decimals** (`toFixed(3)`). |
| `formatPercent` | Percentages (e.g. margin %): default **2 decimals**. |

---

## Quick reference

| Concept | Formula |
|---------|---------|
| Cost | \(R + \text{PSF}\) |
| Markup $ (on \(R\)) | fixed: \(m\) · %: \(R \cdot m/100\) |
| Default sell | no markup: \(\text{cost}\) · fixed markup: \(R+m\) · % markup: \(R(1+m/100)\) |
| Margin $ | \(\text{sell} - \text{cost}\) |
| Margin % | \((\text{margin}/\text{cost})\cdot 100\) if \(\text{cost} > 0\) |

If the implementation changes, update this file in the same PR.
