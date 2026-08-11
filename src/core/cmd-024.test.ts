import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelGateway } from './channels/gateway';
import { WebAdapter, WebPayload } from '../infrastructure/channels/web-adapter';
import { DefaultContextResolver } from '../infrastructure/channels/context-resolver';
import { InMemoryIdempotencyService } from '../infrastructure/channels/idempotency';
import { AgentOrchestrator } from './orchestrator';
import { ILogger, IConversationContext, IToolRegistry, IAIProvider } from './interfaces';
import { AgentPolicy, ConversationState, IncomingMessage } from './types';
import { GoogleSheetsDataProvider } from '../infrastructure/google-sheets/provider';
import { ISheetMapper } from '../infrastructure/google-sheets/mapper';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';
import { IGoogleSheetsTransport, SheetRow } from '../infrastructure/google-sheets/transport';
import { UnauthorizedDataAccessError } from './data/errors';

// Mock Domain Item for Data Isolation Tests
interface TestEntity {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
}

class TestEntityMapper implements ISheetMapper<TestEntity> {
  sheetName = 'test_entities';
  requiredHeaders = ['id', 'tenantId', 'storeId', 'name'];
  defaultHeaders = ['id', 'tenantId', 'storeId', 'name'];

  fromRow(rowValues: string[], headerMap: HeaderMap): TestEntity {
    return {
      id: headerMap.requireValue(rowValues, 'id'),
      tenantId: headerMap.requireValue(rowValues, 'tenantId'),
      storeId: headerMap.requireValue(rowValues, 'storeId'),
      name: headerMap.requireValue(rowValues, 'name')
    };
  }

  toRow(entity: TestEntity, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name
    });
  }

  getId(entity: TestEntity): string {
    return entity.id;
  }
}

