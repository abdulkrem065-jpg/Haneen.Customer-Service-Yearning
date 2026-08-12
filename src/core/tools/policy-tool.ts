import { IDataProvider, DataOperationContext } from '../data/provider';
import { StorePolicy } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export class PolicyTool {
  constructor(private readonly storePolicyProvider: IDataProvider<StorePolicy>) {}

  async getStorePolicies(
    context: DataOperationContext,
    options?: { policyType?: string; tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<StorePolicy[]>> {
    NoHallucinationGuard.validateTrustedContext(options, context);

    const result = await this.storePolicyProvider.search({}, context);
    let activePolicies = result.items
      .filter((p) => p.isActive)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    if (options?.policyType) {
      const typeLower = options.policyType.toLowerCase();
      activePolicies = activePolicies.filter((p) => p.policyType.toLowerCase() === typeLower);
    }

    return NoHallucinationGuard.evaluateData(activePolicies, { entityNameAr: 'سياسات المتجر' });
  }
}
