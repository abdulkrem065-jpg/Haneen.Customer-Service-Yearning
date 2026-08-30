# CMD-093 Report: Admin Order Operations Forensic Audit

**Project:** Sana / سناء — خدمة عملاء متجر الذيباني  
**Audit Scope:** Admin Order Center, Order Checkout Engine, Google Sheets Order Store, Customer Identity, and Order Cancellation Schemas.  
**Audit Mode:** Forensic Diagnosis & Design (No functional code or Google Sheets mutations applied).  
**Final Verdict:** `DIAGNOSED — ADMIN ORDER OPERATIONS GAPS`

---

## Executive Summary

A forensic audit of the order lifecycle pipeline—from conversational checkout in `OrderCheckoutEngine` through `GoogleSheetsOrderStore` and domain mappers to `StoreSettingsAdmin.tsx`—revealed three critical functional gaps:

1. **Customer Name Dropped at Checkout Payload:** `OrderCheckoutEngine` collects `state.customerName` during conversational turns, but **omitted `customerName`** when constructing the payload for `orderStore.createOrder()`.
2. **Missing Cancellation/Rejection Data Schema:** The `orders` schema lacks audit fields for cancellation (`cancellationReason`, `cancelledBy`, `cancelledAt`), preventing administrators from tracking why or by whom an order was cancelled.
3. **Uncategorized Order Views & Missing Search/Filter:** `StoreSettingsAdmin.tsx` renders active and historical/cancelled orders in a single, unseparated list with no search bar (Order ID/Name/Phone) or status filtering.

---

## 1. Item Name Analysis (`productNameSnapshot`)

### 1.1 Code Pipeline Audit
* **Schema Definition (`schema-definitions.ts`):** `CanonicalSchemas.order_items` defines `optionalHeaders: ['productNameSnapshot', 'unitPriceSnapshot', 'subtotal']`.
* **Mapper (`domain-mappers.ts`):** `OrderItemMapper` reads `productNameSnapshot` from sheet rows and maps it to `productNameSnapshot` and `productName` properties on the `OrderItem` domain object.
* **Store (`GoogleSheetsOrderStore.ts`):** `createOrder` accepts `productNameSnapshot` in item payloads and writes it to the `order_items` sheet.
* **UI Component (`StoreSettingsAdmin.tsx`):** Displays `{item.productNameSnapshot || item.productName || item.productId || 'منتج غير محدد'}`.

### 1.2 Root Causes for `productId` Display
1. **Legacy Rows in Google Sheets:** Orders created before `productNameSnapshot` header initialization in Google Sheets contain empty cells for item names, forcing UI fallback to `productId`.
2. **Direct Item Addition by ID:** If items were added directly by `productId` without resolving catalog metadata, `productNameSnapshot` was stored as `undefined` or empty string.

---

## 2. Customer Identity Audit (`customerName`, `customerPhone`, `customerId`)

### 2.1 Code Pipeline Audit
* **Domain & Mapper:** `Order` and `OrderMapper` properly define and map `customerName` and `customerPhone`.
* **GoogleSheetsOrderStore:** Strictly enforces `customerPhone` and `customerName` from payload with **zero fallback to store contact numbers** (preventing store phone corruption).

### 2.2 Root Cause of Missing `customerName`
In `src/core/orders/order-checkout-engine.ts` (lines 229–248):
```typescript
// OrderCheckoutEngine.ts
createdOrder = await this.orderStore.createOrder(
  {
    customerId: 'cst-web-customer',
    customerPhone: state.customerPhone || '',
    // BUG FOUND: customerName: state.customerName WAS OMITTED HERE!
    items: state.cart.map(i => ({ ... })),
    ...
  },
  context
);
```
While `OrderCheckoutEngine` collects `state.customerName` during user dialog, it **did not pass `customerName: state.customerName`** in the object argument sent to `orderStore.createOrder()`. Consequently, `payload.customerName` arrived as `undefined`, saving as `""` (empty string) in Google Sheets.

### 2.3 Identity Validation Gap
`OrderCheckoutEngine` allows advancing to `AWAITING_CONFIRMATION` or creating orders even if `customerName` or `customerPhone` are empty, allowing incomplete customer identities to be committed.

---

## 3. Cancellation & Rejection Audit

### 3.1 Current Schema Audit
* `CanonicalSchemas.orders` currently contains:
  * `requiredHeaders`: `['id', 'tenantId', 'storeId', 'customerId', 'totalAmount', 'currency', 'status', 'createdAt', 'updatedAt']`
  * `optionalHeaders`: `['subtotal', 'deliveryFee', 'paymentMethodId', 'paymentMethodName', 'paymentStatus', 'deliveryAddress', 'customerName', 'customerPhone', 'notes']`
