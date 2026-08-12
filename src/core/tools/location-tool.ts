import { IDataProvider, DataOperationContext } from '../data/provider';
import { StoreLocation } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export class LocationTool {
  constructor(private readonly storeLocationProvider: IDataProvider<StoreLocation>) {}

  async getStoreLocations(
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<StoreLocation[]>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    const result = await this.storeLocationProvider.search({}, context);
    const activeLocations = result.items
      .filter((l) => l.isActive)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    return NoHallucinationGuard.evaluateData(activeLocations, { entityNameAr: 'مواقع وعناوين المتجر' });
  }
}
