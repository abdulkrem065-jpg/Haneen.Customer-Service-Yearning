import { describe, it, expect, vi } from 'vitest';
import {
  CatalogImporter,
  RAW_CATEGORIES,
  RAW_PRODUCTS,
  ALTHEIBANI_TENANT_ID,
  ALTHEIBANI_STORE_ID,
  ALTHEIBANI_CURRENCY
} from '../infrastructure/google-sheets/import-altheibani-catalog';
import { IGoogleSheetsTransport, SheetRow } from '../infrastructure/google-sheets/transport';
import { CanonicalSchemas } from '../infrastructure/google-sheets/schema-definitions';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';

class MockTransport implements IGoogleSheetsTransport {
  public sheetsData: Record<string, SheetRow[]> = {
    categories: [],
    products: []
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

describe('CMD-026: Import Real Al-Theibani Store Catalog Verification', () => {
  it('1. Raw Source Verification: Exactly 10 categories and 31 products are defined in raw input', () => {
    expect(RAW_CATEGORIES.length).toBe(10);
    expect(RAW_PRODUCTS.length).toBe(31);

    // Verify categories list matches requested categories
    const categoryNames = RAW_CATEGORIES.map(c => c.name);
    expect(categoryNames).toContain('تموين');
    expect(categoryNames).toContain('سمون وزيوت');
    expect(categoryNames).toContain('إلكترونيات');
    expect(categoryNames).toContain('منظفات');
    expect(categoryNames).toContain('حفاضات');
    expect(categoryNames).toContain('ادوات منزليه');
    expect(categoryNames).toContain('ادوات التجميل');
    expect(categoryNames).toContain('مستلزمات اطفال');
    expect(categoryNames).toContain('ادوات كهرباء');
    expect(categoryNames).toContain('ترفيه');
  });

  it('2. Execution & Post-Write Read-Back: Import creates 10 categories and 31 products correctly', async () => {
    const transport = new MockTransport();
    const importer = new CatalogImporter(transport);

    const result = await importer.importCatalog();

    expect(result.errors).toEqual([]);
    expect(result.categoriesCreated).toBe(10);
    expect(result.productsCreated).toBe(31);
    expect(result.categoriesSkipped).toBe(0);
    expect(result.productsSkipped).toBe(0);
    expect(result.duplicatesFound).toBe(0);
    expect(result.totalCategoriesReadBack).toBe(10);
    expect(result.totalProductsReadBack).toBe(31);

    // Inspect stored products in transport
    const prodHeaders = [...CanonicalSchemas.products.requiredHeaders, ...CanonicalSchemas.products.optionalHeaders];
    const prodRows = transport.sheetsData['products'];
    expect(prodRows.length).toBe(32); // 1 header row + 31 product rows

    const prodHMap = new HeaderMap(prodRows[0].values, prodHeaders);

    // Verify first product "سكر السعيد ابو كيلو"
    const p1 = prodRows[1].values;
    expect(prodHMap.getValue(p1, 'id')).toBe('prod-001');
    expect(prodHMap.getValue(p1, 'tenantId')).toBe(ALTHEIBANI_TENANT_ID);
    expect(prodHMap.getValue(p1, 'storeId')).toBe(ALTHEIBANI_STORE_ID);
    expect(prodHMap.getValue(p1, 'name')).toBe('سكر السعيد ابو كيلو');
    expect(prodHMap.getValue(p1, 'price')).toBe('500');
    expect(prodHMap.getValue(p1, 'currency')).toBe(ALTHEIBANI_CURRENCY);
    expect(prodHMap.getValue(p1, 'inStock')).toBe('TRUE');
    expect(prodHMap.getValue(p1, 'categoryId')).toBe('cat-tamween');
    expect(prodHMap.getValue(p1, 'description')).toBe('سكر ممتاز');
    expect(prodHMap.getValue(p1, 'imageUrl')).toBe('');

    // Verify featured product "سماعات الوحش"
    const p6 = prodRows[6].values;
    expect(prodHMap.getValue(p6, 'name')).toBe('سماعات الوحش');
    expect(prodHMap.getValue(p6, 'imageUrl')).toBe('a6.jpg');
    const meta6 = JSON.parse(prodHMap.getValue(p6, 'metadata'));
    expect(meta6.featured).toBe(true);

    // Verify non-featured product metadata
    const meta1 = JSON.parse(prodHMap.getValue(p1, 'metadata'));
    expect(meta1.featured).toBe(false);
  });

  it('3. Idempotency & Duplicate Protection: Re-running import skips existing items and creates 0 duplicates', async () => {
    const transport = new MockTransport();
    const importer = new CatalogImporter(transport);

    // First import
    await importer.importCatalog();

    // Second import (idempotency check)
    const secondResult = await importer.importCatalog();

    expect(secondResult.categoriesCreated).toBe(0);
    expect(secondResult.productsCreated).toBe(0);
    expect(secondResult.categoriesSkipped).toBe(10);
    expect(secondResult.productsSkipped).toBe(31);
    expect(secondResult.duplicatesFound).toBe(41);
    expect(secondResult.totalCategoriesReadBack).toBe(10);
    expect(secondResult.totalProductsReadBack).toBe(31);
  });

  it('4. Transaction & Domain Boundary: Only categories and products sheets are affected', async () => {
    const transport = new MockTransport();
    const importer = new CatalogImporter(transport);

    await importer.importCatalog();

    const modifiedSheets = Object.keys(transport.sheetsData);
    expect(modifiedSheets.sort()).toEqual(['categories', 'products'].sort());
    expect(transport.sheetsData['tenants']).toBeUndefined();
    expect(transport.sheetsData['stores']).toBeUndefined();
    expect(transport.sheetsData['customers']).toBeUndefined();
    expect(transport.sheetsData['orders']).toBeUndefined();
  });
});
