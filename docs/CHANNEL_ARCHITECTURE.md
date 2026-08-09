# Channel Architecture & Unified Message Gateway (CMD-016)

## Overview
The Unified Message Gateway decouples the Agent Core from external messaging platforms (e.g., WhatsApp, Web, Telegram). It provides an abstraction layer where external payloads are securely mapped into standardized `IncomingMessage` contracts.

## Architecture Flow

```
External Channel (e.g., WhatsApp Webhook)
       │
       ▼
[ Channel Adapter ] (WhatsAppAdapter, WebAdapter)
       │ Parses payload, extracts external IDs & content
       ▼
[ Channel Gateway ] (Message Routing & Validation)
       │
       ├─► [ Idempotency Service ] (Duplicate Protection)
       │
       ├─► [ Context Resolution Service ] (Security Boundary)
       │    Resolves trusted `TenantContext`, `storeId`, `conversationId`
       │    External input is NEVER trusted to define tenant boundaries.
       ▼
[ Agent Core ] (AgentOrchestrator)
       │ Processes Unified IncomingMessage identically regardless of channel
       ▼
[ Unified Outgoing Message ]
       │
       ▼
[ Channel Gateway ]
       │
       ▼
[ Channel Adapter ] (API formatting)
       │
       ▼
External Channel
```

## Security & Context Resolution
External channels are inherently **untrusted**. The `Channel Gateway` passes the external identity (e.g., sender's phone number or web session ID) to a trusted backend `ContextResolutionService`. The service securely determines which Tenant, Store, and internal Conversation ID the message belongs to. This ensures true multi-tenant isolation.

## Identities
- **Customer Identity**: Internal `customerId` vs External `externalSenderId`.
- **Conversation Identity**: Internal `conversationId` vs External `externalConversationId`.
- **Channel Identity**: Strongly typed `ChannelType` (WEB, WHATSAPP, etc.).

## Capabilities
Adapters define `IChannelCapabilities` declaring what UI elements they support (Text, Images, Buttons, etc.), allowing the Agent Core to degrade gracefully or structure responses conditionally without hardcoding channel names.

## Human Handoff
Human Handoff acts uniformly on the `ConversationState` in the internal layer. The gateway enforces routing blocks transparently.

## Future Channels
To add a new channel (e.g., Telegram):
1. Create `TelegramAdapter` implementing `IChannelAdapter`.
2. Register it with `ChannelGateway`.
3. Agent Core remains untouched.

## Idempotency / Replay Protection
Replay Protection: CONTRACT / ABSTRACTION ONLY
Distributed idempotency: NOT IMPLEMENTED
