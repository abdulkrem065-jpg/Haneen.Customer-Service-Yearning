import { IGoogleSheetsTransport } from './transport';
import { CanonicalSchemas } from './schema-definitions';
import { HeaderMap } from './header-map';
import { CatalogImporter, ALTHEIBANI_TENANT_ID, ALTHEIBANI_STORE_ID, ALTHEIBANI_CURRENCY } from './import-altheibani-catalog';
import { GoogleSheetsAdminReconciler } from './admin-reconciler';

export interface PaymentMethodInput {
  id: string;
  methodType: string;
  displayName: string;
  accountDetails: string;
  isActive: boolean;
  displayOrder: number;
}

export interface StoreContactInput {
  id: string;
  channelType: string;
  contactValue: string;
  isActive: boolean;
  displayOrder: number;
}

export interface StoreNoticeInput {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  isActive: boolean;
  displayOrder: number;
}

export const REAL_PAYMENT_METHODS: PaymentMethodInput[] = [
  {
    id: 'pm-001',
    methodType: 'bank',
    displayName: 'بنك الكريمي',
    accountDetails: '306493341',
    isActive: false,
    displayOrder: 1,
  },
  {
    id: 'pm-002',
    methodType: 'wallet',
    displayName: 'محفظة فلوسك',
    accountDetails: '',
    isActive: false,
    displayOrder: 2,
  },
  {
    id: 'pm-003',
    methodType: 'wallet',
    displayName: 'وان كاش',
    accountDetails: '770493341',
    isActive: true,
    displayOrder: 3,
  },
  {
    id: 'pm-004',
    methodType: 'wallet',
    displayName: 'جيب',
    accountDetails: '774780112',
    isActive: true,
    displayOrder: 4,
  },
  {
    id: 'pm-005',
    methodType: 'wallet',
    displayName: 'جوالي',
    accountDetails: '770493341',
    isActive: true,
    displayOrder: 5,
  },
  {
    id: 'pm-006',
    methodType: 'cash_on_delivery',
    displayName: 'الدفع كاش عند الاستلام',
    accountDetails: '',
    isActive: true,
    displayOrder: 6,
  },
];

export const REAL_STORE_CONTACTS: StoreContactInput[] = [
  {
    id: 'cnt-001',
    channelType: 'whatsapp',
    contactValue: 'https://wa.me/967770493341',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'cnt-002',
    channelType: 'phone',
    contactValue: 'tel:770493341',
    isActive: true,
    displayOrder: 2,
  },
];

export const REAL_STORE_NOTICES: StoreNoticeInput[] = [
  {
    id: 'ntc-001',
    title: 'بنر العروض الحصرية',
    content: 'main_ad',
    imageUrl: 'ad1.jpg',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'ntc-002',
    title: 'smart_notice',
    content: 'بشرى سارة لعملائنا: تنبيه ذكي وتوصيل سريع!',
    imageUrl: '',
    isActive: true,
    displayOrder: 2,
  },
];

export const REAL_BUSINESS_HOURS = [
  { id: 'bh-001', dayOfWeek: 'الأحد', openingTime: '08:00', closingTime: '22:00', isClosed: false, is24Hours: false },
  { id: 'bh-002', dayOfWeek: 'الإثنين', openingTime: '08:00', closingTime: '22:00', isClosed: false, is24Hours: false },
  { id: 'bh-003', dayOfWeek: 'الثلاثاء', openingTime: '08:00', closingTime: '22:00', isClosed: false, is24Hours: false },
  { id: 'bh-004', dayOfWeek: 'الأربعاء', openingTime: '08:00', closingTime: '22:00', isClosed: false, is24Hours: false },
  { id: 'bh-005', dayOfWeek: 'الخميس', openingTime: '08:00', closingTime: '22:00', isClosed: false, is24Hours: false },
  { id: 'bh-006', dayOfWeek: 'الجمعة', openingTime: '14:00', closingTime: '23:00', isClosed: false, is24Hours: false },
  { id: 'bh-007', dayOfWeek: 'السبت', openingTime: '14:00', closingTime: '23:00', isClosed: false, is24Hours: false },
];

