import { google, sheets_v4 } from 'googleapis';
import { IGoogleSheetsTransport, SheetRow } from './transport';
import { IGoogleAuthClient } from './auth';
import { GoogleSheetsConfig } from './config';
import { ProviderError, DataUnavailableError } from '../../core/data/errors';

export class SecureGoogleSheetsTransport implements IGoogleSheetsTransport {
  private sheets: sheets_v4.Sheets | null = null;
  private readonly spreadsheetId: string;
  private cachedMetadata: sheets_v4.Schema$Spreadsheet | null = null;
  private metadataCachedAt: number = 0;
  private readonly METADATA_TTL_MS = 15000;

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

  async getSpreadsheetMetadata(forceRefresh: boolean = false): Promise<sheets_v4.Schema$Spreadsheet> {
    const now = Date.now();
    if (!forceRefresh && this.cachedMetadata && (now - this.metadataCachedAt < this.METADATA_TTL_MS)) {
      return this.cachedMetadata;
    }

    try {
      const api = await this.getSheetsAPI();
      const response = await api.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      this.cachedMetadata = response.data;
      this.metadataCachedAt = now;
      return response.data;
    } catch (error: any) {
      this.handleApiError(error);
      throw error;
    }
  }

  async hasSheet(sheetName: string): Promise<boolean> {
    try {
      const metadata = await this.getSpreadsheetMetadata();
      return Boolean(metadata.sheets?.some((s: any) => s.properties?.title === sheetName));
    } catch (error: any) {
      // If metadata call fails (e.g., auth/network), error propagates
      throw error;
    }
  }

  private buildA1Range(sheetName: string, rangeSpec: string = 'A:Z'): string {
    const cleanTitle = sheetName.replace(/'/g, "''");
    const needsQuotes = /[\s\-\'\"]/.test(sheetName);
    return needsQuotes ? `'${cleanTitle}'!${rangeSpec}` : `${cleanTitle}!${rangeSpec}`;
  }

  async getRows(sheetName: string): Promise<SheetRow[]> {
    const exists = await this.hasSheet(sheetName);
    if (!exists) {
      // SHEET_NOT_FOUND: Return empty rows cleanly without invoking invalid range endpoint
      return [];
    }

    try {
      const api = await this.getSheetsAPI();
      const response = await api.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.buildA1Range(sheetName, 'A:Z'),
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
    await this.ensureSheetExists(sheetName);
    try {
      const api = await this.getSheetsAPI();
      const response = await api.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A:Z`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [values],
        },
      });

      const updatedRange = response.data.updates?.updatedRange || '';
      const match = updatedRange.match(/!A(\d+):/);
      const rowNumber = match ? parseInt(match[1], 10) : 0;

      return { rowNumber, values };
    } catch (error: any) {
      this.handleApiError(error);
      throw error;
    }
  }

  async updateRow(sheetName: string, rowNumber: number, values: string[]): Promise<void> {
    await this.ensureSheetExists(sheetName);
    try {
      const api = await this.getSheetsAPI();
      await api.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [values],
        },
      });
    } catch (error: any) {
      this.handleApiError(error);
    }
  }

  async deleteRow(sheetName: string, rowNumber: number): Promise<void> {
    try {
      const api = await this.getSheetsAPI();
      const metadata = await this.getSpreadsheetMetadata();
      const sheet = metadata.sheets?.find((s: any) => s.properties?.title === sheetName);
      if (!sheet || sheet.properties?.sheetId === undefined || sheet.properties?.sheetId === null) {
        throw new ProviderError(`Sheet '${sheetName}' not found.`);
      }
      const sheetId = sheet.properties.sheetId;

      await api.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: rowNumber - 1,
                  endIndex: rowNumber,
                },
              },
            },
          ],
        },
      });
    } catch (error: any) {
      this.handleApiError(error);
    }
  }

  async createSheet(sheetName: string): Promise<void> {
    const exists = await this.hasSheet(sheetName);
    if (exists) {
      return;
    }

    try {
      const api = await this.getSheetsAPI();
      await api.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });
      // Invalidate metadata cache so subsequent calls reflect newly created sheet
      this.cachedMetadata = null;
      this.metadataCachedAt = 0;
    } catch (error: any) {
      if (error?.message?.includes('already exists') || error?.data?.error?.message?.includes('already exists')) {
        this.cachedMetadata = null;
        this.metadataCachedAt = 0;
        return;
      }
      this.handleApiError(error);
    }
  }

  async ensureSheetExists(sheetName: string): Promise<boolean> {
    const exists = await this.hasSheet(sheetName);
    if (exists) {
      return false;
    }
    await this.createSheet(sheetName);
    return true;
  }

  async writeHeaderRow(sheetName: string, headers: string[]): Promise<void> {
    await this.ensureSheetExists(sheetName);
    try {
      const api = await this.getSheetsAPI();
      await api.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers],
        },
      });
    } catch (error: any) {
      this.handleApiError(error);
    }
  }

  async applyDataValidation(sheetName: string, columnIndex: number, options: string[]): Promise<void> {
    await this.ensureSheetExists(sheetName);
    try {
      const api = await this.getSheetsAPI();
      const metadata = await this.getSpreadsheetMetadata();
      const sheet = metadata.sheets?.find((s: any) => s.properties?.title === sheetName);
      if (!sheet || sheet.properties?.sheetId === undefined || sheet.properties?.sheetId === null) {
        return;
      }
      const sheetId = sheet.properties.sheetId;

      await api.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: 1, // Row 2 onwards (skip header)
                  endRowIndex: 1000,
                  startColumnIndex: columnIndex,
                  endColumnIndex: columnIndex + 1,
                },
                rule: {
                  condition: {
                    type: 'ONE_OF_LIST',
                    values: options.map(opt => ({ userEnteredValue: opt })),
                  },
                  showCustomUi: true,
                  strict: true,
                },
              },
            },
          ],
        },
      });
    } catch (error: any) {
      console.warn(`[SecureTransport] Data validation application warning for ${sheetName} col ${columnIndex}:`, error.message);
    }
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
