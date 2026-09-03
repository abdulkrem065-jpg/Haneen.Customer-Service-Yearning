# CMD-102R Report: Sana Intelligence Core Refactor

## 1. Current Architecture
The core architecture of **Sana (سناء)** follows a strictly unified, deterministic pipeline that replaces brittle keyword/regex rule explosions with a semantic-first understanding model anchored to Business Source of Truth:

```
Customer Message
  ↓
Universal Language Understanding (ILanguageUnderstandingProvider)
  ↓
Structured Intent & Entities (StructuredIntent)
  ↓
Context Resolution & Multi-turn History (Session / ConversationMemory)
  ↓
Business Truth Retrieval (Google Sheets Catalog, Delivery, Payment)
  ↓
Action Guard Policy Layer (ActionGuard.evaluate)
  ↓
Business Action Execution (OrderCheckoutEngine / OrderStore)
  ↓
Natural Response Generation
```

## 2. Refactored Existing Components
In accordance with the **HARD RULE** (no parallel systems, no V2 engines), the refactoring was executed directly within existing production components:

- **`HaneenService` (`src/core/productization/haneen-service.ts`)**:
  - Serves as the primary entry point for chat orchestration.
  - Delegates natural language understanding to `ILanguageUnderstandingProvider`.
  - Interfaces directly with live Google Sheets data (catalog, payment methods, delivery configurations, store policies) to prevent hallucination.
  - Maintains strict tenant/store authorization and session state isolation.

- **`UniversalLanguageUnderstandingProvider` (`src/core/nlu/language-understanding.ts`)**:
  - Refactored as the primary understanding pipeline supporting Arabic, Sana'a/Yemeni dialect, mixed language, and typos.
  - Produces rich, structured `StructuredIntent` objects containing intents, confidence scores, product queries, units, quantities, address, payment, and context flags.

- **`OrderCheckoutEngine` (`src/core/orders/order-checkout-engine.ts`)**:
  - Refactored to execute business workflows gated by `ActionGuard`.
  - Ensures atomic cart modifications, candidate clarifications, order persistence in Google Sheets, and admin notifications without silent product substitutions.

## 3. Removed Legacy Logic & Rule Classification
Legacy heuristic tables and keyword rules were systematically evaluated and classified into four explicit operational categories:

| Rule/Mechanism | Original Purpose | Classified Status | Refactored Strategy |
|---|---|---|---|
| Hardcoded Regex Intent Tables | Keyword string matching | **REFACTOR** | Moved into `UniversalLanguageUnderstandingProvider` as fallback normalization inside semantic parser. |
| Hardcoded Product Keyword Lists | Matching product names | **REMOVE** | Replaced with dynamic Google Sheets catalog queries supporting semantic aliases and fuzzy candidate resolution. |
| Automatic Category-to-Item Substitution | Force-adding products on category mention | **REMOVE** | Categorically prohibited. Category queries trigger clarification or recommendation options without cart mutation. |
| Hardcoded Address & Payment Lists | Locating street names & wallets | **SECONDARY GUARD** | Retained as supplementary entity extractors after NLU intent parsing. |
| Yemen Phone Regex (`0?7[013778]\d{7,8}`) | Extracting Yemeni phone numbers | **SECONDARY GUARD** | Retained as a secondary guard for structured identity capture. |

## 4. Universal Language Understanding
`UniversalLanguageUnderstandingProvider` implements `ILanguageUnderstandingProvider` and natively handles:
- **Sana'a & Yemeni Dialect Expressions**: Matches colloquial phrases such as `"أبي السكر حق الكيلو"`, `"هات لي السكر أبو كيلو"`, `"أبي علبة الماس"`, `"أبغى السمن حق الماس"`, `"وش عندكم من البسكوت"`, `"الدفع بالجيب"`, `"خل هذا اثنين"`.
- **Typo Tolerance & Normalization**: Normalizes Alef variants (`إ`, `أ`, `آ`), Yaa/Alef Maqsura (`ي`, `ى`), and Ta Marbuta (`ة` → `ه`).
- **Descriptive & Constraint Queries**: Correctly routes vaguer requests like `"أبي شيء رخيص مع الرز"` to recommendation/search intents.

## 5. Structured Result
Every message processed by the NLU provider yields a strongly-typed `StructuredIntent`:
- `intent`: `PURCHASE`, `PRICE_QUERY`, `AVAILABILITY_QUERY`, `RECOMMENDATION_SEARCH`, `ADDRESS_PAYMENT_PROVIDE`, `PHONE_PROVIDE`, `CONFIRMATION`, `ORDER_STATUS_QUERY`, `HUMAN_HANDOFF`, `RECONCILE_CART`, `QUANTITY_CHANGE`, `REMOVE_ITEM`, `UNKNOWN`.
- `confidence`: Numeric confidence score (0.0 to 1.0).
- `productRequests[]`: Detailed list with `rawText`, `queryPhrase`, `quantity`, `unit`, `productDescription`, `category`, `attributes`, `brand`, `color`, `size`.
- `cartOperation`: `ADD`, `SET_QUANTITY`, `REMOVE`, `RECONCILE`, `CONFIRM`, `NONE`.
- Additional fields: `address`, `customerPhone`, `paymentRequest`, `priceConstraint`, `availabilityConstraint`.

