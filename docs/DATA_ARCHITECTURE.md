# Data Architecture

تم تصميم طبقة البيانات (Data Layer) بحيث تكون مستقلة تماماً عن Agent Core.

## Data Provider Contract (CMD-006)

تم تأسيس `IDataProvider<T>` ليمثل العقد الأساسي لعمليات المجال، مع التركيز على المبادئ التالية:

1. **Trusted Execution Context**: جميع العمليات تطلب تمرير `DataOperationContext` الذي يعتمد على سياق المستأجر الآمن (TenantContext). لا يتم استخدام المدخلات القادمة من الـAI (params) كمصدر לסياق التنفيذ.
2. **Tenant Isolation**: يضمن العقد عزل البيانات بالكامل على مستوى `tenantId` و `storeId`.
3. **Provider Replaceability**: النظام مبني بحيث يمكن استبدال واجهة `IDataProvider` بأي مزود فعلي (مثل Google Sheets أو PostgreSQL أو Supabase) دون تعديل Agent Core.

## Domain Entities

تم تقسيم البيانات بشكل واضح بين:

- **Platform Data**: مثل المستأجرين (Tenants) واشتراكاتهم.
- **Tenant/Store Data**:
  - `Product`
  - `Customer`
  - `Order`
  - `ConversationData`
  - `StoreSettings`
  - `AgentConfig`

## Error Model

تستخدم طبقة البيانات أخطاء مخصصة للفصل بين أنواع الفشل:
- `DataNotFoundError`
- `DataUnavailableError`
- `UnauthorizedDataAccessError`
- `ValidationError`
- `ConflictError`

## Data Isolation

لا توجد استثناءات لعزل المستأجرين (Tenant Isolation). المزود مطالب برفض أي وصول خارج سياق المستأجر المعطى، حتى لو تم توفير مُعرّف الكيان بشكل صحيح.

أمثلة مستقبلية للمزودات (سيتم تنفيذ أحدها في CMD-007):
- Google Sheets Provider
- Supabase Provider

## Google Sheets Provider (CMD-007)

تم تنفيذ مزود بيانات تجريبي (`GoogleSheetsDataProvider`) في طبقة البنية التحتية (`src/infrastructure/google-sheets/`) باستخدام واجهات تعتمد على صفوف (Rows) بدلاً من قاعدة بيانات تقليدية. المزود يفصل تماماً بين مفاهيم Google Sheets ونواة النظام:

- يلتزم المزود بعقد `IDataProvider<T>`.
- يعتمد على `IGoogleSheetsTransport` للتواصل مع Google Sheets.
- حالياً يعمل عبر `MockGoogleSheetsTransport` لعدم توفر بيانات مصادقة فعلية.
- عزل المستأجرين يتم في طبقة `GoogleSheetsDataProvider` بصرامة بغض النظر عما يطلبه الوكيل.

## Dynamic Header Schema (CMD-007-FIX-01)
تم تطبيق استراتيجية `Dynamic Header Schema` للتعامل مع `Google Sheets`:
- الأعمدة لم تعد تعتمد على ترتيب ثابت. 
- يتطلب المحول (Mapper) تحديد `requiredHeaders` و `defaultHeaders`.
- يقوم `HeaderMap` بتحليل الصف الأول واستخراج العناوين للوصول الآمن (Name-based mapping).
- يتم رفض الجداول التي تحتوي عناوين مكررة أو تفتقر للأعمدة الأساسية لمنع تلف البيانات.
-e 
## Canonical Schema
As per DEC-002, the Canonical Schema is defined in `docs/GOOGLE_SHEETS_SCHEMA.md`. We preserve the existing Google Spreadsheet and use Header Aliases and Data Mappers to align with our Domain Entities. Trusted Tenant/Store Context remains the ultimate security authority.

