import { Request, Response } from 'express';
import { ConfigValidator } from '../config';
import { GoogleServiceAccountAuth } from '../auth';
import { SecureGoogleSheetsTransport } from '../secure-transport';
import { CatalogImporter } from '../import-altheibani-catalog';

export async function importCatalogEndpoint(req: Request, res: Response) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      return res.status(400).json({
        success: false,
        message: 'Google Sheets credentials missing in environment variables.'
      });
    }

    const config = ConfigValidator.validate({
      spreadsheetId,
      clientEmail,
      privateKey,
      mockMode: false
    });

    const authClient = new GoogleServiceAccountAuth(config);
    const transport = new SecureGoogleSheetsTransport(authClient, config);
    const importer = new CatalogImporter(transport);

    const importResult = await importer.importCatalog();

    return res.status(200).json({
      success: true,
      message: 'Catalog imported successfully',
      result: importResult
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Catalog import failed',
      error: error.message
    });
  }
}
