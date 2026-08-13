import { describe, it, expect } from 'vitest';
import { DataOperationContext, IDataProvider, PaginatedResult, SearchQuery } from './data/provider';
import {
  BusinessHour,
  DeliveryConfiguration,
  DeliveryZone,
  StoreLocation,
  StorePolicy,
  DigitalService,
  Lead,
  HumanHandoff,
  PaymentMethod,
  StoreContact,
  FeatureToggle,
  Product
} from './data/domain';
import { UnauthorizedDataAccessError } from './errors';
import { NoHallucinationGuard } from './tools/no-hallucination-guard';
import { BusinessHoursTool } from './tools/business-hours-tool';
import { DeliveryTool } from './tools/delivery-tool';
import { LocationTool } from './tools/location-tool';
import { PolicyTool } from './tools/policy-tool';
import { PaymentTool } from './tools/payment-tool';
import { ContactTool } from './tools/contact-tool';
import { DigitalServicesTool } from './tools/digital-services-tool';
import { LeadTool } from './tools/lead-tool';
import { HumanHandoffTool } from './tools/human-handoff-tool';
import { FeatureToggleTool } from './tools/feature-toggle-tool';

// In-Memory Data Provider for Testing (Zero-Write to Google Sheets)
class InMemoryProvider<T extends { id: string; tenantId: string; storeId: string; createdAt: Date; updatedAt?: Date }>
  implements IDataProvider<T> {
  private items: T[] = [];
  public writeCount = 0;

  constructor(initialItems: T[] = []) {
    this.items = [...initialItems];
  }

  async getById(id: string, context: DataOperationContext): Promise<T> {
    const item = this.items.find((i) => i.id === id && i.tenantId === context.tenantId && i.storeId === context.storeId);
    if (!item) throw new Error('Data not found');
    return item;
  }

  async search(query: SearchQuery, context: DataOperationContext): Promise<PaginatedResult<T>> {
    const filtered = this.items.filter((i) => i.tenantId === context.tenantId && i.storeId === context.storeId);
    return {
      items: filtered,
      totalCount: filtered.length,
      hasMore: false
    };
  }

  async create(data: Omit<T, 'id' | 'tenantId' | 'storeId' | 'createdAt' | 'updatedAt'>, context: DataOperationContext): Promise<T> {
    this.writeCount++;
    const newItem = {
      ...data,
      id: `id_${Date.now()}_${Math.random()}`,
      tenantId: context.tenantId,
      storeId: context.storeId,
      createdAt: new Date(),
      updatedAt: new Date()
    } as T;
    this.items.push(newItem);
    return newItem;
  }

  async update(id: string, data: Partial<Omit<T, 'id' | 'tenantId' | 'storeId'>>, context: DataOperationContext): Promise<T> {
    this.writeCount++;
    const index = this.items.findIndex((i) => i.id === id && i.tenantId === context.tenantId && i.storeId === context.storeId);
    if (index === -1) throw new Error('Data not found');
    this.items[index] = { ...this.items[index], ...data, updatedAt: new Date() };
    return this.items[index];
  }

  async delete(id: string, context: DataOperationContext): Promise<boolean> {
    this.writeCount++;
    const index = this.items.findIndex((i) => i.id === id && i.tenantId === context.tenantId && i.storeId === context.storeId);
    if (index === -1) return false;
    this.items.splice(index, 1);
    return true;
  }
}

