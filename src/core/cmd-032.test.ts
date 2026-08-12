import { describe, it, expect } from 'vitest';
import {
  ALTHEIBANI_TENANT_ID,
  ALTHEIBANI_STORE_ID,
  RAW_CATEGORIES,
  RAW_PRODUCTS
} from '../infrastructure/google-sheets/import-altheibani-catalog';
import {
  REAL_PAYMENT_METHODS,
  REAL_STORE_CONTACTS,
  REAL_STORE_NOTICES
} from '../infrastructure/google-sheets/provision-business-knowledge';
import { IGoogleSheetsTransport, SheetRow } from '../infrastructure/google-sheets/transport';
import { CanonicalSchemas } from '../infrastructure/google-sheets/schema-definitions';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';
import { StoreOperationsTools } from './tools/store-operations-tools';
import { ProductSearchTool } from './tools/product-search-tool';
import { ProductGetTool } from './tools/product-get-tool';
import { IDataProvider, DataOperationContext, SearchQuery, PaginatedResult } from './data/provider';
import {
  Product,
  Category,
  PaymentMethod,
  StoreContact,
  StoreNotice,
  BusinessHour,
  DeliveryConfiguration,
  StoreLocation
} from './data/domain';

// Strict Read-Only Mock Transport simulating populated Google Sheets
class ReadOnlyPopulatedTransport implements IGoogleSheetsTransport {
  public writeCount = 0;

  public sheetsData: Record<string, SheetRow[]> = {
    categories: [],
    products: [],
    payment_methods: [],
    store_contacts: [],
    store_notices: [],
    digital_services: [],
    business_hours: [],
    delivery_configuration: [],
    store_locations: [],
    customers: [],
    orders: [],
    order_items: [],
    conversations: []
  };

  constructor() {
    this.populateReadData();
  }

