import { GoogleAuth } from 'google-auth-library';
import { GoogleSheetsConfig } from './config';
import { ProviderError } from '../../core/data/errors';
import { normalizePrivateKey, validatePrivateKey } from './key-utils';

export interface IGoogleAuthClient {
  getClient(): Promise<any>;
}

export class GoogleServiceAccountAuth implements IGoogleAuthClient {
  private auth: GoogleAuth;

  constructor(config: GoogleSheetsConfig) {
    if (!config.clientEmail || !config.privateKey) {
      throw new ProviderError('Missing credentials for GoogleServiceAccountAuth');
    }

    const normalizedKey = normalizePrivateKey(config.privateKey);
    const validation = validatePrivateKey(normalizedKey);
    if (!validation.valid) {
      throw new ProviderError('Invalid Google service account private key format');
    }
    
    this.auth = new GoogleAuth({
      credentials: {
        client_email: config.clientEmail,
        private_key: normalizedKey,
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

