import { IChannelAdapter, ExternalMessageIdentity, IChannelCapabilities } from '../../core/channels/interfaces';
import { OutgoingMessage, ChannelType } from '../../core/types';
import { InvalidPayloadError } from '../../core/channels/errors';

export interface WhatsAppPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
      field: string;
    }>;
  }>;
}

export class WhatsAppAdapter implements IChannelAdapter {
  channelType: ChannelType = 'WHATSAPP';
  
  capabilities: IChannelCapabilities = {
    supportsText: true,
    supportsImages: true,
    supportsFiles: true,
    supportsButtons: true,
    supportsQuickReplies: true,
    supportsLocation: true,
    supportsTypingIndicator: false
  };

  public sentMessages: OutgoingMessage[] = [];

  async parseExternalPayload(payload: unknown): Promise<ExternalMessageIdentity> {
    if (!payload || typeof payload !== 'object') {
      throw new InvalidPayloadError('Malformed WhatsApp payload', this.channelType);
    }

    const waPayload = payload as Partial<WhatsAppPayload>;
    
    if (waPayload.object !== 'whatsapp_business_account' || !waPayload.entry || !waPayload.entry[0].changes) {
      throw new InvalidPayloadError('Invalid WhatsApp webhook format', this.channelType);
    }

    const changeValue = waPayload.entry[0].changes[0].value;
    
    if (!changeValue.messages || changeValue.messages.length === 0) {
      throw new InvalidPayloadError('No messages in WhatsApp payload', this.channelType);
    }

    const message = changeValue.messages[0];
    
    // Conversation ID is usually the phone number of the sender in simple WA setups
    // or a thread ID if using advanced features. We use the sender phone number here.
    return {
      externalMessageId: message.id,
      externalSenderId: message.from,
      externalConversationId: message.from,
      channel: this.channelType,
      text: message.type === 'text' && message.text ? message.text.body : '',
      metadata: {
        whatsappMetadata: changeValue.metadata,
        senderProfile: changeValue.contacts?.[0]?.profile
      }
    };
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    // In a real adapter, this would call the WhatsApp Cloud API POST /messages endpoint
    this.sentMessages.push(message);
  }
}
