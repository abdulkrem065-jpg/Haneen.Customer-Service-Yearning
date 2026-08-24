import { IAIProvider, AIProviderResponse, ITool, ToolExecutionResponse } from '../../core/interfaces';
import { IncomingMessage, OutgoingMessage, AgentPolicy } from '../../core/types';
import { AIProviderError } from '../../core/errors';

export interface FallbackAIProviderConfig {
  enabled?: boolean;
  providerName?: string;
  apiKey?: string;
}

/**
 * FallbackAIProvider abstraction for future multi-provider resilience.
 * Currently kept unconfigured/disabled to maintain 100% Zero Operating Budget,
 * zero unverified external dependencies, and Google Sheets as sole business truth.
 */
export class FallbackAIProvider implements IAIProvider {
  private readonly enabled: boolean;
  private readonly providerName: string;

  constructor(config?: FallbackAIProviderConfig) {
    this.enabled = config?.enabled ?? false;
    this.providerName = config?.providerName || 'FallbackAIProvider';
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getProviderName(): string {
    return this.providerName;
  }

  async generateResponse(
    _message: IncomingMessage,
    _history: (IncomingMessage | OutgoingMessage)[],
    _policy: AgentPolicy,
    _tools: ITool[],
    _toolResults?: ToolExecutionResponse[]
  ): Promise<AIProviderResponse> {
    if (!this.enabled) {
      throw new AIProviderError(`[${this.providerName}] Fallback AI Provider is unconfigured or disabled.`);
    }

    return {
      text: 'أعتذر، الخدمة مشغولة قليلاً الآن. جرّب معي بعد لحظات.',
    };
  }
}
