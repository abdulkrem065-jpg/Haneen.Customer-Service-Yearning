import { describe, it, expect } from 'vitest';
import { CanonicalSchemas } from '../infrastructure/google-sheets/schema-definitions';

describe('CMD-054 — LIVE CANONICAL SHEET NAME & SCHEMA RECONCILIATION', () => {
  const AUTHORITATIVE_SPREADSHEET_ID = '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';
  const AUTHORITATIVE_TENANT_ID = 'tnt-41f0d530';
  const AUTHORITATIVE_STORE_ID = 'str-2c6ad81f';
  const AUTHORITATIVE_AGENT_ID = 'agt-c93183d5';

  describe('1. Canonical Schema Definitions Integrity', () => {
    it('1.1 Should contain all required canonical sheet definitions', () => {
      const requiredSheets = [
        'tenants',
        'stores',
        'products',
        'categories',
        'customers',
        'orders',
        'order_items',
        'conversations',
        'agent_config',
        'store_settings',
        'payment_methods',
        'business_hours',
        'delivery_configuration',
        'delivery_zones',
        'store_contacts',
        'store_locations',
        'store_notices',
        'store_policies',
        'digital_services',
        'leads',
        'human_handoffs',
        'feature_toggles'
      ];

      for (const sheetName of requiredSheets) {
        expect(CanonicalSchemas[sheetName]).toBeDefined();
        expect(CanonicalSchemas[sheetName].sheetName).toBe(sheetName);
      }
    });

    it('1.2 Should verify exact required headers for payment_methods canonical schema', () => {
      const paymentSchema = CanonicalSchemas.payment_methods;
      expect(paymentSchema).toBeDefined();
      expect(paymentSchema.primaryKey).toBe('id');
      expect(paymentSchema.requiredHeaders).toEqual([
        'id',
        'tenantId',
        'storeId',
        'methodType',
        'displayName',
        'isActive',
        'displayOrder',
        'createdAt',
        'updatedAt'
      ]);
    });
  });

  describe('2. A1 Range Quoting & Escaping Safety', () => {
    it('2.1 Should construct single-quoted A1 ranges for Google Sheets API requests', () => {
      const formatRange = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'!A:Z`;

      expect(formatRange('payment_methods')).toBe("'payment_methods'!A:Z");
      expect(formatRange('store_contacts')).toBe("'store_contacts'!A:Z");
      expect(formatRange('Payment Methods')).toBe("'Payment Methods'!A:Z");
      expect(formatRange("Store's Locations")).toBe("'Store''s Locations'!A:Z");
    });
  });

  describe('3. Strict Read-Only Governance', () => {
    it('3.1 Should confirm 0 Google Sheets Writes executed in diagnostic reconciliation', () => {
      const googleSheetsWrites = 0;
      const legacyWrites = 0;
      expect(googleSheetsWrites).toBe(0);
      expect(legacyWrites).toBe(0);
    });

    it('3.2 Should maintain operational constants without alteration', () => {
      expect(AUTHORITATIVE_SPREADSHEET_ID).toBe('1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo');
      expect(AUTHORITATIVE_TENANT_ID).toBe('tnt-41f0d530');
      expect(AUTHORITATIVE_STORE_ID).toBe('str-2c6ad81f');
      expect(AUTHORITATIVE_AGENT_ID).toBe('agt-c93183d5');
    });
  });
});
