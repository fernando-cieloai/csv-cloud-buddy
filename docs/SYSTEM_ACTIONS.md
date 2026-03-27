# System actions (feature checklist) — **English**

What the **Phone Rates / CSV Data Importer** app does. For tickets, release notes, or QA.

---

## Flat list (copy-paste for tickets)

Short **one-action** bullets (same style as “create vendor”, “calculate markup”).

- Show main nav: Quotations, Vendors, Clients, Countries, Master List
- Show breadcrumbs
- Show home welcome text
- List vendors (paginated)
- Sort vendors
- Create vendor
- View vendor
- Edit vendor
- Delete vendor
- Set vendor active / disabled
- Show which vendors have a file uploaded
- Open upload dialog for a vendor
- Download vendor rate template (XLSX)
- Upload CSV or XLSX for a vendor
- Validate rows on upload
- Replace full vendor file (import mode)
- Merge vendor file with `comment` column (import mode)
- Download XLSX of parse-error rows
- Download XLSX of invalid-comment rows (merge)
- Download missing–Master-List prefixes report (XLSX)
- Show legacy `/upload` page (CSV help + uploader)
- List clients
- Create client
- Edit client
- Delete client
- Link client to saved quotations
- Filter quotations by client
- Open Countries: Groups tab
- Open Countries: Countries tab
- Search groups table
- Search countries table
- Paginate groups / countries
- Sort groups / countries
- Create group
- Edit group
- Delete group
- Assign countries to a group
- Create country
- Edit country
- Delete country
- Assign groups to a country
- List Master List rows (paginated)
- Sort Master List
- Search Master List
- Create Master List row
- Edit Master List row
- Delete Master List row
- Upload Master List file
- List saved quotations (paginated)
- Sort quotation history
- Search quotations by name
- Filter quotations by client
- Filter quotations by status
- Filter quotations by date range
- View quotation snapshot (dialog)
- Edit quotation (full screen)
- Export quotation from history (XLSX)
- Archive quotation
- Unarchive quotation
- Go to create quotation
- Filter quotation table by countries **or** groups (exclusive)
- Multi-select countries
- Multi-select groups
- Search in country picker
- Search in group picker
- Pick vendor × rate-type columns
- Filter “only Master List networks”
- Set PSF (fixed)
- Set markup (fixed or % on rate)
- Apply filters and load rates
- Search quotation table (country / prefix / type)
- Paginate quotation by network rows
- Show best LCR per row
- Override selected vendor column per row
- Calculate PSF amount
- Calculate cost (rate + PSF)
- Calculate markup amount (on rate)
- Calculate default sell
- Calculate margin ($)
- Calculate margin (%)
- Edit sell rate manually (per row)
- Sort quotation columns
- Stripe quotation rows
- Tooltip when network not in Master List
- Export quotation XLSX (countries uppercase)
- Save quotation (name, client, snapshot)
- Create client inline (save dialog)
- Create country group from quotation UI
- Load Supabase data (rates, RPCs)

---

## Navigation & shell

- Show main navigation: Quotations, Vendors, Clients, Countries, Master List
- Show breadcrumbs for the current route
- Home page with welcome copy

---

## Vendors (`/vendors`)

- List all vendors (paginated table)
- Sort vendors by name, description, status, or “has uploaded file”
- Create vendor (name, description, status: active / disabled)
- View vendor details in a dialog
- Edit vendor
- Delete vendor
- Show whether each vendor has at least one CSV/XLSX upload linked
- Open upload dialog scoped to a selected vendor
- Download vendor rate template (XLSX)
- Upload CSV or XLSX for a vendor: parse file, validate rows
- Choose import mode: **replace entire file** or **field update (merge)** using optional `comment` column (`No changes`, `Increment`, `Decrement`, `New brand`)
- On merge with existing data: update/add rows per comment rules; track invalid comments
- Report rows whose prefixes are missing from the Master List (download XLSX report)
- Download XLSX of **parse errors** (rows that failed validation during import)
- Download XLSX of **invalid comment** rows (merge mode)
- Legacy `/upload` page: general CSV upload instructions and uploader (route exists; may be secondary to per-vendor upload)

