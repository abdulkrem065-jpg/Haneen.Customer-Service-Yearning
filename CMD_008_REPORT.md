# CMD-008 EXECUTION REPORT

Status:
PARTIAL

## Real Sheet Access
AVAILABLE
(تم قراءة Spreadsheet الفعلي عبر `curl` للـ URL المصدّر لـ CSV والـ HTML بنجاح. تم استخراج الجداول والبيانات الحالية).

## Sheets Inventory
تم العثور على 4 جداول (Tabs) في الـ Spreadsheet:
1. **Reem's services and prices** (GID: 1099628179)
   - Headers: `service_name, description, price, billing_cycle, status, notes`
   - Rows: 4
   - Domain Entity: None (يبدو أنها باقات اشتراك لخدمة "ريم" SaaS نفسها، وليست منتجات المتجر).
2. **products** (GID: 1605354080)
   - Headers: `id, code, name, category, price, image, Is-Featured, Is-Available`
   - Rows: ~2
   - Domain Entity: `Product`
3. **payments** (GID: 1260860297)
   - Headers: `Type, Key, Value, Link_or_Status`
   - Rows: 2
   - Domain Entity: `StoreSettings` (طرق الدفع، بنك الكريمي ومحفظة فلوسك).
4. **Admin_Settings** (GID: 205636822)
   - Headers: `Key, Value, Description`
   - Rows: 2
   - Domain Entity: `AgentConfig` / `Tenant` (اسم المستخدم وكلمة المرور للوحة التحكم).

## Domain Alignment

| Entity | Sheet | Status | Missing Required Headers | Extra/Unknown Headers |
|---|---|---|---|---|
| `Product` | `products` | NEEDS ALIGNMENT | `tenantId`, `storeId`, `currency`, `inStock`, `createdAt`, `updatedAt` | `code`, `category`, `image`, `Is-Featured`, `Is-Available` |
| `Tenant` | - | MISSING | All | - |
| `Store` | - | MISSING | All | - |
| `StoreSettings` | `payments` (Partial) | NEEDS ALIGNMENT | `id`, `tenantId`, `currency`, `language` | `Type`, `Key`, `Value`, `Link_or_Status` |
| `AgentConfig` | `Admin_Settings` (Partial) | NEEDS ALIGNMENT | All required config fields | - |
| `Category` | - | MISSING | All | - |
| `Customer` | - | MISSING | All | - |
| `Order` | - | MISSING | All | - |
| `ConversationData`| - | MISSING | All | - |

## Schema Alignment
NEEDS ALIGNMENT

## Required Changes
1. **Multi-Tenant Setup:** الـ Spreadsheet مصمم حالياً لمتجر واحد (Single-Tenant). نحتاج لإضافة أعمدة `tenantId` و `storeId` لجميع الجداول التي تخص الدومين لدعم Multi-Tenancy وحماية البيانات.
2. **Missing Columns:** إضافة `createdAt`, `updatedAt`, و `currency` لجدول المنتجات.

## Proposed Renames
- في جدول `products`:
  - تغيير `Is-Available` إلى `inStock` (أو إضافتها كقاعدة ربط في Mapper).
  - تغيير `category` إلى `categoryId` لتسهيل الربط مع جدول الفئات مستقبلاً، أو معاملتها كـ `metadata`.

## Proposed New Headers
- لجدول `products`: `tenantId, storeId, currency, inStock, createdAt, updatedAt`

## Proposed New Sheets
يجب إنشاء جداول جديدة لتغطية باقي الكيانات:
- `Categories`
- `Customers`
- `Orders`
- `Tenants`
- `Stores`
- `AgentConfigs`
- `Conversations`

## Data Type Issues
- عمود `Is-Available` في `products` يحتوي على قيم نصية بالعربية ("نعم", "لا"). يجب تحويلها منطقياً لـ `boolean` (`true/false`) داخل المحول (Mapper)، أو توحيدها في الـ Sheet إلى قيم قياسية `TRUE/FALSE` لتجنب الأخطاء.
- السعر `price` مخزن كرقم صحيح (مثل 500, 1600)، نحتاج للتحقق من خلوه من رموز العملات.

## Tenant Scope
غير موجود حالياً في Spreadsheet، كل البيانات عامة (Implicit Tenant). يجب إضافة عمود `tenantId` لكل جدول يحتوي على بيانات معزولة.

## Store Scope
غير موجود حالياً. يجب إضافة عمود `storeId`.

## Data Integrity Risks
- نقص أعمدة الأمان `tenantId` و `storeId` يعني أن التطبيق لا يمكنه تصفية البيانات بشكل آمن كما يفرضه `DataOperationContext`.
- القيم العربية في الحقول المنطقية (`Is-Available`) قد تتسبب في أخطاء (Data parsing failure) إذا لم تتم إدارتها بحذر في Mapper.

## Data Seeding
NOT EXECUTED
(الانتظار حتى اعتماد القرار المعماري والموافقة على مخطط الجداول الجديد).

## Destructive Changes
NONE

## Tests
Total: 28
Passed: 28
Failed: 0

## TypeScript
PASS

## Build
PASS

## Architectural Decisions Required
LIST
1. **Schema Strategy:** هل نعدل الـ Spreadsheet الحالي لإضافة الجداول والأعمدة المفقودة (Tenants, Orders, etc.)؟
2. **Boolean Data Type:** هل نقوم بتحويل "نعم/لا" إلى "TRUE/FALSE" في الـ Sheet مباشرة لتكون متوافقة مع الـ Parsing القياسي؟ أم نبني Logic داخل المحول يدعم "نعم/لا" كبديل؟
3. **Legacy Sheets:** ماذا نفعل مع `Reem's services and prices` و `payments` و `Admin_Settings`؟ هل نتجاهلها أم نعيد هيكلتها لتناسب `StoreSettings` و `AgentConfig`؟

## APPROVAL REQUIRED
YES
(التعديلات على الـ Spreadsheet الحقيقي أو محاذاة Mappers تحتاج لموافقة المهندس الخارجي لتحديد آلية التحديث قبل الانتقال لـ CMD-009).

## Next Recommended Command
CMD-008-APPROVAL REQUIRED
