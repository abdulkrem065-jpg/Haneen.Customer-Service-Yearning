import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanonicalSchemas } from '../infrastructure/google-sheets/schema-definitions';
import { ProductSearchTool } from './tools/product-search-tool';
import { ProductGetTool } from './tools/product-get-tool';
import { GoogleSheetsDataProvider } from '../infrastructure/google-sheets/provider';
import { Product, Category } from './data/domain';
import { ISheetMapper } from '../infrastructure/google-sheets/mapper';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';
import { IGoogleSheetsTransport } from '../infrastructure/google-sheets/transport';
import { UnauthorizedDataAccessError } from './data/errors';

class ProductMapper implements ISheetMapper<Product> {
  sheetName = 'products';
  requiredHeaders = CanonicalSchemas.products.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.products.requiredHeaders, ...CanonicalSchemas.products.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): Product {
    return {
      id: headerMap.requireValue(rowValues, 'id'),
      tenantId: headerMap.requireValue(rowValues, 'tenantId'),
      storeId: headerMap.requireValue(rowValues, 'storeId'),
      name: headerMap.requireValue(rowValues, 'name'),
      price: parseFloat(headerMap.requireValue(rowValues, 'price')),
      currency: headerMap.requireValue(rowValues, 'currency'),
      inStock: headerMap.requireValue(rowValues, 'inStock') === 'TRUE',
      categoryId: headerMap.getValue(rowValues, 'categoryId'),
      description: headerMap.getValue(rowValues, 'description'),
      createdAt: new Date(headerMap.requireValue(rowValues, 'createdAt')),
      updatedAt: new Date(headerMap.requireValue(rowValues, 'updatedAt'))
    };
  }

  toRow(entity: Product, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name,
      price: entity.price.toString(),
      currency: entity.currency,
      inStock: entity.inStock ? 'TRUE' : 'FALSE',
      categoryId: entity.categoryId || '',
      description: entity.description || '',
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: Product): string {
    return entity.id;
  }
}

class CategoryMapper implements ISheetMapper<Category> {
  sheetName = 'categories';
  requiredHeaders = CanonicalSchemas.categories.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.categories.requiredHeaders, ...CanonicalSchemas.categories.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): Category {
    return {
      id: headerMap.requireValue(rowValues, 'id'),
      tenantId: headerMap.requireValue(rowValues, 'tenantId'),
      storeId: headerMap.requireValue(rowValues, 'storeId'),
      name: headerMap.requireValue(rowValues, 'name'),
      description: headerMap.getValue(rowValues, 'description')
    };
  }

  toRow(entity: Category, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name,
      description: entity.description || ''
    });
  }

  getId(entity: Category): string {
    return entity.id;
  }
}

