export class AgentCoreError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AgentCoreError';
  }
}

export class AIProviderError extends AgentCoreError {
  constructor(message: string) { super(message, 'AI_PROVIDER_ERROR'); }
}

export class ToolExecutionError extends AgentCoreError {
  constructor(message: string) { super(message, 'TOOL_EXECUTION_ERROR'); }
}

export class DataUnavailableError extends AgentCoreError {
  constructor(message: string) { super(message, 'DATA_UNAVAILABLE'); }
}

export class InvalidMessageError extends AgentCoreError {
  constructor(message: string) { super(message, 'INVALID_MESSAGE'); }
}

import { UnauthorizedDataAccessError as DataUnauthorizedDataAccessError } from './data/errors';

export class UnauthorizedContextError extends AgentCoreError {
  constructor(message: string) { super(message, 'UNAUTHORIZED_CONTEXT'); }
}

export const UnauthorizedDataAccessError = DataUnauthorizedDataAccessError;
export type UnauthorizedDataAccessError = DataUnauthorizedDataAccessError;

export class ConversationError extends AgentCoreError {
  constructor(message: string) { super(message, 'CONVERSATION_ERROR'); }
}
