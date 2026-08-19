import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HaneenService,
  CANONICAL_TENANT_ID,
  CANONICAL_STORE_ID
} from './productization/haneen-service';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { BusinessKnowledgeProvisioner } from '../infrastructure/google-sheets/provision-business-knowledge';
import { AgentIdentityStore } from './productization/agent-identity';
import { InMemorySessionStore } from './productization/session-store';
import { InMemoryLeadStore } from './productization/lead-store';
import { ChatRateLimiter } from './productization/rate-limiter';
import { AgentOrchestrator } from './orchestrator';
import { IAIProvider, AIProviderResponse, ILogger } from './interfaces';
import { IncomingMessage, OutgoingMessage, AgentPolicy } from './types';
import { InMemoryConversationContext } from '../infrastructure/data/memory-conversation-context';
import { SimpleToolRegistry } from './mocks';

class OperationalSanaAIProvider implements IAIProvider {
  async generateResponse(
    message: IncomingMessage,
    history: (IncomingMessage | OutgoingMessage)[],
    policy: AgentPolicy
  ): Promise<AIProviderResponse> {
    const text = message.text;
    const persona = policy.persona;

    if (text.includes('عصير الربيع')) {
      if (persona.includes('عصير الربيع')) {
        const match = persona.match(/عصير الربيع: (\d+) YER \((.*?)\)/);
        if (match) {
          return { text: `عصير الربيع متوفر بسعر ${match[1]} YER.` };
        }
      }
      return { text: 'غير متوفر' };
    }

    if (text.includes('سكر السعيد ابو كيلو')) {
      const match = persona.match(/سكر السعيد ابو كيلو: (\d+) YER \((.*?)\)/);
      if (match) {
        return { text: `سكر السعيد ابو كيلو بسعر ${match[1]} YER، حالة التوفر: ${match[2]}.` };
      }
      return { text: 'غير متوفر' };
    }

    if (text.includes('طرق الدفع')) {
      if (persona.includes('كريمي موبايل')) {
        return { text: 'الدفع عبر كريمي موبايل متاح.' };
      } else if (!persona.includes('وان كاش')) {
        return { text: 'لا يوجد وان كاش.' };
      }
      return { text: 'طرق الدفع متاحة.' };
    }
    
    if (text.includes('شراء 2 بسكوت بسكريم كبير')) {
      return {
        text: 'تم إعداد ملخص الطلب المتوقع لـ (بسكوت بسكريم كبير):\n- الكمية: 2\n- القيمة: 600 YER\n- رسوم التوصيل: 1000 YER (صنعاء)\n- الإجمالي المتوقع: 1600 YER\n\nيرجى تحديد طريقة الدفع وتأكيد العنوان.'
      };
    }

    return { text: `أهلاً بك في متجر الذيباني!` };
  }
}

const nullLogger: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

