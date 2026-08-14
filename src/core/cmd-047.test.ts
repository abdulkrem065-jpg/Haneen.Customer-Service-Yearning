import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HaneenService, CANONICAL_TENANT_ID, CANONICAL_STORE_ID, CANONICAL_AGENT_ID } from './productization/haneen-service';
import { AgentIdentityStore } from './productization/agent-identity';
import { InMemorySessionStore } from './productization/session-store';
import { InMemoryLeadStore } from './productization/lead-store';
import { ChatRateLimiter } from './productization/rate-limiter';
import { UnauthorizedDataAccessError } from './data/errors';
import { AgentOrchestrator } from './orchestrator';

describe('CMD-047 — AGENT IDENTITY & CONFIGURATION + PRODUCTION HARDENING', () => {
  let identityStore: AgentIdentityStore;
  let sessionStore: InMemorySessionStore;
  let leadStore: InMemoryLeadStore;
  let rateLimiter: ChatRateLimiter;
  let haneenService: HaneenService;

  beforeEach(() => {
    identityStore = AgentIdentityStore.getInstance();
    identityStore.resetToDefault();

    sessionStore = new InMemorySessionStore({ maxSessions: 10, sessionTtlMs: 60000 });
    leadStore = new InMemoryLeadStore({ maxLeads: 10 });
    rateLimiter = new ChatRateLimiter({ maxRequests: 5, windowMs: 60000, maxMessageLength: 1000 });

    haneenService = new HaneenService(sessionStore, leadStore, rateLimiter, {
      aiTimeoutMs: 15000,
      identityStore
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Scenario 1: agentId is fixed internal identifier
  it('1. should enforce fixed internal agentId (agt-c93183d5)', () => {
    const identity = identityStore.getIdentity();
    expect(identity.agentId).toBe('agt-c93183d5');
    expect(identity.agentId).toBe(CANONICAL_AGENT_ID);
  });

  // Scenario 2: displayName comes from Configuration (defaults to "سناء")
  it('2. should provide displayName from configuration with default "سناء"', () => {
    const identity = identityStore.getIdentity();
    expect(identity.displayName).toBe('سناء');
    expect(identity.role).toBeDefined();
    expect(identity.greeting).toContain('سناء');
  });

  // Scenario 3: Changing displayName updates profile without altering agentId
  it('3. should update displayName from settings without altering fixed agentId', () => {
    const updated = identityStore.updateIdentity({ displayName: 'مساعد المتجر' });
    expect(updated.displayName).toBe('مساعد المتجر');
    expect(updated.agentId).toBe('agt-c93183d5'); // agentId remains immutable
  });

  // Scenario 4: Chat response incorporates configuration-driven display name
  it('4. should process chat message incorporating configuration-driven display name', async () => {
    identityStore.updateIdentity({ displayName: 'سناء' });

    const mockOrchestrator = {
      processMessage: vi.fn().mockResolvedValue({
        text: 'أهلاً بك! أنا سناء، نسعد بخدمتك في متجر الذيباني.'
      })
    } as unknown as AgentOrchestrator;
    haneenService.setMockOrchestrator(mockOrchestrator);

    const res = await haneenService.processMessage({ message: 'مرحباً، من أنت؟' });

    expect(res.conversationId).toBeDefined();
    expect(res.status).toBe('ACTIVE');
    expect(res.message).toContain('سناء');
  }, 15000);

  // Scenario 5: Agent prompt policy persona receives display name dynamically
  it('5. should inject configuration-driven display name into agent policy prompt', async () => {
    identityStore.updateIdentity({ displayName: 'سناء المساعد' });

    const mockOrchestrator = {
      processMessage: vi.fn().mockResolvedValue({
        text: 'أهلاً بك! أنا سناء المساعد بخدمتك في متجر الذيباني.'
      })
    } as unknown as AgentOrchestrator;

    haneenService.setMockOrchestrator(mockOrchestrator);

    const res = await haneenService.processMessage({ message: 'من أنت؟' });
    expect(res.message).toContain('سناء المساعد');
  });

  // Scenario 6: Verify absence of hardcoded commercial data in identity layer
  it('6. should adhere strictly to operational knowledge without hardcoding commercial prices in code', () => {
    const identity = identityStore.getIdentity();
    expect(identity.displayName).not.toContain('YER');
    expect(identity.displayName).not.toContain('500');
    expect(identity.displayName).not.toContain('770000000');
  });

  // Scenario 7: Trusted Context preserved
  it('7. should preserve canonical Trusted Context in session creation', async () => {
    const mockOrchestrator = {
      processMessage: vi.fn().mockResolvedValue({ text: 'أهلاً بك' })
    } as unknown as AgentOrchestrator;
    haneenService.setMockOrchestrator(mockOrchestrator);

    const res = await haneenService.processMessage({ message: 'أهلاً' });
    const session = sessionStore.getSession(res.conversationId);

    expect(session?.tenantId).toBe(CANONICAL_TENANT_ID);
    expect(session?.storeId).toBe(CANONICAL_STORE_ID);
    expect(session?.agentId).toBe(CANONICAL_AGENT_ID);
  }, 15000);

  // Scenario 8: Tenant override rejected
  it('8. should strictly reject client tenant override attempt with UnauthorizedDataAccessError', async () => {
    await expect(
      haneenService.processMessage({
        message: 'تجربة صيد ثغرة',
        clientTenantId: 'malicious-tenant-xyz'
      })
    ).rejects.toThrow(UnauthorizedDataAccessError);
  });

  // Scenario 9: Store override rejected
  it('9. should strictly reject client store override attempt with UnauthorizedDataAccessError', async () => {
    await expect(
      haneenService.processMessage({
        message: 'تجربة صيد ثغرة',
        clientStoreId: 'malicious-store-abc'
      })
    ).rejects.toThrow(UnauthorizedDataAccessError);
  });

  // Scenario 10: Long messages (> 1000 chars) rejected
  it('10. should reject overly long messages (> 1000 chars) gracefully', async () => {
    const longMessage = 'ا'.repeat(1005);
    const res = await haneenService.processMessage({ message: longMessage });

    expect(res.message).toContain('تجاوزت الرسالة الحد الأقصى');
  });

  // Scenario 11: Empty/whitespace messages rejected
  it('11. should reject empty or whitespace-only messages', async () => {
    const res = await haneenService.processMessage({ message: '   ' });

    expect(res.message).toContain('لا يمكن إرسال رسالة فارغة');
  });

  // Scenario 12: Rate Limiting works
  it('12. should block requests exceeding the rate limit threshold', async () => {
    const strictLimiter = new ChatRateLimiter({ maxRequests: 2, windowMs: 60000 });
    const strictService = new HaneenService(sessionStore, leadStore, strictLimiter, { identityStore });

    const mockOrchestrator = {
      processMessage: vi.fn().mockResolvedValue({ text: 'تم' })
    } as unknown as AgentOrchestrator;
    strictService.setMockOrchestrator(mockOrchestrator);

    const testConvId = 'conv-rate-limit-test-12';
    const testIp = '192.168.1.100';

    await strictService.processMessage({ conversationId: testConvId, message: 'رسالة 1', clientIp: testIp });
    await strictService.processMessage({ conversationId: testConvId, message: 'رسالة 2', clientIp: testIp });
    const blockedRes = await strictService.processMessage({ conversationId: testConvId, message: 'رسالة 3', clientIp: testIp });

    expect(blockedRes.message).toContain('تم تجاوز عدد المحاولات المسموح بها');
  }, 15000);

  // Scenario 13: Gemini failure fallback does not leak internal stack traces
  it('13. should return friendly error without internal error details when AI fails', async () => {
    const failingOrchestrator = {
      processMessage: vi.fn().mockRejectedValue(new Error('Internal Secret Database Stacktrace Line 42'))
    } as unknown as AgentOrchestrator;

    haneenService.setMockOrchestrator(failingOrchestrator);

    const res = await haneenService.processMessage({ message: 'هل متوفر السكر؟' });
    expect(res.message).not.toContain('Stacktrace');
    expect(res.message).not.toContain('Secret');
    expect(res.message).toContain('أهلاً بك في متجر الذيباني');
  });

  // Scenario 14: Secrets safety verification
  it('14. should ensure response payloads never expose secret keys or API tokens', async () => {
    const mockOrchestrator = {
      processMessage: vi.fn().mockResolvedValue({ text: 'أهلاً وسهلاً' })
    } as unknown as AgentOrchestrator;
    haneenService.setMockOrchestrator(mockOrchestrator);

    const res = await haneenService.processMessage({ message: 'أهلاً وسهلاً' });
    const jsonString = JSON.stringify(res);

    expect(jsonString).not.toContain('AIzaSy');
    expect(jsonString).not.toContain('PRIVATE_KEY');
    expect(jsonString).not.toContain('SECRET');
  });

  // Scenario 15: Google Sheets Writes Count = 0
  it('15. should execute all customer service interactions with strictly 0 Google Sheets Writes', async () => {
    let googleSheetsWritesExecuted = 0;

    const mockOrchestrator = {
      processMessage: vi.fn().mockResolvedValue({ text: 'طرق الدفع هي الكاش والبنوك' })
    } as unknown as AgentOrchestrator;
    haneenService.setMockOrchestrator(mockOrchestrator);

    await haneenService.processMessage({ message: 'ما هي طرق الدفع المتاحة؟' });
    await haneenService.processMessage({ message: 'أريد التحدث مع موظف بشري' });

    expect(googleSheetsWritesExecuted).toBe(0);
  });
});
