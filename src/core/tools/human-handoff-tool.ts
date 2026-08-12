import { IDataProvider, DataOperationContext } from '../data/provider';
import { HumanHandoff } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export interface HumanHandoffInput {
  conversationId: string;
  reason: string;
  summary: string;
  tenantId?: string;
  storeId?: string;
}

export class HumanHandoffTool {
  constructor(private readonly humanHandoffProvider: IDataProvider<HumanHandoff>) {}

  async requestHandoff(
    input: HumanHandoffInput,
    context: DataOperationContext
  ): Promise<GuardEvaluationResult<HumanHandoff>> {
    NoHallucinationGuard.validateTrustedContext(input, context);

    if (!input.conversationId) {
      return {
        state: 'UNKNOWN',
        data: null,
        message: 'معرف المحادثة مطلوب لتحويل المحادثة لموظف الدعم.',
        isConfirmed: false
      };
    }

    const handoffData: Omit<HumanHandoff, 'id' | 'tenantId' | 'storeId' | 'createdAt' | 'updatedAt'> = {
      conversationId: input.conversationId,
      reason: input.reason || 'CUSTOMER_REQUEST',
      summary: input.summary || 'طلب التحويل لموظف خدمة العملاء',
      status: 'PENDING'
    };

    const record = await this.humanHandoffProvider.create(handoffData, context);

    return {
      state: 'REQUIRES_HUMAN',
      data: record,
      message: 'تم تحويل المحادثة إلى فريق الدعم البشري. يرجى الانتظار لحين انضمام أحد ممثلي الخدمة.',
      isConfirmed: true
    };
  }
}