export const REAL_DELIVERY_CONFIG = {
  id: 'del-001',
  isEnabled: true,
  deliveryFee: '1000',
  currency: 'YER',
  deliveryAreas: 'أمانة العاصمة صنعاء - جميع المناطق المعتمدة',
};

export const REAL_STORE_LOCATION = {
  id: 'loc-001',
  name: 'متجر الذيباني الرئيسي',
  address: 'صنعاء - شارع الثلاثين - متجر الذيباني',
  isActive: true,
};

export const REAL_STORE_POLICIES = [
  {
    id: 'pol-001',
    policyType: 'return',
    title: 'سياسة الاسترجاع والاستبدال',
    content: 'يمكن استبدال أو استرجاع البضائع خلال 3 أيام بشرط حالتها الأصلية وعدم فتح الغلاف.',
    isActive: true,
  },
];

export const REAL_DELIVERY_ZONES = [
  {
    id: 'dz-001',
    name: 'أمانة العاصمة صنعاء',
    deliveryFee: '1000',
    currency: 'YER',
    estimatedDeliveryMinutes: '60',
    isActive: true,
    displayOrder: 1,
  },
];

export const REAL_DIGITAL_SERVICES = [
  {
    id: 'ds-001',
    name: 'شحن فورجي',
    serviceType: 'telecom',
    description: 'تسديد وباقات يمن فورجي ويمن موبايل بأفضل الأسعار',
    isActive: true,
  },
  {
    id: 'ds-002',
    name: 'كروت ترفيه وبوبجي',
    serviceType: 'gaming',
    description: 'شحن شدات بوبجي وبطاقات الترفيه الرقمية',
    isActive: true,
  },
];

export interface BusinessKnowledgeProvisionResult {
  tenantId: string;
  storeId: string;
  agentId: string;
  categoriesCreated: number;
  productsCreated: number;
  paymentMethodsCreated: number;
  contactsCreated: number;
  noticesCreated: number;
  categoriesSkipped: number;
  productsSkipped: number;
  paymentMethodsSkipped: number;
  contactsSkipped: number;
  noticesSkipped: number;
  digitalServicesStatus: string;
  businessHoursStatus: string;
  deliveryConfigurationStatus: string;
  deliveryZonesStatus: string;
  storeLocationsStatus: string;
  storePoliciesStatus: string;
  totalCategoriesReadBack: number;
  totalProductsReadBack: number;
  totalPaymentMethodsReadBack: number;
  totalContactsReadBack: number;
  totalNoticesReadBack: number;
  forbiddenWritesCount: number;
  legacyWritesCount: number;
  errors: string[];
}

export class BusinessKnowledgeProvisioner {
  constructor(private transport: IGoogleSheetsTransport) {}

