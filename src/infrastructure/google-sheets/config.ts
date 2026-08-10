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
    
    if (!config.mockMode && process.env.GOOGLE_SHEETS_MOCK_MODE !== 'true') {
      if (!config.clientEmail && !process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
         throw new Error('Configuration Error: clientEmail is required for real connection.');
      }
      if (!config.privateKey && !process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
         throw new Error('Configuration Error: privateKey is required for real connection.');
      }
    }
    
    return {
      spreadsheetId: config.spreadsheetId,
      mockMode: config.mockMode ?? process.env.GOOGLE_SHEETS_MOCK_MODE === 'true',
      clientEmail: config.clientEmail || process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      privateKey: config.privateKey || process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
  }
}
