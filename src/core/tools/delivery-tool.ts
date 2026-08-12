import { IDataProvider, DataOperationContext } from '../data/provider';
import { DeliveryConfiguration, DeliveryZone } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export class DeliveryTool {
  constructor(
    private readonly deliveryConfigProvider: IDataProvider<DeliveryConfiguration>,
    private readonly deliveryZoneProvider?: IDataProvider<DeliveryZone>
  ) {}

  async getDeliveryConfiguration(
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<DeliveryConfiguration>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    const result = await this.deliveryConfigProvider.search({}, context);
    const configs = result.items;

    if (configs.length === 0) {
      return NoHallucinationGuard.evaluateData(null, { entityNameAr: 'إعدادات التوصيل' });
    }

    const activeConfig = configs.find((c) => c.isEnabled);
    if (!activeConfig) {
      return {
        state: 'INACTIVE',
        data: null,
        message: 'خدمة التوصيل غير مفعّلة حالياً في إعدادات المتجر.',
        isConfirmed: false
      };
    }

    return NoHallucinationGuard.evaluateData(activeConfig, { entityNameAr: 'إعدادات التوصيل' });
  }

  async getDeliveryZones(
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<DeliveryZone[]>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    if (!this.deliveryZoneProvider) {
      return NoHallucinationGuard.evaluateData([], { entityNameAr: 'مناطق التوصيل' });
    }

    const result = await this.deliveryZoneProvider.search({}, context);
    const activeZones = result.items
      .filter((z) => z.isActive)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    return NoHallucinationGuard.evaluateData(activeZones, { entityNameAr: 'مناطق التوصيل' });
  }
}
