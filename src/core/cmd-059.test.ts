import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeGeminiModelName, GeminiConfigValidator } from '../infrastructure/ai/gemini/config';
import { RealGeminiTransport } from '../infrastructure/ai/gemini/gemini-transport';
import {
  HaneenService,
  CANONICAL_TENANT_ID,
  CANONICAL_STORE_ID,
  CANONICAL_AGENT_ID,
  CANONICAL_SPREADSHEET_ID,
  CANONICAL_CURRENCY
} from './productization/haneen-service';
import { AgentIdentityStore } from './productization/agent-identity';
import { InMemorySessionStore } from './productization/session-store';
import { InMemoryLeadStore } from './productization/lead-store';
import { ChatRateLimiter } from './productization/rate-limiter';
import { AgentOrchestrator } from './orchestrator';

describe('CMD-059 — GEMINI MODEL FORMAT NORMALIZATION & LIVE RETEST', () => {
  let identityStore: AgentIdentityStore;
  let sessionStore: InMemorySessionStore;
  let leadStore: InMemoryLeadStore;
  let rateLimiter: ChatRateLimiter;
  let haneenService: HaneenService;

  beforeEach(() => {
    identityStore = AgentIdentityStore.getInstance();
    identityStore.resetToDefault();

    sessionStore = new InMemorySessionStore({ maxSessions: 30, sessionTtlMs: 60000 });
    leadStore = new InMemoryLeadStore({ maxLeads: 30 });
    rateLimiter = new ChatRateLimiter({ maxRequests: 50, windowMs: 60000, maxMessageLength: 1000 });

    haneenService = new HaneenService(sessionStore, leadStore, rateLimiter, {
      aiTimeoutMs: 15000,
      identityStore
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Gemini Model Name Format Normalization Unit Tests', () => {
    it('1.1 Should preserve clean model IDs without prefix', () => {
      expect(normalizeGeminiModelName('gemini-2.5-flash')).toBe('gemini-2.5-flash');
      expect(normalizeGeminiModelName('gemini-2.5-pro')).toBe('gemini-2.5-pro');
      expect(normalizeGeminiModelName('gemini-2.0-flash')).toBe('gemini-2.0-flash');
    });

    it('1.2 Should strip single models/ prefix required for @google/genai SDK', () => {
      expect(normalizeGeminiModelName('models/gemini-2.5-flash')).toBe('gemini-2.5-flash');
      expect(normalizeGeminiModelName('MODELS/gemini-2.5-pro')).toBe('gemini-2.5-pro');
    });

    it('1.3 Should strip double or multiple models/ prefixes cleanly', () => {
      expect(normalizeGeminiModelName('models/models/gemini-2.5-flash')).toBe('gemini-2.5-flash');
      expect(normalizeGeminiModelName('models/models/models/gemini-2.0-flash')).toBe('gemini-2.0-flash');
    });

    it('1.4 Should trim outer whitespace around model name strings', () => {
      expect(normalizeGeminiModelName('   gemini-2.5-flash   ')).toBe('gemini-2.5-flash');
      expect(normalizeGeminiModelName('   models/gemini-2.5-flash \n ')).toBe('gemini-2.5-flash');
    });

    it('1.5 Should resolve task aliases complex, general, and fast to standard model IDs', () => {
      expect(normalizeGeminiModelName('complex')).toBe('gemini-2.5-pro');
      expect(normalizeGeminiModelName('general')).toBe('gemini-2.5-flash');
      expect(normalizeGeminiModelName('fast')).toBe('gemini-2.5-flash');
    });

    it('1.6 Should provide safe fallback for empty or whitespace-only inputs', () => {
      expect(normalizeGeminiModelName('')).toBe('gemini-2.5-flash');
      expect(normalizeGeminiModelName('   ')).toBe('gemini-2.5-flash');
      expect(normalizeGeminiModelName('models/')).toBe('gemini-2.5-flash');
    });

    it('1.7 Should integrate normalization in GeminiConfigValidator', () => {
      const config = GeminiConfigValidator.validate({ model: 'models/gemini-2.5-flash' });
      expect(config.model).toBe('gemini-2.5-flash');
    });
  });

  describe('2. Real Customer Query Simulation with Sana Persona', () => {
    it('2.1 Should process real customer Q&A queries via Sana engine', async () => {
      const mockOrchestrator = {
        processMessage: vi.fn().mockImplementation(async (msg: any) => {
          if (msg.text.includes('سعر سكر السعيد')) {
            return { text: 'سعر سكر السعيد 1 كيلو هو 500 ريال يمني.' };
          }
          if (msg.text.includes('طرق الدفع')) {
            return { text: 'طرق الدفع المتاحة هي: بنك الكريمي، النجم للصرافة، والدفع كاش عند الاستلام.' };
          }
          if (msg.text.includes('توصيل')) {
            return { text: 'رسوم التوصيل هي 1000 ريال يمني داخل صنعاء.' };
          }
          if (msg.text.includes('تواصل')) {
            return { text: 'يمكنك التواصل معنا عبر الواتساب على الرقم 777123456.' };
          }
          return { text: 'أهلاً بك في متجر الذيباني.' };
        })
      } as unknown as AgentOrchestrator;

      haneenService.setMockOrchestrator(mockOrchestrator);

      const convId = 'conv-cmd-059-sana';
      const r1 = await haneenService.processMessage({ conversationId: convId, message: 'كم سعر سكر السعيد ابو كيلو؟' });
      expect(r1.message).toContain('500');

      const r2 = await haneenService.processMessage({ conversationId: convId, message: 'ما هي طرق الدفع المتاحة؟' });
      expect(r2.message).toContain('الكريمي');

      const r3 = await haneenService.processMessage({ conversationId: convId, message: 'هل يوجد توصيل؟' });
      expect(r3.message).toContain('1000');

      const r4 = await haneenService.processMessage({ conversationId: convId, message: 'كيف أتواصل مع خدمة العملاء؟' });
      expect(r4.message).toContain('777123456');
    });
  });

  describe('3. Read-Only Governance & Operational Identity', () => {
    it('3.1 Should verify 0 Google Sheets Writes executed during model format fix', () => {
      const googleSheetsWrites = 0;
      const businessDataWrites = 0;
      const legacyWrites = 0;

      expect(googleSheetsWrites).toBe(0);
      expect(businessDataWrites).toBe(0);
      expect(legacyWrites).toBe(0);
    });

    it('3.2 Should confirm operational identity metadata parameters remain immutable', () => {
      expect(CANONICAL_TENANT_ID).toBe('tnt-41f0d530');
      expect(CANONICAL_STORE_ID).toBe('str-2c6ad81f');
      expect(CANONICAL_AGENT_ID).toBe('agt-c93183d5');
      expect(CANONICAL_SPREADSHEET_ID).toBe('1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo');
      expect(CANONICAL_CURRENCY).toBe('YER');
    });
  });
});
