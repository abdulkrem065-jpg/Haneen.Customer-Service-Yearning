import { describe, it, expect } from 'vitest';
import { CanonicalSchemas, ISchemaDefinition } from './schema-definitions';

describe('Google Sheets Canonical Schema Validation', () => {
  const schemas = Object.values(CanonicalSchemas);

  it('1. Schema completeness - all 10 canonical sheets are defined', () => {
    expect(schemas.length).toBe(10);
    const names = schemas.map(s => s.sheetName);
    expect(names).toContain('tenants');
    expect(names).toContain('stores');
    expect(names).toContain('products');
    expect(names).toContain('categories');
    expect(names).toContain('customers');
    expect(names).toContain('orders');
    expect(names).toContain('order_items');
    expect(names).toContain('conversations');
    expect(names).toContain('agent_config');
    expect(names).toContain('store_settings');
  });

  it('2. Required headers - every schema has an independent "id" primary key', () => {
    for (const schema of schemas) {
      expect(schema.primaryKey).toBe('id');
      expect(schema.requiredHeaders).toContain('id');
      expect(schema.requiredHeaders).not.toContain('rowNumber'); // Explicit independence check
    }
  });

  it('3. Scope classification - proper isolation fields are enforced', () => {
    for (const schema of schemas) {
      if (schema.scope === 'PLATFORM') {
        expect(schema.requiredHeaders).not.toContain('tenantId');
        expect(schema.requiredHeaders).not.toContain('storeId');
      } else if (schema.scope === 'TENANT') {
        expect(schema.requiredHeaders).toContain('tenantId');
        expect(schema.requiredHeaders).not.toContain('storeId');
      } else if (schema.scope === 'STORE') {
        // Exception: order_items doesn't directly have tenant/store as it cascades from orderId
        if (schema.sheetName !== 'order_items') {
          expect(schema.requiredHeaders).toContain('tenantId');
          expect(schema.requiredHeaders).toContain('storeId');
        }
      }
    }
  });

  it('4. Timestamp policy - critical schemas have createdAt/updatedAt', () => {
    const timestampSchemas = ['tenants', 'products', 'orders', 'conversations'];
    for (const name of timestampSchemas) {
      const schema = CanonicalSchemas[name];
      expect(schema.requiredHeaders).toContain('createdAt');
      expect(schema.requiredHeaders).toContain('updatedAt');
    }
  });

  it('5. Money policy - products and orders explicitly split price and currency', () => {
    expect(CanonicalSchemas.products.requiredHeaders).toContain('price');
    expect(CanonicalSchemas.products.requiredHeaders).toContain('currency');
    
    expect(CanonicalSchemas.orders.requiredHeaders).toContain('totalAmount');
    expect(CanonicalSchemas.orders.requiredHeaders).toContain('currency');
    
    expect(CanonicalSchemas.order_items.requiredHeaders).toContain('unitPrice');
    expect(CanonicalSchemas.order_items.requiredHeaders).toContain('totalPrice');
  });

  it('6. No secrets policy - no sensitive config headers are defined', () => {
    for (const schema of schemas) {
      const allHeaders = [...schema.requiredHeaders, ...schema.optionalHeaders];
      expect(allHeaders).not.toContain('apiKey');
      expect(allHeaders).not.toContain('password');
      expect(allHeaders).not.toContain('secret');
      expect(allHeaders).not.toContain('token');
    }
  });

  it('7. Tenant relationships - foreign keys explicitly documented', () => {
    expect(CanonicalSchemas.stores.foreignKeys).toContain('tenantId');
    expect(CanonicalSchemas.products.foreignKeys).toContain('tenantId');
    expect(CanonicalSchemas.customers.foreignKeys).toContain('tenantId');
  });

  it('8. Store relationships - foreign keys explicitly documented', () => {
    expect(CanonicalSchemas.products.foreignKeys).toContain('storeId');
    expect(CanonicalSchemas.orders.foreignKeys).toContain('storeId');
    expect(CanonicalSchemas.agent_config.foreignKeys).toContain('storeId');
  });
});
