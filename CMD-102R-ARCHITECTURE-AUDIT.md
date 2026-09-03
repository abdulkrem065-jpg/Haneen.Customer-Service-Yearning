# CMD-102R ARCHITECTURE AUDIT REPORT

**Date**: 2026-09-02  
**Target System**: Sana AI Core / Order Checkout Engine  
**Audit Purpose**: Read-Only Structural & NLU Pipeline Architecture Verification  

---

## 1. Actual Production Message Flow

When a customer message arrives, the real runtime path is as follows:

```
Customer Message
  ↓
HaneenService.processMessage(context)
  ↓
OrderCheckoutEngine.handleCheckoutMessage(text, session, context)
  ↓
[Inline Heuristics & Custom Regex Parsers inside OrderCheckoutEngine]
  ↓
OrderStore / Cart State Mutation / Response Generation
  ↓
Final Response returned to HaneenService
```

**Actual Class / Function Call Sequence**:
1. `HaneenService.processMessage` (`src/core/productization/haneen-service.ts`)
2. `OrderCheckoutEngine.handleCheckoutMessage` (`src/core/orders/order-checkout-engine.ts`)
3. `OrderCheckoutEngine.tryParseAndAddProducts` / `normalizeArabic` / `splitUserTextIntoItemPhrases` / `resolveSingleProductItem`
4. `OrderStore.createOrder` / `OrderStore.saveDraft` (`src/core/orders/order-store.ts`)

---

## 2. UniversalLanguageUnderstandingProvider Status

**Question**: Is `UniversalLanguageUnderstandingProvider` called in the Production path?

**Answer**: **NO.**

- **Call Site**: `src/core/orders/order-checkout-engine.ts` line 121 (`private nluProvider: ILanguageUnderstandingProvider = new UniversalLanguageUnderstandingProvider();`)
- **Function Name**: `understand(text: string, context?: NLUContext)`
- **File**: `src/core/nlu/language-understanding.ts`
- **Current Runtime Status**: In the production execution method `handleCheckoutMessage`, `this.nluProvider.understand(...)` is **never invoked**. The `nluProvider` instance is instantiated as a class property, but its methods are omitted from the message evaluation loop.
- **Consumers**: Only unit test suites (e.g. `src/core/cmd-102.test.ts`).

---

## 3. Self-Interpretation in OrderCheckoutEngine

**Question**: Does `OrderCheckoutEngine` interpret messages on its own without NLU?

**Answer**: **YES.** `OrderCheckoutEngine` executes all intent detection, entity extraction, and state transitions using hardcoded rules and regexes:

- **Keyword & Regex Rules**:
  - *Order Status Inquiry*: `/أين طلبي|متابعة الطلب|حالة الطلب|ORD-\d{8}-\d{4}/`
  - *Human Handoff*: `/تحويل لإنسان|موظف|تحدث مع موظف/`
  - *Cart Reset / Cancel*: `/إلغاء الطلب|حذف السلة|تفريغ السلة/`
  - *Short Confirmations*: `['نعم', 'ايوه', 'اوكد', 'تمام', 'موافق', 'جهز الطلب']`
  - *Payment Extraction*: `/كاش|دفع عند الاستلام|جوالي|جيب|الكريمي|حاسب/`
  - *Phone Extraction*: `/77\d{7}|73\d{7}|71\d{7}|70\d{7}/`
- **Heuristics & Product Matching**:
  - *Informational Query Detection*: Checks for `سعر`, `بكم`, `هل يوجد`, `متوفر`, `ما عندكم`.
  - *Product Tokenization*: Custom regex splitting (`splitUserTextIntoItemPhrases`).
  - *Fuzzy String Matching*: Levenshtein distance & Arabic string normalization (`resolveSingleProductItem`).

---

## 4. Decision Sources & Priorities

**Question**: Are there multiple decision sources, and what is their priority?

**Answer**: **YES.** Decision-making is handled entirely inside `OrderCheckoutEngine` through sequential rule evaluations:

