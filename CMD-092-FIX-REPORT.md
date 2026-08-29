# CMD-092-FIX Report: Admin Alert UX & Order Item Name Visibility

**Project:** Sana / سناء — خدمة عملاء متجر الذيباني  
**Status:** VERIFIED & IMPLEMENTED  
**Date:** August 2026  

---

## Executive Summary

CMD-092-FIX resolves the UI instability and order item name visibility issues encountered in the Admin Dashboard (`StoreSettingsAdmin.tsx`) without altering the core Google Sheets order store architecture or incurring external service costs.

---

## 1. Problem Root Causes & Resolutions

### 1.1 Disruptive Polling Elimination
* **Root Cause:** The admin dashboard was running an 8-second `setInterval` that repeatedly invoked `fetchOrders()`. This caused complete state replacement of `adminOrders`, resetting UI scrolling, closing active order views, and disrupting administrative reading.
* **Resolution:** 
  1. Removed `fetchOrders()` from the 8-second `setInterval`. The background interval now exclusively executes `fetchNotifications()` for zero-cost real-time alert updates.
  2. Added an explicit `"تحديث الطلبات من Google Sheets"` manual refresh button.
  3. Modified `fetchOrders(keepSelectedOrder = true)` so that refreshing the order list automatically preserves and updates the active `selectedOrder` reference.

### 1.2 Order Item Name Visibility & Historic Preservation
* **Root Cause:** In certain views, order items displayed empty fields if `productNameSnapshot` was missing or structured differently.
* **Resolution:**
  1. Updated order item rendering across cards and modal tables to use robust fallback logic: `{item.productNameSnapshot || item.productName || item.productId || 'منتج غير محدد'}`.
  2. Enhanced unit price rendering: `{item.unitPriceSnapshot ?? item.unitPrice ?? 0} YER`.
  3. Created an interactive, detailed **Order Details Modal** (`selectedOrder` view) displaying:
     - Order ID & Creation Timestamp
     - Customer Name & Phone Number
     - Delivery Address & Payment Method
     - Item Breakdown Table: Product Name (Snapshot), Quantity, Unit Price, and Item Total
     - Order Subtotal, Delivery Fee, and Final Total Amount
     - Real-Time Order Status and Payment Status selectors

---

## 2. Test Verification Matrix (`src/core/cmd-092-fix.test.ts`)

| # | Test Scenario | Status | Result |
|---|---|---|---|
| 1 | New order alert without list reload | PASSED | Background notification fetch checks new orders without re-fetching list |
| 2 | Selected order remains open | PASSED | `selectedOrder` reference preserved during background notification fetch |
| 3 | Details view remains stable | PASSED | Open modal/details state unaffected by alert polling |
| 4 | Manual refresh updates orders | PASSED | Manual trigger re-fetches orders from Google Sheets store |
| 5 | New order detected | PASSED | Notification engine flags new unread order ID accurately |
| 6 | Existing order preserved | PASSED | `selectedOrder` stays open and updates with fresh data on list refresh |
| 7 | Product name visible | PASSED | `productNameSnapshot` accessible in order item rendering |
| 8 | Product name snapshot preserved | PASSED | Historic product name snapshot remains unchanged |
| 9 | Quantity visible | PASSED | Item quantity present and accurately displayed |
| 10 | Unit price visible | PASSED | Unit price snapshot preserved and visible |
| 11 | Item total visible | PASSED | Total price per item calculation verified |
| 12 | Total calculation visible | PASSED | Subtotal + Delivery Fee = Total Amount verified |
| 13 | No duplicate alerts | PASSED | Order notifications deduplicated automatically by order ID |
| 14 | No cross-store data | PASSED | Multi-tenant/multi-store isolation maintained |
| 15 | No order mutation from alert mechanism | PASSED | Alert checks leave order records untouched in storage |

---

## 3. Verification Commands Run

```bash
# Applet Compilation Verification
compile_applet -> SUCCESS

# CMD-092-FIX Test Suite Execution
npx vitest run src/core/cmd-092-fix.test.ts -> 15/15 PASSED

# CMD-092 Core Test Suite Regression Execution
npx vitest run src/core/cmd-092.test.ts -> 15/15 PASSED
```

---

## 4. Conclusion

CMD-092-FIX is fully verified, operational, and tested. The admin dashboard is now completely stable during order review sessions, provides an interactive order details modal, and guarantees full visibility of order item names and pricing snapshots.
