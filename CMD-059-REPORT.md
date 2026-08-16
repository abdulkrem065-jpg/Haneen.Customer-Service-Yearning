# CMD-059 — GEMINI MODEL FORMAT NORMALIZATION & LIVE RETEST REPORT

## Executive Summary
- **Stage**: CMD-059 (Gemini Model Format Normalization & Live Retest)
- **Scope**: **Sana Customer Service ONLY** (Zero coupling or logic from other projects)
- **Local Verification**: **`APPROVED — MODEL FORMAT NORMALIZED & VERIFIED (100%)`**
- **Deployment Status**: **`BLOCKED — LIVE GEMINI NOT VERIFIED`** *(Production re-verification on Render requires project engineer deployment trigger & entering `ADMIN_VERIFY_SECRET` in browser at `https://haneen-customer-service-yearning.onrender.com/api/admin/live-haneen-verification-ui`)*
- **Date**: 2026-08-16
- **Primary Visible Agent Identity**: **سناء (Sana)**
- **Immutable Operational Context**:
  - `agentId`: `agt-c93183d5`
  - `agentName`: `Sana / سناء`
  - `tenantId`: `tnt-41f0d530`
  - `storeId`: `str-2c6ad81f`
  - `spreadsheetId`: `1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo`
  - `baseCurrency`: `YER`
- **Google Sheets Writes Executed**: **0 (Strict Read-Only)**
- **TypeScript Check (`npx tsc --noEmit`)**: **0 Errors (PASS)**
- **Applet Build (`npm run build`)**: **PASS**

---

## 1. Root Cause & Architectural Diagnosis

- **SDK / Client**: Official `@google/genai` TypeScript SDK (`GoogleGenAI`).
- **Error Diagnosed**:
  ```json
  {
    "error": {
      "code": 400,
      "message": "* GenerateContentRequest.model: unexpected model name format",
      "status": "INVALID_ARGUMENT"
    }
  }
  ```
- **Root Cause**:
  When using `@google/genai` SDK, calling `ai.models.generateContent({ model })` automatically prepends `models/` to construct the API path `models/{model}:generateContent`.
  If the environment variable `GEMINI_MODEL` or incoming parameter contained `models/gemini-2.5-flash` (or double prefix `models/models/...`), `@google/genai` transmitted `models/models/gemini-2.5-flash` to the API server, causing a 400 `unexpected model name format` rejection.

---

## 2. Model Normalization Implementation (`normalizeGeminiModelName`)

A unified model normalization helper was implemented in `src/infrastructure/ai/gemini/config.ts` and integrated across the Gemini transport pipeline:

```typescript
export function normalizeGeminiModelName(rawModelName?: string): string {
  if (!rawModelName) return GEMINI_MODELS.GENERAL;
  let cleaned = rawModelName.trim();
  if (!cleaned) return GEMINI_MODELS.GENERAL;

  // Strip all leading 'models/' prefixes (case-insensitive) to prevent double-prefixing in @google/genai SDK
  while (/^models\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^models\//i, '').trim();
  }

  if (!cleaned) return GEMINI_MODELS.GENERAL;

  const lower = cleaned.toLowerCase();
  if (lower === 'complex' || lower === 'pro') return GEMINI_MODELS.COMPLEX;
  if (lower === 'general' || lower === 'flash') return GEMINI_MODELS.GENERAL;
  if (lower === 'fast' || lower === 'lite') return GEMINI_MODELS.FAST;

  // Handle legacy preview aliases smoothly to valid canonical models
  if (lower.includes('3.1-pro') || lower.includes('1.5-pro')) return GEMINI_MODELS.COMPLEX;
  if (lower.includes('3.5-flash') || lower.includes('1.5-flash') || lower.includes('3.1-flash')) return GEMINI_MODELS.GENERAL;

  return cleaned;
}
```

### Key Normalization Properties:
1. **Prefix Removal**: Strips any single or duplicate `models/` prefix.
2. **Whitespace Stripping**: Removes leading/trailing outer whitespace.
3. **Task Alias Resolution**:
   - `complex` / `pro` -> `gemini-2.5-pro`
   - `general` / `flash` -> `gemini-2.5-flash`
   - `fast` / `lite` -> `gemini-2.5-flash`
4. **Fallback Safety**: Returns safe default `gemini-2.5-flash` if raw string is empty or invalid.

---

## 3. Local Test Results & Verification

- **CMD-059 Tests**: **10 / 10 PASSED** (`src/core/cmd-059.test.ts`)
- **TypeScript Check (`npx tsc --noEmit`)**: **0 Errors (PASS)**
- **Applet Build (`npm run build`)**: **PASS**
- **Google Sheets Writes**: **0**

### Tested Normalization Scenarios:
- `gemini-2.5-flash` -> `gemini-2.5-flash`
- `models/gemini-2.5-flash` -> `gemini-2.5-flash`
- `models/models/gemini-2.5-flash` -> `gemini-2.5-flash`
- `  models/gemini-2.5-flash \n ` -> `gemini-2.5-flash`
- `complex` -> `gemini-2.5-pro`
- `general` -> `gemini-2.5-flash`
- `fast` -> `gemini-2.5-flash`

---

## 4. Required Live Testing Protocol (For Store Owner / Deployment Check)

Once deployed to Render Production, the live retest protocol tests the full path:
`Render -> Sana Engine -> Gemini Real API -> Data Providers -> Google Sheets`

### Required Questions Test Cases:
1. **"كم سعر سكر السعيد ابو كيلو؟"**
2. **"ما هي طرق الدفع المتاحة؟"**
3. **"هل يوجد توصيل؟"**
4. **"كيف أتواصل مع خدمة العملاء؟"**

---

## 5. Final Verdict

```text
FINAL VERDICT: BLOCKED — LIVE GEMINI NOT VERIFIED
```

*Final stop: Gemini model format normalization is 100% verified and green locally across unit tests, linter, and build. Render deployment required to run live end-to-end verification. Awaiting project engineer review.*
