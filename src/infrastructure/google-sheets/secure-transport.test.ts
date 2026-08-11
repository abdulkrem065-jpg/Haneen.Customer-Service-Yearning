import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecureGoogleSheetsTransport } from './secure-transport';
import { IGoogleAuthClient } from './auth';
import { ProviderError } from '../../core/data/errors';

describe('SecureGoogleSheetsTransport', () => {
  let mockAuthClient: IGoogleAuthClient;
  let transport: SecureGoogleSheetsTransport;

  beforeEach(() => {
    mockAuthClient = {
      getClient: vi.fn().mockResolvedValue({}),
    };
    
    transport = new SecureGoogleSheetsTransport(mockAuthClient, {
      spreadsheetId: 'test-id',
      clientEmail: 'test@example.com',
      privateKey: 'secret'
    });
  });

  it('should attempt addRow using Google Sheets API', async () => {
    // getClient returns mock object, API call will fail if unauthenticated or throw ProviderError
    await expect(transport.addRow('test', ['val'])).rejects.toThrow(ProviderError);
  });

  it('should attempt updateRow using Google Sheets API', async () => {
    await expect(transport.updateRow('test', 1, ['val'])).rejects.toThrow(ProviderError);
  });

  it('should attempt deleteRow using Google Sheets API', async () => {
    await expect(transport.deleteRow('test', 1)).rejects.toThrow(ProviderError);
  });
});
