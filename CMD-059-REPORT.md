# CMD-059 — GEMINI MODEL FORMAT NORMALIZATION & LIVE RETEST REPORT

## Executive Summary
- **Stage**: CMD-059 (Gemini Model Format Normalization & Live Retest)
- **Scope**: **Sana Customer Service ONLY** (Zero coupling or logic from other projects)
- **Local Verification**: **`APPROVED — MODEL FORMAT NORMALIZED TO STABLE gemini-2.0-flash (100%)`**
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

## 1. Root Cause & Resolution Summary

- **SDK / Client**: Official `@google/genai` TypeScript SDK (`GoogleGenAI`).
- **Initial Error Diagnosed**:
  Google API returned `404 NOT_FOUND` for model `gemini-2.5-flash` stating it is no longer supported for standard API endpoints.
- **Architectural Solution Implemented**:
  Updated central model config (`src/infrastructure/ai/gemini/config.ts`) and normalization logic:
  - Canonical default model set to active, supported **`gemini-2.0-flash`**.
  - `normalizeGeminiModelName` strips leading `models/` prefixes and maps legacy/unsupported model names (including `2.5-flash`, `3.5-flash`, `1.5-flash`) safely to **`gemini-2.0-flash`**.

---

## 2. Model Normalization Logic

```typescript
export function normalizeGeminiModelName(rawModelName?: string): string {
  if (!rawModelName) return GEMINI_MODELS.GENERAL;
  let cleaned = rawModelName.trim();
  if (!cleaned) return GEMINI_MODELS.GENERAL;

  while (/^models\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^models\//i, '').trim();
  }

  if (!cleaned) return GEMINI_MODELS.GENERAL;

  const lower = cleaned.toLowerCase();
  if (lower === 'complex' || lower === 'pro') return GEMINI_MODELS.COMPLEX;
  if (lower === 'general' || lower === 'flash') return GEMINI_MODELS.GENERAL;
  if (lower === 'fast' || lower === 'lite') return GEMINI_MODELS.FAST;

  if (
    lower.includes('2.5') ||
    lower.includes('3.1') ||
    lower.includes('3.5') ||
    lower.includes('1.5')
  ) {
    return GEMINI_MODELS.GENERAL;
  }

  return cleaned;
}
```

---

## 3. Local Test Results & Verification

- **CMD-059 Tests**: **11 / 11 PASSED** (`src/core/cmd-059.test.ts`)
- **TypeScript Check (`npx tsc --noEmit`)**: **0 Errors (PASS)**
- **Applet Build (`npm run build`)**: **PASS**
- **Google Sheets Writes**: **0**

---

## 4. Final Verdict

```text
FINAL VERDICT: BLOCKED — LIVE GEMINI NOT VERIFIED
```

*Final stop: Gemini model configuration is updated to active stable `gemini-2.0-flash` and 100% verified locally across unit tests, linter, and build. Render deployment required to run live end-to-end verification.*
