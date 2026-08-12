import { IDataProvider, DataOperationContext } from '../data/provider';
import { Lead } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export interface CaptureLeadInput {
  name: string;
  phone: string;
  email?: string;
  businessType?: string;
  requestedService?: string;
  branchCount?: number;
  currentSystem?: string;
  customerNeed?: string;
  source?: string;
  notes?: string;
  userConfirmed: boolean;
  tenantId?: string;
  storeId?: string;
}

export class LeadTool {
  constructor(private readonly leadProvider: IDataProvider<Lead>) {}

  async captureLead(
    input: CaptureLeadInput,
    context: DataOperationContext
  ): Promise<GuardEvaluationResult<Lead>> {
    NoHallucinationGuard.validateTrustedContext(input, context);

    if (!input.name || input.name.trim() === '') {
      return {
        state: 'UNKNOWN',
        data: null,
        message: 'الرجاء تزويدنا باسمك الكامل لرفع الطلب.',
        isConfirmed: false
      };
    }

    if (!input.phone || input.phone.trim() === '') {
      return {
        state: 'UNKNOWN',
        data: null,
        message: 'الرجاء تزويدنا برقم الهاتف لتأكيد طلب الخدمة.',
        isConfirmed: false
      };
    }

    if (!input.userConfirmed) {
      return {
        state: 'UNKNOWN',
        data: null,
        message: 'هل تؤكد موافقتك على تسجيل بيانات التواصل الخاصة بك لخدمتكم والتواصل معكم؟',
        isConfirmed: false
      };
    }

    const leadData: Omit<Lead, 'id' | 'tenantId' | 'storeId' | 'createdAt' | 'updatedAt'> = {
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim(),
      businessType: input.businessType,
      requestedService: input.requestedService,
      branchCount: input.branchCount,
      currentSystem: input.currentSystem,
      customerNeed: input.customerNeed,
      status: 'NEW',
      source: input.source || 'HANEEN_AGENT',
      notes: input.notes
    };

    const newLead = await this.leadProvider.create(leadData, context);

    return {
      state: 'KNOWN',
      data: newLead,
      message: 'تم تسجيل طلبك وبيانات التواصل بنجاح، وسيتواصل معك فريقنا في أقرب وقت.',
      isConfirmed: true
    };
  }
}
