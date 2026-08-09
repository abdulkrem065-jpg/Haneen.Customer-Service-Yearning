import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentOrchestrator } from './orchestrator';
import { MockLogger, InMemoryConversationContext, SimpleToolRegistry, MockAIProvider } from './mocks';
import { AgentPolicy, ConversationState, IncomingMessage, OutgoingMessage } from './types';
import { ITool, IToolResult, ToolExecutionContext } from './interfaces';
import { InvalidMessageError, UnauthorizedContextError } from './errors';

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let logger: MockLogger;
  let aiProvider: MockAIProvider;
  let context: InMemoryConversationContext;
  let registry: SimpleToolRegistry;
  let policy: AgentPolicy;

  beforeEach(() => {
    logger = new MockLogger();
    aiProvider = new MockAIProvider();
    context = new InMemoryConversationContext();
    registry = new SimpleToolRegistry();
    policy = {
      persona: 'Assistant',
      language: 'ar',
      tone: 'friendly',
      rules: [],
      handoffRules: [],
      toolUsageRules: []
    };
    orchestrator = new AgentOrchestrator(logger, aiProvider, context, registry, policy);
  });

  const createValidMessage = (text: string = 'Hello'): IncomingMessage => ({
    context: {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      agentId: 'agent-1',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      customerId: 'cust-1',
      channel: 'WEB',
      timestamp: new Date()
    },
    text
  });

  it('should process a valid message and return a response (Test 1)', async () => {
    aiProvider.nextResponse = { text: 'Hello, how can I help?' };
    const msg = createValidMessage('Hi');
    
    const response = await orchestrator.processMessage(msg);
    
    expect(response.text).toBe('Hello, how can I help?');
    expect(response.conversationId).toBe('conv-1');
  });

  it('should reject a message missing tenant context (Test 2)', async () => {
    const msg = createValidMessage('Hi');
    msg.context.tenantId = '';
    
    await expect(orchestrator.processMessage(msg)).rejects.toThrow(UnauthorizedContextError);
  });

  it('should call AI Provider and get response (Test 3)', async () => {
    aiProvider.nextResponse = { text: 'AI response' };
    const msg = createValidMessage('Question');
    
    const response = await orchestrator.processMessage(msg);
    
    expect(response.text).toBe('AI response');
  });

  it('should execute tool and handle failure gracefully (Test 4 & 5)', async () => {
    let toolExecuted = false;
    const failingTool: ITool = {
      name: 'getPrice',
      description: 'Gets product price',
      execute: async () => {
        toolExecuted = true;
        return { success: false, error: 'Database error' };
      }
    };
    registry.registerTool(failingTool);
    
    aiProvider.nextResponse = { 
      text: 'Let me check',
      toolCalls: [{ name: 'getPrice', params: { productId: '123' } }]
    };
    
    const msg = createValidMessage('Price?');
    const response = await orchestrator.processMessage(msg);
    
    expect(toolExecuted).toBe(true);
    expect(response.text).toBe('Let me check');
  });

  it('should pass trusted context to tool and prevent prompt injection (Security Test 1 & 2)', async () => {
    let executedContext: ToolExecutionContext | null = null;
    let executedParams: Record<string, unknown> | null = null;

    const secureTool: ITool = {
      name: 'secureData',
      description: 'Gets secure data',
      execute: async (params, context) => {
        executedParams = params;
        executedContext = context;
        return { success: true, data: 'secure data' };
      }
    };
    registry.registerTool(secureTool);

    // AI tries to override tenantId in params
    aiProvider.nextResponse = {
      text: 'Here is the data',
      toolCalls: [{ name: 'secureData', params: { tenantId: 'tenant-2', otherData: 'abc' } }]
    };

    const msg = createValidMessage('Get data');
    msg.context.tenantId = 'tenant-1'; // Trusted context

    await orchestrator.processMessage(msg);

    expect(executedParams.tenantId).toBe('tenant-2'); // AI generated param
    expect(executedContext.tenantId).toBe('tenant-1'); // Trusted context remains intact
  });

  it('should enforce cross-tenant isolation (Security Test 3)', async () => {
    const tenantSpecificTool: ITool = {
      name: 'getTenantData',
      description: 'Gets data only if tenant matches',
      execute: async (params, context) => {
        if (context.tenantId !== 'tenant-1') {
           return { success: false, error: 'Unauthorized access to tenant data' };
        }
        return { success: true, data: 'Tenant 1 Data' };
      }
    };
    registry.registerTool(tenantSpecificTool);

    aiProvider.nextResponse = {
      text: 'Getting tenant data',
      toolCalls: [{ name: 'getTenantData', params: {} }]
    };

    const validMsg = createValidMessage('Get data');
    validMsg.context.tenantId = 'tenant-1';
    
    const invalidMsg = createValidMessage('Get data');
    invalidMsg.context.tenantId = 'tenant-2';

    // The orchestrator passes the message context. The tool will check it.
    // In valid case, it should succeed (mock doesn't strictly track success in orchestrator response text yet, 
    // but we can spy on logger to see error)
    
    const loggerSpy = vi.spyOn(logger, 'error');
    
    await orchestrator.processMessage(validMsg);
    expect(loggerSpy).not.toHaveBeenCalled();

    await orchestrator.processMessage(invalidMsg);
    expect(loggerSpy).toHaveBeenCalledWith('Tool execution failed for getTenantData', { error: 'Unauthorized access to tenant data' });
  });

  it('should not invent data if tool says data unavailable (Test 6)', async () => {
    const unavailableTool: ITool = {
      name: 'getInventory',
      description: 'Check inventory',
      execute: async () => ({ success: false, isDataUnavailable: true })
    };
    registry.registerTool(unavailableTool);
    
    aiProvider.nextResponse = { 
      text: 'I found the item',
      toolCalls: [{ name: 'getInventory', params: {} }]
    };
    
    const msg = createValidMessage('Is it in stock?');
    const response = await orchestrator.processMessage(msg);
    
    expect(response.text).toContain("I don't have that information available");
  });

  it('should handle human handoff state (Test 7)', async () => {
    aiProvider.nextResponse = { 
      text: 'Transferring you to a human',
      suggestedState: ConversationState.HUMAN_HANDOFF
    };
    
    const msg = createValidMessage('Talk to human');
    const response = await orchestrator.processMessage(msg);
    
    expect(response.handoffToHuman).toBe(true);
    expect(response.newState).toBe(ConversationState.WAITING_FOR_HUMAN);
    
    const state = await context.getState('conv-1');
    expect(state).toBe(ConversationState.WAITING_FOR_HUMAN);
  });

  it('should isolate tenants based on context (Test 8)', async () => {
    // In our orchestrator, context is passed to everything. We verify we check for tenantId.
    const msg = createValidMessage('Hi');
    await orchestrator.processMessage(msg);
    
    const history = await context.getHistory('conv-1');
    expect(history.length).toBe(2); // The incoming message and outgoing response
    expect((history[0] as IncomingMessage).context.tenantId).toBe('tenant-1');
  });

  it('should maintain conversation history (Test 9)', async () => {
    await orchestrator.processMessage(createValidMessage('Msg 1'));
    await orchestrator.processMessage(createValidMessage('Msg 2'));
    
    const history = await context.getHistory('conv-1');
    expect(history.length).toBe(4); // 2 in, 2 out
  });

  it('should return valid Response Contract (Test 10)', async () => {
    aiProvider.nextResponse = { text: 'Valid response' };
    const msg = createValidMessage();
    const response = await orchestrator.processMessage(msg);
    
    expect(response).toHaveProperty('messageId');
    expect(response).toHaveProperty('conversationId');
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('handoffToHuman');
  });
});
