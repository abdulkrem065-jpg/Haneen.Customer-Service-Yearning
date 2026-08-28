# CMD-091 — ADMIN NOTIFICATION DELIVERY FORENSIC DIAGNOSIS REPORT

**Project**: Sana / سناء — خدمة عملاء متجر الذيباني  
**Date**: 2026-08-28  
**Scope**: Forensic diagnosis of admin notification pipeline and delivery status ($0 Cost / No Code Modifications in Diagnostic Phase).

---

## 1. Notification Pipeline Trace

The end-to-end notification execution path was traced through the codebase:

```
[Customer Finalizes Order]
       │
       ▼
[OrderCheckoutEngine.ts]
   ├── 1. Order Persistence ──────► OrderStore / GoogleSheetsOrderStore (Saves order & items)
   │
   └── 2. Admin Event ────────────► await this.adminNotifier.notifyNewOrder(createdOrder, context)
                                              │
                                              ▼
                                   [AdminNotifier.ts]
                                      ├── Generates notificationId: "notif-{timestamp}-{rand}"
                                      ├── Sanitizes content (removes tokens/keys)
                                      ├── Resolves destination: undefined (destinationSupplier is null)
                                      ├── Checks channelAdapter: undefined (No external adapter attached)
                                      ├── Sets status: "PENDING"
                                      └── Saves record to data/admin_notifications.json & Memory
```

---

## 2. AdminNotifier State & Persistence Audit

| Attribute | State | Details |
| :--- | :--- | :--- |
| **Call Verification** | `VERIFIED` | `AdminNotifier.getInstance().notifyNewOrder` is invoked immediately after successful order persistence in `OrderCheckoutEngine`. |
| **Notification Record** | `CREATED` | Record created with unique `notificationId` (e.g., `notif-1772124480000-412`). |
| **Record Status** | **`PENDING`** | Set to `PENDING` because no external channel adapter is configured (`this.channelAdapter === undefined`). |
| **Storage Persistence** | `VERIFIED` | Persisted safely in `data/admin_notifications.json` and available via `getNotifications()`. |
| **Destination** | `UNDEFINED` | `destination` is `undefined` because `destinationSupplier` is not registered in production default instance. |

---

## 3. Actual Destination Resolution Audit

- **Admin Destination**: `undefined`
- **Store Contact Fallback**: **NONE** (Strict safety rule enforced — store contact or customer phone is NEVER substituted as admin destination).
- **Customer Phone**: **NONE** (Not used for admin notifications).
- **Source of Truth**: No external admin recipient (e.g., WhatsApp number, Telegram Chat ID, or Email address) has been registered via `setDestinationSupplier`.

---

## 4. Available Channel Adapters Matrix

| Channel | Configured? | Enabled? | Credentials Present? | Dispatch Attempted? | Delivery Confirmed? |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **WhatsApp** | No | No | No | No | No |
| **Telegram** | No | No | No | No | No |
| **Email** | No | No | No | No | No |
| **Webhook** | No | No | No | No | No |
| **Push** | No | No | No | No | No |
| **SSE / WebSocket** | No | No | No | No | No |
| **In-App Store** | **Yes ($0)** | **Yes** | **N/A (Local)** | **Internal Only** | **Pending Admin Read** |

---

## 5. Pipeline Phase Distinction

- **A. Notification Record Created**: **YES** (`status: 'PENDING'`, saved to `admin_notifications.json`).
- **B. Notification Dispatch Attempted**: **NO** (`this.channelAdapter` is `undefined`).
- **C. External Provider Accepted Request**: **NO**.
- **D. External Message Delivered**: **NO**.

> **Conclusion**: Phase A is active (`PENDING`), but Phases B, C, and D are not connected or executed.

---

## 6. Admin UI Auto-Update & In-App Notification Mechanism

- **Current Admin Order Display**: `StoreSettingsAdmin.tsx` fetches orders via `fetchOrders()` when navigating to the Orders tab, reading directly from `OrderStore` / `/api/admin/orders`.
- **In-App Admin Notification ($0 Budget)**:
  - `AdminNotifier` exposes `/api/admin/notifications` which reads the stored `PENDING` notification records.
  - The Admin UI can query `/api/admin/notifications` or hook into state updates to display a real-time **NEW ORDER** alert/badge inside the Admin UI at **$0 external cost**.

---

## 7. Customer Message Accuracy Verification

Inspecting `OrderCheckoutEngine.ts` (lines 279–285):

```typescript
let notificationMsg = 'تم تسجيل طلبك، وجارٍ إرسال الإشعار للإدارة.';
if (notifResult?.status === 'SENT') {
  notificationMsg = 'تم استلام طلبك وتم إشعار الإدارة بنجاح.';
} else if (notifResult?.status === 'FAILED' || (!notifResult && true)) {
  notificationMsg = 'تم تسجيل طلبك، لكن تعذر إرسال إشعار تلقائي للإدارة حالياً.';
}
```

- When notification status is `PENDING`, Sana responds:
  > *"تم استلام طلبك بنجاح. رقم طلبك: ORD-... \n تم تسجيل طلبك، وجارٍ إرسال الإشعار للإدارة."*
- Sana **truthfully** tells the customer that the notification is pending/in-progress, and **never** claims *"تم إشعار الإدارة بنجاح"* unless `notifResult.status === 'SENT'`.

---

## 8. Root Cause Analysis

1. **Missing Channel Adapter Attachment**: `AdminNotifier.getInstance()` initializes without an external channel adapter (`this.channelAdapter` is undefined).
2. **Missing Destination Supplier**: `destinationSupplier` is undefined, so no external destination (e.g., WhatsApp number or webhook URL) is attached.
3. **Pending Execution**: Because `channelAdapter` is undefined, `AdminNotifier.notifyNewOrder()` records the event as `PENDING` in `data/admin_notifications.json` for in-app / durable tracking, but does not dispatch to any external gateway.

---

## 9. Minimal Fix Recommendation ($0 Cost)

To provide zero-cost admin notification delivery without paid third-party external services:
1. **In-App Admin Toast/Badge**: Connect `StoreSettingsAdmin.tsx` to poll `/api/admin/notifications` or read `AdminNotifier` records, displaying a visual alert and sound/badge for `PENDING` order notifications.
2. **Optional External Channel**: If external delivery (WhatsApp/Telegram/Webhook) is requested in a future turn, register a `channelAdapter` and `destinationSupplier` on `AdminNotifier.getInstance()`.

---

## 10. Final Verdict

**DIAGNOSED — NO ADMIN CHANNEL CONFIGURED**
