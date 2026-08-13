import { describe, it, expect, beforeAll } from 'vitest';
import { ConfigValidator } from '../infrastructure/google-sheets/config';
import { GoogleServiceAccountAuth } from '../infrastructure/google-sheets/auth';
import { SecureGoogleSheetsTransport } from '../infrastructure/google-sheets/secure-transport';
import { GoogleSheetsDataProvider } from '../infrastructure/google-sheets/provider';
import { PaymentMethodMapper, StoreContactMapper } from '../infrastructure/google-sheets/domain-mappers';
import { PaymentTool } from './tools/payment-tool';
import { ContactTool } from './tools/contact-tool';
import { NoHallucinationGuard } from './tools/no-hallucination-guard';
import {
  ALTHEIBANI_TENANT_ID,
  ALTHEIBANI_STORE_ID
} from '../infrastructure/google-sheets/import-altheibani-catalog';
import { PaymentMethod, StoreContact } from './data/domain';
import { UnauthorizedDataAccessError } from './data/errors';
import { validateTrustedContextSecurity, ALLOWED_WRITE_DOMAINS } from '../infrastructure/google-sheets/admin/owner-settings-endpoint';

describe('CMD-035 — OWNER SETTINGS LIVE WRITE-BACK & HANEEN READ-BACK', () => {
  const AUTHORITATIVE_SPREADSHEET_ID = '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';
  const AUTHORITATIVE_TENANT_ID = ALTHEIBANI_TENANT_ID; // 'tnt-41f0d530'
  const AUTHORITATIVE_STORE_ID = ALTHEIBANI_STORE_ID;   // 'str-2c6ad81f'
  const AUTHORITATIVE_AGENT_ID = 'agt-c93183d5';
  const BASE_CURRENCY = 'YER';

  const trustedContext = {
    tenantId: AUTHORITATIVE_TENANT_ID,
    storeId: AUTHORITATIVE_STORE_ID,
    agentId: AUTHORITATIVE_AGENT_ID
  };

  let transport: SecureGoogleSheetsTransport;
  let paymentProvider: GoogleSheetsDataProvider<PaymentMethod>;
  let contactProvider: GoogleSheetsDataProvider<StoreContact>;
  let paymentTool: PaymentTool;
  let contactTool: ContactTool;

  let isRealConnectionAvailable = false;

  beforeAll(async () => {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || AUTHORITATIVE_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    if (clientEmail && privateKey) {
      try {
        const config = ConfigValidator.validate({
          spreadsheetId,
          clientEmail,
          privateKey,
          mockMode: false
        });
        const authClient = new GoogleServiceAccountAuth(config);
        transport = new SecureGoogleSheetsTransport(authClient, config);

        paymentProvider = new GoogleSheetsDataProvider(transport, new PaymentMethodMapper());
        contactProvider = new GoogleSheetsDataProvider(transport, new StoreContactMapper());

        paymentTool = new PaymentTool(paymentProvider);
        contactTool = new ContactTool(contactProvider);

        isRealConnectionAvailable = true;
      } catch (err) {
        console.warn('Real Google Sheets connection not configured or failed in test runner environment:', err);
      }
    }
  });

  // 1. Pre-flight & Authoritative Context Check
  describe('1. Authoritative Identity & Pre-flight Verification', () => {
    it('should verify authoritative spreadsheet and tenant constants', () => {
      expect(AUTHORITATIVE_SPREADSHEET_ID).toBe('1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo');
      expect(trustedContext.tenantId).toBe('tnt-41f0d530');
      expect(trustedContext.storeId).toBe('str-2c6ad81f');
      expect(trustedContext.agentId).toBe('agt-c93183d5');
      expect(BASE_CURRENCY).toBe('YER');
    });

    it('should verify allowed write domains in owner settings scope', () => {
      expect(ALLOWED_WRITE_DOMAINS).toContain('payment_methods');
      expect(ALLOWED_WRITE_DOMAINS).toContain('store_contacts');
      expect(ALLOWED_WRITE_DOMAINS.length).toBeGreaterThanOrEqual(2);
    });
  });

  // 2. Security & Trusted Context Enforcement
  describe('2. Trusted Context & Scope Boundary Security', () => {
    it('should pass when request context matches trusted context', () => {
      const mockReq = {
        body: { tenantId: AUTHORITATIVE_TENANT_ID, storeId: AUTHORITATIVE_STORE_ID },
        query: {},
        headers: {}
      } as any;

      expect(() => validateTrustedContextSecurity(mockReq, trustedContext)).not.toThrow();
    });

    it('should throw UnauthorizedDataAccessError if client tries to override tenantId in body', () => {
      const mockReq = {
        body: { tenantId: 'hacked-tenant', storeId: AUTHORITATIVE_STORE_ID },
        query: {},
        headers: {}
      } as any;

      expect(() => validateTrustedContextSecurity(mockReq, trustedContext)).toThrow(UnauthorizedDataAccessError);
    });

    it('should throw UnauthorizedDataAccessError if client tries to override storeId in query', () => {
      const mockReq = {
        body: {},
        query: { storeId: 'hacked-store' },
        headers: {}
      } as any;

      expect(() => validateTrustedContextSecurity(mockReq, trustedContext)).toThrow(UnauthorizedDataAccessError);
    });

    it('should throw UnauthorizedDataAccessError if client tries to override tenantId in header', () => {
      const mockReq = {
        body: {},
        query: {},
        headers: { 'x-tenant-id': 'malicious-tenant' }
      } as any;

      expect(() => validateTrustedContextSecurity(mockReq, trustedContext)).toThrow(UnauthorizedDataAccessError);
    });

    it('should reject requests targeting out-of-scope sheets (e.g. products or orders)', () => {
      const forbiddenDomains = ['products', 'categories', 'orders', 'customers', 'conversations'];
      
      for (const domain of forbiddenDomains) {
        expect(ALLOWED_WRITE_DOMAINS as any).not.toContain(domain);
      }
    });
  });

  // 3. Payment Method Live Write-Back & Read-Back ("بنك الكريمي")
  describe('3. Payment Method Controlled Toggle ("بنك الكريمي")', () => {
    it('should execute full toggle cycle: inactive -> active -> inactive with read-back and Haneen verification', async () => {
      if (!isRealConnectionAvailable) {
        console.log('Skipping real network calls; credentials not set in local env.');
        return;
      }

      const targetId = 'pm-001';

      // Step A: Fetch initial state
      const initialPm = await paymentProvider.getById(targetId, trustedContext);
      expect(initialPm).not.toBeNull();
      expect(initialPm?.displayName).toBe('بنك الكريمي');

      const initialActive = initialPm!.isActive;

      try {
        // Step B: Toggle to Active (isActive = true)
        const updatedActive = await paymentProvider.update(targetId, { isActive: true }, trustedContext);
        expect(updatedActive.isActive).toBe(true);

        // Read-Back direct from Sheets
        const readBackActive = await paymentProvider.getById(targetId, trustedContext);
        expect(readBackActive?.isActive).toBe(true);

        // Verify Haneen PaymentTool reads active "بنك الكريمي"
        const toolResultActive = await paymentTool.getPaymentMethods(trustedContext);
        expect(toolResultActive.isConfirmed).toBe(true);
        expect(toolResultActive.data).toBeDefined();

        const activeNames = toolResultActive.data!.map(m => m.displayName);
        expect(activeNames).toContain('بنك الكريمي');

        // Step C: Toggle to Inactive (isActive = false)
        const updatedInactive = await paymentProvider.update(targetId, { isActive: false }, trustedContext);
        expect(updatedInactive.isActive).toBe(false);

        // Read-Back direct from Sheets
        const readBackInactive = await paymentProvider.getById(targetId, trustedContext);
        expect(readBackInactive?.isActive).toBe(false);

        // Verify Haneen PaymentTool does NOT read inactive "بنك الكريمي"
        const toolResultInactive = await paymentTool.getPaymentMethods(trustedContext);
        expect(toolResultInactive.isConfirmed).toBe(true);

        const inactiveNames = toolResultInactive.data!.map(m => m.displayName);
        expect(inactiveNames).not.toContain('بنك الكريمي');

      } finally {
        // Step D: Rollback to initial state
        await paymentProvider.update(targetId, { isActive: initialActive }, trustedContext);
        const finalReadBack = await paymentProvider.getById(targetId, trustedContext);
        expect(finalReadBack?.isActive).toBe(initialActive);
      }
    });
  });

  // 4. Store Contact Live Write-Back & Read-Back (WhatsApp)
  describe('4. Store Contact Controlled Toggle (WhatsApp)', () => {
    it('should execute full toggle cycle: active -> inactive -> active with link preservation and Haneen verification', async () => {
      if (!isRealConnectionAvailable) {
        console.log('Skipping real network calls; credentials not set in local env.');
        return;
      }

      const targetId = 'cnt-001';

      // Step A: Fetch initial state
      const initialContact = await contactProvider.getById(targetId, trustedContext);
      expect(initialContact).not.toBeNull();
      expect(initialContact?.channelType).toBe('whatsapp');
      expect(initialContact?.contactValue).toBe('https://wa.me/967770493341');

      const initialActive = initialContact!.isActive;

      try {
        // Step B: Toggle to Inactive (isActive = false)
        const updatedInactive = await contactProvider.update(targetId, { isActive: false }, trustedContext);
        expect(updatedInactive.isActive).toBe(false);

        // Read-Back
        const readBackInactive = await contactProvider.getById(targetId, trustedContext);
        expect(readBackInactive?.isActive).toBe(false);

        // Verify ContactTool excludes inactive WhatsApp
        const toolResultInactive = await contactTool.getStoreContacts(trustedContext);
        expect(toolResultInactive.isConfirmed).toBe(true);
        const inactiveTypes = toolResultInactive.data!.map(c => c.channelType);
        expect(inactiveTypes).not.toContain('whatsapp');

        // Step C: Toggle back to Active (isActive = true)
        const updatedActive = await contactProvider.update(targetId, { isActive: true }, trustedContext);
        expect(updatedActive.isActive).toBe(true);

        // Read-Back
        const readBackActive = await contactProvider.getById(targetId, trustedContext);
        expect(readBackActive?.isActive).toBe(true);
        expect(readBackActive?.contactValue).toBe('https://wa.me/967770493341'); // Unchanged

        // Verify ContactTool includes active WhatsApp
        const toolResultActive = await contactTool.getStoreContacts(trustedContext);
        expect(toolResultActive.isConfirmed).toBe(true);
        const activeTypes = toolResultActive.data!.map(c => c.channelType);
        expect(activeTypes).toContain('whatsapp');

      } finally {
        // Step D: Rollback safety
        await contactProvider.update(targetId, { isActive: initialActive }, trustedContext);
        const finalReadBack = await contactProvider.getById(targetId, trustedContext);
        expect(finalReadBack?.isActive).toBe(initialActive);
      }
    });
  });

  // 5. Idempotency & Duplicate Prevention Test
  describe('5. Idempotency & Duplicate Prevention', () => {
    it('should maintain strict row count and update existing row in-place on multiple saves', async () => {
      if (!isRealConnectionAvailable) {
        return;
      }

      const targetId = 'pm-001';

      const initialList = await paymentProvider.search({}, trustedContext);
      const initialCount = initialList.items.length;

      // Consecutive updates with same value
      await paymentProvider.update(targetId, { isActive: true }, trustedContext);
      await paymentProvider.update(targetId, { isActive: true }, trustedContext);
      await paymentProvider.update(targetId, { isActive: true }, trustedContext);

      const afterList = await paymentProvider.search({}, trustedContext);
      expect(afterList.items.length).toBe(initialCount); // Zero duplicate rows added!

      // Rollback
      await paymentProvider.update(targetId, { isActive: false }, trustedContext);
    });
  });

  // 6. No-Hallucination Guard Evaluation
  describe('6. No-Hallucination Guard Verification', () => {
    it('should return evaluateData result with accurate entityNameAr', () => {
      const mockActivePm: PaymentMethod[] = [
        {
          id: 'pm-003',
          tenantId: AUTHORITATIVE_TENANT_ID,
          storeId: AUTHORITATIVE_STORE_ID,
          methodType: 'wallet',
          displayName: 'وان كاش',
          accountDetails: '770493341',
          isActive: true,
          displayOrder: 3,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const res = NoHallucinationGuard.evaluateData(mockActivePm, { entityNameAr: 'طرق الدفع' });
      expect(res.state).toBe('KNOWN');
      expect(res.isConfirmed).toBe(true);
      expect(res.data).toEqual(mockActivePm);
      expect(res.data?.[0].displayName).toBe('وان كاش');
    });

    it('should return state UNKNOWN if data is empty or unavailable', () => {
      const res = NoHallucinationGuard.evaluateData([], { entityNameAr: 'طرق الدفع' });
      expect(res.state).toBe('UNKNOWN');
      expect(res.isConfirmed).toBe(false);
      expect(res.message).toContain('طرق الدفع');
    });
  });
});
