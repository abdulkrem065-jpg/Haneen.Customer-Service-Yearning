# CMD-074 — PAYMENT METHODS SHEET DISCOVERY & RANGE FORENSIC DIAGNOSIS REPORT

**تاريخ التشخيص:** 21 أغسطس 2026  
**المشروع:** Sana Customer Service — متجر الذيباني  
**المهمة:** تشخيص جنائي برمي (Read-Only) لسبب فشل التزويد لجدول `payment_methods` مع الخطأ:  
`Google Sheets API Error: Unable to parse range: 'payment_methods'!A1`  
**النتيجة النهائية (FINAL VERDICT):** `DIAGNOSED — SHEET MISSING`  

---

## 1. Executive Forensic Summary

- **Spreadsheet ID:** `1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo`
- **Tenant ID:** `tnt-41f0d530` (متجر الذيباني)
- **Store ID:** `str-2c6ad81f` (بقالة الذيباني)
- **Total Writes Executed during CMD-074:** `0` (Strict Read-Only Mode)

---

## 2. Live Spreadsheet Metadata & Sheet Discovery

التحليل التشخيصي للهيكل الفعلي للجدول الإلكتروني المعتمد (`1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo`):

### الجداول المتاحة فعلياً داخل Google Spreadsheet (Present Sheets):
1. `tenants` (مقترن بـ tenant ID العياري)
2. `stores` (مقترن بـ store ID العياري)
3. `agent_config` (مقترن بـ agent ID العياري)
4. `store_settings` (مقترن بـ Base Currency YER)
5. `categories` (تم استيراد التصنيفات)
6. `products` (تم استيراد المنتجات)
7. `store_notices` (تم إنشاء بنرات الإعلانات والتنبيه الذكي)

### الجداول المفقودة غير الموجودة كـ Tabs داخل Spreadsheet (Missing Sheets):
1. **`payment_methods`**: `MISSING` (غير موجود كـ Tab كلياً داخل Spreadsheet)
2. **`store_contacts`**: `MISSING` (غير موجود كـ Tab كلياً داخل Spreadsheet)
3. **`business_hours`**: `MISSING`
4. **`delivery_configuration`**: `MISSING`
5. **`delivery_zones`**: `MISSING`
6. **`store_locations`**: `MISSING`
7. **`store_policies`**: `MISSING`
8. **`digital_services`**: `MISSING`

---

## 3. Forensic Status for Priority Tables

| Table | Actual Title in Sheet | Sheet ID | Read Status (`getRows`) | Write Attempt Status |
| :--- | :--- | :--- | :--- | :--- |
| **`payment_methods`** | `MISSING` | `N/A` | Returns `[]` (Protected by `hasSheet` guard in `getRows`) | Fails with `400 Unable to parse range: 'payment_methods'!A1` during `writeHeaderRow` |
| **`store_contacts`** | `MISSING` | `N/A` | Returns `[]` (Protected by `hasSheet` guard in `getRows`) | Fails with `400 Unable to parse range: 'store_contacts'!A1` during `writeHeaderRow` |
| **`products`** | `products` | `VERIFIED` | `PASS` | `PASS` |
| **`categories`** | `categories` | `VERIFIED` | `PASS` | `PASS` |

---

## 4. Code & Transport Mapping Comparison

تم فحص ومقارنة الكود المباشر دون أي تعديل:

1. **مصدر اسم الشيت (`sheetName`):**
   - يأتي من `CanonicalSchemas.payment_methods.sheetName` في [`/src/infrastructure/google-sheets/schema-definitions.ts`](/src/infrastructure/google-sheets/schema-definitions.ts) وهي محددة بالنص الصريح `'payment_methods'`.

2. **بناء النطاق (A1 Range Construction):**
   - في `SecureGoogleSheetsTransport.getRows(sheetName)`: يتم استدعاء `hasSheet(sheetName)` أولاً. إذا كانت النتيجة `false` (لأن التبويب مفقود)، ترجع دالة `getRows` مصفوفة فارغة `[]` دون استدعاء Google API range parser.
   - في `BusinessKnowledgeProvisioner.provisionAll()`: عندما تعيد `getRows` مصفوفة فارغة `[]` لعدم وجود التبويب، ينتقل المزوّد مباشرة إلى استدعاء `transport.writeHeaderRow('payment_methods', headers)` أو `transport.addRow('payment_methods', values)`.
   - في `SecureGoogleSheetsTransport.writeHeaderRow(sheetName, headers)`: يتم إرسال طلب `spreadsheets.values.update` مباشرة للنطاق `'payment_methods'!A1`.

3. **سبب استجابة Google Sheets API بالخطأ:**
   - في واجهة برمجيات Google Sheets API v4، عند إرسال طلب `values.update` أو `values.append` أو `values.get` لنطاق A1 يحتوي اسم تبويب غير موجود كلياً في المستند (مثل `'payment_methods'!A1`)، يفشل المفسر الخاص بـ Google ويبث خطأ HTTP 400 بركيزة:
     `Unable to parse range: 'payment_methods'!A1`

---

## 5. Error Classification & Root Cause Analysis

- **التصنيف الدقيق للخطأ (Error Classification):**
  `A. SHEET_MISSING`

- **السبب الجذر (Root Cause):**
  التبويب `payment_methods` (وكذلك `store_contacts` وباقي الجداول غير المبتدأة) غير موجود كـ Sheet Tab في مستند Google Spreadsheet. عند محاولة كتابة رأس السجل (Header Row) بواسطة `BusinessKnowledgeProvisioner` بطلب `writeHeaderRow` أو `addRow` دون إنشاء التبويب أولاً بواسطة `createSheet` (`addSheet` batchUpdate request)، يُرجع Google Sheets API الخطأ البرمجي المذكور.

---

## 6. Recommended Minimal Fix (For CMD-075)

لإصلاح المشكلة جذرية وبأقل تغيير ممكن في CMD-075 دون المساس بأي جدول موجود:

1. في `SecureGoogleSheetsTransport.writeHeaderRow(sheetName, headers)` و/أو `addRow(sheetName, values)`:
   - إضافة فحص تحققي: إذا كان `!(await this.hasSheet(sheetName))`، يتم استدعاء `await this.createSheet(sheetName)` تلقائياً قبل محاولة الكتابة إلى `'sheetName'!A1`.
2. أو في `BusinessKnowledgeProvisioner.provisionAll()`:
   - عند اكتشاف عدم وجود صفوف وكان الشيت مفقوداً، يتم استدعاء `await this.transport.createSheet(sheetName)` قبل كتابة `writeHeaderRow`.

---

## 7. Audit Compliance Summary

```text
CMD-074 AUDIT METRICS

Spreadsheet ID:
1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo

payment_methods actual title:
MISSING

payment_methods sheetId:
N/A

payment_methods read status:
PASS (getRows returns [] via hasSheet guard)

payment_methods write status:
FAILS with 'Unable to parse range: 'payment_methods'!A1' due to missing sheet tab

store_contacts actual title:
MISSING

store_contacts sheetId:
N/A

writesExecuted:
0 (Strict Read-Only)

Code Changes Made:
NONE (0 lines modified)

FINAL VERDICT:
DIAGNOSED — SHEET MISSING
```

---

# **`DIAGNOSED — SHEET MISSING`**

---
*تم إكمال الفحص الجنائي البرمي بالكامل بنسبة كتابات = 0. لم يتم تعديل الكود أو إنشاء شيتات أو البدء بـ CMD-075 حسب التعليمات (STOP).*
