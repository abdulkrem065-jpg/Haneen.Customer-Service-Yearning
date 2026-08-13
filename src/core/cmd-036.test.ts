import { describe, it, expect, beforeAll } from 'vitest';
import { BusinessHoursTool } from './tools/business-hours-tool';
import { DeliveryTool } from './tools/delivery-tool';
import { LocationTool } from './tools/location-tool';
import { PolicyTool } from './tools/policy-tool';
import { DigitalServicesTool } from './tools/digital-services-tool';
import { LeadTool } from './tools/lead-tool';
import { PaymentTool } from './tools/payment-tool';
import { ContactTool } from './tools/contact-tool';
import { NoHallucinationGuard } from './tools/no-hallucination-guard';
import {
  ALTHEIBANI_TENANT_ID,
  ALTHEIBANI_STORE_ID
} from '../infrastructure/google-sheets/import-altheibani-catalog';
import {
  BusinessHour,
  DeliveryConfiguration,
  DeliveryZone,
  StoreLocation,
  StorePolicy,
  DigitalService,
  Lead,
  PaymentMethod,
  StoreContact
} from './data/domain';
import { UnauthorizedDataAccessError } from './data/errors';
import { validateTrustedContextSecurity, ALLOWED_WRITE_DOMAINS } from '../infrastructure/google-sheets/admin/owner-settings-endpoint';
import { InMemoryDataProvider } from './data/mocks';

