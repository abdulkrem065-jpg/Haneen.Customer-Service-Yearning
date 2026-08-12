import { IDataProvider, DataOperationContext } from '../data/provider';
import { FeatureToggle } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export class FeatureToggleTool {
  constructor(private readonly featureToggleProvider?: IDataProvider<FeatureToggle>) {}

  async isFeatureEnabled(
    key: string,
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<boolean>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    if (!this.featureToggleProvider) {
      return {
        state: 'KNOWN',
        data: true,
        message: `الميزة ${key} مفعلة افتراضياً.`,
        isConfirmed: true
      };
    }

    const result = await this.featureToggleProvider.search({ filters: { key } }, context);
    const toggle = result.items.find((t) => t.key.toLowerCase() === key.toLowerCase());

    if (!toggle) {
      return {
        state: 'KNOWN',
        data: true,
        message: `الميزة ${key} غير محددة بشكل خاص، تعتبر مفعلة افتراضياً.`,
        isConfirmed: true
      };
    }

    return {
      state: toggle.isEnabled ? 'KNOWN' : 'INACTIVE',
      data: toggle.isEnabled,
      message: toggle.isEnabled ? `الميزة ${key} مفعلة.` : `الميزة ${key} معطلة.`,
      isConfirmed: true
    };
  }
}