* **Deficit:** There are **no fields** for `cancellationReason`, `cancelledBy`, or `cancelledAt`.

### 3.2 Current UI Behavior
In `StoreSettingsAdmin.tsx`, when an admin selects `CANCELLED` from the dropdown, it fires a status update API call immediately without asking for a cancellation reason or capturing who initiated the cancellation.

---

## 4. Active vs. Historical Orders Categorization

### 4.1 Status Classification
* **ACTIVE ORDERS:**
  * `PENDING` (قيد الانتظار)
  * `CONFIRMED` (تم التأكيد)
  * `PREPARING` (قيد التجهيز)
  * `READY_FOR_DELIVERY` (جاهز للتوصيل)
  * `OUT_FOR_DELIVERY` (خرج للتوصيل)
* **HISTORICAL / ARCHIVED ORDERS:**
  * `DELIVERED` (تم التوصيل)
  * `CANCELLED` (ملغي)

### 4.2 Current UI Deficit
`StoreSettingsAdmin.tsx` fetches all orders in one list without visual or tab separation between active and historical orders.

---

## 5. Search & Filter Audit

### 5.1 Search Capabilities
* **Current State:** **None.** `StoreSettingsAdmin.tsx` lacks a search input field for filtering by Order ID (`ORD-...`), Customer Name (`customerName`), or Customer Phone (`customerPhone`).

### 5.2 Filter Capabilities
* **Current State:** **None.** `StoreSettingsAdmin.tsx` displays counter metric badges for each status, but clicking or selecting statuses does not filter the list.

---

## 6. Refresh Behavior Audit

In `StoreSettingsAdmin.tsx`:
* **Manual Refresh Button ("تحديث الطلبات من Google Sheets"):**
  * Invokes `fetchOrders(true)`.
  * **Fetch:** Calls `GET /api/admin/orders?tenantId=...&storeId=...`.
  * **Sort:** Orders are returned in reverse chronological order based on Google Sheets row creation.
  * **Filter:** Multi-tenant isolation filters by `tenantId` and `storeId`.
  * **Preserve `selectedOrder`:** Finds the matching updated order ID in the refreshed array and updates `selectedOrder`, maintaining open modal views without closing or resetting scroll position.

---

## 7. Required Future Design & Implementation Plan (CMD-094)

### A. Product Name Snapshot Guarantee
1. Guarantee `OrderCheckoutEngine` resolves item names against the catalog during cart management and passes `productNameSnapshot` in `createOrder`.
2. In `OrderItemMapper`, provide a fallback lookup against product catalog if `productNameSnapshot` is empty in historic sheet rows.

### B. Required Customer Identity Enforcer
1. Pass `customerName: state.customerName` in `OrderCheckoutEngine.ts` when invoking `orderStore.createOrder()`.
2. Require both `customerName` (min 2 chars) and valid Yemen phone (`customerPhone`) before allowing order confirmation.

### C. Active Orders Default View
1. Add top tab navigation in `StoreSettingsAdmin.tsx`:
   * **الطلبات النشطة (Active Orders):** Default tab displaying `PENDING`, `CONFIRMED`, `PREPARING`, `READY_FOR_DELIVERY`, and `OUT_FOR_DELIVERY`.
   * **أرشيف الطلبات (Historical Archive):** Secondary tab displaying `DELIVERED` and `CANCELLED`.

### D. Historical Order Archive
1. Dedicated tab with summary totals for completed and cancelled orders.

### E. Search Bar
1. Add a real-time search input field in `StoreSettingsAdmin.tsx` filtering live across Order ID, Customer Name, and Customer Phone.

### F. Status Filter Chips
1. Add filter buttons/dropdown ( الكل / قيد الانتظار / مؤكد / قيد التجهيز / جاهز للتوصيل / خرج للتوصيل / تم التوصيل / ملغي ).

### G, H, I. Cancellation Tracking Schema Extension
1. Extend `CanonicalSchemas.orders` optional headers:
   * `cancellationReason`
   * `cancelledBy` (`'ADMIN'` | `'CUSTOMER'` | `'SYSTEM'`)
   * `cancelledAt`
2. Extend `Order` domain interface and `OrderMapper` (`fromRow` and `toRow`).
3. Add a **Cancellation Reason Dialog Modal** in `StoreSettingsAdmin.tsx` when changing order status to `CANCELLED`, requiring the admin to enter a reason before persisting.

---

## 8. Final Verdict

**FINAL VERDICT:**
`DIAGNOSED — ADMIN ORDER OPERATIONS GAPS`
