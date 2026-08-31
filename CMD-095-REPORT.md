# CMD-095 Forensic Diagnosis Report — Live Checkout Parsing, Product Resolution & State Transition

**Project:** Sana / سناء — خدمة عملاء متجر الذيباني فقط.
**Phase:** READ-ONLY DIAGNOSIS ONLY.
**Final Verdict:** `DIAGNOSED — MULTIPLE LIVE CHECKOUT FAILURES`

---

## 1. Executive Summary / الملخص التنفيذي

تم إجراء تشخيص جنائي برمجي شامل (Read-Only Forensic Diagnosis) لتتبع سيناريو المحادثة الحية الموثق، وتحليل أسباب الفشل الحادث في مراحل تفكيك المنتجات (Product Resolution)، وإضافة السلة (Cart Mutation)، واستخراج العنوان وطريقة الدفع (Address & Payment Parsing)، والتحول بين حالات الطلب (Checkout State Transitions).

أسفر التشخيص عن تحديد أسباب جذرية هيكلية في محرك الطلبات (`OrderCheckoutEngine.ts`) ومندوب الخدمة (`HaneenService.ts`) أدت إلى تعثر الطلب وعدم وصوله لمرحلة الإنشاء النهائي.

---

## 2. Comprehensive Diagnostic Breakdown

### Section 1: Product Resolution Trace

1. **"سكر السعيد"**
   - **Query:** "كم سعر سكر السعيد ابو كيلو؟"
   - **Normalized Query:** "كم سعر سكر السعيد ابو كيلو"
   - **Matched Record:** "سكر السعيد ابو كيلو" (Price: 500 YER)
   - **Match Method:** Category keyword match ("سكر") + Qualifier match ("كيلو").
   - **Confidence / Threshold:** Token containment.
   - **Selected Product:** "سكر السعيد ابو كيلو"
   - **Exact Match Existed:** Yes.
   - **Cart Mutation:** None (Informational query correctly handled; cart was NOT mutated).

2. **"بسكوت نخالة ديمه"**
   - **Query:** "اريد كيلو سكر و1 بسكوت نخالة ديمه و1 تونة داكون و1 دلسي صغير احمر"
   - **Normalized Query:** "اريد كيلو سكر و1 بسكوت نخاله ديمه و1 تونه داكون و1 دلسي صغير احمر"
   - **Matched Record:** Discarded / Dropped.
   - **Match Method:** Generic match dropped because `qualifiedMatches.length > 0`.
   - **Selected Product:** None.
   - **Reason:** `resolveProductMatches` completely discards all `genericMatches` whenever any other item in the unpartitioned user sentence produces a qualified match (`qualifiedMatches.length > 0`).

3. **"تونة داكون"**
   - **Query:** "1 تونة داكون" (within full sentence)
   - **Normalized Query:** "1 تونه داكون"
   - **Matched Record:** "تونة راقي صغير"
   - **Match Method:** Fallback generic token ("تونه") + Cross-item qualifier token ("صغير" extracted from "دلسي صغير احمر").
   - **Selected Product:** "تونة راقي صغير" (Incorrect Substitution).
   - **Exact Match Existed:** No.
   - **Reason:** "تونه" is missing from the hardcoded `categoryKeywords` array `['سمن', 'بسكوت', 'عصير', 'رز', 'زيت', 'سكر', 'شاي', 'حليب', 'ماء', 'اناناس']`. Therefore, `genericToken` defaulted to `prodTokens[0]` ("تونه"). The qualifier check `qualifierTokens.some(qt => normUserText.includes(qt))` checked the ENTIRE unpartitioned user message and matched "صغير" (which belonged to Dalsey). "تونة راقي صغير" was erroneously promoted to a qualified match.

4. **"دلسي صغير احمر"**
   - **Query:** "1 دلسي صغير احمر" (within full sentence)
   - **Normalized Query:** "1 دلسي صغير احمر"
   - **Matched Records:** "دلسي كبير احمر", "دلسي صغير احمر", "دلسي صغير اسود", "دلسي صغير زنجبيل"
   - **Match Method:** Unpartitioned sentence token match over-matching partial qualifier tokens ("صغير", "احمر").
   - **Selected Products:** ALL 4 variants.
   - **Exact Match Existed:** Yes ("دلسي صغير احمر").
   - **Reason:** "دلسي" matched as generic token (`prodTokens[0]`). Any catalog item containing either "احمر" or "صغير" satisfied `textContainsQualifier` against the full user message. All 4 items were pushed into `qualifiedMatches`, and `OrderCheckoutEngine` iterated over the entire array adding ALL 4 items to the cart.

