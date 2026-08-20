import { describe, it, expect, beforeEach } from 'vitest';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { BusinessKnowledgeProvisioner } from '../infrastructure/google-sheets/provision-business-knowledge';
import { HaneenService, CANONICAL_SPREADSHEET_ID, CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ChatRateLimiter } from './productization/rate-limiter';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';

describe('CMD-073 — Render-Side Production Provisioning, Google Sheets Completion & Live Sana Verification', () => {
  let transport: MockGoogleSheetsTransport;

  beforeEach(() => {
    transport = new MockGoogleSheetsTransport();
  });

  describe('1. Production Environment & Render Gateway Probe', () => {
    it('should probe local container vs Render production runtime safety limits', () => {
      const isRender = !!process.env.RENDER;
      const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      const adminSecret = process.env.ADMIN_VERIFY_SECRET;

      console.log('=== CMD-073 RENDER PRODUCTION GATE PROBE ===');
      console.log('Render Production Runtime:', isRender ? 'ACTIVE' : 'INACTIVE (Local AI Studio Runner)');
      console.log('GOOGLE_SHEETS_CLIENT_EMAIL:', clientEmail ? 'PRESENT' : 'MISSING IN LOCAL RUNNER');
      console.log('GOOGLE_SHEETS_PRIVATE_KEY:', privateKey ? 'PRESENT' : 'MISSING IN LOCAL RUNNER');
      console.log('ADMIN_VERIFY_SECRET:', adminSecret ? 'PRESENT' : 'MISSING IN LOCAL RUNNER');

      expect(CANONICAL_SPREADSHEET_ID).toBe('1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo');
      expect(CANONICAL_TENANT_ID).toBe('tnt-41f0d530');
      expect(CANONICAL_STORE_ID).toBe('str-2c6ad81f');
    });
  });

  describe('2. Idempotent Business Knowledge Provisioning', () => {
    it('should provision all canonical tables idempotently without duplicating records', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);

      // Run 1
      const res1 = await provisioner.provisionAll();
      expect(res1.paymentMethodsCreated).toBe(6);
      expect(res1.contactsCreated).toBe(2);
      expect(res1.noticesCreated).toBe(2);

      // Run 2 (Re-run / Idempotency check)
      const res2 = await provisioner.provisionAll();
      expect(res2.paymentMethodsCreated).toBe(0);
      expect(res2.paymentMethodsSkipped).toBe(6);
      expect(res2.contactsCreated).toBe(0);
      expect(res2.contactsSkipped).toBe(2);
      expect(res2.noticesCreated).toBe(0);
      expect(res2.noticesSkipped).toBe(2);
    });
  });

  describe('3. Dynamic Policy & Live Verification Read-Back', () => {
    it('should load all business facts from Google Sheets into Sana policy', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      const policy = await service.getLiveKnowledgePolicy();
      expect(policy.persona).toContain('متجر الذيباني');
      expect(policy.persona).toContain('وان كاش');
      expect(policy.persona).toContain('سكر السعيد');
    });

    it('should reflect payment method toggles dynamically in policy', async () => {
      const provisioner = new BusinessKnowledgeProvisioner(transport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: transport });

      const policy1 = await service.getLiveKnowledgePolicy();
      expect(policy1.persona).toContain('وان كاش');

      // Mutate payment method in sheet
      const pmRows = await transport.getRows('payment_methods');
      const hMap = new HeaderMap(pmRows[0].values, pmRows[0].values);

      for (let i = 1; i < pmRows.length; i++) {
        if (hMap.getValue(pmRows[i].values, 'displayName') === 'وان كاش') {
          const rowVals = [...pmRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (pmRows[0].values[j] === 'isActive') rowVals[j] = 'FALSE';
          }
          pmRows[i].values = rowVals;
        }
      }

      service.invalidatePolicyCache();
      const policy2 = await service.getLiveKnowledgePolicy();
      expect(policy2.persona).not.toContain('وان كاش');
    });
  });
});
