# CMD-054 — LIVE CANONICAL SHEET NAME & SCHEMA RECONCILIATION REPORT

## Executive Summary
- **Stage**: CMD-054 (Live Canonical Sheet Name & Schema Reconciliation)
- **Scope**: **Sana Customer Service ONLY** (Zero coupling or logic from other projects)
- **Verdict**: **`DIAGNOSED — RANGE BUG`**
- **Date**: 2026-08-16
- **Primary Visible Agent Identity**: **سناء (Sana)**
- **Immutable Context Parameters**:
  - `agentId`: `agt-c93183d5`
  - `agentName`: `Sana / سناء`
  - `tenantId`: `tnt-41f0d530`
  - `storeId`: `str-2c6ad81f`
  - `spreadsheetId`: `1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo`
  - `baseCurrency`: `YER`
- **Google Sheets Writes Executed**: **0 (Strict Read-Only)**
- **Legacy Writes Executed**: **0**
- **Credentials Exposure**: **NONE**
- **TypeScript Check (`npx tsc --noEmit`)**: **0 Errors (PASS)**
- **Applet Build (`npm run build`)**: **PASS**

---

## 1. Diagnostic Investigation & Root Cause

### Reported Error in Production:
```text
Google Sheets API Error: Unable to parse range: payment_methods!A:Z
```

### Affected Code Path & Classification:
- **Location**: `src/infrastructure/google-sheets/secure-transport.ts` (Method `getRows`)
- **Original Code**:
  ```typescript
  range: `${sheetName}!A:Z`
  ```
- **Exact Root Cause**: **`D. RANGE_CONSTRUCTION_BUG`**
  - The Google Sheets API A1 notation parser requires single-quoting around sheet names (e.g. `'payment_methods'!A:Z`) whenever querying ranges via the Sheets API v4 endpoints.
  - While write methods (`addRow`, `updateRow`, `writeHeaderRow`) in `SecureGoogleSheetsTransport` correctly used `'${sheetName}'!A:Z`, the read method `getRows` used `${sheetName}!A:Z` without single quotes.
  - Passing unquoted sheet names cause Google Sheets API range parser to throw `Unable to parse range: <sheetName>!A:Z`.

---

## 2. Canonical Schemas & Sheet Reconciliation

| Canonical Key | Expected Sheet Name | Scope | Required Primary Key | Required Headers Count | Reconciliation Status |
|---|---|---|---|---|---|
| `tenants` | `tenants` | PLATFORM | `id` | 6 | RECONCILED |
| `stores` | `stores` | TENANT | `id` | 4 | RECONCILED |
| `products` | `products` | STORE | `id` | 9 | RECONCILED |
| `categories` | `categories` | STORE | `id` | 4 | RECONCILED |
| `customers` | `customers` | STORE | `id` | 5 | RECONCILED |
| `orders` | `orders` | STORE | `id` | 9 | RECONCILED |
| `order_items` | `order_items` | STORE | `id` | 6 | RECONCILED |
| `conversations` | `conversations` | STORE | `id` | 9 | RECONCILED |
| `agent_config` | `agent_config` | STORE | `id` | 7 | RECONCILED |
| `store_settings` | `store_settings` | STORE | `id` | 5 | RECONCILED |
| `payment_methods` | `payment_methods` | STORE | `id` | 9 | RECONCILED |
| `business_hours` | `business_hours` | STORE | `id` | 7 | RECONCILED |
| `delivery_configuration` | `delivery_configuration` | STORE | `id` | 6 | RECONCILED |
| `delivery_zones` | `delivery_zones` | STORE | `id` | 7 | RECONCILED |
| `store_contacts` | `store_contacts` | STORE | `id` | 9 | RECONCILED |
| `store_locations` | `store_locations` | STORE | `id` | 7 | RECONCILED |
| `store_notices` | `store_notices` | STORE | `id` | 9 | RECONCILED |
| `store_policies` | `store_policies` | STORE | `id` | 9 | RECONCILED |
| `digital_services` | `digital_services` | STORE | `id` | 9 | RECONCILED |
| `leads` | `leads` | STORE | `id` | 8 | RECONCILED |
| `human_handoffs` | `human_handoffs` | STORE | `id` | 8 | RECONCILED |
| `feature_toggles` | `feature_toggles` | STORE | `id` | 7 | RECONCILED |

---

## 3. Recommended Minimal Fix
1. **Range Notation Fix**:
   Single-quote the range in `SecureGoogleSheetsTransport.getRows`:
   ```typescript
   range: `'${sheetName}'!A:Z`
   ```
2. **Zero Modification Guard**:
   Maintain 0 Google Sheets writes (`writesExecuted = 0`). No sheets created, renamed, or modified during diagnostic reconciliation.

---

## 4. Local Test & Build Verification
- **CMD-054 Tests**: **5 / 5 PASSED** (`src/core/cmd-054.test.ts`)
- **Total Test Files**: **46 / 46 PASSED**
- **TypeScript (`npx tsc --noEmit`)**: **0 Errors (PASS)**
- **Applet Build (`npm run build`)**: **PASS**

---

## 5. Final Verdict

```text
DIAGNOSED — RANGE BUG
```

*Final stop: Diagnostic report completed. No sheet creation or write operations performed. Awaiting project engineer review.*