## Tool Integration Layer (CMD-009)
The AI interacts with the Data Provider via an intermediate Tool Layer (e.g. `ProductSearchTool`, `ProductGetTool`). The Tool Layer guarantees that:
- AI-generated overrides for `tenantId` or `storeId` are ignored.
- Only the trusted `ToolExecutionContext` (mapped to `DataOperationContext`) is passed to the data providers.
- Infrastructure-specific errors (like network failures or `DataUnavailableError`) are translated to graceful AI responses.
- `DataNotFoundError` is passed naturally so the AI won't hallucinate missing data.

## Multi-Tenant Configuration Boundaries (CMD-010)
The system distinguishes strictly between different configuration levels to ensure Multi-Tenant isolation:
- **Platform Configuration:** SaaS infrastructure level. Contains global tenants and their subscriptions. No tenant can see platform-level config or other tenants.
- **Tenant Configuration:** Contains the list of stores owned by a specific business. Governed by `tenantId`.
- **Store Configuration:** Settings specific to a single storefront (e.g. `StoreSettings` like currency, language, payment methods). Governed by `tenantId` + `storeId`.
- **Agent Configuration:** Defines AI behaviour (`AgentConfig` like persona, tone, rules). Tied to a specific `storeId` and `agentId`.

All configurations use the same `DataOperationContext` security boundary. `tenantId` and `storeId` are always supplied securely via the session/channel context and never by the AI, ensuring complete data isolation and no horizontal privilege escalation. Legacy records lacking context IDs remain securely isolated and unassigned until explicitly migrated.

## Legacy Data Migration (CMD-011)
To handle the transition of legacy data into the Multi-Tenant architecture, the system employs an Explicit Legacy Data Migration Strategy.
- **Strict Classification:** All data from providers is passed through `ILegacyMigrationAnalyzer` (implemented by `GoogleSheetsLegacyMigrationAnalyzer`) to determine if it is `FULLY_ASSIGNED`, `TENANT_MISSING`, `STORE_MISSING`, `BOTH_MISSING`, or `INVALID_SCOPE`.
- **Zero-Write Dry Run:** Migration is purely analytical. No data is modified. 
- **Ownership Guessing Prohibited:** Missing context IDs render a record `BLOCKED` for migration unless a highly trusted, explicit target scope is supplied. AI-generated inferences for missing ownership are strictly rejected.

## Canonical MVP Schema (CMD-012)
The database structure relies on an explicit Entity Relational model represented in `schema-definitions.ts`. 
- **Legacy Archival**: The pre-existing spreadsheet is considered legacy/archived and is NOT part of the new runtime pipeline (DEC-003).
- **Identifier Independence**: All entities utilize robust, independent IDs (e.g., CUID/UUID) as primary keys, not row indices.
- **Scope Rigidity**: Every entity operates securely within a defined hierarchy (PLATFORM -> TENANT -> STORE) enforced strictly by `DataOperationContext` via foreign keys (`tenantId`, `storeId`).

## Error Isolation (CMD-014)
Data architecture strictly separates operational infrastructure errors from business application state. `SecureGoogleSheetsTransport` intercepts HTTP errors (401, 500) and maps them to `DataUnavailableError` or `ProviderError`. The `AgentOrchestrator` consumes these domain errors and responds gracefully to users, preventing any infrastructure paths or secrets from bleeding into the conversational context.

## AI Provider Decoupling (CMD-015)
The AI provider layer is completely isolated under `src/infrastructure/ai/gemini/`. Core domain entities and data providers are completely unaware of Gemini SDK specifics, ensuring pluggability and zero vendor lock-in.

## Unified Channel Data Architecture (CMD-016)
Incoming webhooks and payloads from disparate services (WhatsApp, Web) are decoupled from the Agent Core. The `ChannelGateway` orchestrates parsing via `IChannelAdapter`, deduplication via `IIdempotencyService`, and security resolution via `IContextResolutionService`, producing a unified type-safe message payload for the `AgentOrchestrator`.
