# CMD-023-PRIVATE-KEY-LIVE-DIAG-01-REPORT

## 1. Root Cause Analysis
- **Error Observed**: `error:1E08010C:DECODER routines::unsupported` on Render live execution.
- **Root Cause**: The bootstrap execution path in `bootstrap-endpoint.ts` and `cmd-023-bootstrap.ts` previously bypassed the unified `normalizePrivateKey()` function in `key-utils.ts` and instead relied on a simple inline `.replace(/\\n/g, '\n')`.
- **OpenSSL 3.0 Failure**: When environment variables on Render are entered with enclosing quotes (e.g., `"-----BEGIN PRIVATE KEY...` or `\"-----BEGIN PRIVATE KEY...`), or contain double-escaped newlines (`\\\\n`), the simple replace left outer quote characters in place. OpenSSL 3.0 PEM decoder failed immediately upon encountering a quote character instead of `-----BEGIN PRIVATE KEY-----`.

## 2. Affected Path & Fix Applied
- **Affected Files**:
  - `src/infrastructure/google-sheets/admin/bootstrap-endpoint.ts`
  - `cmd-023-bootstrap.ts`
  - `src/infrastructure/google-sheets/key-utils.ts`
- **Fix Summary**:
  1. Updated `bootstrap-endpoint.ts` and `cmd-023-bootstrap.ts` to route all private key parsing through `normalizePrivateKey(rawPrivateKey)` and `validatePrivateKey(privateKey)`.
  2. Enhanced `normalizePrivateKey()` in `key-utils.ts` to recursively strip outer double/single quotes and escaped quotes (`\"`, `\'`).
  3. Added normalization support for double-escaped newlines (`\\\\n`), carriage returns (`\r\n`, `\r`), and single-escaped newlines (`\\n`).
  4. Added automatic insertion of newlines after `-----BEGIN PRIVATE KEY-----` and before `-----END PRIVATE KEY-----` if missing.

## 3. Normalization & Validation Status
- **Normalization Status**: `VERIFIED & UNIFIED` across all endpoints (`bootstrap-endpoint.ts`, `verify-endpoint.ts`, `secure-transport.ts`, `cmd-023-bootstrap.ts`).
- **Validation Status**: `PASS` (Programmatic check using `crypto.createPrivateKey` via `validatePrivateKey()`).
- **Secret Exposure**: `NONE` (Zero private key bytes, length, or fragments are logged or exposed).
- **Google Sheets Writes**: `0` (Diagnostic phase conducted with zero write calls).

## 4. Test Results
- **Vitest Unit Tests**: `PASS` (119/119 passed, including new key normalization regression tests)
- **TypeScript (`npx tsc --noEmit`)**: `PASS` (0 errors)
- **Build (`npm run build`)**: `PASS` (Vite SPA + esbuild CJS server bundled successfully)

## 5. Recommended Render Environment Value Format
Render environment variables for `GOOGLE_SHEETS_PRIVATE_KEY` can be provided in any standard format:
1. Standard multiline string:
   ```
   -----BEGIN PRIVATE KEY-----
   MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
   -----END PRIVATE KEY-----
   ```
2. One-line escaped string:
   `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----`
3. Quoted or raw string from Google Cloud Service Account JSON file.

All formats are now seamlessly normalized and validated by `normalizePrivateKey()`.