  public async provisionAll(): Promise<BusinessKnowledgeProvisionResult> {
    const tenantId = ALTHEIBANI_TENANT_ID;
    const storeId = ALTHEIBANI_STORE_ID;
    const agentId = 'agt-c93183d5';

    const result: BusinessKnowledgeProvisionResult = {
      tenantId,
      storeId,
      agentId,
      categoriesCreated: 0,
      productsCreated: 0,
      paymentMethodsCreated: 0,
      contactsCreated: 0,
      noticesCreated: 0,
      categoriesSkipped: 0,
      productsSkipped: 0,
      paymentMethodsSkipped: 0,
      contactsSkipped: 0,
      noticesSkipped: 0,
      digitalServicesStatus: 'EMPTY / READY_FOR_REAL_DATA',
      businessHoursStatus: 'EMPTY',
      deliveryConfigurationStatus: 'EMPTY',
      deliveryZonesStatus: 'EMPTY',
      storeLocationsStatus: 'EMPTY',
      storePoliciesStatus: 'EMPTY',
      totalCategoriesReadBack: 0,
      totalProductsReadBack: 0,
      totalPaymentMethodsReadBack: 0,
      totalContactsReadBack: 0,
      totalNoticesReadBack: 0,
      forbiddenWritesCount: 0,
      legacyWritesCount: 0,
      errors: [],
    };

    // 1. Provision Catalog (Categories & Products)
    const catalogImporter = new CatalogImporter(this.transport);
    const catalogRes = await catalogImporter.importCatalog();
    result.categoriesCreated = catalogRes.categoriesCreated;
    result.productsCreated = catalogRes.productsCreated;
    result.categoriesSkipped = catalogRes.categoriesSkipped;
    result.productsSkipped = catalogRes.productsSkipped;
    result.totalCategoriesReadBack = catalogRes.totalCategoriesReadBack;
    result.totalProductsReadBack = catalogRes.totalProductsReadBack;
    if (catalogRes.errors.length > 0) {
      result.errors.push(...catalogRes.errors);
    }

    // 2. Provision Payment Methods
    const pmSchema = CanonicalSchemas.payment_methods;
    const pmHeaders = [...pmSchema.requiredHeaders, ...pmSchema.optionalHeaders];
    const pmRows = await this.transport.getRows(pmSchema.sheetName);

    let pmHeaderMap: HeaderMap;
    const existingPmKeys = new Set<string>();

    if (pmRows.length > 0) {
      pmHeaderMap = new HeaderMap(pmRows[0].values, pmHeaders);
      for (let i = 1; i < pmRows.length; i++) {
        const row = pmRows[i].values;
        const rTenantId = pmHeaderMap.getValue(row, 'tenantId');
        const rStoreId = pmHeaderMap.getValue(row, 'storeId');
        const rName = pmHeaderMap.getValue(row, 'displayName');
        if (rTenantId === tenantId && rStoreId === storeId && rName) {
          existingPmKeys.add(rName);
        }
      }
    } else {
      pmHeaderMap = new HeaderMap(pmHeaders, pmHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(pmSchema.sheetName, pmHeaders);
      } else {
        await this.transport.addRow(pmSchema.sheetName, pmHeaders);
      }
    }

    const now = new Date().toISOString();

    for (const pm of REAL_PAYMENT_METHODS) {
      if (existingPmKeys.has(pm.displayName)) {
        result.paymentMethodsSkipped++;
        continue;
      }

      const rowValues = pmHeaderMap.buildRow({
        id: pm.id,
        tenantId,
        storeId,
        methodType: pm.methodType,
        displayName: pm.displayName,
        accountDetails: pm.accountDetails || '',
        isActive: pm.isActive ? 'TRUE' : 'FALSE',
        displayOrder: pm.displayOrder.toString(),
        createdAt: now,
        updatedAt: now,
      });

      await this.transport.addRow(pmSchema.sheetName, rowValues);
      result.paymentMethodsCreated++;
      existingPmKeys.add(pm.displayName);
    }

    // 3. Provision Store Contacts
    const cntSchema = CanonicalSchemas.store_contacts;
    const cntHeaders = [...cntSchema.requiredHeaders, ...cntSchema.optionalHeaders];
    const cntRows = await this.transport.getRows(cntSchema.sheetName);

    let cntHeaderMap: HeaderMap;
    const existingCntKeys = new Set<string>();

    if (cntRows.length > 0) {
      cntHeaderMap = new HeaderMap(cntRows[0].values, cntHeaders);
      for (let i = 1; i < cntRows.length; i++) {
        const row = cntRows[i].values;
        const rTenantId = cntHeaderMap.getValue(row, 'tenantId');
        const rStoreId = cntHeaderMap.getValue(row, 'storeId');
        const rVal = cntHeaderMap.getValue(row, 'contactValue');
        if (rTenantId === tenantId && rStoreId === storeId && rVal) {
          existingCntKeys.add(rVal);
        }
      }
    } else {
      cntHeaderMap = new HeaderMap(cntHeaders, cntHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(cntSchema.sheetName, cntHeaders);
      } else {
        await this.transport.addRow(cntSchema.sheetName, cntHeaders);
      }
    }

    for (const cnt of REAL_STORE_CONTACTS) {
      if (existingCntKeys.has(cnt.contactValue)) {
        result.contactsSkipped++;
        continue;
      }

      const rowValues = cntHeaderMap.buildRow({
        id: cnt.id,
        tenantId,
        storeId,
        channelType: cnt.channelType,
        contactValue: cnt.contactValue,
        isActive: cnt.isActive ? 'TRUE' : 'FALSE',
        displayOrder: cnt.displayOrder.toString(),
        createdAt: now,
        updatedAt: now,
      });

      await this.transport.addRow(cntSchema.sheetName, rowValues);
      result.contactsCreated++;
      existingCntKeys.add(cnt.contactValue);
    }

    // 4. Provision Store Notices & Banners
    const ntcSchema = CanonicalSchemas.store_notices;
    const ntcHeaders = [...ntcSchema.requiredHeaders, ...ntcSchema.optionalHeaders];
    const ntcRows = await this.transport.getRows(ntcSchema.sheetName);

    let ntcHeaderMap: HeaderMap;
    const existingNtcKeys = new Set<string>();

    if (ntcRows.length > 0) {
      ntcHeaderMap = new HeaderMap(ntcRows[0].values, ntcHeaders);
      for (let i = 1; i < ntcRows.length; i++) {
        const row = ntcRows[i].values;
        const rTenantId = ntcHeaderMap.getValue(row, 'tenantId');
        const rStoreId = ntcHeaderMap.getValue(row, 'storeId');
        const rTitle = ntcHeaderMap.getValue(row, 'title');
        if (rTenantId === tenantId && rStoreId === storeId && rTitle) {
          existingNtcKeys.add(rTitle);
        }
      }
    } else {
      ntcHeaderMap = new HeaderMap(ntcHeaders, ntcHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(ntcSchema.sheetName, ntcHeaders);
      } else {
        await this.transport.addRow(ntcSchema.sheetName, ntcHeaders);
      }
    }

    for (const ntc of REAL_STORE_NOTICES) {
      if (existingNtcKeys.has(ntc.title)) {
        result.noticesSkipped++;
        continue;
      }

      const rowValues = ntcHeaderMap.buildRow({
        id: ntc.id,
        tenantId,
        storeId,
        title: ntc.title,
        content: ntc.content,
        imageUrl: ntc.imageUrl || '',
        isActive: ntc.isActive ? 'TRUE' : 'FALSE',
        displayOrder: ntc.displayOrder.toString(),
        createdAt: now,
        updatedAt: now,
      });

      await this.transport.addRow(ntcSchema.sheetName, rowValues);
      result.noticesCreated++;
      existingNtcKeys.add(ntc.title);
    }

    // 5. Provision Business Hours
    const bhSchema = CanonicalSchemas.business_hours;
    const bhHeaders = [...bhSchema.requiredHeaders, ...bhSchema.optionalHeaders];
    const bhRows = await this.transport.getRows(bhSchema.sheetName);
    if (bhRows.length === 0) {
      const bhHeaderMap = new HeaderMap(bhHeaders, bhHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(bhSchema.sheetName, bhHeaders);
      } else {
        await this.transport.addRow(bhSchema.sheetName, bhHeaders);
      }
      for (const bh of REAL_BUSINESS_HOURS) {
        const row = bhHeaderMap.buildRow({
          id: bh.id,
          tenantId,
          storeId,
          dayOfWeek: bh.dayOfWeek,
          openingTime: bh.openingTime,
          closingTime: bh.closingTime,
          isClosed: bh.isClosed ? 'TRUE' : 'FALSE',
          is24Hours: bh.is24Hours ? 'TRUE' : 'FALSE',
          createdAt: now,
          updatedAt: now,
        });
        await this.transport.addRow(bhSchema.sheetName, row);
      }
      result.businessHoursStatus = 'PROVISIONED';
    } else {
      result.businessHoursStatus = 'EXISTS';
    }

    // 6. Provision Delivery Configuration
    const delSchema = CanonicalSchemas.delivery_configuration;
    const delHeaders = [...delSchema.requiredHeaders, ...delSchema.optionalHeaders];
    const delRows = await this.transport.getRows(delSchema.sheetName);
    if (delRows.length === 0) {
      const delHeaderMap = new HeaderMap(delHeaders, delHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(delSchema.sheetName, delHeaders);
      } else {
        await this.transport.addRow(delSchema.sheetName, delHeaders);
      }
      const row = delHeaderMap.buildRow({
        id: REAL_DELIVERY_CONFIG.id,
        tenantId,
        storeId,
        isEnabled: REAL_DELIVERY_CONFIG.isEnabled ? 'TRUE' : 'FALSE',
        deliveryFee: REAL_DELIVERY_CONFIG.deliveryFee,
        currency: REAL_DELIVERY_CONFIG.currency,
        deliveryAreas: REAL_DELIVERY_CONFIG.deliveryAreas,
        createdAt: now,
        updatedAt: now,
      });
      await this.transport.addRow(delSchema.sheetName, row);
      result.deliveryConfigurationStatus = 'PROVISIONED';
    } else {
      result.deliveryConfigurationStatus = 'EXISTS';
    }

    // 7. Provision Store Location
    const locSchema = CanonicalSchemas.store_locations;
    const locHeaders = [...locSchema.requiredHeaders, ...locSchema.optionalHeaders];
    const locRows = await this.transport.getRows(locSchema.sheetName);
    if (locRows.length === 0) {
      const locHeaderMap = new HeaderMap(locHeaders, locHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(locSchema.sheetName, locHeaders);
      } else {
        await this.transport.addRow(locSchema.sheetName, locHeaders);
      }
      const row = locHeaderMap.buildRow({
        id: REAL_STORE_LOCATION.id,
        tenantId,
        storeId,
        name: REAL_STORE_LOCATION.name,
        address: REAL_STORE_LOCATION.address,
        isActive: REAL_STORE_LOCATION.isActive ? 'TRUE' : 'FALSE',
        createdAt: now,
        updatedAt: now,
      });
      await this.transport.addRow(locSchema.sheetName, row);
      result.storeLocationsStatus = 'PROVISIONED';
    } else {
      result.storeLocationsStatus = 'EXISTS';
    }

    // 8. Provision Store Policies
    const polSchema = CanonicalSchemas.store_policies;
    const polHeaders = [...polSchema.requiredHeaders, ...polSchema.optionalHeaders];
    const polRows = await this.transport.getRows(polSchema.sheetName);
    if (polRows.length === 0) {
      const polHeaderMap = new HeaderMap(polHeaders, polHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(polSchema.sheetName, polHeaders);
      } else {
        await this.transport.addRow(polSchema.sheetName, polHeaders);
      }
      for (const pol of REAL_STORE_POLICIES) {
        const row = polHeaderMap.buildRow({
          id: pol.id,
          tenantId,
          storeId,
          policyType: pol.policyType,
          title: pol.title,
          content: pol.content,
          isActive: pol.isActive ? 'TRUE' : 'FALSE',
          createdAt: now,
          updatedAt: now,
        });
        await this.transport.addRow(polSchema.sheetName, row);
      }
      result.storePoliciesStatus = 'PROVISIONED';
    } else {
      result.storePoliciesStatus = 'EXISTS';
    }

    // 8.5. Provision Delivery Zones
    const dzSchema = CanonicalSchemas.delivery_zones;
    const dzHeaders = [...dzSchema.requiredHeaders, ...dzSchema.optionalHeaders];
    const dzRows = await this.transport.getRows(dzSchema.sheetName);
    if (dzRows.length === 0) {
      const dzHeaderMap = new HeaderMap(dzHeaders, dzHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(dzSchema.sheetName, dzHeaders);
      } else {
        await this.transport.addRow(dzSchema.sheetName, dzHeaders);
      }
      for (const dz of REAL_DELIVERY_ZONES) {
        const row = dzHeaderMap.buildRow({
          id: dz.id,
          tenantId,
          storeId,
          name: dz.name,
          deliveryFee: dz.deliveryFee,
          currency: dz.currency,
          estimatedDeliveryMinutes: dz.estimatedDeliveryMinutes,
          isActive: dz.isActive ? 'TRUE' : 'FALSE',
          displayOrder: dz.displayOrder.toString(),
          createdAt: now,
          updatedAt: now,
        });
        await this.transport.addRow(dzSchema.sheetName, row);
      }
      result.deliveryZonesStatus = 'PROVISIONED';
    } else {
      result.deliveryZonesStatus = 'EXISTS';
    }

    // 9. Provision Digital Services
    const dsSchema = CanonicalSchemas.digital_services;
    const dsHeaders = [...dsSchema.requiredHeaders, ...dsSchema.optionalHeaders];
    const dsRows = await this.transport.getRows(dsSchema.sheetName);
    if (dsRows.length === 0) {
      const dsHeaderMap = new HeaderMap(dsHeaders, dsHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(dsSchema.sheetName, dsHeaders);
      } else {
        await this.transport.addRow(dsSchema.sheetName, dsHeaders);
      }
      for (const ds of REAL_DIGITAL_SERVICES) {
        const row = dsHeaderMap.buildRow({
          id: ds.id,
          tenantId,
          storeId,
          name: ds.name,
          serviceType: ds.serviceType,
          description: ds.description,
          isActive: ds.isActive ? 'TRUE' : 'FALSE',
          displayOrder: '1',
          createdAt: now,
          updatedAt: now,
        });
        await this.transport.addRow(dsSchema.sheetName, row);
      }
      result.digitalServicesStatus = 'PROVISIONED';
    } else {
      result.digitalServicesStatus = 'EXISTS';
    }

    // 10. Post-Write Read-Back Verification for Payment Methods, Contacts, and Notices
    const readBackPm = await this.transport.getRows(pmSchema.sheetName);
    let countPm = 0;
    if (readBackPm.length > 0) {
      const h = new HeaderMap(readBackPm[0].values, pmHeaders);
      for (let i = 1; i < readBackPm.length; i++) {
        if (h.getValue(readBackPm[i].values, 'tenantId') === tenantId && h.getValue(readBackPm[i].values, 'storeId') === storeId) {
          countPm++;
        }
      }
    }
    result.totalPaymentMethodsReadBack = countPm;

    const readBackCnt = await this.transport.getRows(cntSchema.sheetName);
    let countCnt = 0;
    if (readBackCnt.length > 0) {
      const h = new HeaderMap(readBackCnt[0].values, cntHeaders);
      for (let i = 1; i < readBackCnt.length; i++) {
        if (h.getValue(readBackCnt[i].values, 'tenantId') === tenantId && h.getValue(readBackCnt[i].values, 'storeId') === storeId) {
          countCnt++;
        }
      }
    }
    result.totalContactsReadBack = countCnt;

    const readBackNtc = await this.transport.getRows(ntcSchema.sheetName);
    let countNtc = 0;
    if (readBackNtc.length > 0) {
      const h = new HeaderMap(readBackNtc[0].values, ntcHeaders);
      for (let i = 1; i < readBackNtc.length; i++) {
        if (h.getValue(readBackNtc[i].values, 'tenantId') === tenantId && h.getValue(readBackNtc[i].values, 'storeId') === storeId) {
          countNtc++;
        }
      }
    }
    result.totalNoticesReadBack = countNtc;

    // 11. Run Auto-Fields Reconciliation & Data Validations
    const reconciler = new GoogleSheetsAdminReconciler(this.transport);
    await reconciler.reconcileAll();

    return result;
  }
}