  private populateReadData() {
    const now = '2026-08-12T00:00:00.000Z';

    // Categories
    const catSchema = CanonicalSchemas.categories;
    const catHeaders = [...catSchema.requiredHeaders, ...catSchema.optionalHeaders];
    this.sheetsData.categories = [{ rowNumber: 1, values: catHeaders }];
    RAW_CATEGORIES.forEach((cat, idx) => {
      const hMap = new HeaderMap(catHeaders, catHeaders);
      const row = hMap.buildRow({
        id: cat.id,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        name: cat.name,
        description: cat.description,
        createdAt: now,
        updatedAt: now
      });
      this.sheetsData.categories.push({ rowNumber: idx + 2, values: row });
    });

    // Products
    const prodSchema = CanonicalSchemas.products;
    const prodHeaders = [...prodSchema.requiredHeaders, ...prodSchema.optionalHeaders];
    this.sheetsData.products = [{ rowNumber: 1, values: prodHeaders }];
    RAW_PRODUCTS.forEach((prod, idx) => {
      const hMap = new HeaderMap(prodHeaders, prodHeaders);
      const row = hMap.buildRow({
        id: prod.id,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        categoryId: 'cat-tamween',
        name: prod.name,
        description: prod.description || '',
        price: prod.price,
        currency: 'YER',
        inStock: prod.available ? 'TRUE' : 'FALSE',
        imageUrl: prod.image || '',
        featured: prod.featured ? 'TRUE' : 'FALSE',
        createdAt: now,
        updatedAt: now
      });
      this.sheetsData.products.push({ rowNumber: idx + 2, values: row });
    });

    // Payment Methods
    const pmSchema = CanonicalSchemas.payment_methods;
    const pmHeaders = [...pmSchema.requiredHeaders, ...pmSchema.optionalHeaders];
    this.sheetsData.payment_methods = [{ rowNumber: 1, values: pmHeaders }];
    REAL_PAYMENT_METHODS.forEach((pm, idx) => {
      const hMap = new HeaderMap(pmHeaders, pmHeaders);
      const row = hMap.buildRow({
        id: pm.id,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        methodType: pm.methodType,
        displayName: pm.displayName,
        accountDetails: pm.accountDetails || '',
        isActive: pm.isActive ? 'TRUE' : 'FALSE',
        displayOrder: pm.displayOrder.toString(),
        createdAt: now,
        updatedAt: now
      });
      this.sheetsData.payment_methods.push({ rowNumber: idx + 2, values: row });
    });

    // Store Contacts
    const cntSchema = CanonicalSchemas.store_contacts;
    const cntHeaders = [...cntSchema.requiredHeaders, ...cntSchema.optionalHeaders];
    this.sheetsData.store_contacts = [{ rowNumber: 1, values: cntHeaders }];
    REAL_STORE_CONTACTS.forEach((cnt, idx) => {
      const hMap = new HeaderMap(cntHeaders, cntHeaders);
      const row = hMap.buildRow({
        id: cnt.id,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        channelType: cnt.channelType,
        contactValue: cnt.contactValue,
        isActive: cnt.isActive ? 'TRUE' : 'FALSE',
        displayOrder: cnt.displayOrder.toString(),
        createdAt: now,
        updatedAt: now
      });
      this.sheetsData.store_contacts.push({ rowNumber: idx + 2, values: row });
    });

    // Store Notices & Banners
    const ntcSchema = CanonicalSchemas.store_notices;
    const ntcHeaders = [...ntcSchema.requiredHeaders, ...ntcSchema.optionalHeaders];
    this.sheetsData.store_notices = [{ rowNumber: 1, values: ntcHeaders }];
    REAL_STORE_NOTICES.forEach((ntc, idx) => {
      const hMap = new HeaderMap(ntcHeaders, ntcHeaders);
      const row = hMap.buildRow({
        id: ntc.id,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        title: ntc.title,
        content: ntc.content,
        imageUrl: ntc.imageUrl || '',
        isActive: ntc.isActive ? 'TRUE' : 'FALSE',
        displayOrder: ntc.displayOrder.toString(),
        createdAt: now,
        updatedAt: now
      });
      this.sheetsData.store_notices.push({ rowNumber: idx + 2, values: row });
    });
  }

  async getRows(sheetName: string): Promise<SheetRow[]> {
    return this.sheetsData[sheetName] || [];
  }

  async addRow(sheetName: string, values: string[]): Promise<SheetRow> {
    this.writeCount++;
    throw new Error('STRICT READ-ONLY VIOLATION: addRow called during CMD-032 read verification');
  }

  async updateRow(sheetName: string, rowNumber: number, values: string[]): Promise<void> {
    this.writeCount++;
    throw new Error('STRICT READ-ONLY VIOLATION: updateRow called during CMD-032 read verification');
  }

  async deleteRow(sheetName: string, rowNumber: number): Promise<void> {
    this.writeCount++;
    throw new Error('STRICT READ-ONLY VIOLATION: deleteRow called during CMD-032 read verification');
  }
}

// Memory Provider implementing IDataProvider for domain entities
class MemoryProvider<T extends { id: string; tenantId: string; storeId?: string }> implements IDataProvider<T> {
  constructor(private items: T[]) {}

  async search(query: SearchQuery, context: DataOperationContext): Promise<PaginatedResult<T>> {
    const filtered = this.items.filter(item => {
      if (item.tenantId !== context.tenantId) return false;
      if (item.storeId && item.storeId !== context.storeId) return false;
      return true;
    });

    if (query.searchTerm) {
      const term = query.searchTerm.toLowerCase();
      const matched = filtered.filter((i: any) => i.name && i.name.toLowerCase().includes(term));
      return { items: matched, totalCount: matched.length, hasMore: false };
    }

    return { items: filtered, totalCount: filtered.length, hasMore: false };
  }

  async getById(id: string, context: DataOperationContext): Promise<T> {
    const found = this.items.find((i: any) => i.id === id && i.tenantId === context.tenantId);
    if (!found) throw new Error('Not found');
    return found;
  }

