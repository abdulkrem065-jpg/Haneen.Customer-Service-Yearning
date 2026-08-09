import { Type, FunctionDeclaration } from '@google/genai';
import { IncomingMessage, OutgoingMessage, AgentPolicy } from '../../../core/types';
import { ITool, ToolExecutionResponse } from '../../../core/interfaces';

export interface GeminiContentPartText {
  text: string;
}

export interface GeminiContentPartFunctionCall {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
}

export interface GeminiContentPartFunctionResponse {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

export type GeminiContentPart =
  | GeminiContentPartText
  | GeminiContentPartFunctionCall
  | GeminiContentPartFunctionResponse;

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
}

export class GeminiAdapter {
  static buildSystemInstruction(policy: AgentPolicy): string {
    const instructions: string[] = [
      `Persona: ${policy.persona}`,
      `Language: ${policy.language}`,
      `Tone: ${policy.tone}`,
    ];

    if (policy.rules && policy.rules.length > 0) {
      instructions.push('Rules:\n' + policy.rules.map(r => `- ${r}`).join('\n'));
    }

    if (policy.toolUsageRules && policy.toolUsageRules.length > 0) {
      instructions.push('Tool Usage Rules:\n' + policy.toolUsageRules.map(r => `- ${r}`).join('\n'));
    }

    if (policy.handoffRules && policy.handoffRules.length > 0) {
      instructions.push('Handoff Rules:\n' + policy.handoffRules.map(r => `- ${r}`).join('\n'));
    }

    return instructions.join('\n\n');
  }

  static formatHistoryAndMessage(
    message: IncomingMessage,
    history: (IncomingMessage | OutgoingMessage)[],
    toolResults?: ToolExecutionResponse[]
  ): GeminiContent[] {
    const contents: GeminiContent[] = [];

    // Map existing history
    for (const msg of history) {
      if ('text' in msg && msg.text) {
        if ('context' in msg) {
          // IncomingMessage -> user
          contents.push({
            role: 'user',
            parts: [{ text: msg.text }],
          });
        } else {
          // OutgoingMessage -> model
          contents.push({
            role: 'model',
            parts: [{ text: msg.text }],
          });
        }
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message.text }],
    });

    // If tool results are provided, attach them as functionResponse parts
    if (toolResults && toolResults.length > 0) {
      for (const res of toolResults) {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: res.name,
                response: {
                  success: res.result.success,
                  data: res.result.data ?? null,
                  error: res.result.error ?? null,
                  isDataUnavailable: res.result.isDataUnavailable ?? false,
                },
              },
            },
          ],
        });
      }
    }

    return contents;
  }

  static formatTools(tools: ITool[]): FunctionDeclaration[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: Type.OBJECT,
        properties: {
          searchTerm: { type: Type.STRING, description: 'Search keyword or product name' },
          productId: { type: Type.STRING, description: 'Unique ID of the product' },
        },
      },
    }));
  }
}
