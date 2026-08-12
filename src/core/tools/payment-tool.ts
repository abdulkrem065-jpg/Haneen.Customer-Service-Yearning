import { IDataProvider, DataOperationContext } from '../data/provider';
import { PaymentMethod } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export class PaymentTool {
  constructor(private readonly paymentMethodProvider: IDataProvider<PaymentMethod>) {}

  async getPaymentMethods(
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<PaymentMethod[]>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    const result = await this.paymentMethodProvider.search({}, context);
    const activeMethods = result.items
      .filter((m) => m.isActive)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    return NoHallucinationGuard.evaluateData(activeMethods, { entityNameAr: 'طرق الدفع' });
  }
}
