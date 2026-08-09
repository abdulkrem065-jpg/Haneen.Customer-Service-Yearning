import { IConversationContext } from '../../core/interfaces';
import { ConversationState, IncomingMessage, OutgoingMessage } from '../../core/types';

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
