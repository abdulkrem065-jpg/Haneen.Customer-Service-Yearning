import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigValidator } from './config';
import { GoogleServiceAccountAuth } from './auth';

describe('Google Sheets Config & Auth Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('correctly loads GOOGLE_SHEETS_SPREADSHEET_ID, CLIENT_EMAIL, and PRIVATE_KEY with line-break normalization', () => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'sheet-id-123';
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL = 'sa@project.iam.gserviceaccount.com';
    process.env.GOOGLE_SHEETS_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nFAKE_KEY\\n-----END PRIVATE KEY-----';

    const config = ConfigValidator.validate({});

    expect(config.spreadsheetId).toBe('sheet-id-123');
    expect(config.clientEmail).toBe('sa@project.iam.gserviceaccount.com');
    expect(config.privateKey).toBe('-----BEGIN PRIVATE KEY-----\nFAKE_KEY\n-----END PRIVATE KEY-----');

    // Verify auth client can initialize with these credentials
    const auth = new GoogleServiceAccountAuth(config);
    expect(auth).toBeDefined();
  });

  it('throws Error when required spreadsheetId is missing', () => {
    delete process.env.GOOGLE_SHEETS_ID;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    expect(() => ConfigValidator.validate({})).toThrow(/spreadsheetId is required/);
  });
});
