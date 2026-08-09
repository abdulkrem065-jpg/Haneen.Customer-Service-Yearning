import { IncomingMessage, OutgoingMessage, ConversationState, AgentPolicy } from './types';
import { ILogger, IConversationContext, IToolRegistry, IAIProvider, ToolExecutionResponse } from './interfaces';
import { InvalidMessageError, UnauthorizedContextError } from './errors';

export class AgentOrchestrator {
  private static MAX_TOOL_LOOPS = 3;

  constructor(
    private readonly logger: ILogger,
    private readonly aiProvider: IAIProvider,
    private readonly conversationContext: IConversationContext,
    private readonly toolRegistry: IToolRegistry,
    private readonly defaultPolicy: AgentPolicy
  ) {}

  async processMessage(message: IncomingMessage): Promise<OutgoingMessage> {
    const { context } = message;
    
    this.logger.info(`Processing message for conversation ${context.conversationId}`, { context });

    if (!context.tenantId || !context.storeId || !context.agentId) {
      throw new UnauthorizedContextError('Missing tenant context');
    }

    if (!message.text || message.text.trim() === '') {
      throw new InvalidMessageError('Message text cannot be empty');
    }

    try {
      const currentState = await this.conversationContext.getState(context.conversationId);
      
      if (currentState === ConversationState.CLOSED) {
        return this.createSystemResponse(context.conversationId, 'This conversation is closed.');
      }
      
      if (currentState === ConversationState.HUMAN_HANDOFF || currentState === ConversationState.WAITING_FOR_HUMAN) {
        return this.createSystemResponse(context.conversationId, 'Please wait for a human agent.');
      }

      await this.conversationContext.addMessage(context.conversationId, message);

      const history = await this.conversationContext.getHistory(context.conversationId);
      let aiResponse = await this.aiProvider.generateResponse(
        message,
        history,
        this.defaultPolicy,
        this.toolRegistry.getAllTools()
      );

      let finalState = aiResponse.suggestedState || ConversationState.AI_HANDLING;
      
      let loopCount = 0;
      let isDataUnavailable = false;

      while (aiResponse.toolCalls && aiResponse.toolCalls.length > 0 && loopCount < AgentOrchestrator.MAX_TOOL_LOOPS) {
        loopCount++;
        const toolResults: ToolExecutionResponse[] = [];
        
        for (const call of aiResponse.toolCalls) {
          const tool = this.toolRegistry.getTool(call.name);
          if (tool) {
            this.logger.info(`Executing tool ${call.name}`, { params: call.params });
            const result = await tool.execute(call.params, context);
            
            if (result.isDataUnavailable) {
               isDataUnavailable = true;
               this.logger.warn(`Data unavailable for tool ${call.name}`);
               break; 
            }
            
            toolResults.push({ name: call.name, result });
            
            if (!result.success) {
               this.logger.error(`Tool execution failed for ${call.name}`, { error: result.error });
            }
          } else {
            this.logger.warn(`Tool ${call.name} not found in registry`);
            toolResults.push({ name: call.name, result: { success: false, error: 'Tool not found' } });
          }
        }

        if (isDataUnavailable) {
          break;
        }

        // Feed results back to AI Provider
        aiResponse = await this.aiProvider.generateResponse(
          message,
          history,
          this.defaultPolicy,
          this.toolRegistry.getAllTools(),
          toolResults
        );
        finalState = aiResponse.suggestedState || ConversationState.AI_HANDLING;
      }

      if (isDataUnavailable) {
        return this.createResponse(context.conversationId, "I'm sorry, but I don't have that information available at the moment.", false, finalState);
      }

      const isHandoff = finalState === ConversationState.HUMAN_HANDOFF;
      if (isHandoff) {
        finalState = ConversationState.WAITING_FOR_HUMAN;
        await this.conversationContext.setState(context.conversationId, finalState);
      }

      const responseMessage = this.createResponse(context.conversationId, aiResponse.text, isHandoff, finalState);
      await this.conversationContext.addMessage(context.conversationId, responseMessage);

      return responseMessage;
    } catch (error: unknown) {
      this.logger.error('Error processing message', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  private createSystemResponse(conversationId: string, text: string): OutgoingMessage {
     return this.createResponse(conversationId, text, false, undefined);
  }

  private createResponse(conversationId: string, text: string, handoffToHuman: boolean, newState?: ConversationState): OutgoingMessage {
    return {
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      text,
      handoffToHuman,
      newState
    };
  }
}
