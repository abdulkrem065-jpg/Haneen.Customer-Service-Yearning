# CMD-097 — LIVE CHECKOUT STATE, CART MUTATION & CUSTOMER IDENTITY FORENSIC TRACE REPORT

**Status**: DIAGNOSIS ONLY (No code, schema, catalog, or order state modifications were made)  
**Date**: 2026-08-31  
**Target Module**: `src/core/orders/order-checkout-engine.ts` & `src/core/productization/haneen-service.ts`

---

## 1. CART MUTATION TRACE

### Call Sites Mutating Cart
1. **`addItemToCart`** (`src/core/orders/order-checkout-engine.ts`, lines 830–844):
   - **Invocation Site A**: Line 207 (Handling `lastOfferedProduct` when user accepts offered item).
   - **Invocation Site B**: Line 563 (Looping over resolved products from purchase triggers in `handleCheckoutMessage`).
   - **Mutation Logic** (Line 833):
     ```typescript
     const existing = state.cart.find(i => i.productId === productId || i.productName === productName);
     if (existing) {
       existing.quantity += quantity; // <--- INCREMENTAL ADDITION ONLY
       existing.subtotal = existing.quantity * existing.unitPriceSnapshot;
     }
     ```

### Root Cause of Quantity Duplication on "ركز على الطلب..."
- **Turn 1**: Customer requested items -> Cart stored `تونة داكون صغير` (qty=1), `دلسي صغير احمر` (qty=1).
- **Turn 3**: Customer sent correction/re-statement sentence: *"ركز على الطلب تريد 1كيلو سكر و1 تونة داكون و1 دلسي صغير احمر"*.
- **Execution Path**:
  1. Message matched `isPurchaseTrigger` (Line 526).
  2. `splitUserTextIntoItemPhrases` parsed `1 تونة داكون` (qty=1) and `1 دلسي صغير احمر` (qty=1).
  3. `addItemToCart` was called for each resolved item.
  4. Because `addItemToCart` ONLY performs `existing.quantity += quantity`, it incremented quantities: `1 + 1 = 2` for both `تونة داكون صغير` and `دلسي صغير احمر`.

---

## 2. CART SEMANTICS (ARCHITECTURAL GAP)

The current system implementation lacks multi-modal cart operations:
- **`ADD_INCREMENTAL`**:  Implemented (`existing.quantity += quantity`).
- **`SET_EXACT_QUANTITY`**:  Absent.
- **`REPLACE_CART`**:  Absent.
- **`CONFIRM_EXISTING_CART`**:  Absent.
- **`REMOVE_ITEM`**:  Absent.

**Architectural Gap**: When a user re-states or corrects their order during an active session, the engine treats every product mention as an incremental addition, lacking the ability to distinguish between an additive request and a cart state re-statement or replacement.

---

## 3. REPEATED PRODUCT MESSAGE ANALYSIS

- **Turn 1**: *"اريد 1 تونه..."* -> Initializes cart with items.
- **Turn 2**: *"اضف كيلو سكر"* -> Attempts incremental add.
- **Turn 3**: *"ركز على الطلب تريد 1 كيلو سكر و1 تونة..."* -> **Customer Intent = Re-statement / Correction of desired full cart**.
- **Correct State Interpretation**: When an active cart exists and the customer states a full list of items ("ركز على الطلب تريد..."), the engine should evaluate the statement as a **Cart Replacement / Synchronization**, overwriting cart item quantities rather than executing `+= quantity`.

---

## 4. PRODUCT PHRASE TRACE ("كيلو سكر")

- **Raw input**: `"كيلو سكر"` or `"1كيلو سكر"`
- **Phrase Segmentation**:
  - `splitUserTextIntoItemPhrases` (Line 604):
  - Number Regex `^(\d+)\s*(.*)` extracts `quantity = 1`, `queryPhrase = "كيلو سكر"`.
  - Unit Stripping: `queryPhrase.replace(/^(كيلو|حبة|...)\s+/i, '')` -> `strippedQuery = "سكر"`.
  - `normalizedQuery` = `"سكر"`.
- **Product Resolution (`resolveSingleProductItem`)**:
  - Query tokens: `["سكر"]`.
  - Catalog match: `prod-sugar` (`"سكر السعيد ابو كيلو"`, tokens: `["سكر", "السعيد", "ابو", "كيلو"]`).
