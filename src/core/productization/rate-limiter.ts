export interface RateLimiterOptions {
  windowMs?: number; // Time window in milliseconds (default: 60,000ms = 1 min)
  maxRequests?: number; // Max requests allowed per window (default: 30)
  maxMessageLength?: number; // Max allowed message length (default: 1000)
}

export interface ValidationResult {
  valid: boolean;
  errorCode?: 'EMPTY_MESSAGE' | 'MAX_LENGTH_EXCEEDED' | 'RATE_LIMIT_EXCEEDED';
  errorMessage?: string;
}

export class ChatRateLimiter {
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private windowMs: number;
  private maxRequests: number;
  private maxMessageLength: number;

  constructor(options?: RateLimiterOptions) {
    this.windowMs = options?.windowMs ?? 60000;
    this.maxRequests = options?.maxRequests ?? 30;
    this.maxMessageLength = options?.maxMessageLength ?? 1000;
  }

  public validateAndRateLimit(message: string, clientKey: string): ValidationResult {
    this.cleanupExpiredRecords();

    // 1. Check for empty or whitespace message
    if (!message || message.trim().length === 0) {
      return {
        valid: false,
        errorCode: 'EMPTY_MESSAGE',
        errorMessage: 'عذراً، لا يمكن إرسال رسالة فارغة.'
      };
    }

    // 2. Check max message length
    if (message.length > this.maxMessageLength) {
      return {
        valid: false,
        errorCode: 'MAX_LENGTH_EXCEEDED',
        errorMessage: `عذراً، تجاوزت الرسالة الحد الأقصى المسموح به (${this.maxMessageLength} حرفاً).`
      };
    }

    // 3. Check rate limiting per client key (IP or conversationId)
    const now = Date.now();
    const clientRecord = this.requestCounts.get(clientKey);

    if (!clientRecord || now > clientRecord.resetTime) {
      this.requestCounts.set(clientKey, { count: 1, resetTime: now + this.windowMs });
    } else {
      clientRecord.count += 1;
      if (clientRecord.count > this.maxRequests) {
        return {
          valid: false,
          errorCode: 'RATE_LIMIT_EXCEEDED',
          errorMessage: 'تم تجاوز عدد المحاولات المسموح بها مؤقتاً. يرجى الانتظار دقيقة واحدة ثم إعادة المحاولة.'
        };
      }
    }

    return { valid: true };
  }

  public cleanupExpiredRecords(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, record] of this.requestCounts.entries()) {
      if (now > record.resetTime) {
        this.requestCounts.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  public reset(): void {
    this.requestCounts.clear();
  }
}
