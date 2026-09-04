# WOSG Load Sheet Template Library — v1 (seeded from supplied examples)
*Derived from `Loadsheets - 21-12-21` (329 files). This is the first cut of the knowledge base described in the requirements spec's Section 6.3. A companion file, `loadsheet-extraction-raw.json`, has the full machine-readable extraction (every INSERT_UPDATE/UPDATE header line, every `includeExternalDataMedia` call, and the matched CSV header row) — this document is the human-readable digest of it.*

## 1. Universal ImpEx conventions (apply to nearly every script)

**Standard preamble**, present at the top of almost every import script:
```
"#% impex.enableCodeExecution(true);"
$productCatalog=masterProductCatalog
$lang=en
$catalogVersion=catalogversion(catalog(id[default=$productCatalog]),version[default='Staged'])[unique=true,default=$productCatalog:Staged]
```
- Product-level scripts use `$productCatalog=masterProductCatalog`. **Category-level scripts instead hard-code a specific site catalog** (e.g. `catalog(id[default='Goldsmiths_UK_ProductCatalog'])`) — categories are per-site, products aren't.
- `$lang=en` / `$lang2=en_US` appear when a script writes localized fields (`name[lang=$lang]`, `description[lang=$lang2]`) — `$lang2` is only added when the US variant of the same field needs its own value.
- Other recurring macros: `$supercategories=supercategories(code,$catalogVersion)[mode=append]`, `$approved=approvalstatus(code)[default='unapproved']`, `$unit=unit(code)[default=EA]`.

**Header line** (defines the item type + columns):
```
INSERT_UPDATE Product;code[unique=true];<col2>;<col3>;...;$catalogVersion
```
- `INSERT_UPDATE` is used for the large majority. `UPDATE` appears for Category and a couple of Product/VariantProduct scripts where the record must already exist (no accidental creation).
- The unique key is virtually always `code[unique=true]` (SKU for products, category code for categories), except `VariantProduct` scripts which key on `baseProduct(code,$catalogVersion);code[unique=true]`.
- A single script can define **multiple header blocks back-to-back** (e.g. Facets: one block for `ProductFacetType`, one for `ProductFacetValue`; Stores: eleven blocks across `Address`, `OpeningSchedule`, `WeekdayOpeningDay`, `AurumPointOfService`, `Media`, `StoreBrand`), each with its own `includeExternalDataMedia` call if it pulls from a CSV.