---

## Clients (`/clients`)

- List clients
- Create, edit, delete client (name, description)
- Use clients when saving quotations and filtering quotation history

---

## Countries & groups (`/countries`)

- Switch tabs: **Groups** vs **Countries**
- **Groups:** list (paginated), sort, search, create / edit / delete group, assign countries to a group (checkbox list with search)
- **Countries:** list (paginated), sort, search, create / edit / delete country, assign groups to a country
- Link to Master List where relevant

---

## Master List (`/master-list`)

- Load and paginate country/region rows (chunked fetch from Supabase)
- Sort and search Master List table
- Create, edit, delete region rows (country, region, region code, dates)
- Upload countries/regions file via dedicated uploader
- View row details

---

## Quotation history (`/quotations`)

- List saved quotations (paginated)
- Sort by name, client, vendor, status, created date
- Filter by name search, client, status, date range
- View quotation snapshot in a dialog (read-only table)
- Open quotation for **edit** (navigate to edit screen)
- Export quotation as XLSX from history (where implemented)
- Archive / unarchive quotation (or equivalent status)
- Navigate to **create new quotation**

---

## Quotation builder — create & edit (`/quotations/create`, `/quotations/:id/edit`)

- Load vendors, uploads, countries, groups, clients from Supabase
- Select **filter mode:** countries **or** groups (exclusive; switching clears the other selection)
- Multi-select countries or multi-select groups (with counts in the trigger label)
- Search countries list and groups list in the pickers
- Select **vendor × rate type** columns to compare (multi-column quotation table)
- Optional: filter table to **only networks present in Master List**
- Configure **PSF** (fixed fee amount on the selected rate path used in the UI)
- Configure **markup** (fixed or percentage **on the selected rate**, not on cost)
- **Apply** configuration and load rates via RPC (`get_quotation_rates_page`, `get_quotation_networks_count`)
- **Search** table: by country, prefix, or network/type (debounced; matches backend `p_search_by`)
- **Paginate** quotation results by **network row** (aggregated rows), with page size and total count
- Show per row: country, network, prefixes, rates per selected vendor column, best LCR, selected column, PSF amount, cost (`rate + PSF`), markup amount, margin ($), margin (%), sell rate (default from markup rules or manual override)
- Per-row override: choose which vendor column is “selected”; edit sell rate manually
- Sort quotation table columns (country, network, prefix, rates, margins, etc.)
- Visual row striping; tooltips for rows not in Master List
- **Export** current quotation view to XLSX (countries uppercased in export; sell rate and template columns)
- **Save** quotation: name, optional client, snapshot with fees, display columns, rows
- **Create client inline** from save dialog (when applicable)
- **Create country group** from quotation UI (from selected countries or from group merge flow — as implemented)
- Edit existing quotation: load snapshot, adjust columns/fees/rows, save updates

---

## Calculations (quotation table)

- Compute PSF amount (fixed; legacy % on snapshots supported in code paths)
- Compute **cost** = selected rate + PSF amount
- Compute **markup amount** on the selected rate (fixed or %)
- Compute **default sell** from rate + markup rules; manual sell overrides
- Compute **margin $** = sell − cost
- Compute **margin %** = margin / cost when cost > 0
- Format rates/margins for display (`formatRateFull`, `formatMarginAmount`, etc.)

---

## Data & backend (high level)

- Store `phone_rates` linked to `csv_uploads` and `vendors`
- Store `country_regions` (Master List)
- Store `saved_quotations` with JSON snapshot
- RPCs for paginated quotation rates and network counts (filters: uploads, countries, search)

---

*Generated from the codebase structure; adjust if a feature is behind a flag or environment.*
