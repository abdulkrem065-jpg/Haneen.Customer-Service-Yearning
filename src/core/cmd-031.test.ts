import { describe, it, expect } from 'vitest';
import {
  BusinessKnowledgeProvisioner,
  REAL_PAYMENT_METHODS,
  REAL_STORE_CONTACTS,
  REAL_STORE_NOTICES
} from '../infrastructure/google-sheets/provision-business-knowledge';
import {
  RAW_CATEGORIES,
  RAW_PRODUCTS,
  ALTHEIBANI_TENANT_ID,
  ALTHEIBANI_STORE_ID
} from '../infrastructure/google-sheets/import-altheibani-catalog';
import { IGoogleSheetsTransport, SheetRow } from '../infrastructure/google-sheets/transport';
import { CanonicalSchemas } from '../infrastructure/google-sheets/schema-definitions';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';

class MockTransport implements IGoogleSheetsTransport {
  public sheetsData: Record<string, SheetRow[]> = {
    categories: [],
    products: [],
    payment_methods: [],
    store_contacts: [],
    store_notices: [],
    customers: [],
    orders: [],
    order_items: [],
    conversations: [],
    business_hours: [],
    delivery_configuration: [],
    store_locations: []
  };

  async getRows(sheetName: string): Promise<SheetRow[]> {
    return this.sheetsData[sheetName] || [];
  }

  async addRow(sheetName: string, values: string[]): Promise<SheetRow> {
    if (!this.sheetsData[sheetName]) {
      this.sheetsData[sheetName] = [];
    }
    const rowNumber = this.sheetsData[sheetName].length + 1;
    const row: SheetRow = { rowNumber, values };
    this.sheetsData[sheetName].push(row);
    return row;
  }

  async updateRow(sheetName: string, rowNumber: number, values: string[]): Promise<void> {
    if (this.sheetsData[sheetName] && this.sheetsData[sheetName][rowNumber - 1]) {
      this.sheetsData[sheetName][rowNumber - 1].values = values;
    }
  }

  async deleteRow(sheetName: string, rowNumber: number): Promise<void> {
    if (this.sheetsData[sheetName]) {
      this.sheetsData[sheetName].splice(rowNumber - 1, 1);
    }
  }

  async writeHeaderRow(sheetName: string, headers: string[]): Promise<void> {
    if (!this.sheetsData[sheetName] || this.sheetsData[sheetName].length === 0) {
      this.sheetsData[sheetName] = [{ rowNumber: 1, values: headers }];
    } else {
      this.sheetsData[sheetName][0] = { rowNumber: 1, values: headers };
    }
  }
}

