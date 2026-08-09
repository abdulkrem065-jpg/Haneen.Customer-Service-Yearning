# Decision Log

## DEC-001 - Data Operation Context
Use `DataOperationContext` to encapsulate all data operations with `tenantId` and `storeId` to strictly enforce multi-tenant separation. No data operation can proceed without it.

## DEC-002 - Existing Spreadsheet Preservation & Canonical Schema
يعتمد النظام على Google Spreadsheet الحالي كمصدر بيانات MVP،
مع الحفاظ على البيانات الحالية وعدم إجراء تغييرات مدمرة.

يتم تعريف Canonical Schema داخل النظام.

اختلاف أسماء الأعمدة القديمة يتم التعامل معه بواسطة Mapping/Alias
داخل طبقة Google Sheets Infrastructure.

اختلاف أنواع البيانات يتم التعامل معه بواسطة Mapper/Schema Layer.

Trusted TenantContext وStoreContext هما السلطة الأمنية النهائية،
ولا تعتبر قيم tenantId/storeId القادمة من AI أو البيانات الخام
مصدر صلاحية.

هذا التصميم يسمح لاحقاً باستبدال Google Sheets بقاعدة بيانات أو
Provider آخر دون إعادة بناء Agent Core.

## DEC-003 - Fresh Canonical Spreadsheet
يستخدم النظام مجموعة Google Sheets جديدة ومنظمة بالكامل ومتوافقة مع Canonical Domain Schema كمصدر بيانات MVP.
الـSpreadsheet القديم لا يتم حذفه أو تعديله أو إعادة هيكلته، بل يعتبر LEGACY / ARCHIVED SOURCE ولا يدخل ضمن Runtime Data Provider الخاص بالنظام الجديد.
لا يتم تنفيذ Automatic Migration للبيانات القديمة. أي Import مستقبلي للبيانات القديمة يجب أن يكون عملية صريحة ومنفصلة وقابلة للمراجعة.