**External CSV loading:**
```
"#% impex.includeExternalDataMedia( ""FileName.csv"", ""UTF-8"", ',', 1, 0);"
```
Params: `(filename, encoding, delimiter, linesToSkip, columnsOffset)`. `linesToSkip=1` (skip the CSV's own header row) is universal. Delimiter is `,` in almost every case — one example (`SpecialBrandFeatures`) uses `;`.

**⚠️ `columnsOffset` gotcha — the thing that broke [[see-more-styles-impex]]:**
Most CSVs in this set follow a house convention of a leading `Type (Leave Blank)` column (left empty in every row — a leftover of the HAC export template) before the real data starts, and often a trailing `Catalogue Version (Leave Blank)` column too. When that leading blank column is present, `columnsOffset=0` is correct. When a CSV has **no** leading blank column (data starts in column A), `columnsOffset` must be `-1`, or every value shifts one column left and SAP throws "unknown type" errors on import. Confirmed both ways in this set:
- `columnsOffset=0` (56 of 59 scripts) — CSV has the leading blank column.
- `columnsOffset=-1` (3 scripts: both SeeMoreStyles Append/Remove scripts, and SpecialBrandFeatures) — CSV has no leading blank column.
This isn't fully self-consistent across the set (a handful of scripts show offset=0 with a CSV column count that doesn't cleanly match the header + 1 rule — those are shared "scratch" folders reused for different one-off jobs over time, so the CSV currently sitting there isn't always the CSV that script was last correctly paired with). **Recommendation for the app:** don't derive `columnsOffset` from first principles — copy it from the closest matching library template, and validate the generated CSV's column count against the header line's column count (±1 for the leading blank convention) before finalising output.

**Boolean fields:** written as `TRUE`/`FALSE` (all caps) in the CSV, with `[default=False]` on the header column when the field should default off if left blank. Booleans are almost always paired with a simple 3-column pattern: `Type (blank), SKU, <value>, Catalogue Version (blank)`.

**Collections / multi-value references:** e.g. `seeMoreStyles(code,$catalogVersion)[mode=append]`, `youMayAlsoLike(code,$catalogVersion)[mode=append]`. CSV cell holds a comma-separated list inside quotes: `"17331268,17331097,17331228"`. **Append and Remove are always separate script+CSV pairs** with matching column layouts — `[mode=append]` vs `[mode=remove]` is the only difference between them.

**Per-site reference fields:** e.g. `syncToSite(uid)`, `purchaseOnSite(uid)`, `homeDeliveryAvailableOnSite(uid)` — CSV cell holds a comma-separated list of site UIDs, e.g. `"Betteridge_US, Mayors_US, WatchesOfSwitzerland_US"`.

**Facet maps (on variants):** `productFacetMap(key(code),value(code))[map-delimiter=|]` — CSV cell format `RingSize->I`.

**Dates:** `publishedDate[dateformat='dd/MM/yyyy HH:mm']`.

## 2. Catalog of load sheet types found

### Categories
| Load sheet | Item type(s) | Notes |
|---|---|---|
| Category → Product append/remove | `Product` (`$supercategories`) | Adds/removes a product from categories; Append & Remove folders mirror each other |
| Category Description | `UPDATE Category` | Description text by category code, per-site catalog |
| Category Meta Description | `UPDATE Category` | Meta description by category code |
| Site Category Attributes | `SiteCategoryAttribute` + `Category` | Two-block script, inline (no external CSV) |

### Facets
| Load sheet | Item type(s) | Notes |
|---|---|---|
| Facet Types + Values (combined) | `ProductFacetType` + `ProductFacetValue` | Two blocks, two CSVs, in one script |
| Facet Types only | `ProductFacetType` | UK and US variants (separate catalogs) |
| Facet Values only | `ProductFacetValue` | UK and US variants |
| Product Facet import (append) | `Product` | Assigns facet type/value to a product by SKU |
| Facet export (types / values / list / wildcard) | `ProductFacetType`/`Value`/`Product` | Export-direction scripts — see Section 3 |

### Orders
| Load sheet | Item type(s) | Notes |
|---|---|---|
| Order export (full) | `Order` | 59 columns — comprehensive order data pull, export-direction |
| Order export (slim) | `Order` | 6-column cut-down variant |

### Products — the largest group by far (~85 of the 109 scripts)
| Load sheet | Item type(s) | Notes |
|---|---|---|
| **Master Product Loadsheet** | `Product` | The "everything" loadsheet — 42 columns covering name/description (2 languages), categories, per-site availability flags, associated products, metadata, special brand fields, product type, published date, approval status. Three variants exist (general, Rolex-specific, a working copy) with slightly different column sets — treat as the master template but confirm which variant applies |
| Product Type | `Product` | Single-column product type assignment, very large CSV (thousands of SKUs) |
| Product Description | `Product` | Description text only |
| Product Name | `Product` | Name only |
| Product Notes | `Product` | Internal notes field |
| maxOrderQuantity | `Product` | Simple 1-value-per-SKU pattern — see [[ecom-2480-max-order-quantity]] |
| Measurements | `Product` | Localized measurements text |
| Metadata (full / keywords+title / keywords only / title only) | `Product` | Four variants of the same meta fields, different column subsets |
| Video URL | `Product` | Product video URL |
| Product Specification Sequence | `ProductFacetType` | Despite the "Products" folder location, this actually targets `ProductFacetType` |
| Approval | `Product` | Sets approval status |
| Finance Exclusions (Append/Remove) | `Product` | Collection field, mode=append vs mode=remove pair |
| Associated Products — "All Associations In One" (Append/Remove) | `Product` | Sets `seeMoreStyles` + `youMayAlsoLike` together, mode=append vs remove |
| Associated Products — See More Styles (Append/Remove) | `Product` | Single-field version — **this is the pair with the `columnsOffset=-1` gotcha** — see [[see-more-styles-impex]] |
| Variant Products (with facets / without facets / change parent-child) | `VariantProduct` | With-facets version includes `productFacetMap`; keyed on `baseProduct(code,$catalogVersion);code` |
| USRingBuilder | `Product` | 38-column ring-builder base product setup |
| Site Settings (Append/Remove) | `Product` | 12 per-site availability flags (sync, purchase, price visible, virtual stock, gift wrap, home delivery, C&C, PayPal Credit/Express), mode=append vs remove |
| C&C Restriction (import/export, old/new, TrueFalse variants) | `Product` | Click & collect restriction flag, several historical variants in the folder |
| TrueFalse — SAPLoaded | `Product` | Boolean `sapLoaded` flag — see [[sap-readonly-replica-cpu]]-adjacent context if relevant |
| TrueFalse — Restricted Fraud (True/False) | `Product` | Boolean flag, separate folders per direction rather than a single toggle column |
| TrueFalse — usePngImageFormat, isManufacturerProductNumberHidden, IsSpecialOrder, Home-CC-SpecialOrder | `Product` | Simple boolean-flag pattern, repeated per attribute |
| TrueFalse — YMAL Loadsheets (Campaign / Enabled / Campaign & Enabled / RolexCPO Master) | `Product` | You-May-Also-Like campaign flags; RolexCPO variant is a 43-column master-style sheet |
| Special Brand — Description, Import, Export (List/Wildcard), ProductSpecialBrand3, ProductCssClasses | `Product` + `SpecialBrandFeature` | Several related but distinct scenarios under one folder |
| Special Delivery — assign message, export (list/wildcard) | `Product` | Delivery message/range assignment — related to [[ecom-1706-delivery-message]] |
| Akamai — Image Count, Roundels (import/export), additional image URL list (add/remove) | `Product` | Akamai-specific product image/roundel metadata |
| SOLR Tiebreaker Values (Mayors US, WOS US) | `Product` | Search sort-score override, per-site |
| Product Exports (SKU only, SKU approved, description, name, page title, image count, saploaded, seeMoreStyles, virtual, finance exclusions) | `Product` | All export-direction, single or few columns each |

### Solr
| Load sheet | Item type(s) | Notes |
|---|---|---|
| Exclude from Solr | `Product` | Boolean-style exclusion flag |
| Solr Facets/Properties | `SolrIndexedProperty` + `SolrSearchQueryProperty` | Two-block script, inline (no CSV), 25 + 9 columns |

### Stores
| Load sheet | Item type(s) | Notes |
|---|---|---|
| New store setup | `Address`, `OpeningSchedule`, `WeekdayOpeningDay`, `AurumPointOfService`, `StoreDescription`, `Media`, `StoreBrand` | The most complex script in the set — 11 header blocks in one file, inline (no external CSV), building up a complete store record end-to-end |

## 3. Import vs. export scripts — a scope question
A meaningful chunk of the supplied examples (Product Exports folder, the Facets/Orders/Special Brand/Special Delivery "Export" subfolders, Category export-style scripts) are **export-direction**: they pull data out of SAP Commerce as a CSV (by SKU list or wildcard) rather than loading data in. Same `INSERT_UPDATE`-style header-line syntax, but used with SAP Commerce's export/preview mechanism rather than an import.

This is a related but distinct capability to what the requirements spec scoped (generating an import load sheet + CSV to upload). Worth deciding: is generating export scripts in scope for v1, a v2 addition, or explicitly out of scope? Flagged as an open question in the main spec.

## 4. Suggested library record shape
Each entry in `loadsheet-extraction-raw.json` (and so each template the app's library should store) has: source path/name, one or more `{op, itemType, columns}` header blocks, the `includeExternalDataMedia` call(s) with their exact params, the matched CSV header row, and the macros the script defines. That's a reasonable shape to carry forward into the actual app's stored template schema.
