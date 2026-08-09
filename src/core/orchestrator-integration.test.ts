import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { AgentOrchestrator } from './orchestrator';
import { ILogger, IConversationContext, IToolRegistry, IAIProvider } from './interfaces';
import { IncomingMessage, ConversationState, AgentPolicy } from './types';
import { ProductSearchTool } from './tools/product-search-tool';
import { ProductGetTool } from './tools/product-get-tool';
import { DataUnavailableError, DataNotFoundError, UnauthorizedDataAccessError } from './data/errors';

describe('AgentOrchestrator Integration with Tools and Provider', () => {
  let mockLogger: ILogger;
  let mockAiProvider: IAIProvider;
  let mockConversationContext: IConversationContext;
  let mockToolRegistry: IToolRegistry;
  let defaultPolicy: AgentPolicy;
  let mockProductProvider: any;
  let orchestrator: AgentOrchestrator;
  let tools: any[];

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

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

    const searchTool = new ProductSearchTool(mockProductProvider);
    const getTool = new ProductGetTool(mockProductProvider);
    tools = [searchTool, getTool];

    mockToolRegistry = {
      getTool: vi.fn().mockImplementation((name) => tools.find(t => t.name === name)),
      getAllTools: vi.fn().mockReturnValue(tools),
      registerTool: vi.fn(),
    };

    mockAiProvider = {
      generateResponse: vi.fn(),
    };

    defaultPolicy = {
      persona: 'Test',
      language: 'en',
      tone: 'friendly',
      rules: [],
      handoffRules: [],
      toolUsageRules: [],
    };

    orchestrator = new AgentOrchestrator(
      mockLogger,
      mockAiProvider,
      mockConversationContext,
      mockToolRegistry,
      defaultPolicy
    );
  });

  const createIncomingMessage = (text: string, tenantId = 't1', storeId = 's1'): IncomingMessage => ({
    context: {
      messageId: 'msg1',
      conversationId: 'c1',
      customerId: 'cust1',
      channel: 'WEB',
      timestamp: new Date(),
      tenantId,
      storeId,
      agentId: 'a1'
    },
    text
  });

  it('1. Agent -> Tool -> IDataProvider (Happy Path)', async () => {
    (mockAiProvider.generateResponse as Mock).mockResolvedValueOnce({
      text: 'Here is what I found.',
      toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'apple' } }]
    }).mockResolvedValueOnce({
      text: 'Here is what I found.'
    });

    mockProductProvider.search.mockResolvedValue({
      items: [{ id: '1', name: 'Apple', price: 10, currency: 'USD', inStock: true }],
      totalCount: 1,
      hasMore: false
    });

    const response = await orchestrator.processMessage(createIncomingMessage('find apple'));
    
    expect(mockProductProvider.search).toHaveBeenCalledWith(
      { searchTerm: 'apple', limit: 10 },
      expect.objectContaining({ tenantId: 't1', storeId: 's1' })
    );
    expect(response.text).toBe('Here is what I found.');
  });

  it('6 & 7. AI Override Protection', async () => {
    (mockAiProvider.generateResponse as Mock).mockResolvedValueOnce({
      text: 'Trying to override context.',
      toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'apple', tenantId: 'malicious', storeId: 'malicious' } }]
    }).mockResolvedValueOnce({
      text: 'Trying to override context.'
    });

    mockProductProvider.search.mockResolvedValue({ items: [], totalCount: 0, hasMore: false });

    await orchestrator.processMessage(createIncomingMessage('find apple', 't1', 's1'));
    
    expect(mockProductProvider.search).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 't1', storeId: 's1' })
    );
  });

  it('9. DataUnavailable returns graceful error', async () => {
    (mockAiProvider.generateResponse as Mock).mockResolvedValue({
      text: 'Let me check.',
      toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'apple' } }]
    });

    mockProductProvider.search.mockRejectedValue(new DataUnavailableError('DB is down'));

    const response = await orchestrator.processMessage(createIncomingMessage('find apple'));
    
    expect(response.text).toBe("I'm sorry, but I don't have that information available at the moment.");
  });

  it('8. DataNotFoundError in ProductGetTool returns graceful message inside tool result', async () => {
    (mockAiProvider.generateResponse as Mock).mockResolvedValueOnce({
      text: 'Let me check.',
      toolCalls: [{ name: 'ProductGetTool', params: { productId: '999' } }]
    }).mockResolvedValueOnce({
      text: 'Let me check.'
    });

    mockProductProvider.getById.mockRejectedValue(new DataNotFoundError('Not found'));

    const response = await orchestrator.processMessage(createIncomingMessage('get 999'));
    expect(response.text).toBe('Let me check.'); 
    expect(mockProductProvider.getById).toHaveBeenCalledWith('999', expect.objectContaining({ tenantId: 't1' }));
  });
});
