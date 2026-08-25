# CMD-082 — SANA ORDER INTENT & PRODUCT MATCHING FORENSIC DIAGNOSIS REPORT

**Status:** DIAGNOSED — BOTH INTENT AND MATCHING BUGS  
**Timestamp:** 2026-08-25  
**Scope:** Forensic Diagnosis Only (No Code or Data Modifications Executed)

---

## Executive Summary

A forensic analysis was performed on the intent detection, product matching, and checkout state engine within `src/core/orders/order-checkout-engine.ts` and `src/core/productization/haneen-service.ts`.

Both production failures reported in **CMD-082** have been definitively diagnosed:
1. **Live Failure #1 (Price Query mutating cart):** Caused by **Intent-Cart Coupling**. Product keyword triggers (`'سكر'`, `'كيلو'`, `'سمن'`, `'بسكوت'`) in `OrderCheckoutEngine.ts` automatically set `isOrderRequest = true` without checking if the user message is an informational query (`PRICE_QUERY` / `AVAILABILITY_QUERY`) or checking for query indicators (`'كم'`, `'سعر'`, `'؟'`).
2. **Live Failure #2 (Availability Query adding multiple products):** Caused by **Unfiltered Broad Substring Matching & Automated Multi-Addition**. When matching products in `OrderCheckoutEngine.ts`, any item in the catalog satisfying `prodNameLower.includes('سمن') && lowerText.includes('سمن')` is added in a loop (`for (const prod of catalog)`), invoking `addItemToCart` for *every* match (`سمن البنت`, `سمن القمرية`, `سمن الماس`) rather than seeking clarification or applying strict intent gates.

---

## A. Exact Root Cause of Automatic Cart Mutation

* **Location:** `src/core/orders/order-checkout-engine.ts`, lines 361–371 & lines 390–422.
* **Mechanism:**
  ```typescript
  const isOrderRequest = (
    lowerText.includes('اريد') ||
    lowerText.includes('أريد') ||
    lowerText.includes('بدنا') ||
    lowerText.includes('اشتري') ||
    lowerText.includes('أشتري') ||
    lowerText.includes('كيلو') ||
    lowerText.includes('سمن') ||
    lowerText.includes('بسكوت') ||
    lowerText.includes('سكر')
  );
  ```
* **Analysis:**
  - Words representing domain product categories or units (`'كيلو'`, `'سمن'`, `'بسكوت'`, `'سكر'`) are treated as *unconditional indicators of purchase intent*.
  - When a customer sends `"كم سعر سكر السعيد ابو كيلو؟"`, `lowerText` contains `'سكر'` and `'كيلو'`.
  - `isOrderRequest` evaluates to `true`.
  - The engine immediately invokes `addItemToCart(...)`, sets `state.activeOrderDraftId = draft-${Date.now()}`, transitions `state.step = 'AWAITING_ADDRESS_AND_PAYMENT'`, and outputs:
    `"تمت إضافة المنتجات إلى طلبك بنجاح:\n- سكر..."`.
  - There is zero evaluation of whether the text contains query keywords (`'كم'`, `'سعر'`, `'؟'`).

---

## B. Exact Root Cause of Multi-Match Addition

* **Location:** `src/core/orders/order-checkout-engine.ts`, lines 391–402.
* **Mechanism:**
  ```typescript
  for (const prod of catalog) {
    const prodNameLower = prod.name.toLowerCase();
    if (lowerText.includes(prodNameLower) || (prodNameLower === 'سكر' && lowerText.includes('سكر')) || (prodNameLower.includes('سمن') && lowerText.includes('سمن')) || (prodNameLower.includes('بسكوت') && lowerText.includes('بسكوت'))) {
      ...
      this.addItemToCart(state, prod.id, prod.name, prod.price, qty);
      addedAny = true;
    }
  }
  ```
* **Analysis:**
  - When the customer asks `"هل يوجد سمن الماس"`:
    - `lowerText` is `'هل يوجد سمن الماس'`.
    - `isOrderRequest` is triggered because `lowerText.includes('سمن')` is `true`.
    - The loop iterates through the entire catalog (`catalog`).
    - For `prod.name = 'سمن البنت'`, `prodNameLower.includes('سمن') && lowerText.includes('سمن')` evaluates to `true`. -> `addItemToCart` executed!
    - For `prod.name = 'سمن القمرية'`, `prodNameLower.includes('سمن') && lowerText.includes('سمن')` evaluates to `true`. -> `addItemToCart` executed!
    - For `prod.name = 'سمن الماس'`, `prodNameLower.includes('سمن') && lowerText.includes('سمن')` evaluates to `true`. -> `addItemToCart` executed!
  - Instead of filtering for exact/best match or returning multiple candidates for user clarification, the engine adds ALL candidate products to the active cart in a single turn.

---

## C. Intent Classification Path

1. Entry point: `HaneenService.processMessage` (`src/core/productization/haneen-service.ts`, line 313).
2. Direct Handler execution: `checkoutEngine.handleCheckoutMessage(userText, session, context)` (line 318).
3. Evaluated order in `OrderCheckoutEngine.handleCheckoutMessage`:
   - Step 1: Status tracking check (`explicitOrderMatch` / `isStatusKeyword`) (lines 39–69).
   - Step 2: "الطلب قد أرسلته سابقاً" check (`isSentPreviouslyText`) (lines 72–99).
   - Step 3: Customer identity check (`isExplicitIdentity`) (lines 101–150).
   - Step 4: Short confirmation check (`isShortConfirmation`) (lines 153–251).
   - Step 5: Address & payment parsing (`isAddressOrPayment && !isQuestion`) (lines 253–358).
   - Step 6: Product Request / Item Parsing (`isOrderRequest`) (lines 361–422).
