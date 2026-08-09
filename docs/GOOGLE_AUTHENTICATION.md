# Google Authentication Architecture (CMD-013)

## Overview
The system utilizes a secure transport abstraction (`IGoogleAuthClient` and `SecureGoogleSheetsTransport`) to isolate the Google Sheets API from the `AgentCore`.

## Credential Loading
Credentials are not stored in source code. They are injected via environment variables:
- `GOOGLE_SHEETS_ID`: The ID of the Canonical MVP Spreadsheet.
- `GOOGLE_SHEETS_CLIENT_EMAIL`: The Google Service Account email.
- `GOOGLE_SHEETS_PRIVATE_KEY`: The Service Account private key.

*Note: In the development sandbox (AI Studio), these credentials are not provided in plaintext, and the system relies on the configuration validator to fall back to `mockMode` or explicitly declare `NOT CONFIGURED` to prevent security leaks.*

## Read-Only Security 
At this stage (PH-003), the transport enforces a **Zero-Write Policy**. `addRow`, `updateRow`, and `deleteRow` methods throw `ProviderError` unconditionally.

## Abstraction Layers
1. **GoogleSheetsConfig**: Validates environment injection and sets `mockMode`.
2. **GoogleServiceAccountAuth**: Instantiates `google-auth-library` and returns an authenticated client if credentials exist.
3. **SecureGoogleSheetsTransport**: Implements `IGoogleSheetsTransport` using the `googleapis` package. It catches network and auth errors, safely translating them into Domain `DataUnavailableError` or `ProviderError` without exposing stack traces to the LLM agent.