1. **Top Priority**: Emergency / Control Intent Rules (Human handoff, Order Cancellation, Status Query by ORD-ID).
2. **Second Priority**: Active State Gate (If step is `AWAITING_CONFIRMATION`, match short confirmation keywords).
3. **Third Priority**: Address & Payment Method Extraction Regexes.
4. **Fourth Priority**: Informational / Catalog Query Detection (Price and Availability heuristics).
5. **Fifth Priority**: Product Phrase Parsing & Fuzzy Catalog Matching (`tryParseAndAddProducts`).
6. **Fallback**: Default conversational response / Clarification request.

*(Note: NLU is not in the active evaluation stack).*

---

## 5. Production Trace Example: Multi-Item Order

**Message**: `"أبغى علبة الماس وكيلو السكر حقكم"`

1. **Raw Message**: `"أبغى علبة الماس وكيلو السكر حقكم"`
2. **NLU Result**: *Bypassed / Not called.*
3. **Structured Intent**: Inferred as `PURCHASE_INTENT` via `tryParseAndAddProducts`.
4. **Product Requests Extracted**:
   - Phrase 1: `"علبة الماس"` (Qty: 1)
   - Phrase 2: `"كيلو السكر حقكم"` (Qty: 1)
5. **Product Candidates Resolved**:
   - `"علبة الماس"` → `سمن الماس` (Resolved)
   - `"كيلو السكر حقكم"` → `سكر السعيد ابو كيلو` (Resolved)
6. **Business Validation**: Items validated against active catalog prices and availability. Added to cart.
7. **Action**: `AWAITING_ADDRESS_AND_PAYMENT` state assigned, draft order saved.
8. **Final Response**: Order summary presented showing both items, requesting delivery address and payment method.

---

## 6. Production Trace Example: Price Query

**Message**: `"كم سعر السكر؟"`

1. **Raw Message**: `"كم سعر السكر؟"`
2. **NLU Result**: *Bypassed.*
3. **Intent Detection**: `isQuestionOrInquiry = true`, `isPriceQuery = true`.
4. **Product Resolution**: `"السكر"` resolved to `سكر السعيد ابو كيلو`.
5. **Action**: Price formatted directly from catalog (`500 YER`).
6. **Cart State**: Unchanged (`cart.length` remains 0).
7. **Verification**: `PRICE_QUERY` answered, no cart mutation executed.

---

## 7. Production Trace Example: Complex / Semantic Query

**Message**: `"أبي الشيء الأرخص اللي ينحط مع الرز"`

1. **Raw Message**: `"أبي الشيء الأرخص اللي ينحط مع الرز"`
2. **Execution Path**: Enters `splitUserTextIntoItemPhrases` & `resolveSingleProductItem`.
3. **Fuzzy Matcher Result**: Evaluates string `"الشيء الأرخص اللي ينحط مع الرز"` against catalog names (`سمن الماس`, `سكر السعيد`, `بسكوت ابو ولد`).
4. **Outcome**: **FAILS / NOT_FOUND.** Returns generic fallback or non-match message.
5. **Root Cause**: The current parser uses exact/fuzzy string token distance without LLM-backed semantic reasoning or embedding search in the live runtime path.

---

## 8. Production Trace Example: Single Token Keyword

**Message**: `"الماس"`

1. **Raw Message**: `"الماس"`
2. **Product Resolution**: `resolveSingleProductItem` matches token `"الماس"` to `سمن الماس`.
3. **State Action**:
   - If cart is empty: Adds 1 x `سمن الماس` to cart and prompts for address.
   - If inquiry context detected: Returns product details.

---

## 9. Production Trace Example: Quantity Update in Context

**Message**: `"خليه اثنين"`

1. **Raw Message**: `"خليه اثنين"`
2. **Context Inspection**: Evaluates active `OrderCheckoutState.cart`.
3. **Regex Extraction**: Matches `"اثنين"` → `quantity = 2`.
4. **Action**: Updates quantity of the last added item in `state.cart` to 2.

---

## 10. Production Trace Example: Payment Keyword

**Message**: `"جوالي"` (during checkout)

1. **Raw Message**: `"جوالي"`
2. **Evaluation**: Matches `PAYMENT_METHOD_KEYWORDS` (`/جوالي/`).
3. **State Action**: Sets `state.paymentMethodId = 'جوالي'`.
4. **Context vs Keyword**: Resolved strictly via keyword regex matching within the `AWAITING_ADDRESS_AND_PAYMENT` step.

---

## 11. NLU Capabilities & Google Sheets Independence

