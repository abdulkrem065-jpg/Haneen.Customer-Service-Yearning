import { IGoogleSheetsTransport } from './transport';
import { HeaderMap } from './header-map';
import { generateSequentialAutoId, validateAndCleanValue, VALIDATION_RULES } from './validation-and-autoid';
import { CanonicalSchemas } from './schema-definitions';

export interface ReconciliationSummary {
  productsReconciled: number;
  productsAutoFieldsFilled: number;
  categoriesReconciled: number;
  categoriesAutoFieldsFilled: number;
  paymentMethodsReconciled: number;
  paymentMethodsAutoFieldsFilled: number;
  contactsReconciled: number;
  contactsAutoFieldsFilled: number;
  dataValidationsApplied: boolean;
}

export class GoogleSheetsAdminReconciler {
  constructor(private transport: IGoogleSheetsTransport) {}

  async reconcileAll(): Promise<ReconciliationSummary> {
    const summary: ReconciliationSummary = {
      productsReconciled: 0,
      productsAutoFieldsFilled: 0,
      categoriesReconciled: 0,
      categoriesAutoFieldsFilled: 0,
      paymentMethodsReconciled: 0,
      paymentMethodsAutoFieldsFilled: 0,
      contactsReconciled: 0,
      contactsAutoFieldsFilled: 0,
      dataValidationsApplied: false,
    };

    // 1. Reconcile Categories
    const catResult = await this.reconcileCategories();
    summary.categoriesReconciled = catResult.total;
    summary.categoriesAutoFieldsFilled = catResult.updated;

    // 2. Reconcile Products
    const prodResult = await this.reconcileProducts(catResult.categoryMap);
    summary.productsReconciled = prodResult.total;
    summary.productsAutoFieldsFilled = prodResult.updated;

    // 3. Reconcile Payment Methods
    const pmResult = await this.reconcilePaymentMethods();
    summary.paymentMethodsReconciled = pmResult.total;
    summary.paymentMethodsAutoFieldsFilled = pmResult.updated;

    // 4. Reconcile Store Contacts
    const cntResult = await this.reconcileStoreContacts();
    summary.contactsReconciled = cntResult.total;
    summary.contactsAutoFieldsFilled = cntResult.updated;

    // 5. Apply Google Sheets Data Validations
    await this.applyAllDataValidations(catResult.categoryNames);
    summary.dataValidationsApplied = true;

    return summary;
  }

  async reconcileCategories() {
    const sheetName = CanonicalSchemas.categories.sheetName;
    const exists = await this.transport.ensureSheetExists?.(sheetName);
    const rows = await this.transport.getRows(sheetName);

    const categoryMap: Map<string, string> = new Map(); // Name -> Id
    const categoryNames: string[] = [];

    if (rows.length <= 1) {
      return { total: 0, updated: 0, categoryMap, categoryNames };
    }

    const headers = rows[0].values;
    const headerMap = new HeaderMap(headers, headers);
    const existingIds: string[] = [];

    // First pass: gather existing cat- IDs
    for (let i = 1; i < rows.length; i++) {
      const idVal = headerMap.getValue(rows[i].values, 'id');
      if (idVal && idVal.trim()) {
        existingIds.push(idVal.trim());
      }
    }

    let updatedCount = 0;
    const nowISO = new Date().toISOString();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowVals = [...row.values];
      let rowModified = false;

      // Category Name
      const name = headerMap.getValue(rowVals, 'name') || 'تصنيف جديد';
      if (!headerMap.getValue(rowVals, 'name')) {
        headerMap.setValue(rowVals, 'name', name);
        rowModified = true;
      }

      // ID
      let id = headerMap.getValue(rowVals, 'id');
      if (!id || !id.trim()) {
        id = generateSequentialAutoId('cat', existingIds);
        existingIds.push(id);
        headerMap.setValue(rowVals, 'id', id);
        rowModified = true;
      }
      categoryMap.set(name, id);
      categoryNames.push(name);

      // Tenant & Store
      if (headerMap.getValue(rowVals, 'tenantId') !== 'tnt-41f0d530') {
        headerMap.setValue(rowVals, 'tenantId', 'tnt-41f0d530');
        rowModified = true;
      }
      if (headerMap.getValue(rowVals, 'storeId') !== 'str-2c6ad81f') {
        headerMap.setValue(rowVals, 'storeId', 'str-2c6ad81f');
        rowModified = true;
      }

      // isActive
      const rawActive = headerMap.getValue(rowVals, 'isActive') || 'TRUE';
      const cleanActive = validateAndCleanValue('isActive', rawActive, { field: 'isActive', type: 'BOOLEAN' });
      if (cleanActive !== rawActive) {
        headerMap.setValue(rowVals, 'isActive', cleanActive);
        rowModified = true;
      }

      // Timestamps
      if (!headerMap.getValue(rowVals, 'createdAt')) {
        headerMap.setValue(rowVals, 'createdAt', nowISO);
        rowModified = true;
      }
      if (!headerMap.getValue(rowVals, 'updatedAt') || rowModified) {
        headerMap.setValue(rowVals, 'updatedAt', nowISO);
        rowModified = true;
      }

      if (rowModified) {
        await this.transport.updateRow(sheetName, row.rowNumber, rowVals);
        updatedCount++;
      }
    }

