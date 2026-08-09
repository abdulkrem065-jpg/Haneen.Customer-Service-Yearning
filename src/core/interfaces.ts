import { IncomingMessage, OutgoingMessage, ConversationState, AgentPolicy, TenantContext } from './types';

export interface ILogger {
  info(message: string, meta?: Record<string, unknown> | unknown): void;
  warn(message: string, meta?: Record<string, unknown> | unknown): void;
  error(message: string, meta?: Record<string, unknown> | unknown): void;
  debug(message: string, meta?: Record<string, unknown> | unknown): void;
}

export interface IConversationContext {
  getState(conversationId: string): Promise<ConversationState>;
  setState(conversationId: string, state: ConversationState): Promise<void>;
  getHistory(conversationId: string, limit?: number): Promise<(IncomingMessage | OutgoingMessage)[]>;
  addMessage(conversationId: string, message: IncomingMessage | OutgoingMessage): Promise<void>;
}

export interface IToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  isDataUnavailable?: boolean;
}

export type ToolExecutionContext = TenantContext;

export interface ITool {
  name: string;
  description: string;
  execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<IToolResult>;
}

export interface IToolRegistry {
  getTool(name: string): ITool | undefined;
  getAllTools(): ITool[];
  registerTool(tool: ITool): void;
}

export interface AIProviderResponse {
  text: string;
  suggestedState?: ConversationState;
  toolCalls?: { name: string; params: Record<string, unknown> }[];
}

export interface ToolExecutionResponse {
  name: string;
  result: IToolResult;
}

export interface IAIProvider {
  generateResponse(
    message: IncomingMessage,
    history: (IncomingMessage | OutgoingMessage)[],
    policy: AgentPolicy,
    tools: ITool[],
    toolResults?: ToolExecutionResponse[]
  ): Promise<AIProviderResponse>;
}
