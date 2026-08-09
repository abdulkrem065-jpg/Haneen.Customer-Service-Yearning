import { IncomingMessage, OutgoingMessage, AgentPolicy } from '../../../core/types';
import { ITool, ToolExecutionResponse, AIProviderResponse } from '../../../core/interfaces';

export interface GeminiTransportParams {
  message: IncomingMessage;
  history: (IncomingMessage | OutgoingMessage)[];
  policy: AgentPolicy;
  tools: ITool[];
  toolResults?: ToolExecutionResponse[];
}

export interface IGeminiTransport {
  generateContent(params: GeminiTransportParams): Promise<AIProviderResponse>;
}
