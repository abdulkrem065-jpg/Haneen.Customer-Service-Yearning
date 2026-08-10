import { normalizePrivateKey, validatePrivateKey } from './key-utils';

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  mockMode?: boolean;
  clientEmail?: string;
  privateKey?: string;
}

export class ConfigValidator {
  static validate(config: Partial<GoogleSheetsConfig>): GoogleSheetsConfig {
    if (!config.spreadsheetId) {
      const idFromEnv = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;
      if (idFromEnv) {
        config.spreadsheetId = idFromEnv;
      } else {
        throw new Error('Configuration Error: spreadsheetId is required.');
      }
    }
    
    const isMock = config.mockMode ?? process.env.GOOGLE_SHEETS_MOCK_MODE === 'true';

    if (!isMock) {
      if (!config.clientEmail && !process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
         throw new Error('Configuration Error: clientEmail is required for real connection.');
      }
      const rawPrivateKey = config.privateKey || process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      if (!rawPrivateKey) {
         throw new Error('Configuration Error: privateKey is required for real connection.');
      }
      const keyVal = validatePrivateKey(rawPrivateKey);
      if (!keyVal.valid) {
         throw new Error('Invalid Google service account private key format');
      }
    }
    
    const rawKey = config.privateKey || process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    return {
      spreadsheetId: config.spreadsheetId,
      mockMode: isMock,
      clientEmail: config.clientEmail || process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(rawKey),
    };
  }
}

