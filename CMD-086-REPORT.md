# CMD-086 — PRODUCTION ORDER PERSISTENCE ARCHITECTURE DECISION AUDIT

المشروع: **Sana Customer Service — متجر الذيباني**
تاريخ التقييم: **2026-08-26**

---

## 1. CURRENT STATE (الوضع الحالي للتخزين)

في مرحلة **CMD-085**، تم بناء المكونات التالية للحفاظ على استمرارية الطلبات وإشعارات الإدارة:

1. **`PersistentOrderStore` (`src/core/orders/order-store.ts`)**:
   - المسار المستهدف: `data/orders_persistent.json`
   - الاستخدام الفعلي: يتولى عمليات إنشاء الطلبات وقراءتها وتحديث حالتها وتوليد الرقم القياسي السنوي `ORD-YYYYMMDD-XXXX`.

2. **`AdminNotifier` (`src/core/orders/admin-notifier.ts`)**:
   - المسار المستهدف: `data/admin_notifications.json`
   - الاستخدام الفعلي: يسجل جميع إشعارات الإدارة بحالة `PENDING` عند إنشاء كل طلب جديد.

---

## 2. RENDER DURABILITY (تقييم ملاءمة بيئة Render Production)

تم فحص سلوك التخزين المحلي `data/*.json` على منصة **Render Web Services**:

- **هل يستمر الملف بعد Restart؟** ❌ **لا.** (حاويات Render تعمل بملفات ephemeral تُمسح عند إعادة التشغيل).
- **هل يستمر الملف بعد Deploy؟** ❌ **لا.** (أي عملية نشر جديدة تبني/تشغل حاوية جديدة بنظام ملفات نظيف).
- **هل يستمر الملف بعد Instance Replacement؟** ❌ **لا.** (عند نقل الحاوية لعقدة جديدة يُفقد أي ملف محلي).
- **هل الخدمة الحالية Free أم Paid؟** ℹ️ **Free / Standard Ephemeral Container.**
- **هل يوجد Persistent Disk مرفق؟** ❌ **لا.** (أقراص Render Persistent Disks غير متوفرة في باقة Render المجانية، وتتطلب خطة مدفوعة Starter+ مع تركيب محدد).
- **هل يمكن الاعتماد فعليًا على `data/*.json` في الانتاج؟** ❌ **مطلقاً.** بيئة Render المجانية تقوم بإيقاف الحاوية (Spin-down) تلقائياً بعد 15 دقيقة من الخمول، مما يسبب فقدان تام لجميع الطلبات المسجلة في `data/orders_persistent.json`.

---

## 3. EXISTING STORAGE (البحث عن قواعد البيانات المتاحة في المشروع)

تم إجراء جرد شامل لكل ملفات المشروع والاعتمادات والمتغيرات البيئية:

- **PostgreSQL / DATABASE_URL**: ❌ غير موجود وغير مهيأ في المشروع.
- **Supabase**: ❌ غير موجود.
- **Firebase**: ❌ غير موجود.
- **Redis / Key Value**: ❌ غير موجود.
- **SQLite**: ❌ غير موجود.
- **أي Persistent Datastore موجود مسبقاً**: ✅ **Google Sheets API Datastore Infrastructure**.
  - يتوفر بالمشروع بنية تحتية كاملة ومجربة للربط مع Google Sheets عبر حساب خدمة موثق (`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`).
  - توجد نماذج ومخططات بيانات جاهزة في `src/infrastructure/google-sheets/schema-definitions.ts` تتضمن ورقتي عمل معرفة مسبقاً للطلبات: `orders` و `order_items`.

---

## 4. ZERO-BUDGET OPTIONS (مقارنة خيارات التخزين المجانية)

| الخيار | Persistence | Durability | Render Compatibility | Restart Survival | Deploy Survival | Multi-Instance Safety | Cost Now | Limitations | Migration Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Local JSON (`data/*.json`)** | Ephemeral | 0% | غير مناسب | ❌ لا | ❌ لا | ❌ لا | $0 | مسح البيانات عند الخمول أو إعادة التشغيل | منخفض جداً |
| **B. Render Postgres Free** | Persistent | 90 يوماً فقط | ممتاز | ✅ نعم | ✅ نعم | ✅ نعم | $0 (لمدة 90 يوماً) | **يُحذف تلقائياً بواسطة Render بعد 90 يوماً** | متوسط |
| **C. Render Key Value Free** | In-Memory / Disk | منخفض | ممتاز | ✅ نعم | ✅ نعم | ✅ نعم | $0 | حد أقصى للذاكرة 25MB، مسح المفاتيح عند الامتلاء | مرتفع للطلبات |
| **D. Google Sheets API (Datastore مسبق)** | Persistent Cloud | **100% دائم** | **ممتاز (عبر REST API)** | ✅ **نعم** | ✅ **نعم** | ✅ **نعم** | **$0.00 دائماً** | زمن استجابة API (~200-500ms)، قيود حصة API العادية | **منخفض جداً (الكود مهيأ مسبقاً)** |
| **E. Neon / Supabase Free Tier** | Persistent Cloud | 100% دائم | ممتاز | ✅ نعم | ✅ نعم | ✅ نعم | $0.00 | يتطلب فتح حساب خارجي وإعادة إعداد المتغيرات | متوسط |

