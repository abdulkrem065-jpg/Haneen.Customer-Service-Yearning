import { ILogger, IConversationContext, IToolRegistry, ITool, IAIProvider, AIProviderResponse, ToolExecutionContext } from './interfaces';
import { ConversationState, IncomingMessage, OutgoingMessage, AgentPolicy } from './types';

export class MockLogger implements ILogger {
  info(msg: string, meta?: Record<string, unknown> | unknown) {}
  warn(msg: string, meta?: Record<string, unknown> | unknown) {}
  error(msg: string, meta?: Record<string, unknown> | unknown) {}
  debug(msg: string, meta?: Record<string, unknown> | unknown) {}
}

export class InMemoryConversationContext implements IConversationContext {
  private states = new Map<string, ConversationState>();
  private messages = new Map<string, (IncomingMessage | OutgoingMessage)[]>();

  async getState(conversationId: string): Promise<ConversationState> {
    return this.states.get(conversationId) || ConversationState.AI_HANDLING;
  }

  async setState(conversationId: string, state: ConversationState): Promise<void> {
    this.states.set(conversationId, state);
  }

  async getHistory(conversationId: string, limit?: number): Promise<(IncomingMessage | OutgoingMessage)[]> {
    return this.messages.get(conversationId) || [];
  }

  async addMessage(conversationId: string, message: IncomingMessage | OutgoingMessage): Promise<void> {
    const history = this.messages.get(conversationId) || [];
    history.push(message);
    this.messages.set(conversationId, history);
  }
}

export class SimpleToolRegistry implements IToolRegistry {
  private tools = new Map<string, ITool>();

  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  registerTool(tool: ITool): void {
    this.tools.set(tool.name, tool);
  }
}

export class MockAIProvider implements IAIProvider {
  public nextResponse: AIProviderResponse = { text: 'Mock response' };

  async generateResponse(
    message: IncomingMessage,
    history: (IncomingMessage | OutgoingMessage)[],
    policy: AgentPolicy,
    tools: ITool[]
  ): Promise<AIProviderResponse> {
    return this.nextResponse;
  }
}
