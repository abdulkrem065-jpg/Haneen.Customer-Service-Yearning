# CMD-058 — SAFE MISSING-SHEET HANDLING & LIVE READ RECOVERY REPORT

## Executive Summary
- **Stage**: CMD-058 (Safe Missing-Sheet Handling & Live Read Recovery)
- **Scope**: **Sana Customer Service ONLY** (Zero coupling or logic from other projects)
- **Local Status**: **`APPROVED — LOCAL MISSING-SHEET HANDLING VERIFIED (100%)`**
- **Deployment Status**: **`BLOCKED — LOCAL ONLY`** *(Production verification on Render requires store owner deployment trigger & entering `ADMIN_VERIFY_SECRET` in browser at `https://haneen-customer-service-yearning.onrender.com/api/admin/live-haneen-verification-ui`)*
- **Date**: 2026-08-16
- **Primary Visible Agent Identity**: **سناء (Sana)**
- **Immutable Operational Context**:
  - `agentId`: `agt-c93183d5`
  - `agentName`: `Sana / سناء`
  - `tenantId`: `tnt-41f0d530`
  - `storeId`: `str-2c6ad81f`
  - `spreadsheetId`: `1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo`
  - `baseCurrency`: `YER`
- **Google Sheets Writes Executed**: **0 (Strict Read-Only)**
- **TypeScript Check (`npx tsc --noEmit`)**: **0 Errors (PASS)**
- **Applet Build (`npm run build`)**: **PASS**

---

## 1. Root Cause & Architectural Fix

- **Root Cause Confirmed**:
  Requesting an A1 range for a worksheet tab that does not exist in the Google Spreadsheet causes Google Sheets API v4 (`spreadsheets.values.get`) to throw `HTTP 400 Bad Request: Unable to parse range: <sheetName>!A:Z`.
- **Architectural Solution Implemented**:
  1. **Short-TTL Metadata Caching**:
     Added 15-second TTL cache (`cachedMetadata`, `METADATA_TTL_MS = 15000`) in `SecureGoogleSheetsTransport` to optimize metadata lookups without stale state.
  2. **Existence Pre-Check (`hasSheet`)**:
     Before issuing `values.get`, `getRows(sheetName)` inspects metadata via `hasSheet(sheetName)`.
     - If the sheet tab is **NOT** present in metadata: Returns `[]` cleanly (classified as `SHEET_NOT_FOUND`).
     - If the sheet tab **IS** present: Issues `values.get` using `buildA1Range(sheetName, 'A:Z')`.
  3. **Strict Error Classification**:
     If `values.get` fails for a sheet present in metadata, the error is NOT swallowed as `[]`. It is propagated via `handleApiError(error)` as a true `ProviderError` / `DataUnavailableError` (`SHEET_READ_FAILED`), preventing false `0` counts in domain facades.
  4. **Central Range Helper (`buildA1Range`)**:
     Quotes and escapes apostrophes (`'`) for titles with spaces or hyphens, while keeping simple alphanumeric titles unquoted per Google API standard notation.

---

## 2. Data Provider & Error Classification Semantics

| Condition | Transport Response | Provider/Facade Status |
|---|---|---|
| **Sheet Not Present in Metadata** | Returns `[]` | `SHEET_NOT_FOUND` (Empty Dataset) |
| **Sheet Present but 0 Rows** | Returns `[]` | `EMPTY` (Empty Dataset) |
| **Sheet Present but Read Error (500/400/Network)** | Throws `ProviderError` / `DataUnavailableError` | `SHEET_READ_FAILED` (No False Zero Count) |
| **Invalid Authentication (401/403)** | Throws `ProviderError` | `AUTHENTICATION_FAILED` |

---

## 3. Local Test Suite & Build Verification

- **CMD-058 Tests**: **9 / 9 PASSED** (`src/core/cmd-058.test.ts`)
- **Total Test Files**: **50 / 50 PASSED**
- **TypeScript Check (`npx tsc --noEmit`)**: **0 Errors**
- **Applet Build (`npm run build`)**: **PASS**
- **Google Sheets Writes**: **0**

---

## 4. Live Verification Protocol (For Store Owner)

To verify the live read recovery on Render Production:
1. Access: `https://haneen-customer-service-yearning.onrender.com/api/admin/live-haneen-verification-ui`
2. Input `ADMIN_VERIFY_SECRET` directly in the browser UI.
3. The UI will run read checks across all operational sheets (`products`, `categories`, `payment_methods`, `store_contacts`, `business_hours`, `delivery_configuration`, `delivery_zones`, `store_locations`, `store_notices`, `store_policies`, `digital_services`).

---

## 5. Final Verdict

```text
FINAL VERDICT: BLOCKED — LOCAL ONLY
```

*Final stop: Safe missing-sheet handling and metadata pre-checking applied and verified 100% locally across unit tests, linter, and build. No write operations performed. Awaiting project engineer review.*