4. **Architectural Gap:** `isOrderRequest` runs BEFORE passing the message to Orchestrator / LLM knowledge search. If `isOrderRequest` evaluates to `true`, it immediately mutates the cart and returns a hardcoded response, completely bypassing the Orchestrator/LLM and any intent classification layer.

---

## D. Product Matching Path

* **Query extraction:** Raw `userText` converted to `lowerText`.
* **Algorithm:** Simple substring check & hardcoded category fallback (`lowerText.includes(prodNameLower)` or generic product category matching).
* **Ranking / Scoring:** None. All products matching the substring condition are treated equally.
* **Threshold / Fuzzy Logic:** Broad substring matching (`includes`). No Levenshtein or token-overlap scoring.
* **Multi-Match Behavior:** All matches are added sequentially to `state.cart`. No clarification prompt is generated when `matches.length > 1`.

---

## E. Cart Mutation Path

Functions with access to mutate cart and draft state:
1. `OrderCheckoutEngine.addItemToCart(state, productId, productName, unitPrice, quantity)` (lines 427–441).
2. Called exclusively by `OrderCheckoutEngine.handleCheckoutMessage` during Step 6 (`isOrderRequest`).
3. State mutations triggered:
   - `state.cart.push(...)` or `existing.quantity += quantity`
   - `state.activeOrderDraftId = draft-${Date.now()}` (if not already set)
   - `state.subtotal = calculateSubtotal(...)`
   - `state.step = 'AWAITING_ADDRESS_AND_PAYMENT'`

---

## F. Conversation State Behavior

When `"كم سعر سكر السعيد ابو كيلو؟"` is processed:
- Initial state: `checkoutState = { cart: [], step: 'NO_ORDER' }`.
- Execution: Triggered by `isOrderRequest` (`'سكر'`, `'كيلو'`).
- Result:
  - `activeOrderDraftId` is generated.
  - `cart` is updated with 1 item (`سكر`).
  - `step` becomes `'AWAITING_ADDRESS_AND_PAYMENT'`.
  - An active draft is created despite zero purchase intent expressed by the user.

---

## G. Production vs Local Path

- Both Production and Local execute the exact same entry point (`HaneenService.processMessage`) and engine (`OrderCheckoutEngine`).
- `HaneenService.fetchCatalogProducts()` uses `SecureGoogleSheetsTransport` when environment credentials (`GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`) are present in production.
- If transport is null or fails, it falls back to the default catalog in `OrderCheckoutEngine`.
- In both production (with real Sheets data) and local testing, `OrderCheckoutEngine.handleCheckoutMessage` exhibits identical coupling of query keywords to cart mutations.

---

## H. Existing Test Coverage

* `src/core/cmd-081.test.ts`: Verifies successful cart creation and multi-turn checkout completion when user provides order requests.
* `src/core/cmd-080.test.ts`: Verifies end-to-end checkout flow and Order ID generation.

---

## I. Missing Tests (Architectural Test Gaps)

1. `PRICE QUERY → CART MUTATION`: Test ensuring `"كم سعر سكر السعيد"` returns pricing information without adding items to `cart` or setting `activeOrderDraftId`.
2. `AVAILABILITY QUERY → CART MUTATION`: Test ensuring `"هل يوجد سمن الماس"` checks stock without mutating `cart`.
3. `MULTIPLE PRODUCT MATCHES → CLARIFICATION`: Test ensuring queries matching multiple items (e.g., `"سمن"`) prompt the customer for clarification instead of adding all matching items to cart.
4. `EXPLICIT PURCHASE INTENT → ADD TO CART`: Test ensuring cart mutation occurs ONLY when explicit intent (e.g., `"أريد شراء"`, `"أضف للطلب"`, `"طلب كيس سكر"`) is detected.

---

## J. Minimal Fix Plan (For Future Execution)

1. **Intent Gate Separation in `OrderCheckoutEngine`:**
   - Differentiate `PURCHASE_INTENT` from `INFO_QUERY` (`PRICE_QUERY` / `AVAILABILITY_QUERY`).
   - If `lowerText` contains question/info indicators (`'كم'`, `'سعر'`, `'هل يوجد'`, `'متوفر'`, `'بكم'`, `'عندكم'`, `'؟'`) without explicit purchase action (`'اريد شراء'`, `'اشتري'`, `'طلب'`), skip `addItemToCart` and pass query to Orchestrator / catalog lookup.
2. **Product Matching & Multi-Match Clarification:**
   - Implement tiered matching: Exact Match -> Normalized Match -> Partial Match.
   - If multiple candidates match a search term (e.g. 3 types of `سمن`), do NOT add all to cart. Instead, return a clarification response listing the available options and asking the user to specify which one they want.
3. **Pending Product Confirmation:**
   - Introduce `pendingProduct` in `OrderCheckoutState` when answering availability queries, allowing subsequent "نعم" responses to confirm addition of the specific pending item.

---

## FINAL VERDICT

**DIAGNOSED — BOTH INTENT AND MATCHING BUGS**