---

## 5. ORDER REQUIREMENTS (متطلبات تخزين الطلبات)

التخزين المستهدف يلبي متطلبات الدورة الكاملة للطلب:

1. **الطلبات (`orders`)**:
   - `id` (`ORD-YYYYMMDD-XXXX`)
   - `tenantId` / `storeId`
   - `customerId` / `customerPhone` / `customerName`
   - `totalAmount` / `currency`
   - `status` (`PENDING`, `CONFIRMED`, `PREPARING`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`)
   - `paymentMethodId` / `paymentMethodName` / `paymentStatus` (`UNPAID`, `PENDING`, `PAID`, `FAILED`)
   - `deliveryAddress` / `deliveryFee`
   - `createdAt` / `updatedAt`

2. **عناصر الطلب (`order_items`)**:
   - `id` / `orderId` / `productId` / `productNameSnapshot` / `quantity` / `unitPriceSnapshot` / `totalPrice`

3. **ضمان الاستمرارية (Durability Guarantee)**:
   - بقاء الطلبات واستعادتها بنجاح بعد: `restart` و `redeploy` و `instance replacement`.

---

## 6. ADMIN NOTIFICATION (إشعارات الإدارة)

أفضل مكان دائم لإشعارات وتحديثات الطلبات (`Order notifications & events`):

- **التصميم المستهدف الخالي من التكلفة**:
  - كتابة الإشعارات كصفوف دائمية في tab مخصص داخل Google Sheets (`admin_notifications`) أو تحديث خانات حالة الطلب مباشرة في ورقة `orders`.
  - الامتناع التام عن استخدام الـ `in-memory array` أو الـ `filesystem` Ephemeral.

---

## 7. RECOMMENDED ARCHITECTURE (التوصية المعمارية)

### الخيار المختار: **Google Sheets API Datastore via `GoogleSheetsDataProvider`**

- **السبب العلمي والمعماري**:
  1. **صفر تكلفة تشغيلية ($0 OPERATING BUDGET)** وبشكل دائم ومستمر دون وجود مؤقت حذف (خلافاً لـ Render Postgres Free الذي يُحذف بعد 90 يوماً).
  2. **البنية التحتية البرمجية جاهزة ومجربة بالمشروع** (`GoogleSheetsDataProvider`, `domain-mappers.ts`, `schema-definitions.ts` لـ `orders` و `order_items`).
  3. **اعتمادات الربط (Credentials) معرفة ومحقونة بالفعل** في بيئة الإنتاج على Render (`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`).
  4. **صمود كامل 100%** ضد عمليات إعادة التشغيل وتحديثات السيرفر دون فقدان أي طلب.

---

## 8. MIGRATION PATH & FUTURE SCALING (مسار الانتقال المستقبلي)

- **المرحلة الحالية (Phase 1)**: ربط واجهة `IOrderStore` بمقدم البيانات `GoogleSheetsDataProvider` كقاعدة بيانات سحابية دائمة ومجانية.
- **المرحلة المستقبلية (Phase 2 - عند التوسع)**: عند تجاوز الطلبات حاجز 10,000 طلب شهرياً، يتم إنشاء قاعدة بيانات إقليمية مدفوعة (مثل Neon Postgres أو Cloud SQL) وتغيير المكون المنفذ لـ `IOrderStore` دون الحاجة لتغيير أي منطق عمل في `OrderCheckoutEngine` بفضل فصل الطبقات المحكم.

---

## 9. COST & RISKS SUMMARY

- **التياسة والتكلفة الحالية**: **$0.00 / شهر**.
- **المخاطر التشغيلية**:
  - `data/*.json`: **مخاطر عالية جداً (فقدان بيانات).**
  - `Render Postgres Free`: **مخاطر عالية (حذف القاعدة تلقائياً بعد 90 يوماً).**
  - `Google Sheets API`: **مخاطر منخفضة جداً** (مضمون الاستمرارية، زمن الاستجابة مقبول لطلبات المتجر).

---

## FINAL VERDICT

**PERSISTENCE DECISION READY**
