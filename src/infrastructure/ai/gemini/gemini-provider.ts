import { IAIProvider, AIProviderResponse, ITool, ToolExecutionResponse } from '../../../core/interfaces';
import { IncomingMessage, OutgoingMessage, AgentPolicy } from '../../../core/types';
import { IGeminiTransport } from './transport';
import { GeminiConfig, GeminiConfigValidator, GEMINI_MODELS } from './config';
import { AIProviderError } from '../../../core/errors';
import { RealGeminiTransport } from './gemini-transport';
import { MockGeminiTransport } from './mock-transport';

export class GeminiAIProvider implements IAIProvider {
  private readonly transport: IGeminiTransport;
  private readonly config: GeminiConfig;

  constructor(
    customConfig?: Partial<GeminiConfig>,
    customTransport?: IGeminiTransport
  ) {
    this.config = GeminiConfigValidator.validate(customConfig);

    if (customTransport) {
      this.transport = customTransport;
    } else if (this.config.isMockMode) {
      this.transport = new MockGeminiTransport();
    } else {
      this.transport = new RealGeminiTransport(this.config);
    }
  }

  public getConfig(): GeminiConfig {
    return { ...this.config };
  }

  public static createForTask(
    taskType: 'complex' | 'general' | 'fast',
    customConfig?: Partial<GeminiConfig>
  ): GeminiAIProvider {
    const model = taskType === 'complex' ? GEMINI_MODELS.COMPLEX :
                  taskType === 'fast' ? GEMINI_MODELS.FAST :
                  GEMINI_MODELS.GENERAL;

    return new GeminiAIProvider({
      ...customConfig,
      model,
      enableThinking: taskType === 'complex' ? true : customConfig?.enableThinking,
    });
  }

  async generateResponse(
    message: IncomingMessage,
    history: (IncomingMessage | OutgoingMessage)[],
    policy: AgentPolicy,
    tools: ITool[],
    toolResults?: ToolExecutionResponse[]
  ): Promise<AIProviderResponse> {
    if (!message || !message.text) {
      throw new AIProviderError('Message text is required for Gemini AI Provider');
    }

    try {
      const response = await this.transport.generateContent({
        message,
        history,
        policy,
        tools,
        toolResults,
      });

      // Filter out malformed tool calls if any exist
      if (response.toolCalls) {
        response.toolCalls = response.toolCalls.filter(call => call.name && typeof call.name === 'string');
      }

      return response;
    } catch (error: unknown) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new AIProviderError(`Gemini AI Provider Error: ${error.message}`);
      }
      throw new AIProviderError('Unknown error in Gemini AI Provider');
    }
  }
}
