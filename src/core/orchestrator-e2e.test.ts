import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { AgentOrchestrator } from './orchestrator';
import { ILogger, IConversationContext, IToolRegistry, IAIProvider } from './interfaces';
import { IncomingMessage, ConversationState, AgentPolicy } from './types';
import { ProductSearchTool } from './tools/product-search-tool';
import { ProductGetTool } from './tools/product-get-tool';
import { DataUnavailableError, DataNotFoundError, UnauthorizedDataAccessError } from './data/errors';

describe('CMD-014: End-to-End Orchestrator Scenarios', () => {
  let mockLogger: ILogger;
  let mockAiProvider: IAIProvider;
  let mockConversationContext: IConversationContext;
  let mockToolRegistry: IToolRegistry;
  let defaultPolicy: AgentPolicy;
  let mockProductProvider: any;
  let orchestrator: AgentOrchestrator;
  let tools: any[];
  
  beforeEach(() => {
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    mockConversationContext = {
      getState: vi.fn().mockResolvedValue(undefined),
      setState: vi.fn().mockResolvedValue(undefined),
      getHistory: vi.fn().mockResolvedValue([]),
      addMessage: vi.fn().mockResolvedValue(undefined),
    };
    mockProductProvider = {
      search: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    
    tools = [new ProductSearchTool(mockProductProvider), new ProductGetTool(mockProductProvider)];
    mockToolRegistry = {
      getTool: vi.fn().mockImplementation((name) => tools.find(t => t.name === name)),
      getAllTools: vi.fn().mockReturnValue(tools),
      registerTool: vi.fn(),
    };
    
    mockAiProvider = {
      generateResponse: vi.fn(),
    };
    
    defaultPolicy = { persona: 'Test', language: 'en', tone: 'friendly', rules: [], handoffRules: [], toolUsageRules: [] };
    orchestrator = new AgentOrchestrator(mockLogger, mockAiProvider, mockConversationContext, mockToolRegistry, defaultPolicy);
  });

  const createIncomingMessage = (text: string, tenantId = 't1', storeId = 's1', channel = 'WEB'): IncomingMessage => ({
    context: { messageId: 'msg1', conversationId: 'c1', customerId: 'cust1', channel, timestamp: new Date(), tenantId, storeId, agentId: 'a1' },
    text
  });

  it('Scenario A: Customer asks "هل لديكم أرز؟" (Do you have rice?)', async () => {
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({
      text: 'Let me check.',
      toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'rice' } }]
    }));
    mockProductProvider.search.mockResolvedValueOnce({
      items: [{ id: '1', name: 'Rice 5kg', price: 20, currency: 'USD', inStock: true }],
      totalCount: 1, hasMore: false
    });
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async (msg, hist, pol, tools, results) => {
      const data: any = results![0].result.data;
      return { text: `Yes, we have ${data.items[0].name}.` };
    });

    const res = await orchestrator.processMessage(createIncomingMessage('هل لديكم أرز؟'));
    expect(res.text).toBe('Yes, we have Rice 5kg.');
    expect(mockProductProvider.search).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 't1', storeId: 's1' }));
  });

  it('Scenario B: Ask about non-existent product -> Safe response', async () => {
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({
      text: '', toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'unicorn' } }]
    }));
    mockProductProvider.search.mockResolvedValueOnce({ items: [], totalCount: 0, hasMore: false });
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({
      text: 'Sorry, we do not have that.'
    }));

    const res = await orchestrator.processMessage(createIncomingMessage('Do you have unicorns?'));
    expect(res.text).toBe('Sorry, we do not have that.');
  });

  it('Scenario C: Ask for product price -> comes from data', async () => {
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({
      text: '', toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'milk' } }]
    }));
    mockProductProvider.search.mockResolvedValueOnce({
      items: [{ id: '2', name: 'Milk', price: 5, currency: 'USD', inStock: true }],
      totalCount: 1, hasMore: false
    });
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async (m, h, p, t, results) => {
      const data: any = results![0].result.data;
      return { text: `The price is ${data.items[0].price} ${data.items[0].currency}.` };
    });

    const res = await orchestrator.processMessage(createIncomingMessage('How much is milk?'));
    expect(res.text).toBe('The price is 5 USD.');
  });

  it('Scenario D: AI attempts to inject tenantId/storeId -> Trusted context wins', async () => {
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({
      text: '', toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'apple', tenantId: 'hacker', storeId: 'hacker' } }]
    }));
    mockProductProvider.search.mockResolvedValueOnce({ items: [], totalCount: 0, hasMore: false });
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({ text: 'Done.' }));

    await orchestrator.processMessage(createIncomingMessage('find apple', 't1', 's1'));
    
    expect(mockProductProvider.search).toHaveBeenCalledWith(
      expect.not.objectContaining({ tenantId: 'hacker' }),
      expect.objectContaining({ tenantId: 't1', storeId: 's1' })
    );
  });

  it('Scenario E & F: Cross-Tenant/Store Isolation', async () => {
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({
      text: '', toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'apple' } }]
    }));
    mockProductProvider.search.mockRejectedValueOnce(new UnauthorizedDataAccessError('Access Denied'));
    
    const res = await orchestrator.processMessage(createIncomingMessage('apple', 't1', 's1'));
    expect(res.text).toBe("I'm sorry, but I don't have that information available at the moment.");
  });

  it('Scenario G: Data Provider unavailable -> Safe response', async () => {
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({
      text: '', toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'apple' } }]
    }));
    mockProductProvider.search.mockRejectedValueOnce(new DataUnavailableError('DB Down'));
    
    const res = await orchestrator.processMessage(createIncomingMessage('apple'));
    expect(res.text).toBe("I'm sorry, but I don't have that information available at the moment.");
  });

  it('Scenario H: Human Handoff', async () => {
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({
      text: 'Transferring you to a human.',
      suggestedState: ConversationState.HUMAN_HANDOFF
    }));

    const res = await orchestrator.processMessage(createIncomingMessage('agent please'));
    
    expect(res.handoffToHuman).toBe(true);
    expect(res.newState).toBe(ConversationState.WAITING_FOR_HUMAN);
    expect(mockConversationContext.setState).toHaveBeenCalledWith('c1', ConversationState.WAITING_FOR_HUMAN);
    
    // Test that the orchestrator respects the new state on the next message
    (mockConversationContext.getState as Mock).mockResolvedValueOnce(ConversationState.WAITING_FOR_HUMAN);
    const res2 = await orchestrator.processMessage(createIncomingMessage('hello?'));
    
    expect(res2.text).toBe('Please wait for a human agent.');
    expect(mockAiProvider.generateResponse).toHaveBeenCalledTimes(1);
  });

  it('Channel Independence: Should process WHATSAPP channel without modifying core logic', async () => {
    (mockAiProvider.generateResponse as Mock).mockImplementationOnce(async () => ({ text: 'Channel test' }));
    
    const msg = createIncomingMessage('hello', 't1', 's1', 'WHATSAPP');
    const res = await orchestrator.processMessage(msg);
    
    expect(res.text).toBe('Channel test');
  });
});
