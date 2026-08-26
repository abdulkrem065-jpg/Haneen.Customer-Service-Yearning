# CMD-084 — REAL ORDER PERSISTENCE & CUSTOMER IDENTITY FORENSIC DIAGNOSIS REPORT

**Project:** Sana / سناء — خدمة عملاء متجر الذيباني  
**Date:** 2026-08-25  
**Diagnosis Type:** Forensic Code & Execution Path Analysis (Read-Only)  
**Final Verdict:** `DIAGNOSED — MULTIPLE ORDER INTEGRITY FAILURES`

---

## Executive Summary

A forensic diagnosis was conducted on the order creation, customer identity resolution, order persistence, and notification subsystem for **Sana (متجر الذيباني)**. 

The investigation confirms multiple severe production order integrity failures:
1. **Durable Persistence Failure:** Order creation in `OrderCheckoutEngine` saves orders exclusively to `OrderStore`, an in-memory TypeScript `Map<string, Order>`. No write operation is executed to Google Sheets or a durable database for either `orders` or `order_items`. Orders disappear upon container restart.
2. **Customer Identity Data Integrity Bug:** When a customer confirms an order without explicitly providing a phone number, `OrderCheckoutEngine` defaults `state.customerPhone` to `'777123456'` (the store's own official phone number), falsely attributing customer orders to the store contact.
3. **In-Memory Admin Notification:** `AdminNotifier.notifyNewOrder` pushes notifications to an in-memory array (`notifications: AdminNotificationRecord[]`). No external notification transport (WhatsApp, Email, SMS, Webhook, or Google Sheets) is invoked.
4. **False Success Response:** The application returns a successful confirmation message (`"تم استلام طلبك بنجاح. رقم طلبك: ORD-..."`) to the customer before any durable persistence or real admin notification occurs.

---

## A. Order Creation Trace

**Execution Path:**
```
1. Customer Message ("نعم" / "أؤكد")
   ↓
2. HaneenService.processMessage() (src/core/productization/haneen-service.ts:313)
   ↓
3. OrderCheckoutEngine.handleCheckoutMessage() (src/core/orders/order-checkout-engine.ts:184)
   - Evaluates isShortConfirmation == true
   - Validates state.cart.length > 0 && deliveryAddress && paymentMethodId
   ↓
4. OrderStore.createOrder() (src/core/orders/order-store.ts:44)
   - Generates Order ID (ORD-YYYYMMDD-XXXX)
   - Maps cart items to OrderItem[] array
   - Constructs Order domain object
   ↓
5. OrderStore.orders.set(orderId, newOrder) (src/core/orders/order-store.ts:109)
   [VOLATILE PROCESS MEMORY ONLY - NO DB / NO GOOGLE SHEETS CALL]
   ↓
6. AdminNotifier.notifyNewOrder() (src/core/orders/admin-notifier.ts:30)
   - Pushes AdminNotificationRecord to in-memory array this.notifications
   [IN-MEMORY ARRAY ONLY - NO EXTERNAL TRANSPORT]
   ↓
7. Response Generated (src/core/orders/order-checkout-engine.ts:254)
   "تم استلام طلبك بنجاح. رقم طلبك: ORD-20260825-0001..."
```

**Key Components & Files Involved:**
- Service Entry point: `HaneenService` (`src/core/productization/haneen-service.ts`)
- Checkout Engine: `OrderCheckoutEngine` (`src/core/orders/order-checkout-engine.ts`)
- Storage Implementation: `OrderStore` (`src/core/orders/order-store.ts`)
- Admin Notification: `AdminNotifier` (`src/core/orders/admin-notifier.ts`)

---

## B. Order Persistence Trace

- **Real Persistence Call (`write` / `addRow` / `insert`):** **NO.** `GoogleSheetsDataProvider` / `transport.addRow` is never instantiated or invoked by `OrderCheckoutEngine` or `OrderStore`.
- **Persistence Type:** **Strictly In-Memory (`Map<string, Order>`)**.
- **Container Restart Resilience:** **ZERO**. All created orders and order items are wiped from memory whenever the Node.js process / Cloud Run container restarts or re-deploys.
- **`order_items` Persistence:** Items exist solely as an array property inside the in-memory `Order` object. No independent storage or row insertion exists.

---

## C. Order ID Source (`ORD-20260825-0001`)

- **Generator:** `OrderStore.generateOrderId()` in `src/core/orders/order-store.ts` (lines 21–33).
- **Format:** `ORD-${dateKey}-${paddedSeq}` generated using in-memory `dailySequence` map.
- **Timing:** Generated at runtime inside `OrderStore.createOrder()` prior to memory map storage.
- **Classification:** **`IN-MEMORY ID`**. It is not returned from or saved to any durable database or Google Sheets tab.

---

## D. `customerPhone` Source (`777123456`)

- **Code Location:** `src/core/orders/order-checkout-engine.ts`
  - Line 116: `let phone = state.customerPhone || '777123456';`
  - Line 221: `customerPhone: state.customerPhone || '777123456',`
- **Forensic Finding:** `777123456` is hardcoded as a fallback phone number in `OrderCheckoutEngine`. When a customer places an order without explicitly providing their phone number in the chat, the engine silently replaces the missing phone number with `'777123456'`.
- **Impact:** `'777123456'` is the official store contact number. Using it as a customer fallback incorrectly assigns the store's phone number as the customer's identity.
- **Integrity Severity:** **`CRITICAL DATA INTEGRITY BUG`**.

---

## E. Session Isolation Result

- The presence of `777123456` in order records is **not** caused by cross-session context leaks or data bleeding between different customers.
- It is caused directly by the hardcoded fallback `'777123456'` in `OrderCheckoutEngine` when `state.customerPhone` is falsy.

---

## F. `orders` Persistence Result

- **Google Sheets Tab / DB Table:** Canonical schema exists in `schema-definitions.ts` (`orders` sheet) and `OrderMapper` in `domain-mappers.ts`.
- **Actual Execution:** **`SKIPPED / UNWIRED`**. Neither `HaneenService` nor `OrderCheckoutEngine` connects `OrderStore` to `GoogleSheetsDataProvider<Order>`. No `addRow` calls are executed for `orders`.

---

## G. `order_items` Persistence Result

- **Google Sheets Tab / DB Table:** Canonical schema exists in `schema-definitions.ts` (`order_items` sheet) and `OrderItemMapper` in `domain-mappers.ts`.
- **Actual Execution:** **`SKIPPED / UNWIRED`**. No provider or mapper is invoked during checkout to record individual order line items.

---

## H. Admin Notification Result

- **Implementation:** `AdminNotifier.notifyNewOrder()` in `src/core/orders/admin-notifier.ts`.
- **Storage:** Appends to `private notifications: AdminNotificationRecord[] = []` in process memory.
- **External Channels:** **NONE**. No WhatsApp message, SMS, Email, or Webhook push notification is sent to store administrators.
- **Classification:** **`IN-MEMORY EVENT ONLY`**.

---

## I. Success Response Timing

- **Code Location:** `src/core/orders/order-checkout-engine.ts` (lines 254–260).
- **Timing Analysis:** The message `"تم استلام طلبك بنجاح. رقم طلبك: ORD-..."` is compiled and returned to the customer **immediately after in-memory state updates**, without verifying durable database persistence or external admin delivery.
- **Classification:** **`FALSE SUCCESS RESPONSE (CRITICAL BUG)`**.

---

## J. Missing Test Coverage

- **Acceptance Test Gap:** There is no integration test verifying end-to-end durable order persistence:
  - `Customer confirms` → `Google Sheets orders row inserted` → `Google Sheets order_items rows inserted` → `Durable query verification` → `Admin notification dispatched` → `Customer receives success response`.
- **Classification:** **`Missing Acceptance Test`**.

---

## K. Exact Root Causes

1. **Unwired Order Persistence Layer:** `OrderStore` was built as a standalone in-memory singleton without an adapter or hook to write orders and order items to `GoogleSheetsDataProvider` or external durable storage.
2. **Hardcoded Customer Phone Fallback:** `OrderCheckoutEngine` hardcoded `'777123456'` as a default value for `customerPhone` instead of enforcing mandatory customer phone collection or leaving the phone field as `null`/`unknown`.
3. **In-Memory Notification Sink:** `AdminNotifier` lacks external transport integration (e.g. Google Sheets admin notifications sheet or external webhook).
4. **Premature Customer Confirmation:** The engine responds with order success before durable write confirmation.

---

## L. Minimal Safe Fix Plan (Proposed for Future Stage)

1. **Wire Durable Order Provider:**
   - Inject `GoogleSheetsDataProvider<Order>` and `GoogleSheetsDataProvider<OrderItem>` (or dual-write storage provider) into `OrderStore` / `OrderCheckoutEngine`.
   - Execute `addRow` for `orders` and `order_items` upon customer confirmation before returning success.
2. **Enforce Customer Identity Rules:**
   - Remove the `'777123456'` hardcoded fallback in `OrderCheckoutEngine`.
   - Require customer to provide a valid phone number before transitioning step to `AWAITING_CONFIRMATION`, or set `customerPhone` to `null` if optional.
3. **Wire Admin Notification Channel:**
   - Connect `AdminNotifier` to a durable log or external messaging transport.
4. **Gated Success Response:**
   - Ensure `"تم استلام طلبك بنجاح"` is only sent after successful write acknowledgment from the persistence provider.

---

## FINAL VERDICT

```
DIAGNOSED — MULTIPLE ORDER INTEGRITY FAILURES
```
