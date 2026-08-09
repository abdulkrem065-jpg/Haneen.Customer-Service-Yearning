# Changelog

## 2026-08-07
- **CMD-001**: Initial project architecture and documentation foundation.
- **CMD-002**: Validated and reconciled the PH-001 architectural foundation.
- **CMD-003**: Implemented AI Agent Core Foundation (Interfaces, Orchestrator, Mocks, and Tests).
- **CMD-004**: Performed Deep Audit & Validation of AI Agent Core, identified tool context injection risk.
- **CMD-005-FIX**: Secured Tool Execution Context to prevent prompt injection and cross-tenant data leakage, removed unsafe usages of `any` for strict type safety.
- **CMD-006**: Implemented Data Architecture and Provider Contract, including Domain Entities, standard Error classes, and `IDataProvider` interface with strict `DataOperationContext` security checks.
- **CMD-007**: Created `GoogleSheetsDataProvider` in the infrastructure layer mapping domain requests to Sheet Rows, supported by a `MockGoogleSheetsTransport`, fully enforcing Tenant Isolation without leaking Google logic to Core.
- **CMD-007-FIX-01**: Implemented `HeaderMap` to introduce a Dynamic Header Schema for the `GoogleSheetsDataProvider`. Removed all hardcoded array indices, enforcing validation, missing header detection, and robustness against reordered columns.
-e 
## [Unreleased] - 2026-08-08
### Added
- Boolean mapping capabilities (`نعم/لا`) and strict validation in Data Mappers.
- Header aliases support in `HeaderMap` for seamless schema translation.
- Canonical schema definition (`GOOGLE_SHEETS_SCHEMA.md`).
- DEC-002: Decision log for Existing Spreadsheet Preservation.
-e 
- Established Legacy Data Migration Policy to prevent unauthorized access and silent mutation of unassigned legacy rows.

## [Unreleased] - $(date +%Y-%m-%d)
### Added
- Tools layer implementation (\`ProductSearchTool\`, \`ProductGetTool\`) successfully integrated with \`IDataProvider\`.
- \`ToolExecutionContext\` strictly derived from \`DataOperationContext\` to prevent AI override of \`tenantId\`/\`storeId\`.
- Graceful mapping of provider errors (\`DataNotFoundError\`, \`DataUnavailableError\`, \`UnauthorizedDataAccessError\`) to safe \`IToolResult\` output.
- Integration tests ensuring proper data isolation when tools interact with data provider layer.
-e 
- Documented Multi-Tenant Configuration Boundaries (Platform, Tenant, Store, Agent).
- Validated Read-Only Real Sheets against Canonical Schema, isolating legacy and irrelevant platform data.
-e 
- Implemented Legacy Data Migration Dry Run analyzer (`GoogleSheetsLegacyMigrationAnalyzer`) to safely classify unassigned records without mutation.
- Established `LEGACY_MIGRATION_POLICY.md` to govern strict zero-write data migration.

- Adopted DEC-003: Fresh Canonical Spreadsheet for MVP runtime, archiving the legacy spreadsheet entirely.
- Defined explicit data schemas in `schema-definitions.ts` for 10 entities (tenants, stores, products, etc.).
- Established rigid identifier, timestamp (ISO-8601), and separated currency numeric policies.
- Formulated `GOOGLE_SHEETS_PROVISIONING.md` to define manual/automated setup of the new database securely.

- Added `googleapis` and `google-auth-library` for real spreadsheet connectivity.
- Created `SecureGoogleSheetsTransport` to safely wrap the Google Sheets API v4.
- Implemented `GoogleServiceAccountAuth` to standardize credential generation.
- Enforced zero-write policy at the transport level.
- Confirmed zero hardcoded secrets via rigorous source scanning.

- Added an explicit `toolResults` loop array to `IAIProvider.generateResponse` to allow multi-turn tool calling context.
- Upgraded `AgentOrchestrator` to loop through tool executions and feed results back to the AI provider.
- Developed `orchestrator-e2e.test.ts` with explicit strict end-to-end multi-tenant validation criteria (Scenarios A through H).
- Validated that `DataUnavailableError` and `UnauthorizedDataAccessError` are securely translated into safe customer-facing responses, intercepting AI logic.

- Added `src/infrastructure/ai/gemini/` with `GeminiAIProvider`, `RealGeminiTransport`, `MockGeminiTransport`, `GeminiAdapter`, and `GeminiConfig`.
- Implemented `gemini-provider.test.ts` verifying all 16 prompt criteria (tool calling, prompt injection, tenant context protection, max iterations, error handling).
- Added `docs/GEMINI_PROVIDER.md` and updated existing system documentation.

- Added `src/core/channels/` directory defining `IChannelGateway`, `IChannelAdapter`, `IContextResolutionService`, and `IIdempotencyService`.
- Added `ChannelGateway` and Channel Typed errors (`ChannelError`, `InvalidPayloadError`, etc.).
- Created `WebAdapter` and `WhatsAppAdapter` in `src/infrastructure/channels/` as abstract implementations.
- Implemented `gateway.test.ts` checking all 18 requirements (identity separation, valid mapping, unknown channels, etc.).
- Wrote `docs/CHANNEL_ARCHITECTURE.md` to document the unified messaging approach.

- **CMD-016-FIX-01:** Moved nested channel infrastructure and core files to correct canonical paths in `src/`. Added missing handoff test to `gateway.test.ts`. Clarified idempotency documentation.

- **CMD-017:** Added `ChatInterface` and Express `/api/chat` route to act as the web channel adapter. Security checks enforced isolating context from frontend payload requests.

- **CMD-019:** Checked Google Sheets Provider live activation and verified zero-write properties. Blocked by missing real credentials. E2E works with Mock Data Provider.
