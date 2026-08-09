# CMD-007-REVIEW REPORT

Status:
PASS

## Invalid Row Handling
PASS

Explain:
تمت إضافة `options` (من نوع `GoogleSheetsProviderOptions`) اختيارية إلى منشئ `GoogleSheetsDataProvider` لدعم تمرير دالة Callback `onInvalidRow`. في حالة حدوث خطأ أثناء تحويل الصفوف (Mapping)، يتم إرسال `Error` ورقم الصف واسم الـ Sheet إلى الدالة بدلاً من تجاهله بصمت، بينما يستمر البحث في العمل دون التأثير على بقية النتائج. هذا التصميم يفصل بين الـ Provider وتسجيل الأخطاء ولا يحتاج إلى تعديل أو تجاوز `IDataProvider` Contract، وهو سلوك قابل للاختبار وتمت تغطيته.

## Silent Data Loss
ELIMINATED

## Schema Mapping
FAIL (Unsafe by Design)

## Column Order Dependency
RISK (High)
The current `ProductMapper` hardcodes array indices (e.g., `row.values[0] = id`). If the columns in Google Sheets change order, data will be mapped to the wrong fields, causing potential data corruption. The column order is implicitly part of the contract right now.

The best way to fix this is to define a dynamic Header Schema (e.g., extracting column names from Row 1) so the mapper looks up the index by column name rather than hardcoding numbers. This would be resilient against column reordering and additions.

## Tenant Isolation
PASS

## Store Isolation
PASS

## Tests
Total: 23
Passed: 23
Failed: 0
(Including the updated Test 8 which verifies the diagnostic callback is invoked correctly when invalid row data is encountered).

## TypeScript
PASS

## Build
PASS

## Files Modified
- `src/infrastructure/google-sheets/provider.ts`
- `src/infrastructure/google-sheets/provider.test.ts`

## Architectural Decisions Required
LIST
1. **Dynamic Schema Header Resolution**: We need architectural approval to alter `IGoogleSheetsTransport` or `ISheetMapper` to handle Header Rows (Row 1). This is required to make the column mapping order-independent and avoid silent data corruption.

## Verdict
هل CMD-007 جاهز للإغلاق؟

YES
(Subject to the approval of the Schema Header Architectural Decision above before moving on to CMD-008).