describe('CMD-025: Canonical Store Catalog Provisioning & Security', () => {
  const TRUSTED_TENANT = 'tenant-altheibani';
  const TRUSTED_STORE = 'store-altheibani-grocery';
  const TRUSTED_AGENT = 'agent-haneen';

  it('1. Schema Inspection: CanonicalSchemas.products & CanonicalSchemas.categories are valid', () => {
    const prodSchema = CanonicalSchemas.products;
    expect(prodSchema).toBeDefined();
    expect(prodSchema.sheetName).toBe('products');
    expect(prodSchema.scope).toBe('STORE');
    expect(prodSchema.requiredHeaders).toContain('id');
    expect(prodSchema.requiredHeaders).toContain('tenantId');
    expect(prodSchema.requiredHeaders).toContain('storeId');
    expect(prodSchema.requiredHeaders).toContain('name');
    expect(prodSchema.requiredHeaders).toContain('price');
    expect(prodSchema.requiredHeaders).toContain('currency');
    expect(prodSchema.requiredHeaders).toContain('inStock');
    expect(prodSchema.requiredHeaders).toContain('createdAt');
    expect(prodSchema.requiredHeaders).toContain('updatedAt');

    const catSchema = CanonicalSchemas.categories;
    expect(catSchema).toBeDefined();
    expect(catSchema.sheetName).toBe('categories');
    expect(catSchema.scope).toBe('STORE');
    expect(catSchema.requiredHeaders).toContain('id');
    expect(catSchema.requiredHeaders).toContain('tenantId');
    expect(catSchema.requiredHeaders).toContain('storeId');
    expect(catSchema.requiredHeaders).toContain('name');
  });

  it('2. Catalog Status Check: Empty products and categories return empty array without errors', async () => {
    const mockTransport: IGoogleSheetsTransport = {
      getRows: vi.fn().mockImplementation(async (sheetName) => {
        if (sheetName === 'products') {
          return [{ rowNumber: 1, values: CanonicalSchemas.products.requiredHeaders }];
        }
        if (sheetName === 'categories') {
          return [{ rowNumber: 1, values: CanonicalSchemas.categories.requiredHeaders }];
        }
        return [];
      }),
      addRow: vi.fn(),
      updateRow: vi.fn(),
      deleteRow: vi.fn()
    };

    const productProvider = new GoogleSheetsDataProvider<Product>(mockTransport, new ProductMapper());
    const categoryProvider = new GoogleSheetsDataProvider<Category>(mockTransport, new CategoryMapper());

    const trustedContext = { tenantId: TRUSTED_TENANT, storeId: TRUSTED_STORE, agentId: TRUSTED_AGENT };

    const productsResult = await productProvider.search({}, trustedContext);
    expect(productsResult.items).toEqual([]);
    expect(productsResult.totalCount).toBe(0);

    const categoriesResult = await categoryProvider.search({}, trustedContext);
    expect(categoriesResult.items).toEqual([]);
    expect(categoriesResult.totalCount).toBe(0);

    // ZERO writes were triggered
    expect(mockTransport.addRow).not.toHaveBeenCalled();
    expect(mockTransport.updateRow).not.toHaveBeenCalled();
    expect(mockTransport.deleteRow).not.toHaveBeenCalled();
  });

  it('3. Security & Isolation: Cross-tenant and cross-store product reads are blocked', async () => {
    const mockTransport: IGoogleSheetsTransport = {
      getRows: vi.fn().mockResolvedValue([
        { rowNumber: 1, values: ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'] },
        { rowNumber: 2, values: ['p-1', TRUSTED_TENANT, TRUSTED_STORE, 'أرز الشعلان 10 كجم', '25000', 'YER', 'TRUE', '2026-08-11T00:00:00Z', '2026-08-11T00:00:00Z'] },
        { rowNumber: 3, values: ['p-2', 'tenant-other', 'store-other', 'منتج متجر آخر', '100', 'USD', 'TRUE', '2026-08-11T00:00:00Z', '2026-08-11T00:00:00Z'] },
        { rowNumber: 4, values: ['p-3', TRUSTED_TENANT, 'store-other-branch', 'منتج فرع آخر', '1500', 'YER', 'TRUE', '2026-08-11T00:00:00Z', '2026-08-11T00:00:00Z'] }
      ]),
      addRow: vi.fn(),
      updateRow: vi.fn(),
      deleteRow: vi.fn()
    };

    const productProvider = new GoogleSheetsDataProvider<Product>(mockTransport, new ProductMapper());
    const trustedContext = { tenantId: TRUSTED_TENANT, storeId: TRUSTED_STORE, agentId: TRUSTED_AGENT };

    // 1. Authorized read
    const p1 = await productProvider.getById('p-1', trustedContext);
    expect(p1.name).toBe('أرز الشعلان 10 كجم');
    expect(p1.currency).toBe('YER');

    // 2. Cross-Tenant Attempt -> Blocked
    await expect(productProvider.getById('p-2', trustedContext)).rejects.toThrow(UnauthorizedDataAccessError);

    // 3. Cross-Store Attempt -> Blocked
    await expect(productProvider.getById('p-3', trustedContext)).rejects.toThrow(UnauthorizedDataAccessError);

    // 4. Search strictly filters to ONLY authorized products
    const searchRes = await productProvider.search({}, trustedContext);
    expect(searchRes.items.length).toBe(1);
    expect(searchRes.items[0].id).toBe('p-1');
  });

  it('4. AI Readiness: ProductSearchTool & ProductGetTool properly use Trusted Context & YER Currency', async () => {
    const mockTransport: IGoogleSheetsTransport = {
      getRows: vi.fn().mockResolvedValue([
        { rowNumber: 1, values: ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'] },
        { rowNumber: 2, values: ['p-10', TRUSTED_TENANT, TRUSTED_STORE, 'زيت زيتون 1 لتر', '12000', 'YER', 'TRUE', '2026-08-11T00:00:00Z', '2026-08-11T00:00:00Z'] }
      ]),
      addRow: vi.fn(),
      updateRow: vi.fn(),
      deleteRow: vi.fn()
    };

    const productProvider = new GoogleSheetsDataProvider<Product>(mockTransport, new ProductMapper());
    const searchTool = new ProductSearchTool(productProvider);
    const getTool = new ProductGetTool(productProvider);

    const toolContext = { tenantId: TRUSTED_TENANT, storeId: TRUSTED_STORE, agentId: TRUSTED_AGENT };

    // Search Tool Test
    const searchResult = await searchTool.execute({ searchTerm: 'زيت' }, toolContext);
    expect(searchResult.success).toBe(true);
    expect(searchResult.data).toBeDefined();
    const items = (searchResult.data as { items: Array<{ name: string; currency: string; price: number }> }).items;
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('زيت زيتون 1 لتر');
    expect(items[0].currency).toBe('YER');

    // Get Tool Test
    const getResult = await getTool.execute({ productId: 'p-10' }, toolContext);
    expect(getResult.success).toBe(true);
    const prod = getResult.data as { name: string; currency: string; price: number };
    expect(prod.name).toBe('زيت زيتون 1 لتر');
    expect(prod.currency).toBe('YER');
  });
});
