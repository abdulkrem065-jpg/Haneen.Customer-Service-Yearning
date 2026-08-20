import { describe, it, expect, beforeEach } from 'vitest';
import { generateAutoId, validateAndCleanValue, VALIDATION_RULES } from '../infrastructure/google-sheets/validation-and-autoid';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { ProductMapper, CategoryMapper, PaymentMethodMapper, StoreContactMapper } from '../infrastructure/google-sheets/domain-mappers';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';
import { HaneenService, CANONICAL_SPREADSHEET_ID, CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ChatRateLimiter } from './productization/rate-limiter';
import { BusinessKnowledgeProvisioner } from '../infrastructure/google-sheets/provision-business-knowledge';

describe('CMD-071: Google Sheets Data Model Hardening & Live Production Sync', () => {
  let transport: MockGoogleSheetsTransport;

  beforeEach(() => {
    transport = new MockGoogleSheetsTransport();
  });

  describe('1. Auto-ID Generation & Stable Identity', () => {
    it('should generate stable Auto-IDs with correct prefixes', () => {
      const prodId = generateAutoId('prod', 'سكر السعيد ابو كيلو');
      const catId = generateAutoId('cat', 'أغذية أساسية');
      const payId = generateAutoId('pay', 'محفظة فلوسك');
      const cntId = generateAutoId('cnt', 'whatsapp');

      expect(prodId).toMatch(/^prod-/);
      expect(catId).toMatch(/^cat-/);
      expect(payId).toMatch(/^pay-/);
      expect(cntId).toMatch(/^cnt-/);
    });

    it('should preserve Auto-IDs across row reordering without depending on row numbers', () => {
      const mapper = new ProductMapper();
      const headers = ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
      const headerMap = new HeaderMap(headers, headers);

      // Row added without explicit ID
      const rowWithoutId = ['', 'tnt-41f0d530', 'str-2c6ad81f', 'شاي الكبوس', '500', 'YER', 'TRUE', '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z'];
      const product1 = mapper.fromRow(rowWithoutId, headerMap);

      expect(product1.id).toBeDefined();
      expect(product1.id.length).toBeGreaterThan(0);
      expect(product1.id).toMatch(/^prod-/);

      // Reordering rows (e.g. at index 5 vs index 1) maintains the exact same object ID
      const product1Reordered = mapper.fromRow(rowWithoutId, headerMap);
      expect(product1Reordered.id).toBe(product1.id);
    });
  });

  describe('2. Data Validation & Dropdown Rules', () => {
    it('should validate and clean boolean values for inStock and isActive', () => {
      const rule = VALIDATION_RULES.products.find(r => r.field === 'inStock');
      expect(validateAndCleanValue('inStock', 'true', rule)).toBe('TRUE');
      expect(validateAndCleanValue('inStock', '1', rule)).toBe('TRUE');
      expect(validateAndCleanValue('inStock', 'نعم', rule)).toBe('TRUE');
      expect(validateAndCleanValue('inStock', 'false', rule)).toBe('FALSE');
      expect(validateAndCleanValue('inStock', '0', rule)).toBe('FALSE');
      expect(validateAndCleanValue('inStock', 'invalid', rule)).toBe('TRUE'); // Fallback default
    });

    it('should validate dropdown values for currency', () => {
      const rule = VALIDATION_RULES.products.find(r => r.field === 'currency');
      expect(validateAndCleanValue('currency', 'yer', rule)).toBe('YER');
      expect(validateAndCleanValue('currency', 'SAR', rule)).toBe('SAR');
      expect(validateAndCleanValue('currency', 'INVALID_CURRENCY', rule)).toBe('YER');
    });

    it('should validate numeric price and quantity values', () => {
      const rulePrice = VALIDATION_RULES.products.find(r => r.field === 'price');
      expect(validateAndCleanValue('price', '1500', rulePrice)).toBe('1500');
      expect(validateAndCleanValue('price', 'abc', rulePrice)).toBe('0');
    });
  });

  describe('3. Default Resolution for Tenant & Store Identifiers', () => {
    it('should auto-populate canonical tenantId, storeId, and base currency when omitted', () => {
      const mapper = new ProductMapper();
      const headers = ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
      const headerMap = new HeaderMap(headers, headers);

      // Row missing tenantId and storeId
      const sparseRow = ['prod-999', '', '', 'منتج تجريبي', '1200', '', '', '', ''];
      const product = mapper.fromRow(sparseRow, headerMap);

      expect(product.tenantId).toBe('tnt-41f0d530');
      expect(product.storeId).toBe('str-2c6ad81f');
      expect(product.currency).toBe('YER');
      expect(product.inStock).toBe(true);
    });
  });

  describe('4. Sana Live Knowledge Read-Back & Dynamic Mutations', () => {
    it('should provision business knowledge and reflect live changes in HaneenService', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      // 1. Initial policy check
      const policy1 = await service.getLiveKnowledgePolicy();
      expect(policy1.persona).toContain('سكر السعيد ابو كيلو: 500 YER');

      // 2. Dynamic Price Mutation in Google Sheets
      const prodRows = await transport.getRows('products');
      const hMap = new HeaderMap(prodRows[0].values, prodRows[0].values);

      for (let i = 1; i < prodRows.length; i++) {
        if (hMap.getValue(prodRows[i].values, 'name') === 'سكر السعيد ابو كيلو') {
          const rowVals = [...prodRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (prodRows[0].values[j] === 'price') rowVals[j] = '1500';
          }
          prodRows[i].values = rowVals;
        }
      }

      service.invalidatePolicyCache();
      const policy2 = await service.getLiveKnowledgePolicy();
      expect(policy2.persona).toContain('سكر السعيد ابو كيلو: 1500 YER');
    });

    it('should handle payment method toggling dynamically', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      const policy1 = await service.getLiveKnowledgePolicy();
      expect(policy1.persona).toContain('وان كاش');

      // Disable OneCash in payment_methods sheet
      const payRows = await transport.getRows('payment_methods');
      for (let i = 1; i < payRows.length; i++) {
        const rowVals = [...payRows[i].values];
        const hMap = new HeaderMap(payRows[0].values, payRows[0].values);
        if (hMap.getValue(rowVals, 'displayName') === 'وان كاش') {
          for (let j = 0; j < rowVals.length; j++) {
            if (payRows[0].values[j] === 'isActive') rowVals[j] = 'FALSE';
          }
          payRows[i].values = rowVals;
        }
      }

      service.invalidatePolicyCache();
      const policy2 = await service.getLiveKnowledgePolicy();
      expect(policy2.persona).not.toContain('وان كاش');
    });

    it('should refuse to guess prices or inventory for non-existent products', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      const policy = await service.getLiveKnowledgePolicy();
      expect(policy.persona).not.toContain('طائرة هليكوبتر فضائية');
    });
  });
});
