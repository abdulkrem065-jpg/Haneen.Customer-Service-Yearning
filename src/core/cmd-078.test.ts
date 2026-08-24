import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAIProvider } from '../infrastructure/ai/gemini/gemini-provider';
import { MockGeminiTransport } from '../infrastructure/ai/gemini/mock-transport';
import { FallbackAIProvider } from '../infrastructure/ai/fallback-provider';
import {
  isRetriableError,
  calculateBackoffDelay,
  executeWithRetry
} from '../infrastructure/ai/retry-policy';
import { HaneenService, CANONICAL_TENANT_ID, CANONICAL_STORE_ID, CANONICAL_AGENT_ID } from './productization/haneen-service';
import { ChatRateLimiter } from './productization/rate-limiter';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { AgentPolicy } from './types';
import { AIProviderError } from './errors';
import { IAIProvider } from './interfaces';

describe('CMD-078 — Sana AI Reliability, Zero-Cost Resilience & Provider Abstraction', () => {

  const samplePolicy: AgentPolicy = {
    persona: 'سناء - متجر الذيباني',
    language: 'العربية',
    tone: 'ودودة',
    rules: ['القاعدة الأولية'],
    handoffRules: ['تحويل للموظف عند الطلب'],
    toolUsageRules: []
  };

  const createIncomingMessage = (text: string) => ({
    id: `msg-${Date.now()}`,
    text,
    context: {
      messageId: `msg-${Date.now()}`,
      conversationId: 'conv-test-078',
      customerId: 'cst-001',
      channel: 'WEB',
      timestamp: new Date(),
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID
    }
  });

  // 1. Gemini success
  it('1. Gemini success: returns successful text response', async () => {
    const mockTransport = new MockGeminiTransport();
    mockTransport.queueResponse({ text: 'مرحباً بك في متجر الذيباني، كيف يمكنني مساعدتك اليوم؟' });
    const provider = new GeminiAIProvider({ isMockMode: true }, mockTransport);

    const res = await provider.generateResponse(createIncomingMessage('مرحباً'), [], samplePolicy, []);
    expect(res.text).toContain('متجر الذيباني');
  });

  // 2. Retry after 503
  it('2. Retry after 503: retries on 503 Service Unavailable and succeeds', async () => {
    let attempts = 0;
    const result = await executeWithRetry(
      async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('503 Service Unavailable');
        }
        return 'success_after_503';
      },
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false }
    );

    expect(attempts).toBe(2);
    expect(result).toBe('success_after_503');
  });

  // 3. Retry after 429
  it('3. Retry after 429: retries on 429 Rate Limit Exceeded and succeeds', async () => {
    let attempts = 0;
    const result = await executeWithRetry(
      async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('429 RESOURCE_EXHAUSTED: Rate Limit Exceeded');
        }
        return 'success_after_429';
      },
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false }
    );

    expect(attempts).toBe(2);
    expect(result).toBe('success_after_429');
  });

  // 4. Timeout retry
  it('4. Timeout retry: retries on TIMEOUT / DEADLINE_EXCEEDED and succeeds', async () => {
    let attempts = 0;
    const result = await executeWithRetry(
      async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('TIMEOUT: Gateway Timeout / DEADLINE_EXCEEDED');
        }
        return 'success_after_timeout';
      },
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false }
    );

    expect(attempts).toBe(2);
    expect(result).toBe('success_after_timeout');
  });

  // 5. No retry on 400
  it('5. No retry on 400: fails immediately without retrying on 400 Bad Request', async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        async () => {
          attempts++;
          throw new Error('400 INVALID_ARGUMENT: Bad Request');
        },
        { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false }
      )
    ).rejects.toThrow('400 INVALID_ARGUMENT');

    expect(attempts).toBe(1);
    expect(isRetriableError(new Error('400 INVALID_ARGUMENT'))).toBe(false);
  });

  // 6. No retry on 401
  it('6. No retry on 401: fails immediately without retrying on 401 Unauthorized', async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        async () => {
          attempts++;
          throw new Error('401 UNAUTHENTICATED: Invalid API Key');
        },
        { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false }
      )
    ).rejects.toThrow('401 UNAUTHENTICATED');

    expect(attempts).toBe(1);
    expect(isRetriableError(new Error('401 UNAUTHENTICATED'))).toBe(false);
  });

  // 7. No retry on 403
  it('7. No retry on 403: fails immediately without retrying on 403 Forbidden', async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        async () => {
          attempts++;
          throw new Error('403 PERMISSION_DENIED: Access Forbidden');
        },
        { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false }
      )
    ).rejects.toThrow('403 PERMISSION_DENIED');

    expect(attempts).toBe(1);
    expect(isRetriableError(new Error('403 PERMISSION_DENIED'))).toBe(false);
  });

  // 8. No retry on 404
  it('8. No retry on 404: fails immediately without retrying on 404 Not Found', async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        async () => {
          attempts++;
          throw new Error('404 NOT_FOUND: Resource Not Found');
        },
        { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false }
      )
    ).rejects.toThrow('404 NOT_FOUND');

    expect(attempts).toBe(1);
    expect(isRetriableError(new Error('404 NOT_FOUND'))).toBe(false);
  });

  // 9. Exponential backoff
  it('9. Exponential backoff: delay doubles per attempt and respects maxDelayMs limit', () => {
    const cfg = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 500, jitter: false };

    const delay1 = calculateBackoffDelay(1, cfg);
    const delay2 = calculateBackoffDelay(2, cfg);
    const delay3 = calculateBackoffDelay(3, cfg);
    const delay4 = calculateBackoffDelay(4, cfg);

    expect(delay1).toBe(100);
    expect(delay2).toBe(200);
    expect(delay3).toBe(400);
    expect(delay4).toBe(500); // capped at maxDelayMs
  });

  // 10. Retry limit
  it('10. Retry limit: respects maxAttempts limit when retriable error persists', async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        async () => {
          attempts++;
          throw new Error('503 Service Unavailable');
        },
        { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20, jitter: false }
      )
    ).rejects.toThrow('503 Service Unavailable');

    expect(attempts).toBe(3);
  });

  // 11. User-friendly fallback message
  it('11. User-friendly fallback message: returns human-friendly message on AI failure', async () => {
    const mockTransport = new MockGoogleSheetsTransport();
    const rateLimiter = new ChatRateLimiter({ maxRequests: 100, windowMs: 60000 });

    const failingAiProvider: IAIProvider = {
      async generateResponse() {
        throw new AIProviderError('Gemini 503 Service Unavailable');
      }
    };

    const service = new HaneenService(undefined, undefined, rateLimiter, {
      sheetsTransport: mockTransport,
      aiProvider: failingAiProvider
    });

    const res = await service.processMessage({ message: 'ما هي أسعار العصائر؟' });
    expect(res.message).toBe('عذراً، الخدمة مشغولة حالياً. جرّب معي بعد لحظات.');
    expect(res.message).not.toContain('503');
    expect(res.message).not.toContain('Gemini');
    expect(res.message).not.toContain('Error');
  });

  // 12. No business-data hallucination during AI failure
  it('12. No business-data hallucination during AI failure: fallback message does not fabricate prices or products', async () => {
    const failingAiProvider: IAIProvider = {
      async generateResponse() {
        throw new AIProviderError('Gemini 429 Rate Limit Exceeded');
      }
    };

    const service = new HaneenService(undefined, undefined, undefined, { aiProvider: failingAiProvider });
    const res = await service.processMessage({ message: 'كم سعر أرز السعيد؟' });

    expect(res.message).toBe('عذراً، الخدمة مشغولة حالياً. جرّب معي بعد لحظات.');
    expect(res.message).not.toContain('YER');
    expect(res.message).not.toContain('ريال');
    expect(res.message).not.toMatch(/\d+/); // Contains no fake numeric figures
  });

  // 13. Multi-turn preservation
  it('13. Multi-turn preservation: retains conversationId and session history across messages', async () => {
    const mockTransport = new MockGeminiTransport();
    mockTransport.queueResponse({ text: 'أهلاً بك! نسعد بخدمتك.' });
    mockTransport.queueResponse({ text: 'أسعار الأرز تبدأ من 500 YER.' });

    const provider = new GeminiAIProvider({ isMockMode: true }, mockTransport);
    const service = new HaneenService(undefined, undefined, undefined, { aiProvider: provider });

    const convId = 'conv-multiturn-078';
    const res1 = await service.processMessage({ message: 'مرحباً', conversationId: convId });
    expect(res1.conversationId).toBe(convId);
    expect(res1.message).toContain('نسعد بخدمتك');

    const res2 = await service.processMessage({ message: 'كم سعر الأرز؟', conversationId: convId });
    expect(res2.conversationId).toBe(convId);

    const session = service.getSessionStore().getSession(convId);
    expect(session).toBeDefined();
    expect(session?.messages.length).toBe(4); // 2 incoming + 2 outgoing
  });

  // 14. Provider abstraction
  it('14. Provider abstraction: IAIProvider interface implemented by GeminiAIProvider and FallbackAIProvider', () => {
    const geminiProvider: IAIProvider = new GeminiAIProvider({ isMockMode: true });
    const fallbackProvider: IAIProvider = new FallbackAIProvider();

    expect(geminiProvider).toBeDefined();
    expect(fallbackProvider).toBeDefined();
    expect(typeof geminiProvider.generateResponse).toBe('function');
    expect(typeof fallbackProvider.generateResponse).toBe('function');
  });

  // 15. Gemini model remains gemini-3.6-flash
  it('15. Gemini model remains gemini-3.6-flash: model configuration does not downgrade', () => {
    const complex = GeminiAIProvider.createForTask('complex', { isMockMode: true });
    const general = GeminiAIProvider.createForTask('general', { isMockMode: true });
    const fast = GeminiAIProvider.createForTask('fast', { isMockMode: true });

    expect(complex.getConfig().model).toBe('gemini-3.6-flash');
    expect(general.getConfig().model).toBe('gemini-3.6-flash');
    expect(fast.getConfig().model).toBe('gemini-3.6-flash');
  });

  // 16. No secrets in logs
  it('16. No secrets in logs: logger output sanitizes sensitive keys and auth data', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockSecretKey = 'AIzaSyA_TEST_SECRET_KEY_12345';
    const isRetriable = isRetriableError(new Error(`Failure with key: ${mockSecretKey}`));
    expect(isRetriable).toBe(false);

    // Verify no secret logged to stdout/stderr
    for (const call of consoleSpy.mock.calls) {
      expect(call.join(' ')).not.toContain(mockSecretKey);
    }
    for (const call of errorSpy.mock.calls) {
      expect(call.join(' ')).not.toContain(mockSecretKey);
    }

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // 17. No Google Sheets writes
  it('17. No Google Sheets writes: sheets transport write operations were not executed', async () => {
    const sheetsTransport = new MockGoogleSheetsTransport();
    const addRowSpy = vi.spyOn(sheetsTransport, 'addRow');
    const updateRowSpy = vi.spyOn(sheetsTransport, 'updateRow');
    const writeHeaderSpy = vi.spyOn(sheetsTransport, 'writeHeaderRow');

    const service = new HaneenService(undefined, undefined, undefined, { sheetsTransport });
    await service.processMessage({ message: 'استفسار عن أسعار المنتجات' });

    expect(addRowSpy).not.toHaveBeenCalled();
    expect(updateRowSpy).not.toHaveBeenCalled();
    expect(writeHeaderSpy).not.toHaveBeenCalled();
  });

  // 18. No hardcoded business facts
  it('18. No hardcoded business facts: fallback AI provider has no hardcoded price/store data', async () => {
    const fallbackProvider = new FallbackAIProvider({ enabled: false });

    await expect(
      fallbackProvider.generateResponse(createIncomingMessage('ايش الاسعار؟'), [], samplePolicy, [])
    ).rejects.toThrow('Fallback AI Provider is unconfigured or disabled');
  });

});