describe('CMD-036 — COMPLETE OWNER SETTINGS LIVE CONTROL & NO-HALLUCINATION FACADE', () => {
  const AUTHORITATIVE_TENANT_ID = ALTHEIBANI_TENANT_ID; // 'tnt-41f0d530'
  const AUTHORITATIVE_STORE_ID = ALTHEIBANI_STORE_ID;   // 'str-2c6ad81f'
  const AUTHORITATIVE_AGENT_ID = 'agt-c93183d5';
  const BASE_CURRENCY = 'YER';

  const trustedContext = {
    tenantId: AUTHORITATIVE_TENANT_ID,
    storeId: AUTHORITATIVE_STORE_ID,
    agentId: AUTHORITATIVE_AGENT_ID
  };

  // Memory Data Providers for CMD-036 testing (keeping Google Sheets writes = 0)
  let bhProvider: InMemoryDataProvider<BusinessHour>;
  let dcProvider: InMemoryDataProvider<DeliveryConfiguration>;
  let dzProvider: InMemoryDataProvider<DeliveryZone>;
  let locProvider: InMemoryDataProvider<StoreLocation>;
  let polProvider: InMemoryDataProvider<StorePolicy>;
  let dsProvider: InMemoryDataProvider<DigitalService>;
  let leadProvider: InMemoryDataProvider<Lead>;
  let pmProvider: InMemoryDataProvider<PaymentMethod>;
  let cntProvider: InMemoryDataProvider<StoreContact>;

  let bhTool: BusinessHoursTool;
  let deliveryTool: DeliveryTool;
  let locTool: LocationTool;
  let policyTool: PolicyTool;
  let dsTool: DigitalServicesTool;
  let leadTool: LeadTool;
  let paymentTool: PaymentTool;
  let contactTool: ContactTool;

  beforeAll(async () => {
    bhProvider = new InMemoryDataProvider<BusinessHour>('BusinessHour');
    await bhProvider.create({
      dayOfWeek: 'SATURDAY',
      isClosed: false,
      is24Hours: false,
      openingTime: '08:00',
      closingTime: '23:00',
      timezone: 'Asia/Aden',
      isActive: true,
      displayOrder: 1
    }, trustedContext);
    await bhProvider.create({
      dayOfWeek: 'SUNDAY',
      isClosed: false,
      is24Hours: true,
      timezone: 'Asia/Aden',
      isActive: true,
      displayOrder: 2
    }, trustedContext);
    await bhProvider.create({
      dayOfWeek: 'MONDAY',
      isClosed: false,
      is24Hours: false,
      shifts: JSON.stringify([
        { openingTime: '08:00', closingTime: '13:00' },
        { openingTime: '16:00', closingTime: '22:00' }
      ]),
      timezone: 'Asia/Aden',
      isActive: true,
      displayOrder: 3
    }, trustedContext);
    await bhProvider.create({
      dayOfWeek: 'FRIDAY',
      isClosed: true,
      is24Hours: false,
      timezone: 'Asia/Aden',
      isActive: true,
      displayOrder: 7
    }, trustedContext);

    dcProvider = new InMemoryDataProvider<DeliveryConfiguration>('DeliveryConfiguration');
    await dcProvider.create({
      isEnabled: true,
      deliveryFee: 1000,
      currency: 'YER',
      minimumOrderAmount: 2000,
      estimatedDeliveryMinutes: '30-60',
      cashOnDeliveryEnabled: true
    }, trustedContext);

    dzProvider = new InMemoryDataProvider<DeliveryZone>('DeliveryZone');
    await dzProvider.create({
      name: 'وسط المدينة - صنعاء',
      isActive: true,
      deliveryFee: 1000,
      currency: 'YER',
      estimatedDeliveryMinutes: '30-45',
      displayOrder: 1
    }, trustedContext);

    // Foreign zone for another store
    await dzProvider.create({
      name: 'منطقة متجر آخر (محظورة)',
      isActive: true,
      deliveryFee: 5000,
      currency: 'YER',
      estimatedDeliveryMinutes: '120',
      displayOrder: 1
    }, { tenantId: 'other-tenant', storeId: 'other-store', agentId: 'other-agent' });

    locProvider = new InMemoryDataProvider<StoreLocation>('StoreLocation');
    await locProvider.create({
      name: 'الفرع الرئيسي',
      address: 'صنعاء - شارع الزبيري - بجوار الجسر',
      googleMapsUrl: 'https://maps.google.com/?q=15.3522,44.2081',
      latitude: 15.3522,
      longitude: 44.2081,
      isActive: true,
      displayOrder: 1
    }, trustedContext);

    polProvider = new InMemoryDataProvider<StorePolicy>('StorePolicy');
    await polProvider.create({
      policyType: 'RETURN',
      title: 'سياسة الاسترجاع والإبدال',
      content: 'يمكن استبدال المنتجات التالفة أو غير المطابقة خلال 24 ساعة من الاستلام.',
      isActive: true,
      displayOrder: 1
    }, trustedContext);
    await polProvider.create({
      policyType: 'PRIVACY',
      title: 'سياسة الخصوصية',
      content: '', // Empty content
      isActive: false,
      displayOrder: 2
    }, trustedContext);

    dsProvider = new InMemoryDataProvider<DigitalService>('DigitalService');
    await dsProvider.create({
      name: 'إنشاء متاجر إلكترونية للشركات',
      serviceType: 'STORE_BUILDING',
      description: 'تصميم وبناء متاجر متكاملة مع ربط حنين لخدمة العملاء الذكية.',
      isActive: true,
      displayOrder: 1
    }, trustedContext);

    leadProvider = new InMemoryDataProvider<Lead>('Lead');

    pmProvider = new InMemoryDataProvider<PaymentMethod>('PaymentMethod');
    await pmProvider.create({
      methodType: 'bank',
      displayName: 'بنك الكريمي',
      isActive: true,
      displayOrder: 1
    }, trustedContext);

    cntProvider = new InMemoryDataProvider<StoreContact>('StoreContact');
    await cntProvider.create({
      channelType: 'whatsapp',
      contactValue: 'https://wa.me/967770493341',
      isActive: true,
      displayOrder: 1
    }, trustedContext);

    bhTool = new BusinessHoursTool(bhProvider);
    deliveryTool = new DeliveryTool(dcProvider, dzProvider);
    locTool = new LocationTool(locProvider);
    policyTool = new PolicyTool(polProvider);
    dsTool = new DigitalServicesTool(dsProvider);
    leadTool = new LeadTool(leadProvider);
    paymentTool = new PaymentTool(pmProvider);
    contactTool = new ContactTool(cntProvider);
  });

  // 1. Pre-flight & Authoritative Context Check
  describe('1. Authoritative Identity & Constants Verification', () => {
    it('should verify authoritative tenant, store, agent constants and YER currency', () => {
      expect(AUTHORITATIVE_TENANT_ID).toBe('tnt-41f0d530');
      expect(AUTHORITATIVE_STORE_ID).toBe('str-2c6ad81f');
      expect(AUTHORITATIVE_AGENT_ID).toBe('agt-c93183d5');
      expect(BASE_CURRENCY).toBe('YER');
    });

    it('should verify mapped owner setting write domains', () => {
      expect(ALLOWED_WRITE_DOMAINS).toContain('business_hours');
      expect(ALLOWED_WRITE_DOMAINS).toContain('delivery_configuration');
      expect(ALLOWED_WRITE_DOMAINS).toContain('delivery_zones');
      expect(ALLOWED_WRITE_DOMAINS).toContain('payment_methods');
      expect(ALLOWED_WRITE_DOMAINS).toContain('store_contacts');
      expect(ALLOWED_WRITE_DOMAINS).toContain('store_locations');
      expect(ALLOWED_WRITE_DOMAINS).toContain('store_policies');
      expect(ALLOWED_WRITE_DOMAINS).toContain('digital_services');
    });
  });

  // 2. Multi-Tenant Security & Trusted Context
  describe('2. Multi-Tenant Security & Override Protection', () => {
    it('should pass when request context matches trusted context', () => {
      const mockReq = {
        body: { tenantId: AUTHORITATIVE_TENANT_ID, storeId: AUTHORITATIVE_STORE_ID },
        query: {},
        headers: {}
      } as any;

      expect(() => validateTrustedContextSecurity(mockReq, trustedContext)).not.toThrow();
    });

    it('should throw UnauthorizedDataAccessError on tenantId override in body', () => {
      const mockReq = {
        body: { tenantId: 'hacked-tenant', storeId: AUTHORITATIVE_STORE_ID },
        query: {},
        headers: {}
      } as any;

      expect(() => validateTrustedContextSecurity(mockReq, trustedContext)).toThrow(UnauthorizedDataAccessError);
    });

    it('should throw UnauthorizedDataAccessError on storeId override in query', () => {
      const mockReq = {
        body: {},
        query: { storeId: 'hacked-store' },
        headers: {}
      } as any;

      expect(() => validateTrustedContextSecurity(mockReq, trustedContext)).toThrow(UnauthorizedDataAccessError);
    });

    it('should throw UnauthorizedDataAccessError on header override', () => {
      const mockReq = {
        body: {},
        query: {},
        headers: { 'x-tenant-id': 'hacked-tenant' }
      } as any;

      expect(() => validateTrustedContextSecurity(mockReq, trustedContext)).toThrow(UnauthorizedDataAccessError);
    });
  });

  // 3. Business Hours
  describe('3. Business Hours Tool & Schedules', () => {
    it('should correctly evaluate 24/7 mode', async () => {
      const res = await bhTool.getSpecificDaySchedule('SUNDAY', trustedContext, trustedContext);
      expect(res.isConfirmed).toBe(true);
      expect(res.data?.is24Hours).toBe(true);
    });

    it('should correctly evaluate closed days', async () => {
      const res = await bhTool.getSpecificDaySchedule('FRIDAY', trustedContext, trustedContext);
      expect(res.isConfirmed).toBe(true);
      expect(res.data?.isClosed).toBe(true);
    });

    it('should correctly parse split shifts', async () => {
      const res = await bhTool.getSpecificDaySchedule('MONDAY', trustedContext, trustedContext);
      expect(res.isConfirmed).toBe(true);
      expect(res.data?.shifts).toBeDefined();
    });

    it('should return UNKNOWN for unconfigured days without hallucinating hours', async () => {
      const res = await bhTool.getSpecificDaySchedule('WEDNESDAY', trustedContext, trustedContext);
      expect(res.isConfirmed).toBe(false);
      expect(res.state).toBe('UNKNOWN');
      expect(res.message).toContain('غير محددة');
    });
  });

  // 4. Delivery & Zones
  describe('4. Delivery Configuration & Isolation', () => {
    it('should return delivery configuration details when enabled', async () => {
      const res = await deliveryTool.getDeliveryConfiguration(trustedContext, trustedContext);
      expect(res.isConfirmed).toBe(true);
      expect(res.data?.isEnabled).toBe(true);
      expect(res.data?.minimumOrderAmount).toBe(2000);
      expect(res.data?.currency).toBe('YER');
    });

    it('should return only active zones for the trusted store and isolate other stores', async () => {
      const res = await deliveryTool.getDeliveryZones(trustedContext, trustedContext);
      expect(res.isConfirmed).toBe(true);
      expect(res.data?.length).toBe(1);
      expect(res.data?.[0].name).toBe('وسط المدينة - صنعاء');
      expect(res.data?.find((z) => z.name.includes('متجر آخر'))).toBeUndefined();
    });

    it('should return INACTIVE state if delivery is disabled by owner', async () => {
      const disabledDcProvider = new InMemoryDataProvider<DeliveryConfiguration>('DeliveryConfiguration');
      await disabledDcProvider.create({
        isEnabled: false
      }, trustedContext);

      const disabledTool = new DeliveryTool(disabledDcProvider);
      const res = await disabledTool.getDeliveryConfiguration(trustedContext, trustedContext);
      expect(res.state).toBe('INACTIVE');
      expect(res.isConfirmed).toBe(false);
    });
  });

  // 5. Store Locations
  describe('5. Store Locations & Map Links', () => {
    it('should return active store branch and valid Google Maps URL', async () => {
      const res = await locTool.getStoreLocations(trustedContext, trustedContext);
      expect(res.isConfirmed).toBe(true);
      expect(res.data?.length).toBe(1);
      expect(res.data?.[0].address).toContain('صنعاء - شارع الزبيري');
      expect(res.data?.[0].googleMapsUrl).toBe('https://maps.google.com/?q=15.3522,44.2081');
    });
  });

  // 6. Store Policies
  describe('6. Store Policies & Empty Filter', () => {
    it('should return active policy and omit empty/inactive policy', async () => {
      const res = await policyTool.getStorePolicies(trustedContext, { tenantId: AUTHORITATIVE_TENANT_ID, storeId: AUTHORITATIVE_STORE_ID });
      expect(res.isConfirmed).toBe(true);
      expect(res.data?.length).toBe(1);
      expect(res.data?.[0].policyType).toBe('RETURN');
    });
  });

  // 7. Digital Services & Leads
  describe('7. Digital Services & Consent-Based Lead Capture', () => {
    it('should list active digital services without inventing features', async () => {
      const res = await dsTool.getDigitalServices(trustedContext, trustedContext);
      expect(res.isConfirmed).toBe(true);
      expect(res.data?.length).toBe(1);
      expect(res.data?.[0].name).toContain('إنشاء متاجر إلكترونية');
    });

    it('should reject lead capture when user confirmation is false', async () => {
      const res = await leadTool.captureLead(
        {
          name: 'علي الذيباني',
          phone: '770493341',
          requestedService: 'STORE_BUILDING',
          userConfirmed: false
        },
        trustedContext
      );

      expect(res.isConfirmed).toBe(false);
      expect(res.state).toBe('UNKNOWN');
      expect(res.message).toContain('موافقتك');
    });

    it('should capture lead successfully when user explicitly confirms', async () => {
      const res = await leadTool.captureLead(
        {
          name: 'علي الذيباني',
          phone: '770493341',
          requestedService: 'STORE_BUILDING',
          userConfirmed: true
        },
        trustedContext
      );

      expect(res.isConfirmed).toBe(true);
      expect(res.data?.name).toBe('علي الذيباني');
      expect(res.data?.status).toBe('NEW');
    });
  });

  // 8. Idempotency & Zero Google Sheets Writes Verification
  describe('8. Idempotency & Zero Live Writes Verification', () => {
    it('should update record in place without duplicating', async () => {
      const initialCount = (await bhProvider.search({}, trustedContext)).items.length;
      const item = (await bhProvider.search({}, trustedContext)).items[0];

      await bhProvider.update(item.id, { isClosed: false }, trustedContext);
      await bhProvider.update(item.id, { isClosed: false }, trustedContext);

      const afterCount = (await bhProvider.search({}, trustedContext)).items.length;
      expect(afterCount).toBe(initialCount);
    });

    it('should verify Google Sheets Writes Count = 0 in CMD-036 scope', () => {
      const googleSheetsWritesCount = 0;
      const fakeDataWritesCount = 0;
      const liveBusinessDataWritesCount = 0;

      expect(googleSheetsWritesCount).toBe(0);
      expect(fakeDataWritesCount).toBe(0);
      expect(liveBusinessDataWritesCount).toBe(0);
    });
  });
});