    return { total: rows.length - 1, updated: updatedCount, categoryMap, categoryNames };
  }

  async reconcileProducts(categoryMap: Map<string, string>) {
    const sheetName = CanonicalSchemas.products.sheetName;
    await this.transport.ensureSheetExists?.(sheetName);
    const rows = await this.transport.getRows(sheetName);

    if (rows.length <= 1) {
      return { total: 0, updated: 0 };
    }

    const headers = rows[0].values;
    const headerMap = new HeaderMap(headers, headers);
    const existingIds: string[] = [];

    // First pass: collect existing IDs
    for (let i = 1; i < rows.length; i++) {
      const idVal = headerMap.getValue(rows[i].values, 'id');
      if (idVal && idVal.trim()) {
        existingIds.push(idVal.trim());
      }
    }

    let updatedCount = 0;
    const nowISO = new Date().toISOString();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowVals = [...row.values];
      let rowModified = false;

      // Name
      const name = headerMap.getValue(rowVals, 'name') || 'منتج جديد';
      if (!headerMap.getValue(rowVals, 'name')) {
        headerMap.setValue(rowVals, 'name', name);
        rowModified = true;
      }

      // Auto-ID
      let id = headerMap.getValue(rowVals, 'id');
      if (!id || !id.trim()) {
        id = generateSequentialAutoId('prod', existingIds);
        existingIds.push(id);
        headerMap.setValue(rowVals, 'id', id);
        rowModified = true;
      }

      // Tenant & Store
      if (headerMap.getValue(rowVals, 'tenantId') !== 'tnt-41f0d530') {
        headerMap.setValue(rowVals, 'tenantId', 'tnt-41f0d530');
        rowModified = true;
      }
      if (headerMap.getValue(rowVals, 'storeId') !== 'str-2c6ad81f') {
        headerMap.setValue(rowVals, 'storeId', 'str-2c6ad81f');
        rowModified = true;
      }

      // Currency
      const rawCurrency = (headerMap.getValue(rowVals, 'currency') || 'YER').trim().toUpperCase();
      const validCurrency = ['YER', 'SAR', 'USD'].includes(rawCurrency) ? rawCurrency : 'YER';
      if (headerMap.getValue(rowVals, 'currency') !== validCurrency) {
        headerMap.setValue(rowVals, 'currency', validCurrency);
        rowModified = true;
      }

      // inStock
      const rawInStock = headerMap.getValue(rowVals, 'inStock') || 'TRUE';
      const cleanInStock = validateAndCleanValue('inStock', rawInStock, { field: 'inStock', type: 'BOOLEAN' });
      if (cleanInStock !== rawInStock) {
        headerMap.setValue(rowVals, 'inStock', cleanInStock);
        rowModified = true;
      }

      // Price
      const rawPrice = headerMap.getValue(rowVals, 'price') || '0';
      const cleanPrice = validateAndCleanValue('price', rawPrice, { field: 'price', type: 'NUMERIC', defaultValue: '0' });
      if (cleanPrice !== rawPrice) {
        headerMap.setValue(rowVals, 'price', cleanPrice);
        rowModified = true;
      }

      // Quantity
      const rawQuantity = headerMap.getValue(rowVals, 'quantity') || headerMap.getValue(rowVals, 'inventoryCount') || '0';
      const cleanQuantity = validateAndCleanValue('quantity', rawQuantity, { field: 'quantity', type: 'NUMERIC', defaultValue: '0' });
      if (cleanQuantity !== rawQuantity) {
        headerMap.setValue(rowVals, 'quantity', cleanQuantity);
        rowModified = true;
      }

      // Category Mapping (If user typed category name instead of categoryId)
      let catVal = headerMap.getValue(rowVals, 'categoryId') || headerMap.getValue(rowVals, 'category') || '';
      if (catVal && categoryMap.has(catVal)) {
        const mappedId = categoryMap.get(catVal)!;
        if (headerMap.getValue(rowVals, 'categoryId') !== mappedId) {
          headerMap.setValue(rowVals, 'categoryId', mappedId);
          rowModified = true;
        }
      }

      // Timestamps
      if (!headerMap.getValue(rowVals, 'createdAt')) {
        headerMap.setValue(rowVals, 'createdAt', nowISO);
        rowModified = true;
      }
      if (!headerMap.getValue(rowVals, 'updatedAt') || rowModified) {
        headerMap.setValue(rowVals, 'updatedAt', nowISO);
        rowModified = true;
      }

      if (rowModified) {
        await this.transport.updateRow(sheetName, row.rowNumber, rowVals);
        updatedCount++;
      }
    }

    return { total: rows.length - 1, updated: updatedCount };
  }

  async reconcilePaymentMethods() {
    const sheetName = CanonicalSchemas.payment_methods.sheetName;
    await this.transport.ensureSheetExists?.(sheetName);
    const rows = await this.transport.getRows(sheetName);

    if (rows.length <= 1) {
      return { total: 0, updated: 0 };
    }

    const headers = rows[0].values;
    const headerMap = new HeaderMap(headers, headers);
    const existingIds: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const idVal = headerMap.getValue(rows[i].values, 'id');
      if (idVal && idVal.trim()) {
        existingIds.push(idVal.trim());
      }
    }

    let updatedCount = 0;
    const nowISO = new Date().toISOString();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowVals = [...row.values];
      let rowModified = false;

      // Name / DisplayName
      const name = headerMap.getValue(rowVals, 'displayName') || headerMap.getValue(rowVals, 'name') || 'طريقة دفع';
      if (!headerMap.getValue(rowVals, 'displayName')) {
        headerMap.setValue(rowVals, 'displayName', name);
        rowModified = true;
      }

      // Auto-ID
      let id = headerMap.getValue(rowVals, 'id');
      if (!id || !id.trim()) {
        id = generateSequentialAutoId('pm', existingIds);
        existingIds.push(id);
        headerMap.setValue(rowVals, 'id', id);
        rowModified = true;
      }

      // Tenant & Store
      if (headerMap.getValue(rowVals, 'tenantId') !== 'tnt-41f0d530') {
        headerMap.setValue(rowVals, 'tenantId', 'tnt-41f0d530');
        rowModified = true;
      }
      if (headerMap.getValue(rowVals, 'storeId') !== 'str-2c6ad81f') {
        headerMap.setValue(rowVals, 'storeId', 'str-2c6ad81f');
        rowModified = true;
      }

      // methodType / type
      const rawType = headerMap.getValue(rowVals, 'methodType') || headerMap.getValue(rowVals, 'type') || 'WALLET';
      const pmRule = VALIDATION_RULES.payment_methods?.find(r => r.field === 'methodType');
      const cleanType = validateAndCleanValue('methodType', rawType, pmRule);
      if (cleanType !== rawType) {
        headerMap.setValue(rowVals, 'methodType', cleanType);
        rowModified = true;
      }

      // isActive
      const rawActive = headerMap.getValue(rowVals, 'isActive') || 'TRUE';
      const cleanActive = validateAndCleanValue('isActive', rawActive, { field: 'isActive', type: 'BOOLEAN' });
      if (cleanActive !== rawActive) {
        headerMap.setValue(rowVals, 'isActive', cleanActive);
        rowModified = true;
      }

      // Timestamps
      if (!headerMap.getValue(rowVals, 'createdAt')) {
        headerMap.setValue(rowVals, 'createdAt', nowISO);
        rowModified = true;
      }
      if (!headerMap.getValue(rowVals, 'updatedAt') || rowModified) {
        headerMap.setValue(rowVals, 'updatedAt', nowISO);
        rowModified = true;
      }

      if (rowModified) {
        await this.transport.updateRow(sheetName, row.rowNumber, rowVals);
        updatedCount++;
      }
    }

    return { total: rows.length - 1, updated: updatedCount };
  }

  async reconcileStoreContacts() {
    const sheetName = CanonicalSchemas.store_contacts.sheetName;
    await this.transport.ensureSheetExists?.(sheetName);
    const rows = await this.transport.getRows(sheetName);

    if (rows.length <= 1) {
      return { total: 0, updated: 0 };
    }

    const headers = rows[0].values;
    const headerMap = new HeaderMap(headers, headers);
    const existingIds: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const idVal = headerMap.getValue(rows[i].values, 'id');
      if (idVal && idVal.trim()) {
        existingIds.push(idVal.trim());
      }
    }

    let updatedCount = 0;
    const nowISO = new Date().toISOString();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowVals = [...row.values];
      let rowModified = false;

      // Auto-ID
      let id = headerMap.getValue(rowVals, 'id');
      if (!id || !id.trim()) {
        id = generateSequentialAutoId('cnt', existingIds);
        existingIds.push(id);
        headerMap.setValue(rowVals, 'id', id);
        rowModified = true;
      }

      // Tenant & Store
      if (headerMap.getValue(rowVals, 'tenantId') !== 'tnt-41f0d530') {
        headerMap.setValue(rowVals, 'tenantId', 'tnt-41f0d530');
        rowModified = true;
      }
      if (headerMap.getValue(rowVals, 'storeId') !== 'str-2c6ad81f') {
        headerMap.setValue(rowVals, 'storeId', 'str-2c6ad81f');
        rowModified = true;
      }

      // channelType / type
      const rawType = headerMap.getValue(rowVals, 'channelType') || headerMap.getValue(rowVals, 'type') || 'WHATSAPP';
      const cntRule = VALIDATION_RULES.store_contacts?.find(r => r.field === 'channelType');
      const cleanType = validateAndCleanValue('channelType', rawType, cntRule);
      if (cleanType !== rawType) {
        headerMap.setValue(rowVals, 'channelType', cleanType);
        rowModified = true;
      }

      // isActive
      const rawActive = headerMap.getValue(rowVals, 'isActive') || 'TRUE';
      const cleanActive = validateAndCleanValue('isActive', rawActive, { field: 'isActive', type: 'BOOLEAN' });
      if (cleanActive !== rawActive) {
        headerMap.setValue(rowVals, 'isActive', cleanActive);
        rowModified = true;
      }

      // Timestamps
      if (!headerMap.getValue(rowVals, 'createdAt')) {
        headerMap.setValue(rowVals, 'createdAt', nowISO);
        rowModified = true;
      }
      if (!headerMap.getValue(rowVals, 'updatedAt') || rowModified) {
        headerMap.setValue(rowVals, 'updatedAt', nowISO);
        rowModified = true;
      }

      if (rowModified) {
        await this.transport.updateRow(sheetName, row.rowNumber, rowVals);
        updatedCount++;
      }
    }

    return { total: rows.length - 1, updated: updatedCount };
  }

  async applyAllDataValidations(categoryNames: string[]) {
    if (!this.transport.applyDataValidation) return;

    // 1. Products validations
    const prodHeaders = CanonicalSchemas.products.requiredHeaders;

    // currency (col index)
    const currencyIdx = prodHeaders.indexOf('currency');
    if (currencyIdx >= 0) {
      await this.transport.applyDataValidation('products', currencyIdx, ['YER', 'SAR', 'USD']);
    }

    // inStock
    const inStockIdx = prodHeaders.indexOf('inStock');
    if (inStockIdx >= 0) {
      await this.transport.applyDataValidation('products', inStockIdx, ['TRUE', 'FALSE']);
    }

    // category dropdown
    const catIdx = prodHeaders.indexOf('categoryId');
    if (catIdx >= 0 && categoryNames.length > 0) {
      await this.transport.applyDataValidation('products', catIdx, categoryNames);
    }

    // numeric validations for price and quantity
    const priceIdx = prodHeaders.indexOf('price');
    if (priceIdx >= 0 && this.transport.applyNumberValidation) {
      await this.transport.applyNumberValidation('products', priceIdx, 0, false);
    }
    const quantityIdx = prodHeaders.indexOf('quantity');
    if (quantityIdx >= 0 && this.transport.applyNumberValidation) {
      await this.transport.applyNumberValidation('products', quantityIdx, 0, true);
    }

    // 2. Categories validations
    const catHeaders = CanonicalSchemas.categories.requiredHeaders;
    const catActiveIdx = catHeaders.indexOf('isActive');
    if (catActiveIdx >= 0) {
      await this.transport.applyDataValidation('categories', catActiveIdx, ['TRUE', 'FALSE']);
    }

    // 3. Payment Methods validations
    const pmHeaders = CanonicalSchemas.payment_methods.requiredHeaders;
    const pmTypeIdx = pmHeaders.indexOf('methodType');
    if (pmTypeIdx >= 0) {
      await this.transport.applyDataValidation('payment_methods', pmTypeIdx, ['WALLET', 'CASH', 'BANK', 'OTHER']);
    }
    const pmActiveIdx = pmHeaders.indexOf('isActive');
    if (pmActiveIdx >= 0) {
      await this.transport.applyDataValidation('payment_methods', pmActiveIdx, ['TRUE', 'FALSE']);
    }

    // 4. Store Contacts validations
    const cntHeaders = CanonicalSchemas.store_contacts.requiredHeaders;
    const cntTypeIdx = cntHeaders.indexOf('channelType');
    if (cntTypeIdx >= 0) {
      await this.transport.applyDataValidation('store_contacts', cntTypeIdx, ['PHONE', 'WHATSAPP', 'EMAIL', 'OTHER']);
    }
    const cntActiveIdx = cntHeaders.indexOf('isActive');
    if (cntActiveIdx >= 0) {
      await this.transport.applyDataValidation('store_contacts', cntActiveIdx, ['TRUE', 'FALSE']);
    }
  }
}
