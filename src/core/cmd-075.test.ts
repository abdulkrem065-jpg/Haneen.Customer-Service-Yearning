import { describe, it, expect, beforeEach } from 'vitest';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { BusinessKnowledgeProvisioner, REAL_PAYMENT_METHODS, REAL_STORE_CONTACTS } from '../infrastructure/google-sheets/provision-business-knowledge';
import { HaneenService, CANONICAL_SPREADSHEET_ID, CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ChatRateLimiter } from './productization/rate-limiter';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';

describe('CMD-075 — Safe Auto-Creation of Missing Canonical Sheets & Real Production Provisioning', () => {
  let transport: MockGoogleSheetsTransport;

  beforeEach(() => {
    transport = new MockGoogleSheetsTransport();
  });

  describe('1. Safe Sheet Creation Abstraction (ensureSheetExists & createSheet)', () => {
    it('should create missing canonical sheet tab and prevent duplicates idempotently', async () => {
      const sheetName = 'payment_methods';

      // 1. First call should return true (created new sheet)
      const createdFirst = await transport.ensureSheetExists(sheetName);
      expect(createdFirst).toBe(true);

      // 2. Second call should return false (sheet already exists, no duplicate)
      const createdSecond = await transport.ensureSheetExists(sheetName);
      expect(createdSecond).toBe(false);
    });

    it('should automatically invoke ensureSheetExists during writeHeaderRow and addRow', async () => {
      const sheetName = 'delivery_zones';
      const headers = ['id', 'tenantId', 'storeId', 'name', 'isActive', 'displayOrder', 'createdAt', 'updatedAt'];

      // Write header directly to a non-initialized sheet
      await transport.writeHeaderRow(sheetName, headers);

      const rows = await transport.getRows(sheetName);
      expect(rows.length).toBe(1);
      expect(rows[0].values).toEqual(headers);
    });
  });

  describe('2. Idempotent Business Knowledge Provisioning Across Missing Canonical Sheets', () => {
    it('should safely auto-create and provision all missing canonical sheets without duplicate records', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);

      // Run 1: Initial Provisioning
      const res1 = await provisioner.provisionAll();
      expect(res1.paymentMethodsCreated).toBe(6);
      expect(res1.contactsCreated).toBe(2);
      expect(res1.noticesCreated).toBe(2);
      expect(res1.businessHoursStatus).toBe('PROVISIONED');
      expect(res1.deliveryConfigurationStatus).toBe('PROVISIONED');
      expect(res1.deliveryZonesStatus).toBe('PROVISIONED');
      expect(res1.storeLocationsStatus).toBe('PROVISIONED');
      expect(res1.storePoliciesStatus).toBe('PROVISIONED');
      expect(res1.digitalServicesStatus).toBe('PROVISIONED');

      // Run 2: Re-run Idempotency Verification
      const res2 = await provisioner.provisionAll();
      expect(res2.paymentMethodsCreated).toBe(0);
      expect(res2.paymentMethodsSkipped).toBe(6);
      expect(res2.contactsCreated).toBe(0);
      expect(res2.contactsSkipped).toBe(2);
      expect(res2.noticesCreated).toBe(0);
      expect(res2.noticesSkipped).toBe(2);
      expect(res2.businessHoursStatus).toBe('EXISTS');
      expect(res2.deliveryConfigurationStatus).toBe('EXISTS');
      expect(res2.deliveryZonesStatus).toBe('EXISTS');
      expect(res2.storeLocationsStatus).toBe('EXISTS');
      expect(res2.storePoliciesStatus).toBe('EXISTS');
      expect(res2.digitalServicesStatus).toBe('EXISTS');
    });
  });

  describe('3. Live Sana Knowledge Policy Integration & Dynamic Toggle Test', () => {
    it('should load provisioned payment methods, contacts, and delivery config into Sana policy persona', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      const policy = await service.getLiveKnowledgePolicy();

      // Verified business facts in policy
      expect(policy.persona).toContain('متجر الذيباني');
      expect(policy.persona).toContain('وان كاش');
      expect(policy.persona).toContain('جيب');
      expect(policy.persona).toContain('جوالي');
      expect(policy.persona).toContain('الدفع كاش عند الاستلام');
      expect(policy.persona).toContain('https://wa.me/967770493341');
      expect(policy.persona).toContain('1000 YER');
    });

    it('should dynamically update Sana policy when payment method isActive toggle changes in Google Sheets', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      // Check initial policy contains 'وان كاش'
      const policy1 = await service.getLiveKnowledgePolicy();
      expect(policy1.persona).toContain('وان كاش');

      // Disable 'وان كاش' in sheet (set isActive = FALSE)
      const pmRows = await transport.getRows('payment_methods');
      const hMap = new HeaderMap(pmRows[0].values, pmRows[0].values);

      for (let i = 1; i < pmRows.length; i++) {
        if (hMap.getValue(pmRows[i].values, 'displayName') === 'وان كاش') {
          const rowVals = [...pmRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (pmRows[0].values[j] === 'isActive') rowVals[j] = 'FALSE';
          }
          await transport.updateRow('payment_methods', pmRows[i].rowNumber, rowVals);
        }
      }

      service.invalidatePolicyCache();
      const policy2 = await service.getLiveKnowledgePolicy();
      expect(policy2.persona).not.toContain('وان كاش');

      // Re-enable 'وان كاش' (set isActive = TRUE)
      for (let i = 1; i < pmRows.length; i++) {
        if (hMap.getValue(pmRows[i].values, 'displayName') === 'وان كاش') {
          const rowVals = [...pmRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (pmRows[0].values[j] === 'isActive') rowVals[j] = 'TRUE';
          }
          await transport.updateRow('payment_methods', pmRows[i].rowNumber, rowVals);
        }
      }

      service.invalidatePolicyCache();
      const policy3 = await service.getLiveKnowledgePolicy();
      expect(policy3.persona).toContain('وان كاش');
    });
  });

  describe('4. Render Production Environment & Gateway Probe', () => {
    it('should probe local AI Studio runner vs Render production credentials', () => {
      const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      const adminSecret = process.env.ADMIN_VERIFY_SECRET;

      console.log('=== CMD-075 RENDER PRODUCTION PROBE ===');
      console.log('Spreadsheet ID:', CANONICAL_SPREADSHEET_ID);
      console.log('Tenant ID:', CANONICAL_TENANT_ID);
      console.log('Store ID:', CANONICAL_STORE_ID);
      console.log('CLIENT_EMAIL:', clientEmail ? 'PRESENT' : 'MISSING IN LOCAL RUNNER');
      console.log('PRIVATE_KEY:', privateKey ? 'PRESENT' : 'MISSING IN LOCAL RUNNER');
      console.log('ADMIN_VERIFY_SECRET:', adminSecret ? 'PRESENT' : 'MISSING IN LOCAL RUNNER');

      expect(CANONICAL_SPREADSHEET_ID).toBe('1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo');
      expect(CANONICAL_TENANT_ID).toBe('tnt-41f0d530');
      expect(CANONICAL_STORE_ID).toBe('str-2c6ad81f');
    });
  });
});
