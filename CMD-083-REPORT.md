# CMD-083 — SANA INTENT GATE & SAFE PRODUCT RESOLUTION FIX REPORT

**Project:** Sana / سناء — خدمة عملاء متجر الذيباني فقط  
**Date:** 2026-08-25  
**Status:** COMPLETED & VERIFIED (58/58 Tests Passing)

---

## 1. Executive Summary

CMD-083 fixes the critical architectural defect where informational queries (e.g., price inquiries or availability checks) were mistakenly triggering cart mutations and order draft creations in production. 

By introducing an explicit **Intent Gate** and a **Safe Product Resolution Engine** in `OrderCheckoutEngine`, Sana now strictly separates:
1. **`INFORMATIONAL_QUERY`** (e.g., "كم سعر سكر السعيد؟", "هل يوجد سمن الماس؟"): Answers customer questions cleanly without mutating the cart or instantiating an `activeOrderDraftId`.
2. **`PURCHASE_INTENT`** (e.g., "أريد كيلو سكر", "حط سمن الماس"): Matches products accurately and updates the cart safely.
3. **`CLARIFICATION_REQUIRED`** (e.g., "أريد سمن" when multiple saman products exist): Prompts the user to specify their desired product instead of adding all matching options to the cart.

---

## 2. Root Cause Analysis & Architectural Fixes

### Root Cause 1: Intent Coupling with Keyword Detection
- **Previous Defect:** `isOrderRequest` classified any incoming message containing catalog product names (e.g., "سكر", "سمن") as a purchase request, causing price/availability questions like "كم سعر سكر السعيد؟" to trigger order creation.
- **Architectural Fix:** Implemented `isQuestionOrInquiry` gate that checks for question words (`كم`, `بكم`, `سعر`, `هل`, `أين`, `متى`, `؟`). If present without an explicit purchase verb (`أريد`, `اشتري`, `أضف`), the message is strictly treated as an `INFORMATIONAL_QUERY`.

### Root Cause 2: Broad Substring Matching & Broad Addition
- **Previous Defect:** Searching for generic terms like "سمن" matched all saman products (`سمن البنت`, `سمن القمرية`, `سمن الماس`) and added all of them to the cart simultaneously.
- **Architectural Fix:** Refactored `resolveProductMatches` with a qualified-vs-generic matching algorithm. 
  - If a specific qualifier token is present (e.g., "الماس" in "سمن الماس"), only that specific item is resolved as a `uniqueMatch`.
  - If only a generic category term is present (e.g., "سمن"), all candidate items are grouped into `ambiguousMatches`. In `PURCHASE_INTENT` mode, Sana returns a `CLARIFICATION_REQUIRED` prompt ("تتوفر لدينا عدة أنواع...") without adding anything to the cart.

---

## 3. Key Rule Verifications

1. **Informational Queries Never Mutate Cart:** Tested with `PRICE_QUERY` and `AVAILABILITY_QUERY` strings across single and multi-turn conversations. `cart.length` remains `0` and `activeOrderDraftId` remains `undefined`.
2. **Clarification for Ambiguous Products:** Requesting "أريد سمن" when 3 saman options exist prompts the user for clarification and leaves the cart empty.
3. **Pending Product Confirmation:** On availability check ("هل يوجد سمن الماس؟"), `lastOfferedProduct` is saved in session state. A subsequent short affirmative ("نعم") safely adds only `lastOfferedProduct` to the cart.

---

## 4. Test Verification Results

All automated test suites executed cleanly with zero errors:

| Test Suite | Total Tests | Passed | Status |
| :--- | :--- | :--- | :--- |
| **`cmd-080.test.ts`** | 25 | 25 | ✅ Passed |
| **`cmd-081.test.ts`** | 20 | 20 | ✅ Passed |
| **`cmd-083.test.ts`** | 13 | 13 | ✅ Passed |
| **Total Core Suite** | **58** | **58** | ✅ **100% Passed** |

---

## 5. File Modifications Summary

- **`/src/core/orders/order-checkout-engine.ts`**:
  - Implemented `isQuestionOrInquiry` and `isExplicitPurchaseVerb` intent gate logic.
  - Implemented qualified vs generic `resolveProductMatches` algorithm.
  - Enforced zero-mutation policy for `INFORMATIONAL_QUERY` and `CLARIFICATION_REQUIRED`.
  - Ensured short confirmations ("نعم", "أؤكد") on existing orders return order tracking status cleanly.
- **`/src/core/cmd-083.test.ts`**:
  - Created 13 unit tests covering all edge cases specified in CMD-083.
- **`/CMD-083-REPORT.md`**:
  - Documented forensic diagnosis, root cause analysis, architecture changes, and test results.
