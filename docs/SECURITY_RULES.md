# Security Rules

- عزل بيانات العملاء بشكل كامل (Cross-Tenant isolation).
- عدم كشف أسرار API في الواجهة الأمامية.
- عدم وضع مفاتيح الخدمات الحساسة داخل Git.
- عدم السماح لوكيل متجر بالوصول إلى بيانات متجر آخر تحت أي ظرف.
- تسجيل العمليات الحساسة (Audit Logging).
- تصميم الصلاحيات من البداية (RBAC/ABAC).
- عدم اعتبار Google Sheets أو أي مصدر خارجي موثوقاً تلقائياً دون طبقة وصول آمنة.

## Security Invariants (Added in CMD-005-FIX)
- "AI-generated input is untrusted."
- "Security-sensitive execution context originates only from trusted system state."
- "The model must never determine tenant scope."
- All tool executions MUST rely on a trusted execution context independent of AI-generated parameters.

## Data Provider Security (Added in CMD-006)
- Data isolation (Tenant & Store level) is enforced implicitly by the Provider interface through `DataOperationContext`.
- An explicit `UnauthorizedDataAccessError` must be thrown if an attempt to access cross-tenant or cross-store data occurs.
- The `tenantId` and `storeId` values cannot be overridden during entity creation; they are strictly derived from the trusted context.

## Legacy Data Migration Policy (CMD-008-FINAL-SAFETY)
- **No Implicit Assignment:** If a legacy record lacks `tenantId` or `storeId`, it is considered UNASSIGNED. The system must NEVER automatically assign a default or guessed scope based on context, sheet name, or AI inference.
- **Read Safety:** Unassigned legacy data cannot enter any Tenant or Store scope. Any attempt to read it via the provider context will effectively skip or hide it (resulting in `DataNotFoundError` or similar if targeted by ID).
- **Write Safety:** When writing or updating, `tenantId` and `storeId` are ALWAYS populated from the Trusted `DataOperationContext`.
- **No Hidden Migration:** `create` and `update` operations must not perform silent or side-effect migrations of legacy data. Migration must be an explicit, separate process (with dry-run capabilities) that assigns scopes deliberately.

## 5. Legacy Data Migration Security
- **No Automatic Migration:** The system must never auto-assign legacy records to a tenant or store upon boot, query, or transaction.
- **Zero AI Ownership Guessing:** AI mechanisms cannot override or guess missing `tenantId` or `storeId` for legacy data. 
- **Dry Run Only:** Until explicit migration execution is authorized, the migration analyzers are strictly read-only, ensuring no implicit data leakage or cross-tenant contamination. Unassigned legacy data remains functionally inaccessible to scoped queries.

## 6. Zero Secrets Policy in Data Providers
- **No Secrets in Sheets:** Spreadsheets and other plaintext Data Providers must NEVER store `API Keys`, `Passwords`, `OAuth Tokens`, or `Service Account Private Keys`.
- **Agent Identity:** The `AgentConfig` entity handles behavioral variables (Tone, Persona, Rules) but must explicitly exclude sensitive infrastructure secrets. 
- **Configuration Security:** Access credentials for the Providers themselves must be securely loaded via environment configuration, never committed to source control.

## 7. Transport Security & Credential Scanning
- **Abstraction Over Injection**: Authentication objects (`IGoogleAuthClient`) must be injected into transports, never instantiated deep within business logic.
- **Environment First**: All credentials must be loaded via `process.env`. Hardcoding API keys or Spreadsheet IDs in `config.ts` or test files is strictly forbidden.
- **Error Sanitization**: Transport layers must catch and sanitize all API errors. Raw error messages containing URLs, tokens, or email addresses must never bubble up to the AI orchestrator.

## 8. End-to-End Prompt Injection & Overrides (CMD-014)
- **Context Immutability**: The multi-tenant execution context (`tenantId`, `storeId`) originates *exclusively* from the system's edge via `IncomingMessage.context`.
- **Tool Sandbox**: While AI can propose tool parameters, the `AgentOrchestrator` forces the Trusted Context into the tool's execution scope. The Data Provider always binds reads/writes to this injected trusted scope, rendering any AI attempt to inject unauthorized `tenantId`/`storeId` completely inert.

## 9. Gemini Credential & Context Security (CMD-015)
- **Credential Storage**: API Key is accessed strictly via `process.env.GEMINI_API_KEY`. Zero hardcoded keys in source, tests, logs, or documentation.
- **Untrusted AI Parameters**: Tool execution context (`tenantId`, `storeId`) is derived strictly from `message.context`. Any attempt by Gemini or prompt injections to override context parameters is ignored.

## 10. Channel Trust Boundary & Context Resolution (CMD-016)
- **External Input Untrusted**: Messages arriving from external webhooks (e.g., WhatsApp, Web) are considered strictly untrusted. External payloads cannot define `tenantId`, `storeId`, or internal `conversationId`.
- **Backend Context Authority**: The `ChannelGateway` forces all incoming messages through `IContextResolutionService` to authorize and derive exact tenant bounds securely before handing off to Agent Core.
- **Duplicate Protection**: `IIdempotencyService` contract establishes replay-attack prevention for incoming payloads.
