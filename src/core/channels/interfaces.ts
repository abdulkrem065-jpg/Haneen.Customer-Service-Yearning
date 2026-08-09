import { IncomingMessage, OutgoingMessage, TenantContext, ChannelType } from '../types';

export interface IChannelCapabilities {
  supportsText: boolean;
  supportsImages: boolean;
  supportsFiles: boolean;
  supportsButtons: boolean;
  supportsQuickReplies: boolean;
  supportsLocation: boolean;
  supportsTypingIndicator: boolean;
}

export interface ExternalMessageIdentity {
  externalMessageId: string;
  externalSenderId: string;
  externalConversationId: string;
  channel: ChannelType;
  metadata?: Record<string, unknown>;
  text: string;
}

export interface IChannelAdapter {
  channelType: ChannelType;
  capabilities: IChannelCapabilities;
  
  /** Extracts the normalized identity and text from a raw channel payload */
  parseExternalPayload(payload: unknown): Promise<ExternalMessageIdentity>;
  
  /** Transforms a unified OutgoingMessage into the channel's specific API format and sends it */
  sendMessage(message: OutgoingMessage): Promise<void>;
}

export interface IContextResolutionService {
  /** Resolves the trusted tenant/store/agent context from channel identity */
  resolveContext(channel: ChannelType, externalSenderId: string): Promise<TenantContext>;
  
  /** Resolves or creates a secure internal conversation ID based on external channel info */
  resolveConversationId(channel: ChannelType, externalConversationId: string, tenantId: string): Promise<string>;
  
  /** Resolves a secure internal customer ID */
  resolveCustomerId(channel: ChannelType, externalSenderId: string, tenantId: string): Promise<string>;
}

export interface IIdempotencyService {
  isDuplicate(externalMessageId: string, channel: ChannelType): Promise<boolean>;
  markProcessed(externalMessageId: string, channel: ChannelType): Promise<void>;
}

export interface IChannelGateway {
  registerAdapter(adapter: IChannelAdapter): void;
  getAdapter(channel: ChannelType): IChannelAdapter;
  processIncomingPayload(channel: ChannelType, payload: unknown): Promise<IncomingMessage>;
  routeOutgoingMessage(channel: ChannelType, message: OutgoingMessage): Promise<void>;
}