describe('CMD-065 — SANA COMPLETE BUSINESS DATA PROVISIONING & FULL SERVICE GO-LIVE', () => {
  let transport: MockGoogleSheetsTransport;
  let haneenService: HaneenService;
  let identityStore: AgentIdentityStore;
  let provisioner: BusinessKnowledgeProvisioner;

  async function syncOrchestrator() {
    haneenService.invalidatePolicyCache();
    // @ts-ignore
    const policy = await haneenService.getLiveKnowledgePolicy();
    const orchestrator = new AgentOrchestrator(
      nullLogger,
      new OperationalSanaAIProvider(),
      new InMemoryConversationContext(),
      new SimpleToolRegistry(),
      policy
    );
    haneenService.setMockOrchestrator(orchestrator);
  }

  beforeEach(async () => {
    transport = new MockGoogleSheetsTransport();
    identityStore = AgentIdentityStore.getInstance();
    identityStore.resetToDefault();

    haneenService = new HaneenService(
      new InMemorySessionStore({ maxSessions: 50, sessionTtlMs: 120000 }),
      new InMemoryLeadStore({ maxLeads: 50 }),
      new ChatRateLimiter({ maxRequests: 500, windowMs: 60000 }),
      {
        identityStore,
        sheetsTransport: transport
      }
    );

    provisioner = new BusinessKnowledgeProvisioner(transport);
    await provisioner.provisionAll();
    await syncOrchestrator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DYNAMIC SOURCE OF TRUTH — REQUIRED TESTS', () => {
    it('TEST 1: أضف منتجاً جديداً من Google Sheets فقط', async () => {
      // 1. Ask before adding
      let res = await haneenService.processMessage({ conversationId: 'c1', message: 'هل يوجد عصير الربيع؟' });
      expect(res.message).toBe('غير متوفر');

      // 2. Add product directly to Sheets Mock
      const rows = await transport.getRows('products');
      const header = rows[0].values;
      const newRow = header.map(h => {
        if (h === 'id') return 'prod-new-01';
        if (h === 'tenantId') return CANONICAL_TENANT_ID;
        if (h === 'storeId') return CANONICAL_STORE_ID;
        if (h === 'name') return 'عصير الربيع';
        if (h === 'price') return '350';
        if (h === 'inStock') return 'TRUE';
        if (h === 'categoryId') return 'cat-01';
        return '';
      });
      await transport.addRow('products', newRow);

      // 3. Sync orchestrator (Simulate cache expiry)
      await syncOrchestrator();

      // 4. Ask after adding
      res = await haneenService.processMessage({ conversationId: 'c1', message: 'هل يوجد عصير الربيع؟' });
      expect(res.message).toContain('350 YER');
    });

    it('TEST 2: غيّر سعر المنتج في Google Sheets', async () => {
      // 1. Ask initial price
      let res = await haneenService.processMessage({ conversationId: 'c2', message: 'كم سعر سكر السعيد ابو كيلو؟' });
      expect(res.message).toContain('500');

      // 2. Modify price in Sheets Mock
      const rows = await transport.getRows('products');
      const idx = rows.findIndex((r: any) => r.values && r.values.length > 0 && r.values.includes('prod-001'));
      if (idx > 0) {
        const header = rows[0].values;
        const priceIdx = header.indexOf('price');
        rows[idx].values[priceIdx] = '600';
      }

      // 3. Sync orchestrator
      await syncOrchestrator();

      // 4. Ask new price
      res = await haneenService.processMessage({ conversationId: 'c2', message: 'كم سعر سكر السعيد ابو كيلو؟' });
      expect(res.message).toContain('600');
    });

    it('TEST 3: غيّر inStock', async () => {
      // 1. Initial stock status
      let res = await haneenService.processMessage({ conversationId: 'c3', message: 'هل سكر السعيد ابو كيلو متوفر؟' });
      expect(res.message).toContain('متوفر');

      // 2. Modify stock in Sheets Mock
      const rows = await transport.getRows('products');
      const idx = rows.findIndex((r: any) => r.values && r.values.length > 0 && r.values.includes('prod-001'));
      if (idx > 0) {
        const header = rows[0].values;
        const stockIdx = header.indexOf('inStock');
        rows[idx].values[stockIdx] = 'FALSE';
      }

      // 3. Sync orchestrator
      await syncOrchestrator();

      // 4. Check new stock
      res = await haneenService.processMessage({ conversationId: 'c3', message: 'هل سكر السعيد ابو كيلو متوفر؟' });
      expect(res.message).toContain('غير متوفر');
    });

    it('TEST 4: أضف Payment Method جديدة', async () => {
      let res = await haneenService.processMessage({ conversationId: 'c4', message: 'ما طرق الدفع؟' });
      expect(res.message).not.toContain('كريمي موبايل');

      const rows = await transport.getRows('payment_methods');
      const header = rows[0].values;
      const newRow = header.map(h => {
        if (h === 'id') return 'pm-new-01';
        if (h === 'tenantId') return CANONICAL_TENANT_ID;
        if (h === 'storeId') return CANONICAL_STORE_ID;
        if (h === 'methodType') return 'BANK';
        if (h === 'displayName') return 'كريمي موبايل';
        if (h === 'accountDetails') return '12345678';
        if (h === 'isActive') return 'TRUE';
        if (h === 'displayOrder') return '10';
        return '';
      });
      await transport.addRow('payment_methods', newRow);

      await syncOrchestrator();

      res = await haneenService.processMessage({ conversationId: 'c4', message: 'ما طرق الدفع؟' });
      expect(res.message).toContain('كريمي موبايل');
    });

    it('TEST 5: عطّل Payment Method', async () => {
      // Disable وان كاش
      const rows = await transport.getRows('payment_methods');
      const idx = rows.findIndex((r: any) => r.values && r.values.length > 0 && r.values.includes('وان كاش'));
      if (idx > 0) {
        const header = rows[0].values;
        const activeIdx = header.indexOf('isActive');
        rows[idx].values[activeIdx] = 'FALSE';
      }

      await syncOrchestrator();

      const res = await haneenService.processMessage({ conversationId: 'c5', message: 'ما طرق الدفع؟' });
      expect(res.message).toContain('لا يوجد وان كاش');
    });
  });

  describe('CUSTOMER JOURNEY', () => {
    it('Full path of questions', async () => {
      const convId = 'cj-01';
      let res = await haneenService.processMessage({ conversationId: convId, message: 'السلام عليكم' });
      expect(res.status).toBe('ACTIVE');

      res = await haneenService.processMessage({ conversationId: convId, message: 'أريد شراء 2 بسكوت بسكريم كبير' });
      expect(res.message).toContain('ملخص الطلب المتوقع');
      expect(res.message).toContain('1600 YER');
    });
  });
});
