import { IContextResolutionService } from '../../core/channels/interfaces';
import { TenantContext, ChannelType } from '../../core/types';
import { UnauthorizedContextError } from '../../core/errors';

export class DefaultContextResolver implements IContextResolutionService {
  constructor(
    private readonly fixedTenantId: string,
    private readonly fixedStoreId: string,
    private readonly fixedAgentId: string
  ) {}

  async resolveContext(channel: ChannelType, externalSenderId: string): Promise<TenantContext> {
    // In a real system, we'd lookup tenant by domain, channel, or API key.
    // For this Web UI (single tenant sandbox), we use fixed config from env.
    return {
      tenantId: this.fixedTenantId,
      storeId: this.fixedStoreId,
      agentId: this.fixedAgentId
    };
  }

  async resolveConversationId(channel: ChannelType, externalConversationId: string, tenantId: string): Promise<string> {
    // Isolate by tenant and channel
    return `${tenantId}:${channel}:${externalConversationId}`;
  }

  async resolveCustomerId(channel: ChannelType, externalSenderId: string, tenantId: string): Promise<string> {
    // Isolate by tenant and channel
    return `${tenantId}:${channel}:${externalSenderId}`;
  }
}
