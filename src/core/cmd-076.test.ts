import { describe, it, expect, beforeEach } from 'vitest';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { BusinessKnowledgeProvisioner } from '../infrastructure/google-sheets/provision-business-knowledge';
import { GoogleSheetsAdminReconciler } from '../infrastructure/google-sheets/admin-reconciler';
import { HaneenService, CANONICAL_SPREADSHEET_ID, CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ChatRateLimiter } from './productization/rate-limiter';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';
import { generateSequentialAutoId, validateAndCleanValue } from '../infrastructure/google-sheets/validation-and-autoid';

describe('CMD-076 — Google Sheets Admin UX, Auto-Fields & Data Validation', () => {
  let transport: MockGoogleSheetsTransport;

  beforeEach(() => {
    transport = new MockGoogleSheetsTransport();
  });

  describe('1. Sequential Auto-ID Generation Across Domains', () => {
    it('1.1 should generate next product auto-id sequentially (e.g. prod-032)', () => {
      const existing = ['prod-001', 'prod-002', 'prod-031'];
      const nextId = generateSequentialAutoId('prod', existing);
      expect(nextId).toBe('prod-032');
    });

    it('1.2 should generate next category auto-id sequentially (e.g. cat-011)', () => {
      const existing = ['cat-001', 'cat-002', 'cat-010'];
      const nextId = generateSequentialAutoId('cat', existing);
      expect(nextId).toBe('cat-011');
    });

    it('1.3 should generate next payment method auto-id sequentially (e.g. pm-007)', () => {
      const existing = ['pm-001', 'pm-002', 'pm-006'];
      const nextId = generateSequentialAutoId('pm', existing);
      expect(nextId).toBe('pm-007');
    });

    it('1.4 should generate next contact auto-id sequentially (e.g. cnt-003)', () => {
      const existing = ['cnt-001', 'cnt-002'];
      const nextId = generateSequentialAutoId('cnt', existing);
      expect(nextId).toBe('cnt-003');
    });
  });

  describe('2. Tenant & Store Context Auto-Fill Protection', () => {
    it('2.1 should auto-fill and enforce tenantId=tnt-41f0d530 and storeId=str-2c6ad81f on incomplete rows', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      // Add a raw user row missing tenantId, storeId, id, createdAt, updatedAt
      const prodHeaders = ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'description', 'categoryId', 'quantity', 'createdAt', 'updatedAt'];
      const rawUserRow = ['', '', '', 'منتج يمني تجريبي', '1200', 'yer', 'yes', 'وصف تجريبي', '', '5', '', ''];
      await transport.addRow('products', rawUserRow);

      const reconciler = new GoogleSheetsAdminReconciler(transport);
      const summary = await reconciler.reconcileAll();

      expect(summary.productsAutoFieldsFilled).toBeGreaterThan(0);

      const rows = await transport.getRows('products');
      const hMap = new HeaderMap(rows[0].values, prodHeaders);
      const lastRow = rows[rows.length - 1].values;

      expect(hMap.getValue(lastRow, 'id')).toBe('prod-032');
      expect(hMap.getValue(lastRow, 'tenantId')).toBe('tnt-41f0d530');
      expect(hMap.getValue(lastRow, 'storeId')).toBe('str-2c6ad81f');
      expect(hMap.getValue(lastRow, 'currency')).toBe('YER');
      expect(hMap.getValue(lastRow, 'inStock')).toBe('TRUE');
      expect(hMap.getValue(lastRow, 'createdAt')).toBeTruthy();
      expect(hMap.getValue(lastRow, 'updatedAt')).toBeTruthy();
    });
  });

  describe('3. Field Validations & Cleanings', () => {
    it('3.1 should validate and clean boolean values strictly to TRUE or FALSE', () => {
      expect(validateAndCleanValue('inStock', 'yes', { field: 'inStock', type: 'BOOLEAN' })).toBe('TRUE');
      expect(validateAndCleanValue('inStock', 'متوفر', { field: 'inStock', type: 'BOOLEAN' })).toBe('TRUE');
      expect(validateAndCleanValue('inStock', '1', { field: 'inStock', type: 'BOOLEAN' })).toBe('TRUE');
      expect(validateAndCleanValue('inStock', 'no', { field: 'inStock', type: 'BOOLEAN' })).toBe('FALSE');
      expect(validateAndCleanValue('inStock', 'غير متوفر', { field: 'inStock', type: 'BOOLEAN' })).toBe('FALSE');
      expect(validateAndCleanValue('inStock', '0', { field: 'inStock', type: 'BOOLEAN' })).toBe('FALSE');
    });

    it('3.2 should validate currency dropdown values to YER, SAR, or USD (default YER)', () => {
      expect(validateAndCleanValue('currency', 'sar', { field: 'currency', type: 'DROPDOWN', options: ['YER', 'SAR', 'USD'], defaultValue: 'YER' })).toBe('SAR');
      expect(validateAndCleanValue('currency', 'EUR', { field: 'currency', type: 'DROPDOWN', options: ['YER', 'SAR', 'USD'], defaultValue: 'YER' })).toBe('YER');
    });

    it('3.3 should validate numeric fields for non-negative values', () => {
      expect(validateAndCleanValue('price', '-500', { field: 'price', type: 'NUMERIC', defaultValue: '0' })).toBe('0');
      expect(validateAndCleanValue('price', '1500.5', { field: 'price', type: 'NUMERIC', defaultValue: '0' })).toBe('1500.5');
    });

    it('3.4 should validate contact types to PHONE, WHATSAPP, EMAIL, OTHER', () => {
      expect(validateAndCleanValue('channelType', 'whatsapp', { field: 'channelType', type: 'DROPDOWN', options: ['PHONE', 'WHATSAPP', 'EMAIL', 'OTHER'], defaultValue: 'WHATSAPP' })).toBe('WHATSAPP');
    });
  });

  describe('4. Google Sheets Data Validation API Rules', () => {
    it('4.1 should apply Google Sheets Data Validation rules to transport', async () => {
      const reconciler = new GoogleSheetsAdminReconciler(transport);
      await reconciler.reconcileAll();

      const prodValidations = transport.getValidations('products');
      expect(prodValidations.length).toBeGreaterThan(0);

      // Verify currency validation rule exists
      const currencyVal = prodValidations.find(v => v.options.includes('YER'));
      expect(currencyVal).toBeDefined();
      expect(currencyVal?.options).toEqual(['YER', 'SAR', 'USD']);

      // Verify inStock validation rule exists
      const inStockVal = prodValidations.find(v => v.options.includes('TRUE') && v.options.includes('FALSE'));
      expect(inStockVal).toBeDefined();
    });
  });

  describe('5. Duplicate ID Protection & Idempotent Sync', () => {
    it('5.1 should prevent duplicate IDs when auto-generating sequential IDs', async () => {
      const existing = ['prod-001', 'prod-002', 'prod-003'];
      const id1 = generateSequentialAutoId('prod', existing);
      expect(id1).toBe('prod-004');

      existing.push(id1);
      const id2 = generateSequentialAutoId('prod', existing);
      expect(id2).toBe('prod-005');
      expect(id2).not.toBe(id1);
    });
  });

  describe('6. Live Dynamic Sana Tests (Read, Price Change, Toggle, Availability)', () => {
    it('6.1 should read dynamically provisioned payment methods in Sana knowledge policy', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      const policy = await service.getLiveKnowledgePolicy();

      expect(policy.persona).toContain('متجر الذيباني');
      expect(policy.persona).toContain('وان كاش');
      expect(policy.persona).toContain('جيب');
      expect(policy.persona).toContain('جوالي');
      expect(policy.persona).toContain('الدفع كاش عند الاستلام');
    });

    it('6.2 should exclude payment method from Sana policy when isActive toggle is set to FALSE', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      // Disable 'جيب' in sheet
      const pmRows = await transport.getRows('payment_methods');
      const hMap = new HeaderMap(pmRows[0].values, pmRows[0].values);

      for (let i = 1; i < pmRows.length; i++) {
        if (hMap.getValue(pmRows[i].values, 'displayName') === 'جيب') {
          const rowVals = [...pmRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (pmRows[0].values[j] === 'isActive') rowVals[j] = 'FALSE';
          }
          await transport.updateRow('payment_methods', pmRows[i].rowNumber, rowVals);
        }
      }

      service.invalidatePolicyCache();
      const policy = await service.getLiveKnowledgePolicy();
      expect(policy.persona).not.toContain('طريقة الدفع: جيب');
    });

    it('6.3 should reflect dynamic product price changes from Google Sheets in Sana policy', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      // Update price of 'سكر السعيد ابو كيلو' from 500 to 750
      const prodRows = await transport.getRows('products');
      const hMap = new HeaderMap(prodRows[0].values, prodRows[0].values);

      for (let i = 1; i < prodRows.length; i++) {
        if (hMap.getValue(prodRows[i].values, 'name') === 'سكر السعيد ابو كيلو') {
          const rowVals = [...prodRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (prodRows[0].values[j] === 'price') rowVals[j] = '750';
          }
          await transport.updateRow('products', prodRows[i].rowNumber, rowVals);
        }
      }

      service.invalidatePolicyCache();
      const policy = await service.getLiveKnowledgePolicy();
      expect(policy.persona).toContain('750 YER');
    });

    it('6.4 should reflect dynamic product availability change (inStock = FALSE) from Google Sheets', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      // Update inStock of 'سماعات الوحش' to FALSE
      const prodRows = await transport.getRows('products');
      const hMap = new HeaderMap(prodRows[0].values, prodRows[0].values);

      for (let i = 1; i < prodRows.length; i++) {
        if (hMap.getValue(prodRows[i].values, 'name') === 'سماعات الوحش') {
          const rowVals = [...prodRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (prodRows[0].values[j] === 'inStock') rowVals[j] = 'FALSE';
          }
          await transport.updateRow('products', prodRows[i].rowNumber, rowVals);
        }
      }

      service.invalidatePolicyCache();
      const policy = await service.getLiveKnowledgePolicy();
      expect(policy.persona).toContain('سماعات الوحش: 450 YER (غير متوفر)');
    });
  });


  describe('7. Render Production Environment & Credentials Probe', () => {
    it('7.1 should probe production environment credentials and canonical identities safely', () => {
      expect(CANONICAL_SPREADSHEET_ID).toBe('1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo');
      expect(CANONICAL_TENANT_ID).toBe('tnt-41f0d530');
      expect(CANONICAL_STORE_ID).toBe('str-2c6ad81f');
    });
  });
});
