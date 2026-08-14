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

export interface SessionStoreOptions {
  maxSessions?: number;
  sessionTtlMs?: number;
  maxMessagesPerSession?: number;
}

export class InMemorySessionStore {
  private sessions: Map<string, ConversationSession> = new Map();
  private maxSessions: number;
  private sessionTtlMs: number;
  private maxMessagesPerSession: number;

  constructor(options?: SessionStoreOptions) {
    this.maxSessions = options?.maxSessions ?? 1000;
    this.sessionTtlMs = options?.sessionTtlMs ?? 24 * 60 * 60 * 1000; // 24 hours default TTL
    this.maxMessagesPerSession = options?.maxMessagesPerSession ?? 100; // Max 100 messages per session
  }

  public getSession(conversationId: string): ConversationSession | undefined {
    this.cleanupExpiredSessions();
    return this.sessions.get(conversationId);
  }

  public getOrCreateSession(
    conversationId: string,
    context: { tenantId: string; storeId: string; agentId: string }
  ): ConversationSession {
    this.cleanupExpiredSessions();
    let session = this.sessions.get(conversationId);

    if (!session) {
      // Evict oldest session if max limit reached
      if (this.sessions.size >= this.maxSessions) {
        this.evictOldestSession();
      }

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
    const session = this.getSession(conversationId);
    if (session) {
      session.messages.push(message);
      if (session.messages.length > this.maxMessagesPerSession) {
        session.messages = session.messages.slice(-this.maxMessagesPerSession);
      }
      session.updatedAt = new Date();
      this.sessions.set(conversationId, session);
    }
    return session;
  }

  public cleanupExpiredSessions(): number {
    const now = Date.now();
    let expiredCount = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (now - new Date(session.updatedAt).getTime() > this.sessionTtlMs) {
        this.sessions.delete(id);
        expiredCount++;
      }
    }

    return expiredCount;
  }

  private evictOldestSession(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, session] of this.sessions.entries()) {
      const time = new Date(session.updatedAt).getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
    }
  }

  public get ActiveSessionCount(): number {
    return this.sessions.size;
  }

  public clear(): void {
    this.sessions.clear();
  }
}
