export type ChannelType = 'WEB' | 'WHATSAPP' | 'TELEGRAM' | string;

export interface TenantContext {
  tenantId: string;
  storeId: string;
  agentId: string;
}

export interface MessageContext {
  messageId: string;
  conversationId: string;
  customerId: string;
  channel: ChannelType;
  timestamp: Date;
}

export interface IncomingMessage {
  context: TenantContext & MessageContext;
  text: string;
  metadata?: Record<string, unknown>;
}

export enum ConversationState {
  AI_HANDLING = 'AI_HANDLING',
  HUMAN_HANDOFF = 'HUMAN_HANDOFF',
  WAITING_FOR_HUMAN = 'WAITING_FOR_HUMAN',
  CLOSED = 'CLOSED'
}

export interface OutgoingMessage {
  messageId: string;
  conversationId: string;
  text: string;
  handoffToHuman: boolean;
  metadata?: Record<string, unknown>;
  newState?: ConversationState;
}

export interface AgentPolicy {
  persona: string;
  language: string;
  tone: string;
  rules: string[];
  handoffRules: string[];
  toolUsageRules: string[];
}
