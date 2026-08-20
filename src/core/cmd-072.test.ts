import { describe, it, expect, beforeEach } from 'vitest';
import { generateAutoId, validateAndCleanValue, VALIDATION_RULES } from '../infrastructure/google-sheets/validation-and-autoid';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { ProductMapper, CategoryMapper, PaymentMethodMapper, StoreContactMapper } from '../infrastructure/google-sheets/domain-mappers';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';
import { HaneenService, CANONICAL_SPREADSHEET_ID, CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ChatRateLimiter } from './productization/rate-limiter';
import { BusinessKnowledgeProvisioner } from '../infrastructure/google-sheets/provision-business-knowledge';

describe('CMD-072 — Real Google Sheets Data Model Finalization & Production Sync Gate', () => {
  let transport: MockGoogleSheetsTransport;

  beforeEach(() => {
    transport = new MockGoogleSheetsTransport();
  });

  describe('1. Production Environment & Credentials Gate Probe', () => {
    it('should probe local runner vs Render production runtime credentials safely', () => {
      const isRender = !!process.env.RENDER;
      const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      const adminSecret = process.env.ADMIN_VERIFY_SECRET;

      console.log('=== CMD-072 ENVIRONMENT PROBE ===');
      console.log('Render Production Runtime:', isRender ? 'ACTIVE' : 'INACTIVE (Local AI Studio Runner)');
      console.log('GOOGLE_SHEETS_CLIENT_EMAIL:', clientEmail ? 'PRESENT' : 'MISSING');
      console.log('GOOGLE_SHEETS_PRIVATE_KEY:', privateKey ? 'PRESENT' : 'MISSING');
      console.log('ADMIN_VERIFY_SECRET:', adminSecret ? 'PRESENT' : 'MISSING');

      // Locally, credentials should be missing
      if (!isRender || !clientEmail || !privateKey) {
        console.log('PROBE RESULT: BLOCKED — Live production write must be executed via Render Production environment.');
      }

      expect(CANONICAL_SPREADSHEET_ID).toBe('1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo');
      expect(CANONICAL_TENANT_ID).toBe('tnt-41f0d530');
      expect(CANONICAL_STORE_ID).toBe('str-2c6ad81f');
    });
  });

  describe('2. Canonical Data Models & Auto-ID Generation', () => {
    it('should generate stable IDs for all 4 primary domains without depending on row numbers', () => {
      const prodId = generateAutoId('prod', 'سكر السعيد');
      const catId = generateAutoId('cat', 'أغذية أساسية');
      const payId = generateAutoId('pay', 'وان كاش');
      const cntId = generateAutoId('cnt', 'واتساب');

      expect(prodId).toMatch(/^prod-/);
      expect(catId).toMatch(/^cat-/);
      expect(payId).toMatch(/^pay-/);
      expect(cntId).toMatch(/^cnt-/);

      // Re-running with same seed produces identical ID
      expect(generateAutoId('prod', 'سكر السعيد')).toBe(prodId);
    });

    it('should validate dropdowns and booleans for all domains', () => {
      // Products
      const prodCurrencyRule = VALIDATION_RULES.products.find(r => r.field === 'currency');
      expect(validateAndCleanValue('currency', 'YER', prodCurrencyRule)).toBe('YER');
      expect(validateAndCleanValue('currency', 'INVALID', prodCurrencyRule)).toBe('YER');

      const prodInStockRule = VALIDATION_RULES.products.find(r => r.field === 'inStock');
      expect(validateAndCleanValue('inStock', 'TRUE', prodInStockRule)).toBe('TRUE');
      expect(validateAndCleanValue('inStock', 'FALSE', prodInStockRule)).toBe('FALSE');

      // Payment Methods
      const payTypeRule = VALIDATION_RULES.payment_methods.find(r => r.field === 'methodType');
      expect(validateAndCleanValue('methodType', 'WALLET', payTypeRule)).toBe('WALLET');
      expect(validateAndCleanValue('methodType', 'CASH', payTypeRule)).toBe('CASH');

      // Store Contacts
      const cntTypeRule = VALIDATION_RULES.store_contacts.find(r => r.field === 'channelType');
      expect(validateAndCleanValue('channelType', 'WHATSAPP', cntTypeRule)).toBe('WHATSAPP');
      expect(validateAndCleanValue('channelType', 'PHONE', cntTypeRule)).toBe('PHONE');
    });

    it('should resolve default canonical tenantId and storeId if omitted in sheet', () => {
      const prodMapper = new ProductMapper();
      const headers = ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
      const headerMap = new HeaderMap(headers, headers);

      const row = ['prod-101', '', '', 'أرز بسمتي', '5000', '', '', '', ''];
      const product = prodMapper.fromRow(row, headerMap);

      expect(product.tenantId).toBe('tnt-41f0d530');
      expect(product.storeId).toBe('str-2c6ad81f');
      expect(product.currency).toBe('YER');
    });
  });

  describe('3. Dynamic Policy Reflection & Knowledge Read-Back', () => {
    it('should reflect real Google Sheets data in Sana policy dynamically', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      const policy1 = await service.getLiveKnowledgePolicy();
      expect(policy1.persona).toContain('سكر السعيد');

      // Mutate price in products
      const prodRows = await transport.getRows('products');
      const hMap = new HeaderMap(prodRows[0].values, prodRows[0].values);

      for (let i = 1; i < prodRows.length; i++) {
        if (hMap.getValue(prodRows[i].values, 'name') === 'سكر السعيد ابو كيلو') {
          const rowVals = [...prodRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (prodRows[0].values[j] === 'price') rowVals[j] = '2000';
          }
          prodRows[i].values = rowVals;
        }
      }

      service.invalidatePolicyCache();
      const policy2 = await service.getLiveKnowledgePolicy();
      expect(policy2.persona).toContain('سكر السعيد ابو كيلو: 2000 YER');
    });

    it('should refuse to hallucinate non-existent products', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      const policy = await service.getLiveKnowledgePolicy();
      expect(policy.persona).not.toContain('محرك صاروخي مائي');
    });
  });
});
