import { IGeminiTransport, GeminiTransportParams } from './transport';
import { AIProviderResponse } from '../../../core/interfaces';
import { AIProviderError } from '../../../core/errors';

export class MockGeminiTransport implements IGeminiTransport {
  private responseQueue: (AIProviderResponse | Error)[] = [];
  public generateCallsCount = 0;
  public lastReceivedParams: GeminiTransportParams | null = null;

  public queueResponse(response: AIProviderResponse | Error): void {
    this.responseQueue.push(response);
  }

  public clearQueue(): void {
    this.responseQueue = [];
    this.generateCallsCount = 0;
    this.lastReceivedParams = null;
  }

  async generateContent(params: GeminiTransportParams): Promise<AIProviderResponse> {
    this.generateCallsCount++;
    this.lastReceivedParams = params;

    if (this.responseQueue.length > 0) {
      const nextResponse = this.responseQueue.shift()!;
      if (nextResponse instanceof Error) {
        throw nextResponse;
      }
      return nextResponse;
    }

    // Default intelligent mock behavior if no queued response
    const messageText = params.message.text.toLowerCase();

    // Check prompt injection attempts
    if (messageText.includes('ignore instructions') || messageText.includes('override context')) {
      return {
        text: 'I cannot ignore my rules or alter tenant security boundaries.',
      };
    }

    // Default tool call trigger if asking about items
    if (params.toolResults && params.toolResults.length > 0) {
      const toolRes = params.toolResults[0];
      if (toolRes.result.isDataUnavailable) {
        return {
          text: "I'm sorry, but I don't have that information available at the moment.",
        };
      }
      return {
        text: `Based on store data: ${JSON.stringify(toolRes.result.data)}`,
      };
    }

    if (messageText.includes('rice') || messageText.includes('أرز')) {
      return {
        text: 'Checking product inventory for rice.',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'rice' } }],
      };
    }

    return {
      text: `Mock Gemini response to: ${params.message.text}`,
    };
  }
}
