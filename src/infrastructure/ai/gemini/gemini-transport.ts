import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GeminiConfig, GEMINI_MODELS, normalizeGeminiModelName } from './config';
import { IGeminiTransport, GeminiTransportParams } from './transport';
import { AIProviderResponse } from '../../../core/interfaces';
import { AIProviderError } from '../../../core/errors';
import { GeminiAdapter } from './adapter';
import { executeWithRetry, isRetriableError } from '../retry-policy';

export class RealGeminiTransport implements IGeminiTransport {
  private ai: GoogleGenAI | null = null;

  constructor(private readonly config: GeminiConfig) {
    if (config.apiKey && !config.isMockMode) {
      this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    }
  }

  async generateContent(params: GeminiTransportParams): Promise<AIProviderResponse> {
    if (!this.ai || this.config.isMockMode) {
      throw new AIProviderError('REAL GEMINI: NOT CONFIGURED');
    }

    const systemInstruction = GeminiAdapter.buildSystemInstruction(params.policy);
    const contents = GeminiAdapter.formatHistoryAndMessage(
      params.message,
      params.history,
      params.toolResults
    );

    const formattedContents = contents.map(c => ({
      role: c.role,
      parts: c.parts.map(p => {
        if ('text' in p) return { text: p.text };
        if ('functionCall' in p) return { functionCall: p.functionCall };
        if ('functionResponse' in p) return { functionResponse: p.functionResponse };
        return { text: '' };
      }),
    }));

    const toolsConfig = params.tools.length > 0 ? [
      {
        functionDeclarations: GeminiAdapter.formatTools(params.tools),
      }
    ] : undefined;

    const currentModel = normalizeGeminiModelName(this.config.model);
    const isComplexModel = currentModel === GEMINI_MODELS.COMPLEX;
    const enableThinking = isComplexModel && (this.config.enableThinking ?? false);

    const requestConfig: Record<string, any> = {
      systemInstruction,
      temperature: this.config.temperature,
      tools: toolsConfig,
    };

    if (enableThinking) {
      requestConfig.thinkingConfig = {
        thinkingLevel: ThinkingLevel.HIGH,
      };
    } else if (this.config.maxOutputTokens) {
      requestConfig.maxOutputTokens = this.config.maxOutputTokens;
    } else {
      requestConfig.maxOutputTokens = 2048;
    }

    try {
      return await executeWithRetry(
        async (_attempt) => {
          const response = await this.ai!.models.generateContent({
            model: currentModel,
            contents: formattedContents,
            config: requestConfig,
          });

          const text = response.text || '';
          const toolCalls: { name: string; params: Record<string, unknown> }[] = [];

          if (response.functionCalls && response.functionCalls.length > 0) {
            for (const call of response.functionCalls) {
              toolCalls.push({
                name: call.name,
                params: (call.args as Record<string, unknown>) || {},
              });
            }
          }

          return {
            text,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          };
        },
        {
          maxAttempts: 3,
          baseDelayMs: 200,
          maxDelayMs: 2000,
          jitter: true,
        }
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        const msg = error.message;

        const isAuthError = msg.includes('API key') ||
                            msg.includes('401') ||
                            msg.includes('403') ||
                            msg.includes('UNAUTHENTICATED') ||
                            msg.includes('PERMISSION_DENIED');

        if (isAuthError) {
          throw new AIProviderError('Gemini Authentication Error');
        }

        const isRateLimit = msg.includes('429') ||
                            msg.includes('Quota') ||
                            msg.includes('RESOURCE_EXHAUSTED') ||
                            msg.includes('Rate Limit');

        if (isRateLimit) {
          throw new AIProviderError('Gemini Rate Limit Exceeded');
        }

        if (msg.includes('TIMEOUT') || msg.includes('DEADLINE')) {
          throw new AIProviderError('Gemini Timeout');
        }

        throw new AIProviderError(`Gemini Provider Failure: ${msg}`);
      }
      throw new AIProviderError('Unknown error in Gemini Transport');
    }
  }
}

