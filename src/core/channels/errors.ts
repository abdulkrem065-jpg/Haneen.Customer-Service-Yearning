import { ChannelType } from '../types';

export class ChannelError extends Error {
  constructor(message: string, public readonly channel: ChannelType) {
    super(message);
    this.name = 'ChannelError';
  }
}

export class InvalidPayloadError extends ChannelError {
  constructor(message: string, channel: ChannelType) {
    super(message, channel);
    this.name = 'InvalidPayloadError';
  }
}

export class InvalidContextError extends ChannelError {
  constructor(message: string, channel: ChannelType) {
    super(message, channel);
    this.name = 'InvalidContextError';
  }
}

export class DuplicateMessageError extends ChannelError {
  constructor(message: string, channel: ChannelType) {
    super(message, channel);
    this.name = 'DuplicateMessageError';
  }
}
