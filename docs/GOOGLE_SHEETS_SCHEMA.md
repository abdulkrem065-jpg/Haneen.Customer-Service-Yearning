# Google Sheets Data Schema & Provisioning Plan

## Overview (DEC-003)
The system uses a **FRESH CANONICAL SPREADSHEET** as the primary data source. 
The legacy spreadsheet is preserved as an **ARCHIVED SOURCE** and is excluded from the new MVP Runtime Data Provider. There is no automatic migration.

## Universal Data Policies
- **Identifiers:** Primary keys (`id`) must be independent unique identifiers (e.g., UUID/CUID), NEVER Google Sheet row numbers.
- **Timestamps:** `createdAt` and `updatedAt` must follow the ISO-8601 standard format (e.g., `2026-08-08T15:30:00Z`).
- **Money Policy:** Financial values are separated into `price` (Numeric) and `currency` (String, e.g., 'USD', 'SAR', 'YER'). Formatted text like "1000 ريال" is strictly forbidden in numeric fields.
- **Boolean Policy:** The application domain uses `boolean` (`true`/`false`), which the Google Sheets Mapper translates into Google Sheets conventions (`نعم` for `true`, `لا` for `false`).
- **Secrets Policy:** `API Keys`, `Passwords`, `OAuth Tokens`, and `Service Account Private Keys` are **STRICTLY PROHIBITED** from being stored in Google Sheets.
- **Multi-Tenancy:** The Trusted Context (`DataOperationContext`) strictly dictates the `tenantId` and `storeId` filters during reads and sets them during writes. AI cannot guess or override these.

---

## Canonical MVP Sheets Structure

### 1. tenants (PLATFORM SCOPE)
Contains top-level SaaS tenants.
- `id` (PK, string)
- `name` (string)
- `subscriptionPlan` (string)
- `isActive` (boolean - نعم/لا)
- `createdAt` (ISO-8601 string)
- `updatedAt` (ISO-8601 string)

### 2. stores (TENANT SCOPE)
Contains stores belonging to tenants.
- `id` (PK, string)
- `tenantId` (FK, string)
- `name` (string)
- `createdAt` (ISO-8601 string)

### 3. products (STORE SCOPE)
Contains products available in a specific store.
- `id` (PK, string)
- `tenantId` (FK, string)
- `storeId` (FK, string)
- `categoryId` (FK, string, optional)
- `name` (string)
- `description` (string, optional)
- `price` (number)
- `currency` (string)
- `inStock` (boolean - نعم/لا)
- `quantity` (number, optional)
- `imageUrl` (string, optional)
- `metadata` (JSON string, optional)
- `createdAt` (ISO-8601 string)
- `updatedAt` (ISO-8601 string)

### 4. categories (STORE SCOPE)
Product categories mapping.
- `id` (PK, string)
- `tenantId` (FK, string)
- `storeId` (FK, string)
- `name` (string)
- `description` (string, optional)

### 5. customers (STORE SCOPE)
Customer records specific to a store.
- `id` (PK, string)
- `tenantId` (FK, string)
- `storeId` (FK, string)
- `name` (string)
- `phoneNumber` (string, optional)
- `email` (string, optional)
- `metadata` (JSON string, optional)
- `createdAt` (ISO-8601 string)

### 6. orders (STORE SCOPE)
Order header information.
- `id` (PK, string)
- `tenantId` (FK, string)
- `storeId` (FK, string)
- `customerId` (FK, string)
- `totalAmount` (number)
- `currency` (string)
- `status` (string: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED)
- `createdAt` (ISO-8601 string)
- `updatedAt` (ISO-8601 string)

### 7. order_items (STORE SCOPE)
Line items belonging to an order.
- `id` (PK, string)
- `orderId` (FK, string)
- `productId` (FK, string)
- `quantity` (number)
- `unitPrice` (number)
- `totalPrice` (number)

### 8. conversations (STORE SCOPE)
Records of customer-agent chat sessions, designed to support multiple channels.
- `id` (PK, string)
- `tenantId` (FK, string)
- `storeId` (FK, string)
- `customerId` (FK, string)
- `agentId` (FK, string)
- `channel` (string, e.g., 'WEB', 'WHATSAPP')
- `status` (string: ACTIVE, CLOSED, HUMAN_HANDOFF, WAITING_FOR_HUMAN)
- `createdAt` (ISO-8601 string)
- `updatedAt` (ISO-8601 string)

### 9. agent_config (STORE SCOPE)
Defines behavior identity and configuration for AI agents attached to a store.
- `id` (PK, string)
- `tenantId` (FK, string)
- `storeId` (FK, string)
- `name` (string)
- `persona` (string)
- `tone` (string)
- `language` (string)
- `rules` (JSON string array, optional)

### 10. store_settings (STORE SCOPE)
Business configurations for a specific storefront.
- `id` (PK, string)
- `tenantId` (FK, string)
- `storeId` (FK, string)
- `currency` (string)
- `language` (string)
- `timezone` (string, optional)
- `contactInformation` (JSON string, optional)
- `policies` (JSON string, optional)