**Question**: Can NLU operate without hardcoded Google Sheets row knowledge?

**Answer**: `UniversalLanguageUnderstandingProvider` in `language-understanding.ts` generates structured schema outputs (`productQuery`, `quantity`, `unit`, `intent`) independently of sheet mechanics. However, because it is not connected to the main execution flow in `OrderCheckoutEngine`, product queries must match local catalog snapshots derived from the sheets store.

---

## 12. Proportion of Rule-Driven Logic

**Current Percentage**: **100% of live message evaluation** in `OrderCheckoutEngine` is rule-driven / regex-driven.

**Active Rule-Driven Paths**:
1. Intent Classification (`isQuestionOrInquiry`, `isExplicitPurchaseVerb`, `isShortConfirmation`)
2. Entity Extraction (`extractAddressAndPayment`, phone number regexes)
3. Item Segmentation (`splitUserTextIntoItemPhrases`)
4. Catalog Resolution (`resolveSingleProductItem` Levenshtein + normalizeArabic)
5. State Machine Transitions (`NO_ORDER` → `AWAITING_ADDRESS_AND_PAYMENT` → `AWAITING_CONFIRMATION`)

---

## 13. Action Guard Architecture

**Question**: Is there a unified Action Guard separating Understanding, Validation, and Execution?

**Answer**: **NO.** Intent parsing, catalog validation, cart modification, and response string generation are co-located inside monolithic methods within `OrderCheckoutEngine.ts`.

---

## 14. Ambiguity & Confidence Handling

**Question**: Can ambiguous suggestions be blocked before cart insertion?

**Answer**: **YES.** `resolveSingleProductItem` returns status `AMBIGUOUS` when multiple catalog candidates match with similar scores. `OrderCheckoutEngine` intercepts `AMBIGUOUS` results and returns a clarification prompt without modifying the cart.

---

## 15. Conversation Memory

**Question**: Is there genuine conversational memory or just checkout state?

**Answer**: The system relies on **`OrderCheckoutState`** (a structured state object tied to `conversationId`). It tracks active cart items, address, payment method, and checkout step, but does not maintain a semantic conversation memory window or dialog history log for LLM reasoning.

---

## 16. Future Extensibility

**Question**: Can translation, learning signals, and experience memory be added without rebuilding `OrderCheckoutEngine`?

**Answer**: **NO.** Because `OrderCheckoutEngine` embeds string parsing, regex matching, and state management in a single engine, adding external AI modules (like translation or learning signals) would require refactoring `OrderCheckoutEngine` to consume an abstracted `NLUResult` pipeline.

---

## 17. Component Classification

| Component | Status | Description |
| :--- | :--- | :--- |
| `UniversalLanguageUnderstandingProvider` | **KEEP** | Standardized NLU engine structure; needs wire-up to production path. |
| `OrderStore` / `InMemoryOrderStore` | **KEEP** | Clean persistence layer with process restart survival and sequence generation. |
| `OrderCheckoutEngine` State Machine | **REFACTOR** | Needs decoupling: separate NLU parsing from state transitions. |
| Embedded Regex & Keyword Parsers | **REFACTOR / REMOVE** | Inline regexes inside `handleCheckoutMessage` should be delegated to NLU provider. |
| Custom Levenshtein String Matcher | **LEGACY** | Works as fallback matcher, but should be subordinate to semantic NLU. |

---

## 18. Current Architecture Diagram

```
+-----------------------------------------------------------------------+
|                             CLIENT / API                              |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                   HaneenService.processMessage()                      |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|               OrderCheckoutEngine.handleCheckoutMessage()              |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |             Deterministic Keyword & Regex Parsers               |  |
|  |  - Status Query Regex         - Phone / Payment Regex          |  |
|  |  - Short Confirmation Matcher  - Address Extraction Heuristics   |  |
|  |  - Price / Availability Check - Levenshtein String Matcher     |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
|  * UniversalLanguageUnderstandingProvider is INSTANTIATED             |
|    but UNUSED in this execution path *                                |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                         OrderStore Persistence                        |
|  - Local Drafts / Orders JSON Storage                                 |
+-----------------------------------------------------------------------+
```

---

## FINAL VERDICT

**`BLOCKED — UNIVERSAL NLU NOT ACTUALLY ON PRODUCTION PATH`**
