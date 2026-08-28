# CMD-092 — REAL-TIME ZERO-COST ADMIN ORDER ALERTS REPORT

## Executive Summary
- **Project**: Sana / سناء — خدمة عملاء متجر الذيباني.
- **Task**: CMD-092 — Real-Time Zero-Cost Admin Order Alerts.
- **Status**: **APPROVED — ZERO-COST ADMIN ORDER ALERTS VERIFIED**
- **External Services Used**: NONE ($0 Operational Cost).
- **Test Suite Result**: 15 / 15 Tests PASSED (`src/core/cmd-092.test.ts`).

---

## 1. Notification Architecture
- **In-App Admin Notification Alert**: Internal notification events generated upon order creation are presented directly within the Admin UI (`StoreSettingsAdmin.tsx`).
- **No Paid Dependencies**: Zero external notification costs. No WhatsApp, Telegram, SMS, or paid notification APIs added.
- **Event Structure (`AdminNotificationRecord`)**:
  - `id`: Unique notification identifier.
  - `orderId`: Corresponding order ID.
  - `tenantId`: `tnt-41f0d530` (Canonical tenant).
  - `storeId`: `str-2c6ad81f` (Canonical store).
  - `title`: `طلب جديد - ORD-...`
  - `content`: Complete order breakdown including items, unit prices, subtotal, delivery fee, total amount in YER, payment method, address, and status.
  - `isRead`: Boolean flag tracking read/unread state.
  - `status`: `'PENDING'` | `'SENT'` | `'FAILED'`.

---

## 2. Admin Alert UI & Interaction
- **Banner & Badging**:
  - Displays a high-visibility `🔔 تنبيهات الطلبات الجديدة` panel in the Admin Order Center.
  - Live animated unread badge: `X طلبات جديدة غير مقروءة`.
- **Order Details Inspection**:
  - Clicking any alert card automatically marks the notification as `READ` via `POST /api/admin/notifications/mark-read` and opens the full Order Details view for that specific order.

---

## 3. Realtime Live Update Mechanism
- **Zero-Cost Live Polling**: Light polling interval (every 8 seconds) automatically refreshes orders and notifications when the Admin UI is mounted.
- **No Complex Websockets/SSE**: Reused clean background polling without extra infrastructure overhead or extra costs.

---

## 4. Storage & Container Restart Survival
- **Single Source of Truth**: Orders and order items are stored durably in Google Sheets (`orders` & `order_items`).
- **Notification Persistence Sync**: `syncFromOrders` mechanism in `AdminNotifier` dynamically derives missing notification records from persistent Google Sheets order records after container restart, ensuring alerts survive ephemeral filesystem restarts without corrupting order records.

---

## 5. Unread / Read State Management
- New alerts default to `isRead: false` (`UNREAD`).
- Explicit endpoint `POST /api/admin/notifications/mark-read` handles transition to `READ`.
- Deduplication logic ensures syncing orders never generates duplicate alerts for the same order ID.

---

## 6. Order / Notification Separation
- Failure or exception in the notification handler (e.g. channel adapter failure) never corrupts or rolls back order creation.
- Order persistence is independent and non-blocking.

---

## 7. Customer Identity & Phone Integrity
- No fallback phone numbers (such as `777123456`) are injected.
- If customer phone is not provided, `customerPhone` remains `null`/`undefined`, rendered as `'غير محدد'`.

---

## 8. Security & Isolation
- **Tenant Isolation**: `tnt-41f0d530` strictly enforced across backend endpoints (`GET /api/admin/notifications`, `POST /api/admin/notifications/mark-read`). Cross-tenant access attempts return HTTP 403 Forbidden.
- **Store Isolation**: `str-2c6ad81f` strictly enforced. Cross-store access attempts return HTTP 403 Forbidden.

---

## 9. Test Suite Verification (`src/core/cmd-092.test.ts`)

| # | Test Case | Description | Result |
|---|---|---|---|
| 1 | `new order event` | AdminNotifier creates notification record on new order | PASSED |
| 2 | `admin alert` | Notification payload contains complete order details | PASSED |
| 3 | `notification payload` | Sanitizes sensitive API keys & secrets | PASSED |
| 4 | `unread state` | New notifications start as `isRead: false` | PASSED |
| 5 | `read state` | Marking as read updates `isRead: true` and decrements count | PASSED |
| 6 | `live refresh mechanism` | Fetching notifications reflects live updates automatically | PASSED |
| 7 | `order/notification separation` | Notification failure does not corrupt order creation | PASSED |
| 8 | `tenant isolation` | Notifications from tenant A do not leak to tenant B | PASSED |
| 9 | `store isolation` | Notifications from store A do not leak to store B | PASSED |
| 10 | `customer phone integrity` | Missing phone preserved without fake fallback numbers | PASSED |
| 11 | `order status change` | Admin updating order status updates order in store | PASSED |
| 12 | `customer status query` | Customer querying order status gets updated status | PASSED |
| 13 | `duplicate notification prevention` | Re-syncing does not duplicate notifications | PASSED |
| 14 | `restart survival` | `syncFromOrders` derives alerts from persistent store after restart | PASSED |
| 15 | `no false delivery claim` | Checkout engine reports notification status accurately | PASSED |

---

## 10. Build & Compilation
- **TypeScript & Vite Build**: Executed `compile_applet` successfully with zero errors.

---

## Final Verdict
**APPROVED — ZERO-COST ADMIN ORDER ALERTS VERIFIED**
