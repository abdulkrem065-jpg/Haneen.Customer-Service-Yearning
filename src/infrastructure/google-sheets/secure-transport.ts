import { google, sheets_v4 } from 'googleapis';
import { IGoogleSheetsTransport, SheetRow } from './transport';
import { IGoogleAuthClient } from './auth';
import { GoogleSheetsConfig } from './config';
import { ProviderError, DataUnavailableError } from '../../core/data/errors';

export class SecureGoogleSheetsTransport implements IGoogleSheetsTransport {
  private sheets: sheets_v4.Sheets | null = null;
  private readonly spreadsheetId: string;

  constructor(
    private authClient: IGoogleAuthClient,
    config: GoogleSheetsConfig
  ) {
    this.spreadsheetId = config.spreadsheetId;
  }

  private async getSheetsAPI(): Promise<sheets_v4.Sheets> {
    if (!this.sheets) {
      try {
        const auth = await this.authClient.getClient();
        this.sheets = google.sheets({ version: 'v4', auth });
      } catch (error: any) {
        throw new ProviderError(`Failed to initialize Google Sheets API: ${error.message}`);
      }
    }
    return this.sheets;
  }

  async getSpreadsheetMetadata(): Promise<sheets_v4.Schema$Spreadsheet> {
    try {
      const api = await this.getSheetsAPI();
      const response = await api.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      return response.data;
    } catch (error: any) {
      this.handleApiError(error);
      throw error; // Will be mapped by handleApiError, but TS needs return/throw
    }
  }

  async getRows(sheetName: string): Promise<SheetRow[]> {
    try {
      const api = await this.getSheetsAPI();
      const response = await api.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
      });
      
      const values = response.data.values;
      if (!values || values.length === 0) {
        return [];
      }

      return values.map((rowValues, index) => ({
        rowNumber: index + 1,
        values: rowValues as string[],
      }));
    } catch (error: any) {
      this.handleApiError(error);
      return [];
    }
  }

  async addRow(sheetName: string, values: string[]): Promise<SheetRow> {
    throw new ProviderError('Zero-write policy is currently active. Real data writes are disabled.');
  }

  async updateRow(sheetName: string, rowNumber: number, values: string[]): Promise<void> {
    throw new ProviderError('Zero-write policy is currently active. Real data writes are disabled.');
  }

  async deleteRow(sheetName: string, rowNumber: number): Promise<void> {
    throw new ProviderError('Zero-write policy is currently active. Real data writes are disabled.');
  }

  private handleApiError(error: any): never {
    if (error.code === 404 || error.status === 404) {
      throw new ProviderError(`Spreadsheet not found or inaccessible.`);
    }
    if (error.code === 401 || error.code === 403) {
      throw new ProviderError(`Google API Authentication/Authorization failed.`);
    }
    if (error.code >= 500 || error.code === 'ENOTFOUND') {
      throw new DataUnavailableError('Google API is temporarily unavailable.');
    }
    throw new ProviderError(`Google Sheets API Error: ${error.message}`);
  }
}