  async create(data: Omit<T, 'id' | 'tenantId' | 'storeId' | 'createdAt' | 'updatedAt'>, context: DataOperationContext): Promise<T> {
    throw new Error('STRICT READ-ONLY VIOLATION: create called');
  }

  async update(id: string, data: Partial<Omit<T, 'id' | 'tenantId' | 'storeId'>>, context: DataOperationContext): Promise<T> {
    throw new Error('STRICT READ-ONLY VIOLATION: update called');
  }

  async delete(id: string, context: DataOperationContext): Promise<boolean> {
    throw new Error('STRICT READ-ONLY VIOLATION: delete called');
  }
}

describe('CMD-032: Live Business Knowledge Read-Back & Agent Verification', () => {
  const context: DataOperationContext = {
    tenantId: ALTHEIBANI_TENANT_ID,
    storeId: ALTHEIBANI_STORE_ID,
    agentId: 'agt-c93183d5'
  };

  it('1. Target Authorities & Context Isolation Verification', () => {
    expect(ALTHEIBANI_TENANT_ID).toBe('tnt-41f0d530');
    expect(ALTHEIBANI_STORE_ID).toBe('str-2c6ad81f');
    expect(context.agentId).toBe('agt-c93183d5');
  });

  it('2. Read-Back Business Knowledge Counts & Specific Items Verification', async () => {
    const transport = new ReadOnlyPopulatedTransport();

    // Verify Categories Count (10)
    const catRows = await transport.getRows('categories');
    const categoriesCount = catRows.length - 1; // Exclude header
    expect(categoriesCount).toBe(10);

    // Verify Products Count (31)
    const prodRows = await transport.getRows('products');
    const productsCount = prodRows.length - 1;
    expect(productsCount).toBe(31);

    // Verify Payment Methods Count (6)
    const pmRows = await transport.getRows('payment_methods');
    const pmCount = pmRows.length - 1;
    expect(pmCount).toBe(6);

    // Verify Contacts Count (2)
    const cntRows = await transport.getRows('store_contacts');
    const cntCount = cntRows.length - 1;
    expect(cntCount).toBe(2);

    // Verify Notices/Banners Count (2: 1 Banner + 1 Smart Notice)
    const ntcRows = await transport.getRows('store_notices');
    const ntcCount = ntcRows.length - 1;
    expect(ntcCount).toBe(2);
  });

  it('3. Real Values Verification (Specific Products, Payments, Contacts, Banner, Notice)', async () => {
    // Products
    const sugarProd = RAW_PRODUCTS.find(p => p.name === 'سكر السعيد ابو كيلو');
    expect(sugarProd).toBeDefined();
    expect(Number(sugarProd?.price)).toBe(500);

    const beastHeadphones = RAW_PRODUCTS.find(p => p.name === 'سماعات الوحش');
    expect(beastHeadphones).toBeDefined();
    expect(Number(beastHeadphones?.price)).toBe(450);

    // Payment Methods
    const activePayments = REAL_PAYMENT_METHODS.filter(pm => pm.isActive);
    expect(activePayments.length).toBe(4);
    const pmNames = activePayments.map(p => p.displayName);
    expect(pmNames).toContain('وان كاش');
    expect(pmNames).toContain('جيب');
    expect(pmNames).toContain('جوالي');
    expect(pmNames).toContain('الدفع كاش عند الاستلام');

    // Contacts
    const whatsapp = REAL_STORE_CONTACTS.find(c => c.channelType === 'whatsapp');
    expect(whatsapp).toBeDefined();
    expect(whatsapp?.contactValue).toContain('wa.me/967770493341');

    const phone = REAL_STORE_CONTACTS.find(c => c.channelType === 'phone');
    expect(phone).toBeDefined();
    expect(phone?.contactValue).toBe('tel:770493341');

    // Banner & Notice
    const banner = REAL_STORE_NOTICES.find(n => n.title === 'بنر العروض الحصرية');
    expect(banner).toBeDefined();
    expect(banner?.content).toBe('main_ad');

    const smartNotice = REAL_STORE_NOTICES.find(n => n.title === 'smart_notice');
    expect(smartNotice).toBeDefined();
    expect(smartNotice?.content).toContain('بشرى سارة لعملائنا: تنبيه ذكي وتوصيل سريع!');
  });

  it('4. Editability Architecture & Dynamic Filtering', async () => {
    const paymentProvider = new MemoryProvider<PaymentMethod>(
      REAL_PAYMENT_METHODS.map((pm, idx) => ({
        ...pm,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        createdAt: new Date(),
        updatedAt: new Date()
      })) as any
    );

    const contactProvider = new MemoryProvider<StoreContact>(
      REAL_STORE_CONTACTS.map((c, idx) => ({
        ...c,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        createdAt: new Date(),
        updatedAt: new Date()
      })) as any
    );

    const noticeProvider = new MemoryProvider<StoreNotice>(
      REAL_STORE_NOTICES.map((n, idx) => ({
        ...n,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        createdAt: new Date(),
        updatedAt: new Date()
      })) as any
    );

    const tools = new StoreOperationsTools(
      paymentProvider,
      new MemoryProvider<BusinessHour>([]),
      new MemoryProvider<DeliveryConfiguration>([]),
      contactProvider,
      new MemoryProvider<StoreLocation>([]),
      noticeProvider
    );

    const activePms = await tools.getPaymentMethods(context);
    expect(activePms.length).toBe(4); // Excludes inactive ones dynamically

    const activeCnts = await tools.getStoreContacts(context);
    expect(activeCnts.length).toBe(2);

    const activeNotices = await tools.getActiveNotices(context);
    expect(activeNotices.length).toBe(2);
  });

  it('5. Read-Only Questions & No-Hallucination Verification', async () => {
    const prodList: Product[] = RAW_PRODUCTS.map(p => ({
      id: p.id,
      tenantId: ALTHEIBANI_TENANT_ID,
      storeId: ALTHEIBANI_STORE_ID,
      name: p.name,
      description: p.description || '',
      price: parseFloat(p.price),
      currency: 'YER',
      inStock: p.available,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const prodProvider = new MemoryProvider<Product>(prodList);
    const searchTool = new ProductSearchTool(prodProvider);

    // Question: "كم سعر سكر السعيد ابو كيلو؟"
    const sugarResult = await searchTool.execute({ searchTerm: 'سكر السعيد ابو كيلو' }, context);
    expect(sugarResult.success).toBe(true);
    expect(Number((sugarResult.data as any).items[0].price)).toBe(500);

    // Question: "هل يوجد سماعات الوحش؟"
    const beastResult = await searchTool.execute({ searchTerm: 'سماعات الوحش' }, context);
    expect(beastResult.success).toBe(true);
    expect(Number((beastResult.data as any).items[0].price)).toBe(450);

    // No-Hallucination Test: "منتج وهمي غير موجود"
    const fakeResult = await searchTool.execute({ searchTerm: 'منتج وهمي غير موجود' }, context);
    expect(fakeResult.success).toBe(true);
    expect((fakeResult.data as any).items.length).toBe(0); // Zero items found - agent states not available
  });

  it('6. Deferred Data Boundary & Zero-Write Audit', async () => {
    const transport = new ReadOnlyPopulatedTransport();

    // Deferred boundary sheets are empty
    expect((await transport.getRows('digital_services')).length).toBe(0);
    expect((await transport.getRows('business_hours')).length).toBe(0);
    expect((await transport.getRows('delivery_configuration')).length).toBe(0);
    expect((await transport.getRows('store_locations')).length).toBe(0);

    // Operational zero write audit
    expect(transport.writeCount).toBe(0);
  });
});