describe('CMD-034 — Operational Settings & Owner Control Center Tests', () => {
  const contextA: DataOperationContext = { tenantId: 'tenant_alpha', storeId: 'store_1', agentId: 'haneen_agent' };
  const contextB: DataOperationContext = { tenantId: 'tenant_beta', storeId: 'store_2', agentId: 'haneen_agent' };

  it('1. Business Hours: 24/7 operational mode', async () => {
    const provider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh_247',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        dayOfWeek: 'MONDAY',
        isClosed: false,
        is24Hours: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(provider);
    const targetDate = new Date('2026-08-10T12:00:00Z'); // Monday
    const status = await tool.getStoreStatus(contextA, { targetDate, timezone: 'UTC' });

    expect(status.state).toBe('KNOWN');
    expect(status.data?.status).toBe('24_7');
    expect(status.data?.isOpenNow).toBe(true);
  });

  it('2. Business Hours: Specific day query (e.g. Friday)', async () => {
    const provider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh_fri',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        dayOfWeek: 'FRIDAY',
        isClosed: true,
        notes: 'عطلة رسمية',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(provider);
    const friSchedule = await tool.getSpecificDaySchedule('FRIDAY', contextA);

    expect(friSchedule.state).toBe('KNOWN');
    expect(friSchedule.data?.isClosed).toBe(true);
  });

  it('3. Business Hours: Closed day evaluation', async () => {
    const provider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh_closed',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        dayOfWeek: 'FRIDAY',
        isClosed: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(provider);
    const targetDate = new Date('2026-08-14T15:00:00Z'); // Friday
    const status = await tool.getStoreStatus(contextA, { targetDate, timezone: 'UTC' });

    expect(status.state).toBe('KNOWN');
    expect(status.data?.status).toBe('CLOSED_TODAY');
    expect(status.data?.isOpenNow).toBe(false);
  });

  it('4. Business Hours: Split shift support (morning and evening shifts)', async () => {
    const provider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh_split',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        dayOfWeek: 'SATURDAY',
        isClosed: false,
        shifts: [
          { openingTime: '08:00', closingTime: '13:00' },
          { openingTime: '16:00', closingTime: '23:00' }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(provider);

    // During shift 1 (10:00 UTC)
    const res1 = await tool.getStoreStatus(contextA, { targetDate: new Date('2026-08-15T10:00:00Z'), timezone: 'UTC' });
    expect(res1.data?.isOpenNow).toBe(true);
    expect(res1.data?.activeShift?.closingTime).toBe('13:00');

    // Between shifts (14:30 UTC)
    const res2 = await tool.getStoreStatus(contextA, { targetDate: new Date('2026-08-15T14:30:00Z'), timezone: 'UTC' });
    expect(res2.data?.isOpenNow).toBe(false);
    expect(res2.data?.status).toBe('OPENS_LATER_TODAY');
    expect(res2.data?.nextOpeningTime).toBe('16:00');
  });

  it('5. Delivery: Disabled mode prevents offering delivery', async () => {
    const provider = new InMemoryProvider<DeliveryConfiguration>([
      {
        id: 'del_off',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        isEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new DeliveryTool(provider);
    const res = await tool.getDeliveryConfiguration(contextA);

    expect(res.state).toBe('INACTIVE');
    expect(res.data).toBeNull();
    expect(res.message).toContain('غير مفعّلة');
  });

  it('6. Delivery: Enabled mode without fees does not invent fees', async () => {
    const provider = new InMemoryProvider<DeliveryConfiguration>([
      {
        id: 'del_on',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new DeliveryTool(provider);
    const res = await tool.getDeliveryConfiguration(contextA);

    expect(res.state).toBe('KNOWN');
    expect(res.data?.isEnabled).toBe(true);
    expect(res.data?.deliveryFee).toBeUndefined(); // Zero hallucinated fees
  });

  it('7. Location: Optional location missing returns UNKNOWN state', async () => {
    const provider = new InMemoryProvider<StoreLocation>([]);
    const tool = new LocationTool(provider);
    const res = await tool.getStoreLocations(contextA);

    expect(res.state).toBe('UNKNOWN');
    expect(res.data).toEqual([]);
    expect(res.message).toContain('بيانات المتجر');
  });

  it('8. Policies: Empty policy type returns UNKNOWN without inventing policies', async () => {
    const provider = new InMemoryProvider<StorePolicy>([]);
    const tool = new PolicyTool(provider);
    const res = await tool.getStorePolicies(contextA, { policyType: 'PRIVACY_POLICY' });

    expect(res.state).toBe('UNKNOWN');
    expect(res.data).toEqual([]);
  });

  it('9. Payment Methods: Displays active payment methods only', async () => {
    const provider = new InMemoryProvider<PaymentMethod>([
      {
        id: 'pm1',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        methodType: 'BANK_TRANSFER',
        displayName: 'تحويل بنكي - بنك اليمن والكويت',
        isActive: true,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'pm2',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        methodType: 'PAYPAL',
        displayName: 'بايبال',
        isActive: false,
        displayOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new PaymentTool(provider);
    const res = await tool.getPaymentMethods(contextA);

    expect(res.state).toBe('KNOWN');
    expect(res.data?.length).toBe(1);
    expect(res.data?.[0].displayName).toContain('بنك اليمن والكويت');
  });

  it('10. Contact Channels: Active contact channels filter & displayOrder sort', async () => {
    const provider = new InMemoryProvider<StoreContact>([
      {
        id: 'c1',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        channelType: 'WHATSAPP',
        contactValue: '+967770000000',
        isActive: true,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'c2',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        channelType: 'PHONE',
        contactValue: '+96701200000',
        isActive: false,
        displayOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new ContactTool(provider);
    const res = await tool.getStoreContacts(contextA);

    expect(res.state).toBe('KNOWN');
    expect(res.data?.length).toBe(1);
    expect(res.data?.[0].channelType).toBe('WHATSAPP');
  });

  it('11. Digital Services: Commercial layer query for digital services', async () => {
    const provider = new InMemoryProvider<DigitalService>([
      {
        id: 'ds_store',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        name: 'خدمة إنشاء متجر إلكتروني متكامل',
        serviceType: 'ECOM_STORE',
        isActive: true,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new DigitalServicesTool(provider);
    const res = await tool.getDigitalServices(contextA);

    expect(res.state).toBe('KNOWN');
    expect(res.data?.length).toBe(1);
    expect(res.data?.[0].name).toContain('متجر إلكتروني');
  });

  it('12. Lead Capture: Requires explicit consent and validation', async () => {
    const provider = new InMemoryProvider<Lead>([]);
    const tool = new LeadTool(provider);

    // Consent missing -> asks for user confirmation
    const unconfirmed = await tool.captureLead(
      { name: 'عبدالله السقاف', phone: '771234567', userConfirmed: false },
      contextA
    );
    expect(unconfirmed.state).toBe('UNKNOWN');
    expect(unconfirmed.message).toContain('موافقتك');

    // Valid and confirmed lead creation
    const confirmed = await tool.captureLead(
      {
        name: 'عبدالله السقاف',
        phone: '771234567',
        requestedService: 'خدمة إنشاء متجر',
        userConfirmed: true
      },
      contextA
    );
    expect(confirmed.state).toBe('KNOWN');
    expect(confirmed.data?.status).toBe('NEW');
    expect(confirmed.data?.phone).toBe('771234567');
  });

  it('13. Human Handoff: Triggered on explicit request or complex issue', async () => {
    const provider = new InMemoryProvider<HumanHandoff>([]);
    const tool = new HumanHandoffTool(provider);

    const res = await tool.requestHandoff(
      { conversationId: 'conv_cmd034', reason: 'CUSTOMER_REQUEST', summary: 'طلب التحدث مع موظف' },
      contextA
    );

    expect(res.state).toBe('REQUIRES_HUMAN');
    expect(res.data?.status).toBe('PENDING');
  });

  it('14. Feature Toggles: Configurable feature flag checks', async () => {
    const provider = new InMemoryProvider<FeatureToggle>([
      {
        id: 'ft1',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        key: 'DELIVERY',
        isEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new FeatureToggleTool(provider);
    const toggleRes = await tool.isFeatureEnabled('DELIVERY', contextA);

    expect(toggleRes.state).toBe('INACTIVE');
    expect(toggleRes.data).toBe(false);
  });

  it('15. Security: Rejects tenantId or storeId override attacks from request inputs', () => {
    expect(() => {
      NoHallucinationGuard.validateTrustedContext(
        { tenantId: 'attacker_tenant', storeId: 'store_1' },
        contextA
      );
    }).toThrow(UnauthorizedDataAccessError);

    expect(() => {
      NoHallucinationGuard.validateTrustedContext(
        { tenantId: 'tenant_alpha', storeId: 'attacker_store' },
        contextA
      );
    }).toThrow(UnauthorizedDataAccessError);
  });

  it('16. Cross-Tenant and Cross-Store Data Isolation', async () => {
    const provider = new InMemoryProvider<PaymentMethod>([
      {
        id: 'p_a',
        tenantId: 'tenant_alpha',
        storeId: 'store_1',
        methodType: 'CASH',
        displayName: 'كاش - الدفع عند الاستلام',
        isActive: true,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'p_b',
        tenantId: 'tenant_beta',
        storeId: 'store_2',
        methodType: 'BANK',
        displayName: 'حساب بنك الكريمي',
        isActive: true,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new PaymentTool(provider);

    const resA = await tool.getPaymentMethods(contextA);
    expect(resA.data?.length).toBe(1);
    expect(resA.data?.[0].displayName).toContain('كاش');

    const resB = await tool.getPaymentMethods(contextB);
    expect(resB.data?.length).toBe(1);
    expect(resB.data?.[0].displayName).toContain('الكريمي');
  });

  it('17. Zero Google Sheets Writes verification', async () => {
    const provider = new InMemoryProvider<BusinessHour>([]);
    const tool = new BusinessHoursTool(provider);
    await tool.getBusinessHours(contextA);
    await tool.getStoreStatus(contextA);

    expect(provider.writeCount).toBe(0);
  });
});
