import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GeminiConfig, GEMINI_MODELS } from './config';
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

    try {
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

      const isComplexModel = this.config.model === GEMINI_MODELS.COMPLEX;
      const enableThinking = this.config.enableThinking ?? isComplexModel;

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
      }

      const response = await this.ai.models.generateContent({
        model: this.config.model,
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
        if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('403')) {
          throw new AIProviderError('Gemini Authentication Error');
        }
        if (error.message.includes('429') || error.message.includes('Quota')) {
          throw new AIProviderError('Gemini Rate Limit Exceeded');
        }
        if (error.message.includes('TIMEOUT') || error.message.includes('DEADLINE')) {
          throw new AIProviderError('Gemini Timeout');
        }
        throw new AIProviderError(`Gemini Provider Failure: ${error.message}`);
      }
      throw new AIProviderError('Unknown Gemini Provider Error');
    }
  }
}
