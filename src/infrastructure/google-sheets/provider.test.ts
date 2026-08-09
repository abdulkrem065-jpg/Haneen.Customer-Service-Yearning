import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleSheetsDataProvider } from './provider';
import { MockGoogleSheetsTransport } from './mock-transport';
import { ISheetMapper, parseBoolean, formatBoolean } from './mapper';
import { SheetRow } from './transport';
import { HeaderMap } from './header-map';
import { Product } from '../../core/data/domain';
import { DataOperationContext } from '../../core/data/provider';
import { UnauthorizedDataAccessError, DataNotFoundError, ProviderError } from '../../core/data/errors';

class ProductMapper implements ISheetMapper<Product> {
  sheetName = 'Products';
  requiredHeaders = ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
  defaultHeaders = ['id', 'tenantId', 'storeId', 'name', 'description', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
  headerAliases = {
    'name': ['product_name', 'اسم المنتج'],
    'inStock': ['Is-Available', 'متوفر']
  };

  fromRow(rowValues: string[], headerMap: HeaderMap): Product {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const name = headerMap.requireValue(rowValues, 'name');
    const description = headerMap.getValue(rowValues, 'description');
    const priceStr = headerMap.requireValue(rowValues, 'price');
    const currency = headerMap.requireValue(rowValues, 'currency');
    const inStockStr = headerMap.requireValue(rowValues, 'inStock');
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      name,
      description,
      price: parseFloat(priceStr),
      currency,
      inStock: parseBoolean(inStockStr),
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: Product, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name,
      description: entity.description || '',
      price: entity.price.toString(),
      currency: entity.currency,
      inStock: formatBoolean(entity.inStock),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: Product): string {
    return entity.id;
  }
}

describe('GoogleSheetsDataProvider - Dynamic Header Schema', () => {
  let transport: MockGoogleSheetsTransport;
  let mapper: ProductMapper;
  let provider: GoogleSheetsDataProvider<Product>;

  const tenantAContext: DataOperationContext = { tenantId: 'tenant-a', storeId: 'store-1', agentId: 'agent-1' };
  const tenantBContext: DataOperationContext = { tenantId: 'tenant-b', storeId: 'store-2', agentId: 'agent-2' };

  beforeEach(() => {
    transport = new MockGoogleSheetsTransport();
    mapper = new ProductMapper();
    provider = new GoogleSheetsDataProvider<Product>(transport, mapper);
  });

  it('1. Columns in normal order -> PASS', async () => {
    await transport.addRow('Products', mapper.defaultHeaders);
    
    const created = await provider.create({
      name: 'Test Product',
      description: 'A test product',
      price: 100,
      currency: 'USD',
      inStock: true
    }, tenantAContext);
    
    expect(created.id).toBeDefined();
    
    const fetched = await provider.getById(created.id, tenantAContext);
    expect(fetched.name).toBe('Test Product');
    expect(fetched.price).toBe(100);
  });

  it('2. Same columns reordered -> SAME DOMAIN ENTITY', async () => {
    // We intentionally mess up the header order
    const weirdHeaders = ['price', 'inStock', 'id', 'name', 'createdAt', 'updatedAt', 'storeId', 'currency', 'tenantId', 'description'];
    await transport.addRow('Products', weirdHeaders);
    
    const created = await provider.create({
      name: 'Reordered Product',
      price: 99,
      currency: 'EUR',
      inStock: false
    }, tenantAContext);
    
    const fetched = await provider.getById(created.id, tenantAContext);
    
    expect(fetched.name).toBe('Reordered Product');
    expect(fetched.price).toBe(99);
    expect(fetched.currency).toBe('EUR');
    expect(fetched.inStock).toBe(false);
  });

  it('3. Required header missing -> Schema Error', async () => {
    const missingHeaders = ['id', 'tenantId', /* 'storeId' missing */ 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
    await transport.addRow('Products', missingHeaders);
    
    await expect(provider.search({}, tenantAContext)).rejects.toThrow(ProviderError);
    await expect(provider.search({}, tenantAContext)).rejects.toThrow(/Missing required headers: storeId/);
  });

  it('4. Duplicate header -> Schema Error', async () => {
    const dupHeaders = ['id', 'id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
    await transport.addRow('Products', dupHeaders);
    
    await expect(provider.search({}, tenantAContext)).rejects.toThrow(ProviderError);
    await expect(provider.search({}, tenantAContext)).rejects.toThrow(/Duplicate header detected/);
  });

  it('5. Unknown optional header -> allowed', async () => {
    const customHeaders = [...mapper.defaultHeaders, 'secret_note'];
    await transport.addRow('Products', customHeaders);
    
    const created = await provider.create({
      name: 'Secret Product',
      price: 100,
      currency: 'USD',
      inStock: true
    }, tenantAContext);
    
    const fetched = await provider.getById(created.id, tenantAContext);
    expect(fetched.name).toBe('Secret Product');
  });

  it('6. Header whitespace normalization -> deterministic', async () => {
    const spacesHeaders = ['  id ', 'tenantId  ', ' storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
    await transport.addRow('Products', spacesHeaders);
    
    const created = await provider.create({
      name: 'Spaced Product',
      price: 10,
      currency: 'USD',
      inStock: true
    }, tenantAContext);
    
    const fetched = await provider.getById(created.id, tenantAContext);
    expect(fetched.name).toBe('Spaced Product');
  });

  it('8 & 9. Tenant & Store security - Cannot be overridden by Sheet data', async () => {
    await transport.addRow('Products', mapper.defaultHeaders);
    
    const maliciousData = {
      name: 'Apple', price: 1, currency: 'USD', inStock: true, tenantId: 'tenant-b', storeId: 'store-2'
    } as any; 

    const created = await provider.create(maliciousData, tenantAContext);
    expect(created.tenantId).toBe('tenant-a'); 
    expect(created.storeId).toBe('store-1'); 
  });

  it('10. Existing invalid-row handling remains diagnostic', async () => {
    let invalidRowError: Error | undefined;
    let invalidRowNumber: number | undefined;

    provider = new GoogleSheetsDataProvider<Product>(transport, mapper, {
      onInvalidRow: (error, rowNumber) => {
        invalidRowError = error;
        invalidRowNumber = rowNumber;
      }
    });

    await transport.addRow('Products', mapper.defaultHeaders);
    // Add a bad row (missing values for required fields)
    const badRow = await transport.addRow('Products', ['bad_id', 'tenant-a', 'store-1']); // Not enough columns

    const valid = await provider.create({ name: 'Apple', price: 1, currency: 'USD', inStock: true }, tenantAContext);

    const result = await provider.search({}, tenantAContext);
    expect(result.totalCount).toBe(1);
    expect(result.items[0].id).toBe(valid.id);
    
    expect(invalidRowError).toBeDefined();
    expect(invalidRowError?.message).toContain('Missing value for required header: "name"');
    expect(invalidRowNumber).toBe(badRow.rowNumber);
  });

  it('7. Tenant isolation in search - should isolate tenants and stores', async () => {
    await transport.addRow('Products', mapper.defaultHeaders);
    const productA = await provider.create({ name: 'Apple', price: 1, currency: 'USD', inStock: true }, tenantAContext);
    
    await expect(provider.getById(productA.id, tenantBContext)).rejects.toThrow(UnauthorizedDataAccessError);

    const searchB = await provider.search({}, tenantBContext);
    expect(searchB.totalCount).toBe(0);
  });

  it('11. Pagination and Search Term filtering', async () => {
    await transport.addRow('Products', mapper.defaultHeaders);
    await provider.create({ name: 'Apple', price: 1, currency: 'USD', inStock: true }, tenantAContext);
    await provider.create({ name: 'Banana', price: 2, currency: 'USD', inStock: true }, tenantAContext);
    await provider.create({ name: 'Cherry', price: 3, currency: 'USD', inStock: true }, tenantAContext);

    const result = await provider.search({ limit: 2, offset: 0 }, tenantAContext);
    expect(result.items.length).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.hasMore).toBe(true);

    const resultPage2 = await provider.search({ limit: 2, offset: 2 }, tenantAContext);
    expect(resultPage2.items.length).toBe(1);
    expect(resultPage2.hasMore).toBe(false);
  });

  it('12. Error translation to DataNotFoundError', async () => {
    await transport.addRow('Products', mapper.defaultHeaders);
    await expect(provider.getById('non-existent', tenantAContext)).rejects.toThrow(DataNotFoundError);
  });

  it('13. Header aliases and Boolean values parsing (نعم/لا)', async () => {
    // We use aliases: 'product_name' for 'name', 'Is-Available' for 'inStock'
    const aliasHeaders = ['id', 'tenantId', 'storeId', 'product_name', 'description', 'price', 'currency', 'Is-Available', 'createdAt', 'updatedAt'];
    await transport.addRow('Products', aliasHeaders);
    
    // Add row using raw values with 'نعم' and 'لا'
    await transport.addRow('Products', [
      'prod-x', 'tenant-a', 'store-1', 'Test Alias', '', '150', 'USD', 'نعم', new Date().toISOString(), new Date().toISOString()
    ]);
    
    await transport.addRow('Products', [
      'prod-y', 'tenant-a', 'store-1', 'Test Alias 2', '', '200', 'USD', ' لا ', new Date().toISOString(), new Date().toISOString() // testing spaces too
    ]);

    const result = await provider.search({}, tenantAContext);
    expect(result.items.length).toBe(2);
    
    const p1 = result.items.find(x => x.id === 'prod-x');
    expect(p1).toBeDefined();
    expect(p1!.name).toBe('Test Alias');
    expect(p1!.inStock).toBe(true);

    const p2 = result.items.find(x => x.id === 'prod-y');
    expect(p2).toBeDefined();
    expect(p2!.name).toBe('Test Alias 2');
    expect(p2!.inStock).toBe(false);
  });

  it('14. Invalid boolean values are rejected', async () => {
    let invalidRowError: Error | undefined;
    provider = new GoogleSheetsDataProvider<Product>(transport, mapper, {
      onInvalidRow: (error) => {
        invalidRowError = error;
      }
    });

    await transport.addRow('Products', mapper.defaultHeaders);
    await transport.addRow('Products', [
      'prod-z', 'tenant-a', 'store-1', 'Bad Bool', '', '10', 'USD', 'maybe', new Date().toISOString(), new Date().toISOString()
    ]);

    const result = await provider.search({}, tenantAContext);
    expect(result.items.length).toBe(0);
    expect(invalidRowError).toBeDefined();
    expect(invalidRowError?.message).toContain('Invalid boolean value: "maybe"');
  });

  it('15. Legacy Data Read Safety - missing tenantId/storeId skips row', async () => {
    let invalidRowError: Error | undefined;
    provider = new GoogleSheetsDataProvider<Product>(transport, mapper, {
      onInvalidRow: (error) => {
        invalidRowError = error;
      }
    });

    await transport.addRow('Products', mapper.defaultHeaders);
    // Add legacy record missing tenantId and storeId (empty string values)
    await transport.addRow('Products', [
      'legacy-1', '', '', 'Legacy Product', '', '10', 'USD', 'TRUE', new Date().toISOString(), new Date().toISOString()
    ]);

    const result = await provider.search({}, tenantAContext);
    expect(result.items.length).toBe(0); // Should not appear for tenant-a
    expect(invalidRowError).toBeDefined();
    expect(invalidRowError?.message).toContain('Missing value for required header: "tenantId"');
  });

  it('16. Legacy Data Hidden Migration Protection - update does not touch legacy data', async () => {
    await transport.addRow('Products', mapper.defaultHeaders);
    const legacyRow = await transport.addRow('Products', [
      'legacy-2', '', '', 'Legacy Product 2', '', '20', 'USD', 'TRUE', new Date().toISOString(), new Date().toISOString()
    ]);

    // Try to update it through the provider (it should fail because it doesn't belong to the tenant's context, or isn't found)
    await expect(provider.update('legacy-2', { name: 'Migrated Product' }, tenantAContext)).rejects.toThrow(DataNotFoundError);

    // Verify it wasn't silently updated in the transport
    const rows = await transport.getRows('Products');
    const legacyRecord = rows.find(r => r.values[0] === 'legacy-2');
    expect(legacyRecord?.values[1]).toBe(''); // Still no tenantId
    expect(legacyRecord?.values[3]).toBe('Legacy Product 2'); // Still old name
  });
});
