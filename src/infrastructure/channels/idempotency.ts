import { IIdempotencyService } from '../../core/channels/interfaces';
import { ChannelType } from '../../core/types';

export class InMemoryIdempotencyService implements IIdempotencyService {
  private processed = new Set<string>();

  async isDuplicate(externalMessageId: string, channel: ChannelType): Promise<boolean> {
    return this.processed.has(`${channel}:${externalMessageId}`);
  }

  async markProcessed(externalMessageId: string, channel: ChannelType): Promise<void> {
    this.processed.add(`${channel}:${externalMessageId}`);
  }
}