- **Why Contamination Happened**:
  - `categoryKeywords` includes `"سكر"`.
  - In candidate matching (Lines 677–690), token containment logic checks `allProdTokensInQuery` using `normQuery.includes(pt)`.
  - When non-stripped or composite phrases contain words overlapping with other items, or when generic category matches yield multiple candidates without strict purchase verbs, ambiguity or incorrect candidate lists (e.g., `بسكوت بسكريم كبير`) can be returned if token overlap scoring is unconstrained.

---

## 5. PRODUCT ENTITY BOUNDARY

- **Phrase Splitter**: Splits on `و`, `,`, `\n`, `+` (Line 610).
- **Issue**: Multi-word product titles or phrases where "و" is part of the product name or attached directly to digits (e.g., `1كيلو سكر`) can cause irregular token splits if whitespace is missing.
- **Quantity & Entity Coupling**: Quantity remains attached via `ItemSegment.quantity`, but if splitting breaks a multi-word phrase prematurely, the quantity gets bound to an incomplete string fragment.

---

## 6. CUSTOMER PHONE TRACE ("7747480112")

When the customer sent `"7747480112"` in Turn 6:

1. **Section 3 (`Customer Identity Capture`, Line 163)**:
   - `phoneMatch` = Matches `"774748011"`.
   - `hasNameLikeText`:
     ```typescript
     const hasNameLikeText = text.replace(/[\d\+\-\s]/g, '').length >= 3;
     ```
     For `"7747480112"`, `replace(/[\d\+\-\s]/g, '')` evaluates to `""` (length = 0). `hasNameLikeText` = **FALSE**.
   - `isExplicitIdentity` check (Line 165):
     Requires explicit keywords (`الاسم`, `الهاتف`, `جوالي هو`) OR `(phoneMatch && hasNameLikeText)`.
     Since `hasNameLikeText` was **FALSE** and no keyword was present, `isExplicitIdentity` evaluated to **FALSE**.
   - **Result**: `state.customerPhone` WAS NOT SAVED IN SECTION 3!

2. **Section 6 (`Active Checkout Context`, Line 363)**:
   - `inActiveCheckoutStep` was `TRUE` because `state.step === 'AWAITING_CUSTOMER_INFO'`.
   - `extractAddressText("7747480112")` returned `null`.
   - Line 411: Engine saw `deliveryAddress` ("شارع النصر صنعاء") and `paymentMethodId` ("pay-jawali") were already set.
   - Line 412: Set `state.step = 'AWAITING_CONFIRMATION'` and re-rendered `OrderSummary(state)` (with `customerPhone` still `undefined`).

3. **Turn 7 (`"نعم"`)**:
   - Section 5 checked `if (!state.customerPhone || state.customerPhone.trim() === '')`.
   - Because `customerPhone` was still `undefined`, Section 5 set `state.step = 'AWAITING_CUSTOMER_INFO'` and asked for the phone number again.

---

## 7. PHONE VALIDATION

- **Current Regex in Code** (Line 163): `/(?:0?7[013778]\d{7}|7\d{8})/`
- **Input**: `"7747480112"` (10 digits starting with `77`).
- **Yemen Mobile Standard**: 9 digits without leading zero (e.g., `774748011`), or 10 digits with leading zero (`0774748011`).
- **Software Defect**:
  1. Regex enforces exact digit counts that fail or truncate 10-digit numbers without leading zero.
  2. Primary Failure: Even when regex matches 9 or 10 digits, `hasNameLikeText` prevents saving standalone phone numbers entered without name or explicit prefix keywords.

---

## 8. CUSTOMER NAME

- In the live trace, `state.customerName` remained `undefined` because the customer supplied address, payment, and phone, but no text matching `hasNameLikeText >= 3`.

---

## 9. CHECKOUT STATE TRACE (TURN-BY-TURN)