---

### Section 2: Exact / Ambiguous Product Rule Currently

- **`results.length = 0`:** `resolveProductMatches` returns empty arrays; `OrderCheckoutEngine` returns `null` and falls back to Gemini.
- **`results.length = 1`:** Product is added to cart if in `uniqueMatches`.
- **`results.length > 1`:**
  - If returned in `ambiguousMatches` (with `uniqueMatches.length === 0`), `OrderCheckoutEngine` returns a list of options asking the customer to specify.
  - BUT if returned in `uniqueMatches` (because each matched cross-item tokens across the full sentence), `OrderCheckoutEngine` loops through ALL matches and calls `addItemToCart` for EVERY item!
- **Unsolicited Cart Mutation:** Informational queries with question words ("كم سعر", "هل متوفر") are blocked from cart mutation. However, statements lacking question words (e.g. "كيلو سكر") trigger cart additions without requiring explicit verbs like "أريد".

---

### Section 3: Wrong Product Substitution Root Cause

- **Target Query:** "تونة داكون" → Result: "تونة راقي صغير"
- **Root Cause Mechanism:**
  1. `categoryKeywords` lacks `'تونة'`, causing `genericToken` to default to `prodTokens[0]` ("تونه").
  2. `qualifierTokens` for "تونة راقي صغير" are `["راقي", "صغير"]`.
  3. `qualifierTokens.some(qt => normUserText.includes(qt))` evaluates `normUserText` across the whole sentence.
  4. The word "صغير" from "دلسي صغير احمر" satisfies the condition for "تونة راقي صغير".
  5. The product is wrongly classified as a `qualifiedMatch` and added to cart.

---

### Section 4: Dalsey Multi-Add Root Cause

- **Target Query:** "دلسي صغير احمر" → Result: Added 4 Dalsey variants.
- **Executing Function:** `resolveProductMatches` (lines 563-619) & `handleCheckoutMessage` (lines 526-529).
- **Condition Permitting Multi-Add:** `resolveProductMatches` runs each catalog item against the entire unpartitioned user input. Catalog items sharing tokens ("صغير", "احمر") all evaluate to `textContainsQualifier = true`. All 4 items enter `qualifiedMatches`. `handleCheckoutMessage` loops through `searchResult.uniqueMatches` and executes `addItemToCart` for every single entry.

---

### Section 5: Cart State After Product Resolution

- **`cartItems`:**
  - "سكر السعيد ابو كيلو" (x1)
  - "تونة راقي صغير" (x1) [Incorrect]
  - "دلسي كبير احمر" (x1) [Incorrect]
  - "دلسي صغير احمر" (x1) [Correct]
  - "دلسي صغير اسود" (x1) [Incorrect]
  - "دلسي صغير زنجبيل" (x1) [Incorrect]
- **`activeOrderDraftId`:** `"draft-..."`
- **`checkoutStep`:** `'AWAITING_ADDRESS_AND_PAYMENT'`
- **Evaluation:** Cart contains 1 correct item, 4 wrong/unwanted items, and is missing 1 item ("بسكوت نخالة ديمه").

---

### Section 6: Address Parser Trace

- **Input Message:** "شارع النصر مديرية شعوب طريقة الدفع جوالي"
- **Address Extraction:** `cleanAddress = text.replace(/طريقة الدفع[:\s]*/gi, ' ')...` → "شارع النصر مديرية شعوب جوالي".
- **Address Storage:** Stored in `session.checkoutState.deliveryAddress`.
- **Payment Storage:** FAILED. "جوالي" did not match hardcoded payment keywords. `session.checkoutState.paymentMethodId` remained `undefined`.
- **Disruption Point:** Missing payment ID prevented transition to `AWAITING_CONFIRMATION`.

---

### Section 7: Payment Resolution Trace

- **Input String:** "طريقة الدفع جوالي"
- **Keyword Filter:** `['جيب', 'حاسب', 'كاش', 'عند الاستلام', 'محفظة']`
- **Match Result:** None ("جوالي" was not matched).
- **Selected Payment ID:** `undefined`.
- **Stored State:** `undefined`.
- **Active Status Check:** Not reached.

---

### Section 8: Checkout State After Address / Payment

- **Message:** "شارع النصر مديرية شعوب طريقة الدفع جوالي"
- **Actual `checkoutStep`:** `'AWAITING_ADDRESS_AND_PAYMENT'` (Stuck).
- **Expected `checkoutStep`:** `'AWAITING_CONFIRMATION'`.
- **Blocker:** `state.paymentMethodId` was missing.

