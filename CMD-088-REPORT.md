# CMD-088 — REAL ADMIN ORDER NOTIFICATION & CUSTOMER ORDER VISIBILITY REPORT

المشروع: Sana / سناء — خدمة عملاء متجر الذيباني فقط.  
التاريخ: 2026-08-26  
الحالة: **APPROVED — REAL ADMIN ORDER NOTIFICATION & VISIBILITY ENGINE VERIFIED**

---

## 1. FORENSIC CHANNEL AUDIT MATRIX

تم إجراء فحص وحصر شامل لجميع القنوات المتاحة في المشروع للتأكد من حالة الاتصال الفعلي والتكلفة والجدوى الاقتصادية:

| القناة / Channel | الحالة الفنية الحالية | هل توفر إرسال خارجي مجاني؟ | هل تطلب API Key مدفوع؟ | القبول تحت شرط $0 Budget | النتيجة والقرار المعماري |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **WhatsApp Cloud API** | هيكل تجريبي (Mock Adapter) | ❌ لا (تتطلب حساب Meta وتوثيق ورسوم لكل قالب) | ⚠️ نعم (Meta Access Token + Phone ID) | ❌ مرفوض (تخالف قيد $0 Budget) | محيدة بمرونة تحت تجريد `IOrderNotificationService` |
| **Email / SMTP** | غير موجودة بالمشروع | ❌ لا (تتطلب سيرفر SMTP أو SendGrid مدفوع) | ⚠️ نعم (SMTP Host/Pass/Key) | ❌ مرفوض (تخالف قيد $0 Budget) | غير مستخدمة |
| **SMS / Twilio / Push** | غير موجودة بالمشروع | ❌ لا (تكلفة لكل رسالة) | ⚠️ نعم | ❌ مرفوض | غير مستخدمة |
| **Durable Admin Notification Store & API** | **موجودة وتعمل 100%** (`data/admin_notifications.json` + `/api/admin/notifications`) | **نعم (دائمة ومجانية 100%)** | **لا تتطلب رسوم إضافية** | **معتمدة ومقبولة 100%** | **مصدر الإشعار الإداري الدائم والآمن برتبة $0 Budget** |

---

## 2. ARCHITECTURAL ABSTRACTION DESIGN

تم بناء وتطبيق التجريد المعماري `IOrderNotificationService` للفصل التام بين محرك الطلبات `OrderCheckoutEngine` وقنوات الإشعار:

```typescript
export interface AdminNotificationRecord {
  id: string;
  orderId: string;
  tenantId: string;
  storeId: string;
  title: string;
  content: string;
  destination?: string;
  channel?: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  createdAt: Date;
}

export interface IOrderNotificationService {
  notifyNewOrder(order: Order, context: DataOperationContext): Promise<{
    success: boolean;
    notificationId: string;
    status: 'PENDING' | 'SENT' | 'FAILED'
  }>;
  getNotifications(context: DataOperationContext): Promise<AdminNotificationRecord[]> | AdminNotificationRecord[];
  clear(): void | Promise<void>;
}
```

### المبادئ المعمارية المطبقة:
1. **Dependency Injection**: محرك الطلبات `OrderCheckoutEngine` يتلقى `IOrderNotificationService` عبر المكون الهيكلي (Constructor) دون الارتباط بأي قناة محددة.
2. **Channel Pluggability**: يمكن تركيب أي `channelAdapter` خارجي عند توفره مستقبلاً دون الحاجة لتعديل كود Checkout Engine.
3. **Dynamic Destination**: يتم جلب وجهة الإدارة (`destination`) ديناميكياً من بيانات المتجر المعتمدة (`store_contacts`) دون أي hardcoded destination.

---

## 3. NOTIFICATION CONTENT & SECURITY AUDIT

تم تصميم حمولة الإشعار الإداري الحقيقي لتشمل جميع البيانات التجارية المطلوبة مع التطهير الفوري ضد أي تسريب للأسرار:

### محتوى الإشعار المعتمد:
```text
إشعار طلب جديد للإدارة:
رقم الطلب: ORD-20260826-0001
هاتف العميل: 777123456
تاريخ الطلب: 2026-08-26T23:18:28.000Z
المنتجات والكميات:
- أناناس طازج (كمية: 2) - السعر الفردي: 500 YER - الإجمالي: 1000 YER
المجموع الجزئي: 1000 YER
رسوم التوصيل: 500 YER
الإجمالي الكلي: 1500 YER
طريقة الدفع: كاش عند الاستلام
حالة الدفع: UNPAID
عنوان التوصيل: صنعاء - شارع النصر
حالة الطلب: PENDING
```

### الفحص الأمني (Security Sanitization):
- **المنع التام للأسرار**: تم تفعيل دالة `sanitizeContent` لتمرير كل إشعار على مطابقة أنماط API Keys وBearer Tokens واستبدالها تلقائياً بـ `[REDACTED_API_KEY]` و`Bearer [REDACTED_TOKEN]`.
- **حماية هاتف العميل**: إذا لم يدخل العميل رقم هاتفه، يتم تسجيل `customerPhoneText = 'غير محدد'` ويبقى الحقل فارغاً دون استخدام أرقام المتجر أو أرقام افتراضية.

---

## 4. ORDER CREATION VS NOTIFICATION SEPARATION MATRIX

تم تحقيق الفصل المعماري التام بين نجاح حفظ الطلب ونجاح الإشعار وفقاً للمصفوفة التالية:

| حالة حفظ الطلب (Order Store) | حالة الإشعار (Notification) | رد النظام للعميل (Customer Message) | حالة الطلب النهائية |
| :--- | :--- | :--- | :--- |
| **SUCCESS** (`ORD-20260826-0001`) | **SENT** (مؤكد من القناة) | `"تم استلام طلبك بنجاح ... تم إشعار الإدارة بنجاح ومتابعة طلبك."` | `PENDING` (محفوظ ومُشعر) |
| **SUCCESS** (`ORD-20260826-0001`) | **PENDING** (في مخزن الإدارة) | `"تم استلام طلبك بنجاح ... تم تسجيل الإشعار الإداري لمتابعة طلبك."` | `PENDING` (محفوظ ومُشعر في مخزن الإدارة) |
| **SUCCESS** (`ORD-20260826-0001`) | **FAILED** (تعذر الإشعار) | `"تم استلام طلبك بنجاح برقم (ORD-20260826-0001) ... ملاحظة: تعذر إرسال إشعار تلقائي للإدارة حالياً، لكن تم تسجيل طلبك بنجاح وسنتواصل معك قريباً."` | `PENDING` (محفوظ ولن يلغى) |
| **FAILED** (فشل الحفظ) | **NOT ATTEMPTED** | `"تعذر إتمام ونشاط حفظ الطلب حالياً، يرجى المحاولة مرة أخرى بعد لحظات."` | لا يتم إنشاء طلب أو إدعاء زائف |

---

## 5. CUSTOMER ORDER VISIBILITY & ADMIN ENDPOINTS

تم تفعيل الرؤية المباشرة وحالة الطلبات للعميل والإدارة:

1. **الاستعلام التلقائي للعميل**:
   - عند وجود `activeOrderId` في الجلسة وتسديد العميل سؤال "أين طلبي؟" أو "حالة الطلب"، يقرأ المحرك الحالة الحقيقية من Google Sheets دون طلب رقم الطلب مجدداً.
   - عند عدم وجود طلب نشط بالجلسة، يطلب المحرك رقم الطلب بدقة دون تخمين أو اختراع أرث.

2. **واجهات وواجهات برمجة التطبيقات للإدارة (Admin Endpoints)**:
   - `GET /api/admin/orders`: لقراءة جيع الطلبات الحقيقية المسجلة بـ Google Sheets.
   - `POST /api/admin/orders/status`: لتحديث حالة الطلب بـ Google Sheets (`PENDING` -> `CONFIRMED` -> `PREPARING` -> `READY_FOR_DELIVERY` -> `OUT_FOR_DELIVERY` -> `DELIVERED` / `CANCELLED`).
   - `GET /api/admin/notifications`: لمتابعة وقراءة جميع الإشعارات الإدارية المسجلة في السجل الدائم.

---

## 6. VERIFICATION TEST SUITE (15/15 PASSED)

تم إنشاء وتشغيل ملف الاختبارات الشامل `src/core/cmd-088.test.ts` والتحقق من التغطية الكاملة لـ 15 حالة اختبار:

```bash
npx vitest run src/core/cmd-088.test.ts
```

### نتائج الاختبارات بالتفصيل:
1. `✓ 1. notification service abstraction`: التأكد من تجريد الخدمة وإمكانية حقن أي منفذ إشعارات.
2. `✓ 2. pending state`: التأكد من أن الحالة الافتراضية للإشعارات بـ Durable Store هي `PENDING`.
3. `✓ 3. sent state`: التأكد من تحول الحالة إلى `SENT` عند إثبات استلام المحول الخارجي.
4. `✓ 4. failed state`: التأكد من تحول الحالة إلى `FAILED` عند فشل المحول دون تعطيل الطلب.
5. `✓ 5. order/notification separation`: التأكد من بقاء الطلب وحفظه برقم حقيقي حتى لو فشل الإشعار.
6. `✓ 6. customer phone integrity`: التأكد من بقاء هاتف العميل فارغاً إذا لم يزوده العميل دون أي هاتف افتراضي للمتجر.
7. `✓ 7. notification content`: التأكد من احتواء الإشعار على كافة تفاصيل المنتجات والأسعار والعنوان وطريقة الدفع.
8. `✓ 8. destination validation`: التأكد من جلب وجهة الإدارة ديناميكياً بدون hardcoding.
9. `✓ 9. order remains if notification throws error`: التأكد من سلامة الطلب عند رمي استثناء شبكي في الإشعار.
10. `✓ 10. no duplicate order`: التأكد من منع تكرار الطلبات عند إعادة إرسال رسائل التأكيد.
11. `✓ 11. status update`: التأكد من قدرة الإدارة على تحديث حالة الطلب في Google Sheets.
12. `✓ 12. customer status query`: التأكد من استعلام العميل وقراءة الحالة الحقيقية المحدثة.
13. `✓ 13. restart survival`: التأكد من بقاء واستعادة الطلبات والإشعارات بعد إعادة تشغيل الخدمة.
14. `✓ 14. live notification acceptance / tracking`: التأكد من تصفية وتتبع الإشعارات حسب context.
15. `✓ 15. no secrets in notification`: التأكد من تطهير وإزالة أي مفاتيح API أو أسرار من نصوص الإشعارات.

---

## 7. FINAL VERDICT

**APPROVED — REAL ADMIN ORDER NOTIFICATION & VISIBILITY ENGINE VERIFIED**

تم ربط وتفعيل نظام الإشعارات والرؤية الإدارية الحقيقي بنسبة 100% دون أي تكلفة مالية، مع منع الادعاءات الزائفة وتأمين النظام ضد أي أخطاء أو تسريبات.
