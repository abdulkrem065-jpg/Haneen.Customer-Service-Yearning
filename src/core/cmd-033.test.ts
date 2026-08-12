import { describe, it, expect, beforeEach } from 'vitest';
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
  Product 
} from './data/domain';
import { UnauthorizedDataAccessError } from './errors';
import { NoHallucinationGuard } from './tools/no-hallucination-guard';
import { CatalogTool } from './tools/catalog-tool';
import { PaymentTool } from './tools/payment-tool';
import { ContactTool } from './tools/contact-tool';
import { BusinessHoursTool } from './tools/business-hours-tool';
import { DeliveryTool } from './tools/delivery-tool';
import { LocationTool } from './tools/location-tool';
import { PolicyTool } from './tools/policy-tool';
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

describe('CMD-033 — Business Operations & Haneen Intelligence Architecture Tests', () => {
  const contextA: DataOperationContext = { tenantId: 'tenant_1', storeId: 'store_1', agentId: 'haneen_agent' };
  const contextB: DataOperationContext = { tenantId: 'tenant_2', storeId: 'store_2', agentId: 'haneen_agent' };

  it('1. Business Hours: 24/7 schedule', async () => {
    const hoursProvider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh1',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        dayOfWeek: 'MONDAY',
        isClosed: false,
        is24Hours: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(hoursProvider);
    // Target date set to Monday
    const targetDate = new Date('2026-08-10T12:00:00Z'); // Monday
    const res = await tool.getStoreStatus(contextA, { targetDate, timezone: 'UTC' });

    expect(res.state).toBe('KNOWN');
    expect(res.data?.status).toBe('24_7');
    expect(res.data?.isOpenNow).toBe(true);
  });

  it('2. Business Hours: Closed day', async () => {
    const hoursProvider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh2',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        dayOfWeek: 'FRIDAY',
        isClosed: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(hoursProvider);
    const targetDate = new Date('2026-08-14T12:00:00Z'); // Friday
    const res = await tool.getStoreStatus(contextA, { targetDate, timezone: 'UTC' });

    expect(res.state).toBe('KNOWN');
    expect(res.data?.status).toBe('CLOSED_TODAY');
    expect(res.data?.isOpenNow).toBe(false);
  });

  it('3. Business Hours: Single shift per day', async () => {
    const hoursProvider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh3',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        dayOfWeek: 'SATURDAY',
        isClosed: false,
        openingTime: '08:00',
        closingTime: '18:00',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(hoursProvider);

    // Test open time (10:00 UTC)
    const openDate = new Date('2026-08-15T10:00:00Z'); // Saturday
    const openRes = await tool.getStoreStatus(contextA, { targetDate: openDate, timezone: 'UTC' });
    expect(openRes.data?.isOpenNow).toBe(true);
    expect(openRes.data?.status).toBe('OPEN');

    // Test closed time (20:00 UTC)
    const closedDate = new Date('2026-08-15T20:00:00Z');
    const closedRes = await tool.getStoreStatus(contextA, { targetDate: closedDate, timezone: 'UTC' });
    expect(closedRes.data?.isOpenNow).toBe(false);
    expect(closedRes.data?.status).toBe('CLOSED');
  });

  it('4. Business Hours: Split shifts (two periods per day)', async () => {
    const hoursProvider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh4',
        tenantId: 'tenant_1',
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
    const tool = new BusinessHoursTool(hoursProvider);

    // Shift 1 open (10:00 UTC)
    const s1Date = new Date('2026-08-15T10:00:00Z');
    const s1Res = await tool.getStoreStatus(contextA, { targetDate: s1Date, timezone: 'UTC' });
    expect(s1Res.data?.isOpenNow).toBe(true);
    expect(s1Res.data?.activeShift?.closingTime).toBe('13:00');

    // Break time between shifts (14:30 UTC) -> Opens later today at 16:00
    const breakDate = new Date('2026-08-15T14:30:00Z');
    const breakRes = await tool.getStoreStatus(contextA, { targetDate: breakDate, timezone: 'UTC' });
    expect(breakRes.data?.isOpenNow).toBe(false);
    expect(breakRes.data?.status).toBe('OPENS_LATER_TODAY');
    expect(breakRes.data?.nextOpeningTime).toBe('16:00');

    // Shift 2 open (18:00 UTC)
    const s2Date = new Date('2026-08-15T18:00:00Z');
    const s2Res = await tool.getStoreStatus(contextA, { targetDate: s2Date, timezone: 'UTC' });
    expect(s2Res.data?.isOpenNow).toBe(true);
  });

  it('5. Business Hours: Store currently closed', async () => {
    const hoursProvider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh5',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        dayOfWeek: 'SUNDAY',
        isClosed: false,
        openingTime: '09:00',
        closingTime: '17:00',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(hoursProvider);
    const nightDate = new Date('2026-08-16T22:00:00Z'); // Sunday night
    const res = await tool.getStoreStatus(contextA, { targetDate: nightDate, timezone: 'UTC' });
    expect(res.data?.isOpenNow).toBe(false);
  });

  it('6. Business Hours: Store opens later', async () => {
    const hoursProvider = new InMemoryProvider<BusinessHour>([
      {
        id: 'bh6',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        dayOfWeek: 'MONDAY',
        isClosed: false,
        openingTime: '10:00',
        closingTime: '22:00',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new BusinessHoursTool(hoursProvider);
    const earlyMorning = new Date('2026-08-17T07:00:00Z'); // Monday 07:00
    const res = await tool.getStoreStatus(contextA, { targetDate: earlyMorning, timezone: 'UTC' });
    expect(res.data?.isOpenNow).toBe(false);
    expect(res.data?.status).toBe('OPENS_LATER_TODAY');
    expect(res.data?.nextOpeningTime).toBe('10:00');
  });

  it('7. Delivery: Disabled', async () => {
    const configProvider = new InMemoryProvider<DeliveryConfiguration>([
      {
        id: 'del1',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        isEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new DeliveryTool(configProvider);
    const res = await tool.getDeliveryConfiguration(contextA);
    expect(res.state).toBe('INACTIVE');
    expect(res.data).toBeNull();
  });

  it('8. Delivery: Enabled', async () => {
    const configProvider = new InMemoryProvider<DeliveryConfiguration>([
      {
        id: 'del2',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        isEnabled: true,
        deliveryFee: 500,
        currency: 'YER',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new DeliveryTool(configProvider);
    const res = await tool.getDeliveryConfiguration(contextA);
    expect(res.state).toBe('KNOWN');
    expect(res.data?.isEnabled).toBe(true);
    expect(res.data?.deliveryFee).toBe(500);
    expect(res.data?.currency).toBe('YER');
  });

  it('9. Delivery: Enabled without fees defined (No-hallucination guard)', async () => {
    const configProvider = new InMemoryProvider<DeliveryConfiguration>([
      {
        id: 'del3',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new DeliveryTool(configProvider);
    const res = await tool.getDeliveryConfiguration(contextA);
    expect(res.state).toBe('KNOWN');
    expect(res.data?.deliveryFee).toBeUndefined(); // Must NOT invent a fee!
  });

  it('10. Location: Present', async () => {
    const locProvider = new InMemoryProvider<StoreLocation>([
      {
        id: 'loc1',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        name: 'الفرع الرئيسي',
        address: 'شارع الزبيري - صنعاء',
        googleMapsUrl: 'https://maps.google.com/?q=15.35,44.20',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new LocationTool(locProvider);
    const res = await tool.getStoreLocations(contextA);
    expect(res.state).toBe('KNOWN');
    expect(res.data?.length).toBe(1);
    expect(res.data?.[0].googleMapsUrl).toContain('maps.google.com');
  });

  it('11. Location: Missing', async () => {
    const locProvider = new InMemoryProvider<StoreLocation>([]);
    const tool = new LocationTool(locProvider);
    const res = await tool.getStoreLocations(contextA);
    expect(res.state).toBe('UNKNOWN');
    expect(res.data).toEqual([]);
    expect(res.message).toContain('في بيانات المتجر');
  });

  it('12. Policy: Present', async () => {
    const policyProvider = new InMemoryProvider<StorePolicy>([
      {
        id: 'pol1',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        policyType: 'RETURN',
        title: 'سياسة الإرجاع',
        content: 'يمكن إرجاع السلع خلال 3 أيام.',
        isActive: true,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new PolicyTool(policyProvider);
    const res = await tool.getStorePolicies(contextA, { policyType: 'RETURN' });
    expect(res.state).toBe('KNOWN');
    expect(res.data?.[0].title).toBe('سياسة الإرجاع');
  });

  it('13. Policy: Missing / empty', async () => {
    const policyProvider = new InMemoryProvider<StorePolicy>([]);
    const tool = new PolicyTool(policyProvider);
    const res = await tool.getStorePolicies(contextA, { policyType: 'SHIPPING' });
    expect(res.state).toBe('UNKNOWN');
    expect(res.data).toEqual([]);
  });

  it('14. Payment Method: Inactive', async () => {
    const paymentProvider = new InMemoryProvider<PaymentMethod>([
      {
        id: 'pay1',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        methodType: 'CREDIT_CARD',
        displayName: 'بطاقة ائتمانية',
        isActive: false,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new PaymentTool(paymentProvider);
    const res = await tool.getPaymentMethods(contextA);
    expect(res.state).toBe('UNKNOWN');
    expect(res.data).toEqual([]);
  });

  it('15. Digital Service: Inactive', async () => {
    const digitalProvider = new InMemoryProvider<DigitalService>([
      {
        id: 'ds1',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        name: 'نظام إدارة المتجر',
        serviceType: 'ERP',
        isActive: false,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new DigitalServicesTool(digitalProvider);
    const res = await tool.getDigitalServices(contextA);
    expect(res.state).toBe('UNKNOWN');
    expect(res.data).toEqual([]);
  });

  it('16. Tenant isolation', async () => {
    const productProvider = new InMemoryProvider<Product>([
      {
        id: 'p1',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        name: 'عسل سدر',
        price: 15000,
        currency: 'YER',
        inStock: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'p2',
        tenantId: 'tenant_2',
        storeId: 'store_2',
        name: 'زيت زيتون',
        price: 8000,
        currency: 'YER',
        inStock: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const catalog = new CatalogTool(productProvider);
    const resA = await catalog.searchProducts({}, contextA);
    expect(resA.data?.length).toBe(1);
    expect(resA.data?.[0].name).toBe('عسل سدر');

    const resB = await catalog.searchProducts({}, contextB);
    expect(resB.data?.length).toBe(1);
    expect(resB.data?.[0].name).toBe('زيت زيتون');
  });

  it('17. Store isolation', async () => {
    const locProvider = new InMemoryProvider<StoreLocation>([
      {
        id: 'l1',
        tenantId: 'tenant_1',
        storeId: 'store_1',
        address: 'صنعاء',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'l2',
        tenantId: 'tenant_1',
        storeId: 'store_sub',
        address: 'عدن',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    const tool = new LocationTool(locProvider);
    const subContext: DataOperationContext = { tenantId: 'tenant_1', storeId: 'store_sub', agentId: 'haneen_agent' };
    const res = await tool.getStoreLocations(subContext);
    expect(res.data?.length).toBe(1);
    expect(res.data?.[0].address).toBe('عدن');
  });

  it('18. Client context override attack (UnauthorizedDataAccessError)', () => {
    expect(() => {
      NoHallucinationGuard.validateTrustedContext(
        { tenantId: 'attacker_tenant', storeId: 'store_1' },
        contextA
      );
    }).toThrow(UnauthorizedDataAccessError);
  });

  it('19. No hallucination guard evaluation', () => {
    const nullEval = NoHallucinationGuard.evaluateData(null, { entityNameAr: 'رسوم التوصيل' });
    expect(nullEval.state).toBe('UNKNOWN');
    expect(nullEval.message).toContain('غير محددة في بيانات المتجر');

    const emptyEval = NoHallucinationGuard.evaluateData([], { entityNameAr: 'المنتجات' });
    expect(emptyEval.state).toBe('UNKNOWN');

    const disabledEval = NoHallucinationGuard.evaluateData({ some: 'data' }, { entityNameAr: 'الخدمة', isEnabled: false });
    expect(disabledEval.state).toBe('INACTIVE');
  });

  it('20. Human handoff trigger', async () => {
    const handoffProvider = new InMemoryProvider<HumanHandoff>([]);
    const tool = new HumanHandoffTool(handoffProvider);
    const res = await tool.requestHandoff(
      { conversationId: 'conv_123', reason: 'CUSTOMER_COMPLAINT', summary: 'العميل يشتكي من السعر' },
      contextA
    );
    expect(res.state).toBe('REQUIRES_HUMAN');
    expect(res.data?.status).toBe('PENDING');
    expect(res.data?.conversationId).toBe('conv_123');
  });

  it('21. Lead validation & explicit confirmation', async () => {
    const leadProvider = new InMemoryProvider<Lead>([]);
    const tool = new LeadTool(leadProvider);

    // Unconfirmed request -> Asks confirmation
    const unconfirmedRes = await tool.captureLead(
      { name: 'محمد علي', phone: '770000000', userConfirmed: false },
      contextA
    );
    expect(unconfirmedRes.state).toBe('UNKNOWN');
    expect(unconfirmedRes.message).toContain('تؤكد موافقتك');

    // Missing phone
    const noPhoneRes = await tool.captureLead(
      { name: 'محمد علي', phone: '', userConfirmed: true },
      contextA
    );
    expect(noPhoneRes.state).toBe('UNKNOWN');
    expect(noPhoneRes.message).toContain('رقم الهاتف');

    // Confirmed valid lead
    const confirmedRes = await tool.captureLead(
      {
        name: 'محمد علي',
        phone: '770000000',
        requestedService: 'نظام الكاشير',
        businessType: 'سوبرماركت',
        userConfirmed: true
      },
      contextA
    );
    expect(confirmedRes.state).toBe('KNOWN');
    expect(confirmedRes.data?.status).toBe('NEW');
    expect(confirmedRes.data?.phone).toBe('770000000');
  });
});
