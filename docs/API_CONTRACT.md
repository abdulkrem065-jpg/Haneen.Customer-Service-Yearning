# API Contract

## Core Messaging Contracts (CMD-003)

- **IncomingMessage**: يحتوي على نص الرسالة وسياق التنفيذ (TenantContext).
- **OutgoingMessage**: يحتوي على الرد، حالة المحادثة، وإشارات لتحويل المحادثة (Human Handoff).

## Data Provider Contracts (CMD-006)

تم تأسيس `IDataProvider<T>` في نواة النظام (Agent Core):

```typescript
export interface IDataProvider<T> {
  getById(id: string, context: DataOperationContext): Promise<T>;
  search(query: SearchQuery, context: DataOperationContext): Promise<PaginatedResult<T>>;
  create(data: Omit<T, 'id' | 'tenantId' | 'storeId' | 'createdAt' | 'updatedAt'>, context: DataOperationContext): Promise<T>;
  update(id: string, data: Partial<Omit<T, 'id' | 'tenantId' | 'storeId'>>, context: DataOperationContext): Promise<T>;
  delete(id: string, context: DataOperationContext): Promise<boolean>;
}
```

- **DataOperationContext**: يتطابق مع `TenantContext` لضمان حماية سياق التنفيذ وعزل المستأجرين.
- **SearchQuery & PaginatedResult**: توفر واجهة قياسية للبحث والتصفية على مستوى المزود.

يجب أن يكون API مستقبلاً قادراً على التعامل مع المفاهيم التالية بناءً على Domain Entities:
- Tenants
- Stores
- Agents
- Customers
- Conversations
- Messages
- Products
- Orders

## Database Configuration Abstraction (CMD-012)
The configuration for infrastructure providers (like Google Sheets) must remain abstracted from the core agent application. 
- **No Hardcoded Values**: `Spreadsheet ID`, `Credentials`, and `Tokens` must never be hardcoded in the application logic.
- **Environment Injection**: Configuration should be injected at runtime using environment variables (e.g. `GOOGLE_SHEETS_ID`) or a dedicated `IConfigurationProvider`.
- **Runtime Swappability**: By defining standard schemas and generic configurations, the `AgentOrchestrator` remains unaware if the underlying store is a Google Sheet, Supabase instance, or Mock provider.

## Secure Google Sheets Transport (CMD-013)
The `SecureGoogleSheetsTransport` implements `IGoogleSheetsTransport` using the official `googleapis` SDK.
- **Dependency Isolation**: The `googleapis` dependency is confined entirely to the `infrastructure/google-sheets` directory.
- **Zero-Write Enforcement**: The transport explicitly rejects all write operations at this phase.
- **Error Obfuscation**: The transport intercepts raw HTTP/API errors (401, 403, 404, 500) and transforms them into domain-safe `ProviderError` and `DataUnavailableError` to prevent credential leakage in logs or context windows.

## AI Provider Looping (CMD-014)
The `IAIProvider` interface accepts an optional `toolResults` parameter during `generateResponse` calls. This guarantees that intermediate domain data (like a searched product's price) fetched by the orchestrated tools can be ingested by the AI models asynchronously without breaking the stateless message context interface.

## Gemini AI Provider Contract (CMD-015)
The `GeminiAIProvider` implements `IAIProvider` contract. All tool calls and responses map through `GeminiAdapter`, translating core `AgentPolicy`, `IncomingMessage`, and `ToolExecutionResponse` structures into typed Gemini contents without `any`.

## Unified Channels & Message Contracts (CMD-016)
- `IChannelAdapter`: Base API for mapping external payloads (WhatsApp, Web) to strongly typed internal entities.
- `IChannelCapabilities`: Interface allowing the core to discover layout & format support without knowing channel specifics.
- `ExternalMessageIdentity`: Unified payload identifier struct parsed from various webhooks.