| Turn | User Input | Initial Step | Cart State | Address / Payment / Phone | Final Step | Output / Behavior |
|------|------------|--------------|------------|---------------------------|------------|-------------------|
| **1** | *"اريد 1 تونه داكون و1 دلسي صغير احمر وكيلو سكر"* | `NO_ORDER` | `[]` | `- / - / -` | `AWAITING_ADDRESS_AND_PAYMENT` | Added 2 items. Sugar missing. |
| **2** | *"اضف كيلو سكر"* | `AWAITING_ADDRESS_AND_PAYMENT` | `[Tuna x1, Dalsey x1]` | `- / - / -` | `AWAITING_ADDRESS_AND_PAYMENT` | Ambiguous / mis-matched. |
| **3** | *"ركز على الطلب تريد 1كيلو سكر و1 تونة داكون و1 دلسي..."* | `AWAITING_ADDRESS_AND_PAYMENT` | `[Tuna x1, Dalsey x1]` | `- / - / -` | `AWAITING_ADDRESS_AND_PAYMENT` | Cart incremented: `[Tuna x2, Dalsey x2, Sugar x1]`. |
| **4** | *"شارع النصر صنعاء طريقة الدفع جوالي"* | `AWAITING_ADDRESS_AND_PAYMENT` | `[Tuna x2, Dalsey x2, Sugar x1]` | `شارع النصر / pay-jawali / -` | `AWAITING_CONFIRMATION` | Summary displayed. Phone undefined. |
| **5** | *"نعم"* | `AWAITING_CONFIRMATION` | `[3 items]` | `شارع النصر / pay-jawali / -` | `AWAITING_CUSTOMER_INFO` | Requested phone number. |
| **6** | *"7747480112"* | `AWAITING_CUSTOMER_INFO` | `[3 items]` | `شارع النصر / pay-jawali / -` | `AWAITING_CONFIRMATION` | **Phone NOT saved** (due to `hasNameLikeText=false`). Summary re-rendered. |
| **7** | *"نعم"* | `AWAITING_CONFIRMATION` | `[3 items]` | `شارع النصر / pay-jawali / -` | `AWAITING_CUSTOMER_INFO` | **Confirmation Loop**: Phone missing again. Requested phone number. |

---

## 10. CONFIRMATION BLOCKER

Why `"نعم"` after phone input does not transition to `CREATE_ORDER`:
- The phone number string `"7747480112"` was dropped by the identity parser.
- `state.customerPhone` remained `undefined`.
- Section 5 guard at line 248 (`if (!state.customerPhone)`) blocked order finalization and forced step back to `AWAITING_CUSTOMER_INFO`.

---

## 11. ORDER CREATION STATE

- `OrderCheckoutEngine.createOrder()` was **NEVER REACHED**.
- Stopped at Line 248 due to missing `customerPhone`.

---

## 12. REQUIRED ARCHITECTURAL GAPS

1. **Cart Merge / Replace Policy**: Need explicit logic to replace cart contents when user sends a correction or full order statement.
2. **Dedicated Phone Step Handler**: When `state.step === 'AWAITING_CUSTOMER_INFO'`, standalone numeric input matching Yemeni phone pattern (9-10 digits) MUST be assigned to `state.customerPhone` regardless of `hasNameLikeText`.
3. **Yemeni Phone Normalization**: Robust regex accepting `7[013778]\d{7}`, `07[013778]\d{7}`, or `7\d{8}` without requiring surrounding name text.
4. **Checkout Transition Precedence**: Direct step handler for `AWAITING_CUSTOMER_INFO` must take precedence over general address/payment re-parsing in Section 6.

---

## 13. TEST GAPS

Existing test suite lacks coverage for:
- [ ] Correction phrase re-stating full cart -> must NOT duplicate cart quantities.
- [ ] Standalone phone number input in `AWAITING_CUSTOMER_INFO` step.
- [ ] Phone number without name -> must persist `customerPhone`.
- [ ] Transition from `AWAITING_CUSTOMER_INFO` + Phone input -> `AWAITING_CONFIRMATION` -> `ORDER_CREATED`.
- [ ] Yemen phone formats (9-digit starting with 77/73/71/70/78, 10-digit with leading 0).

---

## 14. MINIMAL SAFE FIX PLAN

1. **Fix Standalone Phone Capture during `AWAITING_CUSTOMER_INFO`**:
   - In Section 3, allow storing `customerPhone` if `phoneMatch` is found AND `state.step === 'AWAITING_CUSTOMER_INFO'`, even if `hasNameLikeText` is false.
2. **Fix Yemeni Phone Regex**:
   - Update phone extraction regex to support 9-digit and 10-digit Yemen mobile numbers cleanly (`/(?:0?7[013778]\d{7}|7\d{8}|0?7\d{8})/`).
3. **Fix Cart Correction Duplication (`REPLACE_CART` Semantics)**:
   - Before adding items in Section 7.2, check if the input contains correction markers (e.g. `"ركز على الطلب"` or full cart restatement) OR if cart already contains the exact items; reset/synchronize cart instead of blindly incrementing.
4. **Prevent Confirmation Loop**:
   - Ensure saving `customerPhone` transitions state directly to `AWAITING_CONFIRMATION` with summary, allowing the subsequent `"نعم"` to execute `createOrder()`.

---

## 15. FINAL VERDICT

**`DIAGNOSED — MULTIPLE LIVE CHECKOUT STATE FAILURES`**
