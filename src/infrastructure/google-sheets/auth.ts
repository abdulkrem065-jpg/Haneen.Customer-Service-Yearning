import { GoogleAuth } from 'google-auth-library';
import { GoogleSheetsConfig } from './config';
import { ProviderError } from '../../core/data/errors';

export interface IGoogleAuthClient {
  getClient(): Promise<any>;
}

export class GoogleServiceAccountAuth implements IGoogleAuthClient {
  private auth: GoogleAuth;

  constructor(config: GoogleSheetsConfig) {
    if (!config.clientEmail || !config.privateKey) {
      throw new ProviderError('Missing credentials for GoogleServiceAccountAuth');
    }
    
    this.auth = new GoogleAuth({
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  async getClient(): Promise<any> {
    try {
      return await this.auth.getClient();
    } catch (error: any) {
      throw new ProviderError(`Google Authentication Failed: ${error.message}`);
    }
  }
}
