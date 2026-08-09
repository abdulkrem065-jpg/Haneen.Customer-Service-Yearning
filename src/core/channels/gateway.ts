import { 
  IChannelGateway, 
  IChannelAdapter, 
  IContextResolutionService, 
  IIdempotencyService 
} from './interfaces';
import { IncomingMessage, OutgoingMessage, ChannelType } from '../types';
import { ChannelError, InvalidPayloadError, DuplicateMessageError, InvalidContextError } from './errors';

export class ChannelGateway implements IChannelGateway {
  private adapters = new Map<ChannelType, IChannelAdapter>();

  constructor(
    private readonly contextResolver: IContextResolutionService,
    private readonly idempotencyService: IIdempotencyService
  ) {}

  registerAdapter(adapter: IChannelAdapter): void {
    this.adapters.set(adapter.channelType, adapter);
  }

  getAdapter(channel: ChannelType): IChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new ChannelError(`Unknown channel adapter: ${channel}`, channel);
    }
    return adapter;
  }

  async processIncomingPayload(channel: ChannelType, payload: unknown): Promise<IncomingMessage> {
    const adapter = this.getAdapter(channel);
    
    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      throw new InvalidPayloadError('Empty or invalid payload', channel);
    }

    try {
      // 1. Parse external payload securely
      const externalIdentity = await adapter.parseExternalPayload(payload);
      
      if (!externalIdentity.text && !externalIdentity.metadata) {
        throw new InvalidPayloadError('Message contains no text or metadata', channel);
      }

      // 2. Idempotency Check
      const isDup = await this.idempotencyService.isDuplicate(externalIdentity.externalMessageId, channel);
      if (isDup) {
        throw new DuplicateMessageError(`Duplicate message detected: ${externalIdentity.externalMessageId}`, channel);
      }

      // 3. Trusted Context Resolution (External Input = UNTRUSTED -> Resolved Context = TRUSTED)
      const tenantContext = await this.contextResolver.resolveContext(channel, externalIdentity.externalSenderId);
      if (!tenantContext || !tenantContext.tenantId || !tenantContext.storeId) {
        throw new InvalidContextError('Failed to resolve trusted tenant context', channel);
      }

      // 4. Conversation and Customer Resolution
      const conversationId = await this.contextResolver.resolveConversationId(
        channel, 
        externalIdentity.externalConversationId, 
        tenantContext.tenantId
      );
      
      const customerId = await this.contextResolver.resolveCustomerId(
        channel, 
        externalIdentity.externalSenderId, 
        tenantContext.tenantId
      );

      // 5. Build Unified Incoming Message
      const incomingMessage: IncomingMessage = {
        context: {
          ...tenantContext,
          messageId: externalIdentity.externalMessageId,
          conversationId,
          customerId,
          channel,
          timestamp: new Date()
        },
        text: externalIdentity.text,
        metadata: externalIdentity.metadata
      };
      
      // 6. Mark as processed
      await this.idempotencyService.markProcessed(externalIdentity.externalMessageId, channel);
      
      return incomingMessage;
    } catch (error: unknown) {
      if (error instanceof ChannelError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new ChannelError(`Adapter processing failed: ${error.message}`, channel);
      }
      throw new ChannelError('Unknown adapter error', channel);
    }
  }

  async routeOutgoingMessage(channel: ChannelType, message: OutgoingMessage): Promise<void> {
    const adapter = this.getAdapter(channel);
    try {
      await adapter.sendMessage(message);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new ChannelError(`Adapter send failed: ${error.message}`, channel);
      }
      throw new ChannelError('Unknown adapter send error', channel);
    }
  }
}
