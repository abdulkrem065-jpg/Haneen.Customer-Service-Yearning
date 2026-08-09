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

  it('should prevent addRow due to zero-write policy', async () => {
    await expect(transport.addRow('test', ['val'])).rejects.toThrow(ProviderError);
    await expect(transport.addRow('test', ['val'])).rejects.toThrow(/Zero-write policy/);
  });

  it('should prevent updateRow due to zero-write policy', async () => {
    await expect(transport.updateRow('test', 1, ['val'])).rejects.toThrow(ProviderError);
    await expect(transport.updateRow('test', 1, ['val'])).rejects.toThrow(/Zero-write policy/);
  });

  it('should prevent deleteRow due to zero-write policy', async () => {
    await expect(transport.deleteRow('test', 1)).rejects.toThrow(ProviderError);
    await expect(transport.deleteRow('test', 1)).rejects.toThrow(/Zero-write policy/);
  });
});
