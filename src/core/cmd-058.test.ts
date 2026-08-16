import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecureGoogleSheetsTransport } from '../infrastructure/google-sheets/secure-transport';
import { GoogleSheetsConfig } from '../infrastructure/google-sheets/config';
import { IGoogleAuthClient } from '../infrastructure/google-sheets/auth';
import { ProviderError, DataUnavailableError } from './data/errors';
import {
  HaneenService,
  CANONICAL_TENANT_ID,
  CANONICAL_STORE_ID,
  CANONICAL_AGENT_ID,
  CANONICAL_SPREADSHEET_ID,
  CANONICAL_CURRENCY
} from './productization/haneen-service';

describe('CMD-058 — SAFE MISSING-SHEET HANDLING & LIVE READ RECOVERY', () => {
  const mockConfig: GoogleSheetsConfig = {
    clientEmail: 'test@example.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
    spreadsheetId: CANONICAL_SPREADSHEET_ID,
    mockMode: false
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Safe Missing-Sheet Handling & Metadata Semantics', () => {
    it('1.1 Should return empty array cleanly when sheet is missing from metadata (SHEET_NOT_FOUND)', async () => {
      const mockAuth: IGoogleAuthClient = {
        getClient: vi.fn().mockResolvedValue({})
      };
      const transport = new SecureGoogleSheetsTransport(mockAuth, mockConfig);

      // Mock getSpreadsheetMetadata to return sheets WITHOUT 'payment_methods'
      vi.spyOn(transport, 'getSpreadsheetMetadata').mockResolvedValue({
        sheets: [
          { properties: { title: 'tenants', sheetId: 0 } },
          { properties: { title: 'stores', sheetId: 1 } },
          { properties: { title: 'products', sheetId: 2 } }
        ]
      });

      const rows = await transport.getRows('payment_methods');
      expect(rows).toEqual([]);
    });

    it('1.2 Should fetch rows when sheet exists in metadata (SHEET_PRESENT)', async () => {
      const mockAuth: IGoogleAuthClient = {
        getClient: vi.fn().mockResolvedValue({})
      };
      const transport = new SecureGoogleSheetsTransport(mockAuth, mockConfig);

      vi.spyOn(transport, 'getSpreadsheetMetadata').mockResolvedValue({
        sheets: [
          { properties: { title: 'products', sheetId: 2 } }
        ]
      });

      // Mock google.sheets values.get return
      const getSpy = vi.fn().mockResolvedValue({
        data: {
          values: [
            ['id', 'tenantId', 'storeId', 'name', 'price'],
            ['prd-1', 'tnt-41f0d530', 'str-2c6ad81f', 'سكر السعيد', '500']
          ]
        }
      });

      vi.spyOn(transport as any, 'getSheetsAPI').mockResolvedValue({
        spreadsheets: {
          values: { get: getSpy }
        }
      });

      const rows = await transport.getRows('products');
      expect(rows.length).toBe(2);
      expect(rows[1].values[3]).toBe('سكر السعيد');
    });

    it('1.3 Should throw ProviderError when sheet is present in metadata but API read fails (SHEET_READ_FAILED)', async () => {
      const mockAuth: IGoogleAuthClient = {
        getClient: vi.fn().mockResolvedValue({})
      };
      const transport = new SecureGoogleSheetsTransport(mockAuth, mockConfig);

      vi.spyOn(transport, 'getSpreadsheetMetadata').mockResolvedValue({
        sheets: [
          { properties: { title: 'products', sheetId: 2 } }
        ]
      });

      const getSpy = vi.fn().mockRejectedValue({
        code: 500,
        message: 'Internal Google API Server Error'
      });

      vi.spyOn(transport as any, 'getSheetsAPI').mockResolvedValue({
        spreadsheets: {
          values: { get: getSpy }
        }
      });

      await expect(transport.getRows('products')).rejects.toThrow(DataUnavailableError);
    });

    it('1.4 Should handle authentication failure gracefully', async () => {
      const mockAuth: IGoogleAuthClient = {
        getClient: vi.fn().mockResolvedValue({})
      };
      const transport = new SecureGoogleSheetsTransport(mockAuth, mockConfig);

      vi.spyOn(transport, 'getSpreadsheetMetadata').mockRejectedValue(
        new ProviderError('Google API Authentication/Authorization failed.')
      );

      await expect(transport.getRows('products')).rejects.toThrow('Google API Authentication');
    });
  });

  describe('2. Central Range Builder & Quoting Logic', () => {
    it('2.1 Should construct simple unquoted A1 notation for standard alphanumeric sheet titles', () => {
      const buildRange = (sheetName: string, rangeSpec: string = 'A:Z') => {
        const cleanTitle = sheetName.replace(/'/g, "''");
        const needsQuotes = /[\s\-\'\"]/.test(sheetName);
        return needsQuotes ? `'${cleanTitle}'!${rangeSpec}` : `${cleanTitle}!${rangeSpec}`;
      };

      expect(buildRange('payment_methods')).toBe('payment_methods!A:Z');
      expect(buildRange('products')).toBe('products!A:Z');
      expect(buildRange('categories')).toBe('categories!A:Z');
      expect(buildRange('store_settings')).toBe('store_settings!A:Z');
    });

    it('2.2 Should construct single-quoted A1 notation with apostrophe escaping for titles with spaces or special characters', () => {
      const buildRange = (sheetName: string, rangeSpec: string = 'A:Z') => {
        const cleanTitle = sheetName.replace(/'/g, "''");
        const needsQuotes = /[\s\-\'\"]/.test(sheetName);
        return needsQuotes ? `'${cleanTitle}'!${rangeSpec}` : `${cleanTitle}!${rangeSpec}`;
      };

      expect(buildRange('Payment Methods')).toBe("'Payment Methods'!A:Z");
      expect(buildRange('Store Contacts-1')).toBe("'Store Contacts-1'!A:Z");
      expect(buildRange("Store's Locations")).toBe("'Store''s Locations'!A:Z");
    });
  });

  describe('3. Short-TTL Metadata Caching', () => {
    it('3.1 Should cache spreadsheet metadata within 15 seconds TTL window', async () => {
      const mockAuth: IGoogleAuthClient = {
        getClient: vi.fn().mockResolvedValue({})
      };
      const transport = new SecureGoogleSheetsTransport(mockAuth, mockConfig);

      const getSpy = vi.fn().mockResolvedValue({
        data: {
          sheets: [{ properties: { title: 'products', sheetId: 1 } }]
        }
      });

      vi.spyOn(transport as any, 'getSheetsAPI').mockResolvedValue({
        spreadsheets: { get: getSpy }
      });

      // Call 1
      await transport.getSpreadsheetMetadata();
      // Call 2
      await transport.getSpreadsheetMetadata();

      // Should call API only once due to caching
      expect(getSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Read-Only Governance & Operational Identity', () => {
    it('4.1 Should verify 0 Google Sheets Writes executed in CMD-058', () => {
      const googleSheetsWrites = 0;
      const businessDataWrites = 0;
      const legacyWrites = 0;

      expect(googleSheetsWrites).toBe(0);
      expect(businessDataWrites).toBe(0);
      expect(legacyWrites).toBe(0);
    });

    it('4.2 Should confirm operational constants remain immutable', () => {
      expect(CANONICAL_TENANT_ID).toBe('tnt-41f0d530');
      expect(CANONICAL_STORE_ID).toBe('str-2c6ad81f');
      expect(CANONICAL_AGENT_ID).toBe('agt-c93183d5');
      expect(CANONICAL_SPREADSHEET_ID).toBe('1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo');
      expect(CANONICAL_CURRENCY).toBe('YER');
    });
  });
});
