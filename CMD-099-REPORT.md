# CMD-099 — ORDER DRAFT TO FINAL ORDER DATA LOSS FORENSIC TRACE

## 1. Forensic Trace Table

| Field | Checkout State | createOrder Input | Order Object (`newOrder`) | Sheets Row | Read-Back | First Loss Point |
|---|---|---|---|---|---|---|
| `customerName` | Present | Present | Present | **Lost** | Lost | Sheets Row (Mapper drops it) |
| `customerPhone` | Present | Present | Present | **Lost** | Lost | Sheets Row (Mapper drops it) |
| `deliveryAddress`| Present | Present | Present | **Lost** | Lost | Sheets Row (Mapper drops it) |
| `paymentMethodId`| Present | Present | Present | **Lost** | Lost | Sheets Row (Mapper drops it) |
| `paymentMethodName`| Present | Present | Present | **Lost** | Lost | Sheets Row (Mapper drops it) |
| `subtotal` | Present | Present | Present | **Lost** | Lost | Sheets Row (Mapper drops it) |
| `deliveryFee` | Present | Present | Present | **Lost** | Lost | Sheets Row (Mapper drops it) |
| `totalAmount` | Present | Present | Present | Present | Present | **Not Lost** (Required Header) |

### Order Items Trace
| Field | Status | First Loss Point | Reason |
|---|---|---|---|
| `productId` | Present | Not Lost | Required Header |
| `quantity` | Present | Not Lost | Required Header |
| `unitPrice` | Present | Not Lost | Required Header |
| `totalPrice` | Present | Not Lost | Required Header |
| `productNameSnapshot`| **Lost** | Sheets Row | Optional Header (Mapper drops it) |

---

## 2. Answers to Specific Questions

**1. هل `customerPhone` موجود في Checkout State ثم يختفي عند `createOrder`؟**
لا يختفي قبل أو كجزء من عملية استدعاء `createOrder`. هو موجود في `Checkout State`، وينتقل بنجاح كمدخل (Input) إلى `createOrder`، ويُعين في كائن الطلب الداخلي `newOrder`. الاختفاء الفعلي يحدث عند محاولة كتابة السطر في Google Sheets (Sheets Row) بسبب الـ Mapper.

**2. هل `paymentMethodId`/`paymentMethodName` موجودان ثم يسقطان في mapper؟**
نعم تماماً. يتم تمريرهما بشكل صحيح حتى مرحلة التجهيز في Google Sheets، لكنهما يسقطان داخل دالة `HeaderMap.buildRow` لأن أعمدتهما مصنفة كـ (Optional Headers)، وإذا كانت غير موجودة فعلياً في الشيت، يتم تجاهل البيانات بصمت.

**3. هل `deliveryAddress` موجود ثم يسقط؟**
نعم، لنفس السبب المذكور أعلاه.

**4. هل `customerName` مفقود فقط لأن العميل لم يقدمه؟**
لا. حتى لو قدمه العميل (أو أخذ القيمة الافتراضية "عميل المتجر")، فإنه سيسقط في الـ Mapper ولن يُحفظ في الشيت لعدم وجود العمود.

**5. لماذا response النهائي يعرض: "العميل: غير محدد"، "طريقة الدفع: "، "عنوان التوصيل: " رغم أن summary السابق يحتوي بعضها؟**
لأن كود الإرسال إلى Google Sheets ينفذ عملية تحقق صارمة (READ-BACK VERIFICATION). بعد كتابة الطلب، تقوم الدالة بقراءته مجدداً من الشيت (`await this.getOrderById`). وبما أن البيانات سقطت أثناء الكتابة (بسبب غياب الأعمدة)، فإن كائن الطلب العائد يكون فارغاً من هذه الحقول. تقوم دالة `OrderCheckoutEngine` بالاعتماد على كائن `createdOrder` (المقروء للتو من الشيت) لبناء الرسالة النهائية، بدلاً من الاعتماد على الـ `state`، مما يسبب ظهور الحقول فارغة أو بقيمها الافتراضية.

---

## 3. Exact Root Cause
The `HeaderMap.buildRow` function in the Google Sheets mapper dynamically maps object fields to row columns by strictly iterating only over the headers that **currently exist** in the physical Google Sheet row 1 (`this.colIndexMap.entries()`).

If the physical Google Sheet was initialized with only the `requiredHeaders`, or if `optionalHeaders` (such as `customerPhone`, `paymentMethodName`, `deliveryAddress`, `productNameSnapshot`) were manually deleted or not created, `HeaderMap.buildRow` silently drops the corresponding data.

Furthermore, `GoogleSheetsOrderStore.createOrder` performs a strict read-back verification after writing. It fetches the order back from the sheet to return to the engine. Because the data was dropped on write, the returned `Order` object has missing or empty values, causing the checkout UI to display missing information despite the session having captured it correctly.

---

## 4. Minimal Safe Fix Plan
1. Update `GoogleSheetsOrderStore.ensureTabsExist()`.
2. Currently, it only writes the header row if the sheet is completely empty (`orderRows.length === 0`).
3. Modify it so that if rows *do* exist, it inspects row 0 (the current headers).
4. Compare the existing headers against `this.orderMapper.defaultHeaders` (which contains both required and optional headers).
5. If any headers are missing, dynamically append them to the end of row 0 in the Google Sheet.
6. Repeat this check for the `order_items` tab (`this.orderItemMapper.defaultHeaders`).
7. This ensures that all data properties always have a valid column mapping to write into, preventing silent data loss.

---

## 5. FINAL VERDICT
**DIAGNOSED — ORDER DATA MAPPING LOSS**