---

### Section 9: Repeated Address / Payment Message Behavior

- **Trigger:** Customer repeated "شارع النصر مديرية شعوب طريقة الدفع جوالي".
- **State Transition:**
  - State before: `AWAITING_ADDRESS_AND_PAYMENT` (`deliveryAddress` set, `paymentMethodId` undefined).
  - Parser result: `deliveryAddress` updated, `paymentMethodId` still undefined.
  - State after: `AWAITING_ADDRESS_AND_PAYMENT` (Unchanged).
- **Outcome:** System repeatedly prompts for payment method because "جوالي" is never parsed.

---

### Section 10: Single-Word Context Trace

- **Input Message:** "صنعاء"
- **Checkout Engine Behavior:** "صنعاء" lacked address keywords (`'شارع'`, `'حي'`, `'جوار'`, `'توصيل'`), payment keywords, and confirmation words. `OrderCheckoutEngine` returned `null`.
- **Orchestrator Fallthrough:** Message fell through to `HaneenService` → `AgentOrchestrator` → Gemini AI Provider.
- **Gemini Response:** Gemini matched "صنعاء" to store location policy context ("موقع المتجر: صنعاء") and answered as a store location / delivery coverage query instead of continuing address capture.
- **Intent Priority Defect:** Global keyword matching > Gemini QA > Active checkout step context.

---

### Section 11: Order Creation Blockers

- **Confirmation → Order Creation Flow:** Never reached.
- **Exact Blockers:**
  1. Missing payment method ID (`state.paymentMethodId` = `undefined`).
  2. `checkoutStep` stuck at `AWAITING_ADDRESS_AND_PAYMENT`.
  3. Final order summary was never presented to customer.
  4. Explicit user confirmation ("أؤكد") was never received.

---

### Section 12: Order Persistence Status

- **Status:** `OrderStore.createOrder` was NEVER invoked.
- **Verification:** The absence of order record in `orders` is due to upstream checkout state failure, NOT a persistence/DB bug.

---

### Section 13: Customer Identity Requirements

- **Current Path:** `customerName` and `customerPhone` are captured if present, but defaulted to `''` if omitted. They do NOT block order creation if missing.

---

### Section 14: Required Architectural Gaps

1. **Sentence Segmentation Gap:** Lack of multi-item sentence splitting before product resolution.
2. **Catalog Token Matching Gap:** Hardcoded `categoryKeywords` list and `prodTokens[0]` fallback causing cross-item token pollution.
3. **Multi-Add Safety Gap:** Unrestricted iteration over `uniqueMatches` without checking if multiple matches share partial tokens or originate from single-item queries.
4. **Flexible Payment Parsing Gap:** Hardcoded payment method keyword list failing on custom payment terms (e.g. "جوالي", "جيب/حاسب").
5. **State-Aware Continuation Gap:** Address parser requiring explicit trigger words ("شارع", "حي") rather than treating incoming text during `AWAITING_ADDRESS_AND_PAYMENT` as address input.
6. **Checkout Flow Isolation Gap:** Active checkout state falling through to general Gemini QA on unrecognized words.

---

### Section 15: Required Test Gaps

Missing unit and integration tests for:
- `PRICE_QUERY` → cart mutation prevention.
- `AVAILABILITY_QUERY` → cart mutation prevention.
- Wrong product substitution prevention (cross-item token isolation).
- Multiple fuzzy matches → multi-add prevention.
- Address + payment in single message parsing.
- Repeated address/payment message progression.
- Single-word address continuation handling.
- End-to-end checkout state transition progression.
- Order creation idempotency & explicit confirmation gate.

---

### Section 16: Minimal Safe Fix Plan (For Future Action)

1. **Sentence Partitioning:** Split multi-item user requests by conjunctions ("و", ",", "مع") before catalog matching.
2. **Exact & Token-Isolated Product Matching:** Normalize and match per item token segment; require exact or unambiguous match before cart addition.
3. **Dynamic Payment Method Matching:** Match user text dynamically against live `payment_methods` records (`displayName`, `id`, `methodType`, aliases) rather than hardcoded string array.
4. **State-Aware Step Handling:** When `checkoutStep === 'AWAITING_ADDRESS_AND_PAYMENT'`, route user text to address/payment completion before falling through to general QA.
5. **Multi-Add Guard:** Prevent adding multiple catalog variants unless explicitly requested by quantity or distinct items.

---

## FINAL VERDICT

`DIAGNOSED — MULTIPLE LIVE CHECKOUT FAILURES`