describe('CMD-031: Real Business Knowledge Provisioning Verification', () => {
  it('1. Pre-flight Dataset Verification: Dataset sizes match exact requirements', () => {
    expect(RAW_CATEGORIES.length).toBe(10);
    expect(RAW_PRODUCTS.length).toBe(31);
    expect(REAL_PAYMENT_METHODS.length).toBe(6);
    expect(REAL_STORE_CONTACTS.length).toBe(2);
    expect(REAL_STORE_NOTICES.length).toBe(2);

    expect(ALTHEIBANI_TENANT_ID).toBe('tnt-41f0d530');
    expect(ALTHEIBANI_STORE_ID).toBe('str-2c6ad81f');
  });

  it('2. Execution & Post-Write Verification: Creates all items and verifies read-back counts', async () => {
    const transport = new MockTransport();
    const provisioner = new BusinessKnowledgeProvisioner(transport);

    const result = await provisioner.provisionAll();

    expect(result.errors).toEqual([]);
    expect(result.tenantId).toBe('tnt-41f0d530');
    expect(result.storeId).toBe('str-2c6ad81f');

    expect(result.categoriesCreated).toBe(10);
    expect(result.productsCreated).toBe(31);
    expect(result.paymentMethodsCreated).toBe(6);
    expect(result.contactsCreated).toBe(2);
    expect(result.noticesCreated).toBe(2);

    expect(result.totalCategoriesReadBack).toBe(10);
    expect(result.totalProductsReadBack).toBe(31);
    expect(result.totalPaymentMethodsReadBack).toBe(6);
    expect(result.totalContactsReadBack).toBe(2);
    expect(result.totalNoticesReadBack).toBe(2);

    // Verify payment methods contents
    const pmRows = transport.sheetsData['payment_methods'];
    const pmHeaders = [...CanonicalSchemas.payment_methods.requiredHeaders, ...CanonicalSchemas.payment_methods.optionalHeaders];
    const pmHMap = new HeaderMap(pmRows[0].values, pmHeaders);

    const pm1 = pmRows[1].values;
    expect(pmHMap.getValue(pm1, 'tenantId')).toBe('tnt-41f0d530');
    expect(pmHMap.getValue(pm1, 'storeId')).toBe('str-2c6ad81f');
    expect(pmHMap.getValue(pm1, 'displayName')).toBe('بنك الكريمي');
    expect(pmHMap.getValue(pm1, 'accountDetails')).toBe('306493341');
    expect(pmHMap.getValue(pm1, 'isActive')).toBe('FALSE');

    const pm3 = pmRows[3].values;
    expect(pmHMap.getValue(pm3, 'displayName')).toBe('وان كاش');
    expect(pmHMap.getValue(pm3, 'accountDetails')).toBe('770493341');
    expect(pmHMap.getValue(pm3, 'isActive')).toBe('TRUE');

    // Verify contact contents
    const cntRows = transport.sheetsData['store_contacts'];
    const cntHeaders = [...CanonicalSchemas.store_contacts.requiredHeaders, ...CanonicalSchemas.store_contacts.optionalHeaders];
    const cntHMap = new HeaderMap(cntRows[0].values, cntHeaders);

    const cnt1 = cntRows[1].values;
    expect(cntHMap.getValue(cnt1, 'channelType')).toBe('whatsapp');
    expect(cntHMap.getValue(cnt1, 'contactValue')).toBe('https://wa.me/967770493341');

    // Verify notice/banner contents
    const ntcRows = transport.sheetsData['store_notices'];
    const ntcHeaders = [...CanonicalSchemas.store_notices.requiredHeaders, ...CanonicalSchemas.store_notices.optionalHeaders];
    const ntcHMap = new HeaderMap(ntcRows[0].values, ntcHeaders);

    const ntc1 = ntcRows[1].values;
    expect(ntcHMap.getValue(ntc1, 'title')).toBe('بنر العروض الحصرية');
    expect(ntcHMap.getValue(ntc1, 'content')).toBe('main_ad');
    expect(ntcHMap.getValue(ntc1, 'imageUrl')).toBe('ad1.jpg');

    const ntc2 = ntcRows[2].values;
    expect(ntcHMap.getValue(ntc2, 'title')).toBe('smart_notice');
    expect(ntcHMap.getValue(ntc2, 'content')).toBe('بشرى سارة لعملائنا: تنبيه ذكي وتوصيل سريع!');
  });

  it('3. Idempotency Verification: Second run skips all existing records without duplicates', async () => {
    const transport = new MockTransport();
    const provisioner = new BusinessKnowledgeProvisioner(transport);

    // First run
    await provisioner.provisionAll();

    // Second run
    const result2 = await provisioner.provisionAll();

    expect(result2.categoriesCreated).toBe(0);
    expect(result2.productsCreated).toBe(0);
    expect(result2.paymentMethodsCreated).toBe(0);
    expect(result2.contactsCreated).toBe(0);
    expect(result2.noticesCreated).toBe(0);

    expect(result2.categoriesSkipped).toBe(10);
    expect(result2.productsSkipped).toBe(31);
    expect(result2.paymentMethodsSkipped).toBe(6);
    expect(result2.contactsSkipped).toBe(2);
    expect(result2.noticesSkipped).toBe(2);

    expect(result2.totalCategoriesReadBack).toBe(10);
    expect(result2.totalProductsReadBack).toBe(31);
    expect(result2.totalPaymentMethodsReadBack).toBe(6);
    expect(result2.totalContactsReadBack).toBe(2);
    expect(result2.totalNoticesReadBack).toBe(2);
  });

  it('4. Write Boundary & Deferred Sheets Verification: Operational tables remain empty', async () => {
    const transport = new MockTransport();
    const provisioner = new BusinessKnowledgeProvisioner(transport);

    await provisioner.provisionAll();

    // Forbidden sheets must be untouched (length 0)
    expect(transport.sheetsData['customers'].length).toBe(0);
    expect(transport.sheetsData['orders'].length).toBe(0);
    expect(transport.sheetsData['order_items'].length).toBe(0);
    expect(transport.sheetsData['conversations'].length).toBe(0);

    // Deferred sheets must be untouched
    expect(transport.sheetsData['business_hours'].length).toBe(0);
    expect(transport.sheetsData['delivery_configuration'].length).toBe(0);
    expect(transport.sheetsData['store_locations'].length).toBe(0);
  });
});
