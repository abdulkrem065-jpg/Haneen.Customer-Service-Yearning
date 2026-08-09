import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelGateway } from './gateway';
import { IContextResolutionService, IIdempotencyService } from './interfaces';
import { WebAdapter } from '../../infrastructure/channels/web-adapter';
import { WhatsAppAdapter } from '../../infrastructure/channels/whatsapp-adapter';
import { ChannelError, InvalidPayloadError, DuplicateMessageError, InvalidContextError } from './errors';
import { OutgoingMessage } from '../types';

describe('CMD-016: Unified Message Gateway & Channel Architecture', () => {
  let mockContextResolver: IContextResolutionService;
  let mockIdempotencyService: IIdempotencyService;
  let gateway: ChannelGateway;
  let webAdapter: WebAdapter;
  let waAdapter: WhatsAppAdapter;

  beforeEach(() => {
    mockContextResolver = {
      resolveContext: vi.fn().mockResolvedValue({ tenantId: 'tenant-1', storeId: 'store-1', agentId: 'agent-1' }),
      resolveConversationId: vi.fn().mockResolvedValue('internal-conv-1'),
      resolveCustomerId: vi.fn().mockResolvedValue('internal-cust-1')
    };

    mockIdempotencyService = {
      isDuplicate: vi.fn().mockResolvedValue(false),
      markProcessed: vi.fn().mockResolvedValue(undefined)
    };

    gateway = new ChannelGateway(mockContextResolver, mockIdempotencyService);
    webAdapter = new WebAdapter();
    waAdapter = new WhatsAppAdapter();
    
    gateway.registerAdapter(webAdapter);
    gateway.registerAdapter(waAdapter);
  });

  it('1. Web Incoming Message Mapping: Parses external payload correctly', async () => {
    const payload = {
      sessionId: 'web-session-xyz',
      userId: 'web-user-123',
      messageId: 'msg-abc',
      text: 'Hello from Web'
    };

    const incoming = await gateway.processIncomingPayload('WEB', payload);
    
    expect(incoming.text).toBe('Hello from Web');
    expect(incoming.context.channel).toBe('WEB');
    expect(incoming.context.conversationId).toBe('internal-conv-1');
    expect(incoming.context.customerId).toBe('internal-cust-1');
  });

  it('2. WhatsApp Incoming Message Mapping: Parses WA payload correctly', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'wa-id',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '123', phone_number_id: '456' },
            messages: [{
              from: '1234567890',
              id: 'wamid.123',
              timestamp: '1234567890',
              type: 'text',
              text: { body: 'Hello from WhatsApp' }
            }]
          }
        }]
      }]
    };

    const incoming = await gateway.processIncomingPayload('WHATSAPP', payload);
    
    expect(incoming.text).toBe('Hello from WhatsApp');
    expect(incoming.context.channel).toBe('WHATSAPP');
  });

  it('3 & 4. Web and WhatsApp Outgoing Message Mapping: Routes outgoing message', async () => {
    const outgoing: OutgoingMessage = {
      messageId: 'out-1',
      conversationId: 'internal-conv-1',
      text: 'Reply to user',
      handoffToHuman: false
    };

    await gateway.routeOutgoingMessage('WEB', outgoing);
    expect(webAdapter.sentMessages).toHaveLength(1);
    expect(webAdapter.sentMessages[0].text).toBe('Reply to user');

    await gateway.routeOutgoingMessage('WHATSAPP', outgoing);
    expect(waAdapter.sentMessages).toHaveLength(1);
    expect(waAdapter.sentMessages[0].text).toBe('Reply to user');
  });

  it('5 & 6. Channel Routing & Invalid Channel: Throws error for unknown channels', async () => {
    await expect(gateway.processIncomingPayload('TELEGRAM', {}))
      .rejects.toThrow(ChannelError);
  });

  it('7 & 18. Invalid & Malformed Message: Throws InvalidPayloadError for bad payload', async () => {
    await expect(gateway.processIncomingPayload('WEB', {}))
      .rejects.toThrow(InvalidPayloadError);

    await expect(gateway.processIncomingPayload('WEB', { sessionId: '1' })) // missing fields
      .rejects.toThrow(InvalidPayloadError);
  });

  it('8 & 9. Tenant & Store Context Protection: Ensures Context is resolved from external boundaries securely', async () => {
    const payload = {
      sessionId: 'web-session-xyz',
      userId: 'web-user-123',
      messageId: 'msg-abc',
      text: 'Hello from Web'
    };

    // The context is supplied by contextResolver which is a trusted backend service, NOT the payload itself.
    const incoming = await gateway.processIncomingPayload('WEB', payload);
    
    expect(incoming.context.tenantId).toBe('tenant-1');
    expect(incoming.context.storeId).toBe('store-1');
    expect(mockContextResolver.resolveContext).toHaveBeenCalledWith('WEB', 'web-user-123');
  });

  it('10 & 11. Customer & Conversation Identity Separation: Internal IDs distinct from External', async () => {
    const payload = {
      sessionId: 'ext-session-123',
      userId: 'ext-user-123',
      messageId: 'msg-abc',
      text: 'Hello from Web'
    };

    const incoming = await gateway.processIncomingPayload('WEB', payload);
    expect(incoming.context.conversationId).toBe('internal-conv-1');
    expect(incoming.context.customerId).toBe('internal-cust-1');
    expect(incoming.context.messageId).toBe('msg-abc');
  });

  it('12. Duplicate Message Contract: Rejects replayed messages', async () => {
    mockIdempotencyService.isDuplicate = vi.fn().mockResolvedValue(true);

    const payload = {
      sessionId: 'web-session-xyz',
      userId: 'web-user-123',
      messageId: 'msg-abc',
      text: 'Hello from Web'
    };

    await expect(gateway.processIncomingPayload('WEB', payload))
      .rejects.toThrow(DuplicateMessageError);
  });

  it('13. Channel Capabilities: Correctly defined per adapter', () => {
    expect(webAdapter.capabilities.supportsTypingIndicator).toBe(true);
    expect(waAdapter.capabilities.supportsTypingIndicator).toBe(false);
  });

  it('14 & 15. Core Independence: Gateway produces identical IncomingMessage structure for Orchestrator', async () => {
    const webPayload = {
      sessionId: 'sess',
      userId: 'user',
      messageId: 'msg1',
      text: 'Web message'
    };
    
    const waPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'wa',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '123', phone_number_id: '456' },
            messages: [{ from: '123', id: 'msg2', timestamp: '123', type: 'text', text: { body: 'WA message' } }]
          }
        }]
      }]
    };

    const webIncoming = await gateway.processIncomingPayload('WEB', webPayload);
    const waIncoming = await gateway.processIncomingPayload('WHATSAPP', waPayload);

    // Both should match the exact same structure Expected by AgentOrchestrator
    expect(webIncoming.context.tenantId).toBe(waIncoming.context.tenantId);
    expect(webIncoming.context).toHaveProperty('channel');
    expect(waIncoming.context).toHaveProperty('channel');
  });

  it('16. Human Handoff Independence: Channel behavior handles handoff identically', async () => {
    const outgoing: OutgoingMessage = {
      messageId: 'out-2',
      conversationId: 'internal-conv-1',
      text: 'Transferring to human',
      handoffToHuman: true
    };

    await gateway.routeOutgoingMessage('WEB', outgoing);
    expect(webAdapter.sentMessages).toHaveLength(1);
    expect(webAdapter.sentMessages[0].handoffToHuman).toBe(true);

    await gateway.routeOutgoingMessage('WHATSAPP', outgoing);
    expect(waAdapter.sentMessages).toHaveLength(1);
    expect(waAdapter.sentMessages[0].handoffToHuman).toBe(true);
  });

  it('17. Adapter Failure: Maps adapter failures to ChannelError', async () => {
    vi.spyOn(webAdapter, 'parseExternalPayload').mockRejectedValue(new Error('Internal DB failure'));

    const payload = {
      sessionId: 'sess',
      userId: 'user',
      messageId: 'msg1',
      text: 'Web message'
    };

    await expect(gateway.processIncomingPayload('WEB', payload))
      .rejects.toThrow(ChannelError);
  });
});
