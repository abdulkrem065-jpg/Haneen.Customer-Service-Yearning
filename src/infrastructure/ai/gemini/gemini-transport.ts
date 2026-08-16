import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GeminiConfig, GEMINI_MODELS, normalizeGeminiModelName } from './config';
import { IGeminiTransport, GeminiTransportParams } from './transport';
import { AIProviderResponse } from '../../../core/interfaces';
import { AIProviderError } from '../../../core/errors';
import { GeminiAdapter } from './adapter';

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

    // Deduplicated list of models to try in sequence upon rate limits
    const rawModels: string[] = [this.config.model, GEMINI_MODELS.GENERAL, GEMINI_MODELS.FAST];
    const modelsToTry: string[] = [];
    for (const m of rawModels) {
      const normalized = normalizeGeminiModelName(m);
      if (!modelsToTry.includes(normalized)) {
        modelsToTry.push(normalized);
      }
    }

    let lastError: Error | null = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      const isComplexModel = currentModel === GEMINI_MODELS.COMPLEX;
      const enableThinking = isComplexModel && (this.config.enableThinking ?? true);

      const requestConfig: Record<string, any> = {
        systemInstruction,
        temperature: this.config.temperature,
        tools: toolsConfig,
      };

      if (enableThinking) {
        requestConfig.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH,
        };
        // Do not set maxOutputTokens when thinking is enabled
      } else if (this.config.maxOutputTokens) {
        requestConfig.maxOutputTokens = this.config.maxOutputTokens;
      } else {
        requestConfig.maxOutputTokens = 2048;
      }

      try {
        const response = await this.ai.models.generateContent({
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
      } catch (error: unknown) {
        if (error instanceof Error) {
          lastError = error;
          const isRateLimit = error.message.includes('429') ||
                              error.message.includes('Quota') ||
                              error.message.includes('RESOURCE_EXHAUSTED') ||
                              error.message.includes('Rate Limit');

          const isAuthError = error.message.includes('API key') ||
                              error.message.includes('401') ||
                              error.message.includes('403');

          if (isAuthError) {
            throw new AIProviderError('Gemini Authentication Error');
          }

          if (isRateLimit) {
            // If there are more models to try, pause briefly and fall back to next model
            if (i < modelsToTry.length - 1) {
              await new Promise(res => setTimeout(res, 400 * (i + 1)));
              continue;
            }
            throw new AIProviderError('Gemini Rate Limit Exceeded');
          }

          if (error.message.includes('TIMEOUT') || error.message.includes('DEADLINE')) {
            throw new AIProviderError('Gemini Timeout');
          }

          throw new AIProviderError(`Gemini Provider Failure: ${error.message}`);
        }
      }
    }

    throw new AIProviderError(lastError?.message ? `Gemini Provider Failure: ${lastError.message}` : 'Gemini Rate Limit Exceeded');
  }
}