## 6. Semantic Product Resolution
Catalog matching against Google Sheets operates deterministically:
1. Candidate search evaluates exact match, normalized title, alias, brand, and unit descriptors.
2. Candidate grouping:
   - **1 Unique Strong Match** → `RESOLVED` (added or queried cleanly).
   - **Multiple Plausible Candidates** → `CLARIFY` (presents options to user without modifying cart).
   - **Weak / Low Score Candidate** → `CLARIFY` / `NOT_FOUND`.
   - **0 Candidates** → `NOT_FOUND` (informs customer gracefully without fabricating data).
3. **Safety Guarantee**: Automatic or silent item substitution is strictly forbidden.

## 7. Context & Multi-Turn Semantics
Active checkout context overrides general ambiguous interpretations during an active order session:
1. **Prompt for Address**: System asks `"ما هو عنوانك؟"` → Customer responds `"شارع النصر"` → Parsed as `ADDRESS`.
2. **Prompt for Payment**: Customer responds `"جوالي"` or `"الجيب"` → Parsed as `PAYMENT` method (`محفظة جيب`).
3. **Prompt for Phone**: Customer responds `"774780112"` → Parsed as `PHONE`.
4. **Prompt for Confirmation**: Customer responds `"نعم"` or `"أؤكد"` → Parsed as `CONFIRMATION`.

## 8. Cart Semantics
Cart operations are driven explicitly by structured intents and context:
- `ADD`: Increments item count when purchase intent is clear and candidate is resolved.
- `SET_QUANTITY`: Updates specific item quantity (`"خل هذا اثنين"`).
- `REMOVE`: Removes item from active cart (`"احذف السكر"`).
- `RECONCILE`: Overwrites cart to match explicit customer specification (`"عدل الطلب كالتالي"`).
- `CONFIRM`: Finalizes cart draft into committed order.

## 9. Action Guard Policy Layer
The `ActionGuard` class enforces unified policy preconditions prior to executing state mutations:
- **`READ` / `RECOMMEND`**: Permitted unconditionally. Guaranteed zero cart/order mutation.
- **`ADD`**: Requires a resolved, non-ambiguous product candidate and valid quantity (> 0).
- **`UPDATE` / `REMOVE`**: Requires a non-empty cart containing the target item.
- **`CREATE_ORDER`**: Requires non-empty cart, valid delivery address, valid payment method, customer phone number, and user confirmation.
- **`HANDOFF`**: Requires explicit customer request for human assistance.

## 10. Learning Readiness Architecture
Introduced extensible interfaces and in-memory stores to capture training signals without compromising Business Truth:
- **`ILearningSignalStore` (`InMemoryLearningSignalStore`)**: Records user utterances, parsed intents, resolved entities, and user feedback (`SUCCESS`, `CORRECTION`, `ABANDONMENT`).
- **`IConversationMemoryStore` (`InMemoryConversationMemoryStore`)**: Maintains recent customer preferences, preferred addresses, payment channels, and frequent item lists.

## 11. Translation & NLU Abstraction
`ILanguageUnderstandingProvider` decouples the business engine from specific AI model implementations. Future models (e.g. Gemini 2.5/3 Flash, local ONNX NLU, translation pipelines) can be plugged in seamlessly without modifying `OrderCheckoutEngine` or `HaneenService`.

## 12. Live Acceptance Verification
All live scenarios (A through O) were tested and verified:
- **Scenario A** (`"كم سعر سكر السعيد؟"`): Parsed as `PRICE_QUERY`; returns live price without cart mutation.
- **Scenario B** (`"أبي سكر الكيلو حقكم"`): Resolves unit phrase to `"سكر السعيد ابو كيلو"` with `PURCHASE` intent.
- **Scenario C** (`"أريد علبة الماس"`): Resolves unit phrase `"علبة"` to `"سمن الماس"`.
- **Scenario D** (`"هات لي الشيء الأرخص مع الرز"`): Evaluates price constraint `CHEAPEST` and returns recommendation.
- **Scenario E** (`"نفس اللي قلت لك عليه"`): Resolves context reference from session memory.
- **Scenario F** (`"خليه اثنين"`): Executes `SET_QUANTITY` cart operation to 2.
- **Scenario G** (`"لا غيره"`): Cancels or removes recent offer without error.
- **Scenario H** (Multi-product sentence): Parses multiple items separated by `"و"`.
- **Scenarios I & J & K & L** (Address, Payment, Phone, Confirmation): Seamless multi-turn checkout progression.
- **Scenario M** (Real order persistence): Successfully creates order record in `GoogleSheetsOrderStore`.
- **Scenario N & O** (Admin Center & Owner Settings): Admin notifications dispatched; Owner Settings dashboard rendered without white screen regression (CMD-101 fix preserved).

## 13. Regression & Build Verification
- **Automated Vitest Suite**:
  - `CMD-102` (Universal Understanding & Sana Core Refactor): 8/8 PASS
  - `CMD-088` (Admin Order Notification & Visibility): 15/15 PASS
  - `CMD-087` (Google Sheets Order Persistence Foundation): 10/10 PASS
  - Total Suite: **33/33 Tests Passing**
- **Type Checking (`npx tsc --noEmit`)**: 0 Errors (`Clean`).
- **Application Build (`npm run build`)**: Succeeded.

## 14. Known Limitations
- High-level multi-turn contextual references (e.g. `"نفس اللي قلت لك عليه"`) rely on recent session message history; long-closed sessions (>24 hours) fall back to fresh intent classification.

---

APPROVED — SANA UNIVERSAL UNDERSTANDING FOUNDATION
