# CMD-020-REPORT — CANONICAL GOOGLE SHEETS PROVISIONING

Status: EXECUTED & STOPPED — NAMING AMBIGUITY ENCOUNTERED (LEGACY DATA PROTECTED)

## 1. Safety Checks & Metadata Inspection
- **Authentication**: PASS (Google Service Account credentials valid).
- **Spreadsheet Access**: PASS (`GOOGLE_SHEETS_SPREADSHEET_ID` accessible with read metadata privileges).
- **Legacy Protection**: PASS (Existing legacy `products` sheet detected and protected from modification/deletion).
- **Zero Write to Legacy**: PASS (Zero cells, rows, or headers altered in the existing `products` sheet).
- **Zero Migration**: PASS (No legacy data migrated or context IDs inferred).
- **Zero Business Data Seeding**: PASS (No sample tenants, stores, or products generated).
- **Credential Exposure**: NONE (No secret tokens, private keys, or emails exposed in code or logs).

## 2. Canonical Sheets Provisioning Audit

| Canonical Entity | Target Sheet Name | Status | Created Headers / Action Taken |
| :--- | :--- | :--- | :--- |
| **tenants** | `tenants` | **READY / CREATED** | `id, name, subscriptionPlan, isActive, createdAt, updatedAt` |
| **stores** | `stores` | **READY / CREATED** | `id, tenantId, name, createdAt` |
| **products** | `products` | **BLOCKED (LEGACY)** | **STOPPED**: Existing legacy sheet named `products` exists. Lacks required headers (`tenantId`, `storeId`, `currency`, `inStock`, `createdAt`, `updatedAt`). |
| **categories** | `categories` | **READY / CREATED** | `id, tenantId, storeId, name, description` |
| **customers** | `customers` | **READY / CREATED** | `id, tenantId, storeId, name, createdAt, phoneNumber, email, metadata` |
| **orders** | `orders` | **READY / CREATED** | `id, tenantId, storeId, customerId, totalAmount, currency, status, createdAt, updatedAt` |
| **order_items** | `order_items` | **READY / CREATED** | `id, orderId, productId, quantity, unitPrice, totalPrice` |
| **conversations** | `conversations` | **READY / CREATED** | `id, tenantId, storeId, customerId, agentId, channel, status, createdAt, updatedAt` |
| **agent_config** | `agent_config` | **READY / CREATED** | `id, tenantId, storeId, name, persona, tone, language, rules` |
| **store_settings** | `store_settings` | **READY / CREATED** | `id, tenantId, storeId, currency, language, timezone, contactInformation, policies` |

## 3. Structural Summary
- **Authentication**: PASS
- **Spreadsheet access**: PASS
- **Sheets created**: `tenants`, `stores`, `categories`, `customers`, `orders`, `order_items`, `conversations`, `agent_config`, `store_settings` (9 sheets)
- **Sheets already existing**: `products` (1 legacy sheet)
- **Headers created**: Canonical headers derived dynamically from `CanonicalSchemas` in `src/infrastructure/google-sheets/schema-definitions.ts`
- **Legacy sheets modified**: **NO**
- **Legacy data migrated**: **NO**
- **Business data seeded**: **NO**
- **Credential exposure**: **NONE**
- **Tenant isolation**: **PASS**
- **Store isolation**: **PASS**
- **Tests**: **PASS** (17 test suites, 117 unit tests passed)
- **TypeScript**: **PASS** (`npx tsc --noEmit` clean with 0 errors)
- **Build**: **PASS** (`npm run build` completed cleanly)

## 4. Technical Analysis & Ambiguity Root Cause
Google Sheets API forbids two sheets with the identical title (`products`) inside the same Spreadsheet ID. 
The existing spreadsheet contains a legacy `products` sheet that lacks the canonical multi-tenant fields (`tenantId`, `storeId`, `currency`, `inStock`, `createdAt`, `updatedAt`).

Per the explicit instructions of **CMD-020**:
1. Modifying or renaming the legacy `products` sheet is strictly forbidden.
2. Inventing an unapproved sheet name (e.g. `canonical_products` or `products_v2`) without prior documentation specification is strictly forbidden.
3. If an ambiguity exists regarding the canonical `products` sheet naming due to the existing legacy sheet, execution **MUST STOP** and report the ambiguity.

Per **DEC-003**, the system architecture specifies using a **Fresh Canonical Spreadsheet** as the MVP Runtime Data Provider to house all 10 canonical sheets cleanly without sheet name collisions with legacy sheets.

## 5. Final Verdict

**BLOCKED**

**Technical Reason**:
A sheet named `products` exists in the target spreadsheet containing legacy schema. Google Sheets cannot contain two sheets named `products` in a single spreadsheet. No alternative canonical sheet name for `products` is defined in project documentation (`schema-definitions.ts`, `docs/GOOGLE_SHEETS_SCHEMA.md`, `docs/GOOGLE_SHEETS_PROVISIONING.md`). To protect legacy business data and prevent unapproved schema alterations, the operation was safely halted in accordance with CMD-020 and DEC-003.

STOP. Awaiting project engineer review.
