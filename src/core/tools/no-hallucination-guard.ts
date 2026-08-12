import { DataOperationContext } from '../data/provider';
import { UnauthorizedDataAccessError } from '../data/errors';

export type KnowledgeState = 'KNOWN' | 'UNKNOWN' | 'UNAVAILABLE' | 'INACTIVE' | 'REQUIRES_HUMAN';

export interface GuardEvaluationResult<T> {
  state: KnowledgeState;
  data: T | null;
  message: string;
  isConfirmed: boolean;
}

export class NoHallucinationGuard {
  /**
   * Enforces trusted execution scope and prevents client/prompt context override attacks.
   */
  static validateTrustedContext(
    requested: { tenantId?: string; storeId?: string } | undefined,
    trustedContext: DataOperationContext
  ): void {
    if (!trustedContext || !trustedContext.tenantId || !trustedContext.storeId) {
      throw new UnauthorizedDataAccessError('Invalid or missing trusted tenant context');
    }

    if (requested) {
      if (requested.tenantId && requested.tenantId !== trustedContext.tenantId) {
        throw new UnauthorizedDataAccessError(
          `Tenant override attack detected. Requested tenant '${requested.tenantId}' does not match trusted tenant '${trustedContext.tenantId}'`
        );
      }
      if (requested.storeId && requested.storeId !== trustedContext.storeId) {
        throw new UnauthorizedDataAccessError(
          `Store override attack detected. Requested store '${requested.storeId}' does not match trusted store '${trustedContext.storeId}'`
        );
      }
    }
  }

  /**
   * Evaluates availability and activity status of store data.
   */
  static evaluateData<T>(
    data: T | null | undefined,
    options?: {
      entityNameAr?: string;
      entityNameEn?: string;
      isEnabled?: boolean;
      isActive?: boolean;
    }
  ): GuardEvaluationResult<T> {
    const entityAr = options?.entityNameAr || 'البيانات المطلوبة';

    // 1. Check feature toggle / explicit disabled flag
    if (options?.isEnabled === false || options?.isActive === false) {
      return {
        state: 'INACTIVE',
        data: null as unknown as T,
        message: `${entityAr} غير مفعّلة حالياً في إعدادات المتجر.`,
        isConfirmed: false
      };
    }

    // 2. Check null/empty
    if (data === null || data === undefined) {
      return {
        state: 'UNKNOWN',
        data: null as unknown as T,
        message: `${entityAr} غير محددة في بيانات المتجر.`,
        isConfirmed: false
      };
    }

    if (Array.isArray(data) && data.length === 0) {
      return {
        state: 'UNKNOWN',
        data: [] as unknown as T,
        message: `لم يتم العثور على أي ${entityAr} في بيانات المتجر.`,
        isConfirmed: false
      };
    }

    // 3. Known and confirmed
    return {
      state: 'KNOWN',
      data,
      message: `${entityAr} متوفرة ومؤكدة.`,
      isConfirmed: true
    };
  }
}
