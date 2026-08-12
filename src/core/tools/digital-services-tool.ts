import { IDataProvider, DataOperationContext } from '../data/provider';
import { DigitalService } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export class DigitalServicesTool {
  constructor(private readonly digitalServiceProvider: IDataProvider<DigitalService>) {}

  async getDigitalServices(
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<DigitalService[]>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    const result = await this.digitalServiceProvider.search({}, context);
    const activeServices = result.items
      .filter((s) => s.isActive)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    return NoHallucinationGuard.evaluateData(activeServices, { entityNameAr: 'الخدمات الرقمية' });
  }
}
