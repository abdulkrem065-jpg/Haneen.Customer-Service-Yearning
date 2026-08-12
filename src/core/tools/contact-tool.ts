import { IDataProvider, DataOperationContext } from '../data/provider';
import { StoreContact } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export class ContactTool {
  constructor(private readonly storeContactProvider: IDataProvider<StoreContact>) {}

  async getStoreContacts(
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<StoreContact[]>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    const result = await this.storeContactProvider.search({}, context);
    const activeContacts = result.items
      .filter((c) => c.isActive)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    return NoHallucinationGuard.evaluateData(activeContacts, { entityNameAr: 'قنوات التواصل' });
  }
}
