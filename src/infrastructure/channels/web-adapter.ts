import { IChannelAdapter, ExternalMessageIdentity, IChannelCapabilities } from '../../core/channels/interfaces';
import { OutgoingMessage, ChannelType } from '../../core/types';
import { InvalidPayloadError } from '../../core/channels/errors';

export interface WebPayload {
  sessionId: string;
  userId: string;
  messageId: string;
  text: string;
  attachments?: unknown[];
}

export class WebAdapter implements IChannelAdapter {
  channelType: ChannelType = 'WEB';
  
  capabilities: IChannelCapabilities = {
    supportsText: true,
    supportsImages: true,
    supportsFiles: true,
    supportsButtons: true,
    supportsQuickReplies: true,
    supportsLocation: false,
    supportsTypingIndicator: true
  };

  // Mock array to simulate sent messages during testing
  public sentMessages: OutgoingMessage[] = [];

  async parseExternalPayload(payload: unknown): Promise<ExternalMessageIdentity> {
    if (!payload || typeof payload !== 'object') {
      throw new InvalidPayloadError('Malformed web payload', this.channelType);
    }

    const webPayload = payload as Partial<WebPayload>;
    
    if (!webPayload.messageId || !webPayload.sessionId || !webPayload.userId || webPayload.text === undefined) {
      throw new InvalidPayloadError('Missing required fields in web payload', this.channelType);
    }

    return {
      externalMessageId: webPayload.messageId,
      externalSenderId: webPayload.userId,
      externalConversationId: webPayload.sessionId,
      channel: this.channelType,
      text: webPayload.text,
      metadata: webPayload.attachments ? { attachments: webPayload.attachments } : undefined
    };
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    // In a real adapter, this would broadcast via WebSockets or SSE
    this.sentMessages.push(message);
  }
}