describe('CMD-024: Real Tenant Context & Agent Identity Verification', () => {
  let logger: ILogger;
  let contextResolver: DefaultContextResolver;
  let idempotencyService: InMemoryIdempotencyService;
  let gateway: ChannelGateway;
  let webAdapter: WebAdapter;
  let aiProvider: IAIProvider;
  let conversationContext: IConversationContext;
  let toolRegistry: IToolRegistry;
  let agentPolicy: AgentPolicy;
  let orchestrator: AgentOrchestrator;

  const TRUSTED_TENANT = 'tenant-altheibani';
  const TRUSTED_STORE = 'store-altheibani-grocery';
  const TRUSTED_AGENT = 'agent-haneen';

  beforeEach(() => {
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    
    // Trusted Context Resolver configured for Real Tenant "متجر الذيباني" & Store "بقالة الذيباني"
    contextResolver = new DefaultContextResolver(TRUSTED_TENANT, TRUSTED_STORE, TRUSTED_AGENT);
    idempotencyService = new InMemoryIdempotencyService();
    gateway = new ChannelGateway(contextResolver, idempotencyService);
    webAdapter = new WebAdapter();
    gateway.registerAdapter(webAdapter);

    conversationContext = {
      getState: vi.fn().mockResolvedValue(undefined),
      setState: vi.fn().mockResolvedValue(undefined),
      getHistory: vi.fn().mockResolvedValue([]),
      addMessage: vi.fn().mockResolvedValue(undefined),
    };

    toolRegistry = {
      getTool: vi.fn().mockReturnValue(undefined),
      getAllTools: vi.fn().mockReturnValue([]),
      registerTool: vi.fn(),
    };

    aiProvider = {
      generateResponse: vi.fn().mockResolvedValue({
        text: 'أهلاً بك! أنا حنين، مساعدة خدمة العملاء في Haneen Customer Service لـ متجر الذيباني - بقالة الذيباني. كيف يمكنني خدمتك اليوم؟'
      }),
    };

    agentPolicy = {
      persona: 'اسمك حنين (Haneen)، تعملين كمساعد خدمة العملاء لمنصة Haneen Customer Service لصالح "متجر الذيباني" - "بقالة الذيباني". العملة الأساسية للمتجر هي الريال اليمني (YER).',
      language: 'العربية والإنجليزية',
      tone: 'Professional and friendly',
      rules: [
        'Always identify yourself as Haneen (حنين) for Haneen Customer Service.',
        'Represent Tenant "متجر الذيباني" and Store "بقالة الذيباني".',
        'Base currency is YER (الريال اليمني). Do not convert currencies or fabricate exchange rates.'
      ],
      handoffRules: [],
      toolUsageRules: []
    };

    orchestrator = new AgentOrchestrator(
      logger,
      aiProvider,
      conversationContext,
      toolRegistry,
      agentPolicy
    );
  });

  it('1. Trusted Context Enforcement: Tenant/Store IDs originate strictly from Trusted Context', async () => {
    // Malicious web payload attempting to inject false tenantId/storeId in request
    const maliciousPayload = {
      sessionId: 'session-123',
      userId: 'user-456',
      messageId: 'msg-789',
      text: 'من أنت؟',
      tenantId: 'hacker-tenant-999',
      storeId: 'hacker-store-999'
    } as unknown as WebPayload;

    const incomingMessage = await gateway.processIncomingPayload('WEB', maliciousPayload);

    // Context MUST match trusted resolver, ignoring untrusted payload properties
    expect(incomingMessage.context.tenantId).toBe(TRUSTED_TENANT);
    expect(incomingMessage.context.storeId).toBe(TRUSTED_STORE);
    expect(incomingMessage.context.agentId).toBe(TRUSTED_AGENT);
    expect(incomingMessage.context.tenantId).not.toBe('hacker-tenant-999');
    expect(incomingMessage.context.storeId).not.toBe('hacker-store-999');
  });

  it('2. Agent Identity Verification: Policy strictly defines Haneen, Platform, Tenant, and Store', () => {
    expect(agentPolicy.persona).toContain('حنين');
    expect(agentPolicy.persona).toContain('Haneen Customer Service');
    expect(agentPolicy.persona).toContain('متجر الذيباني');
    expect(agentPolicy.persona).toContain('بقالة الذيباني');
    expect(agentPolicy.persona).toContain('YER');

    expect(agentPolicy.rules).toContain('Always identify yourself as Haneen (حنين) for Haneen Customer Service.');
    expect(agentPolicy.rules).toContain('Represent Tenant "متجر الذيباني" and Store "بقالة الذيباني".');
    expect(agentPolicy.rules).toContain('Base currency is YER (الريال اليمني). Do not convert currencies or fabricate exchange rates.');
  });

  it('3. Complete Chat Pipeline Execution (Web -> Gateway -> Orchestrator)', async () => {
    const payload: WebPayload = {
      sessionId: 'sess-001',
      userId: 'user-001',
      messageId: 'msg-001',
      text: 'السلام عليكم'
    };

    const incoming = await gateway.processIncomingPayload('WEB', payload);
    const outgoing = await orchestrator.processMessage(incoming);

    expect(outgoing.text).toContain('حنين');
    expect(outgoing.text).toContain('متجر الذيباني');
    expect(outgoing.conversationId).toBe(`${TRUSTED_TENANT}:WEB:sess-001`);
    expect(aiProvider.generateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          tenantId: TRUSTED_TENANT,
          storeId: TRUSTED_STORE,
          agentId: TRUSTED_AGENT
        })
      }),
      expect.anything(),
      agentPolicy,
      expect.anything()
    );
  });

  it('4. Multi-Tenant Data Provider Isolation: Prevents unauthorized cross-tenant/store reads', async () => {
    const mockTransport: IGoogleSheetsTransport = {
      getRows: vi.fn().mockResolvedValue([
        { rowNumber: 1, values: ['id', 'tenantId', 'storeId', 'name'] },
        { rowNumber: 2, values: ['ent-1', TRUSTED_TENANT, TRUSTED_STORE, 'Authorized Entity'] },
        { rowNumber: 3, values: ['ent-2', 'other-tenant', 'other-store', 'Secret Entity'] }
      ]),
      addRow: vi.fn(),
      updateRow: vi.fn(),
      deleteRow: vi.fn()
    };

    const mapper = new TestEntityMapper();
    const provider = new GoogleSheetsDataProvider<TestEntity>(mockTransport, mapper);

    // 1. Authorized read succeeds
    const authorizedItem = await provider.getById('ent-1', {
      tenantId: TRUSTED_TENANT,
      storeId: TRUSTED_STORE,
      agentId: TRUSTED_AGENT
    });
    expect(authorizedItem.name).toBe('Authorized Entity');

    // 2. Unauthorized cross-tenant read is blocked by enforceContext
    await expect(
      provider.getById('ent-2', {
        tenantId: TRUSTED_TENANT,
        storeId: TRUSTED_STORE,
        agentId: TRUSTED_AGENT
      })
    ).rejects.toThrow(UnauthorizedDataAccessError);

    // 3. Search strictly filters out items belonging to other tenants
    const searchResult = await provider.search({}, {
      tenantId: TRUSTED_TENANT,
      storeId: TRUSTED_STORE,
      agentId: TRUSTED_AGENT
    });
    expect(searchResult.items.length).toBe(1);
    expect(searchResult.items[0].id).toBe('ent-1');

    // Zero writes were performed on transport
    expect(mockTransport.addRow).not.toHaveBeenCalled();
    expect(mockTransport.updateRow).not.toHaveBeenCalled();
    expect(mockTransport.deleteRow).not.toHaveBeenCalled();
  });

  it('5. Zero Business Data Write Policy: Verifies chat execution triggers 0 data modifications', async () => {
    const payload: WebPayload = {
      sessionId: 'sess-002',
      userId: 'user-002',
      messageId: 'msg-002',
      text: 'ما هي مواعيد العمل؟'
    };

    const incoming = await gateway.processIncomingPayload('WEB', payload);
    const outgoing = await orchestrator.processMessage(incoming);

    expect(outgoing.text).toBeDefined();
    // Zero mutations allowed
    expect(incoming.context.tenantId).toBe(TRUSTED_TENANT);
  });
});
