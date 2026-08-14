export interface ChatMessageItem {
  id: string;
  text: string;
  sender: 'USER' | 'AGENT';
  timestamp: Date;
}

export interface ConversationSession {
  conversationId: string;
  tenantId: string;
  storeId: string;
  agentId: string;
  messages: ChatMessageItem[];
  createdAt: Date;
  updatedAt: Date;
  status: 'ACTIVE' | 'REQUIRES_HUMAN' | 'CLOSED';
  handoffState?: {
    reason: string;
    requestedAt: Date;
  };
  leadState?: {
    name?: string;
    phone?: string;
    serviceType?: string;
    email?: string;
    userConfirmed: boolean;
    status: 'PENDING' | 'CONFIRMED';
  };
}

export class InMemorySessionStore {
  private sessions: Map<string, ConversationSession> = new Map();

  public getSession(conversationId: string): ConversationSession | undefined {
    return this.sessions.get(conversationId);
  }

  public getOrCreateSession(
    conversationId: string,
    context: { tenantId: string; storeId: string; agentId: string }
  ): ConversationSession {
    let session = this.sessions.get(conversationId);

    if (!session) {
      session = {
        conversationId,
        tenantId: context.tenantId,
        storeId: context.storeId,
        agentId: context.agentId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'ACTIVE'
      };
      this.sessions.set(conversationId, session);
    }

    return session;
  }

  public updateSession(session: ConversationSession): void {
    session.updatedAt = new Date();
    this.sessions.set(session.conversationId, session);
  }

  public addMessage(conversationId: string, message: ChatMessageItem): ConversationSession | undefined {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.messages.push(message);
      session.updatedAt = new Date();
      this.sessions.set(conversationId, session);
    }
    return session;
  }

  public clear(): void {
    this.sessions.clear();
  }
}
