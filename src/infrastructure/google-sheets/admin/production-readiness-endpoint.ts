import { Request, Response } from 'express';
import { GoogleServiceAccountAuth } from '../auth.js';
import { SecureGoogleSheetsTransport } from '../secure-transport.js';
import { ConfigValidator } from '../config.js';

export async function productionReadinessEndpoint(req: Request, res: Response) {
  try {
    const adminSecret = process.env.ADMIN_VERIFY_SECRET;
    if (!adminSecret) {
      return res.status(403).json({ status: 'BLOCKED', message: 'Admin verification secret is not configured in the environment.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ status: 'BLOCKED', message: 'Unauthorized. Invalid or missing Admin secret.' });
    }

    const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;
    const geminiKey = process.env.GEMINI_API_KEY;

    const response = {
      render: isRender ? 'READY' : 'MISSING',
      googleSheetsClientEmail: clientEmail ? 'PRESENT' : 'MISSING',
      googleSheetsPrivateKey: privateKey ? 'PRESENT' : 'MISSING',
      googleSheetsSpreadsheetId: spreadsheetId ? 'PRESENT' : 'MISSING',
      geminiApiKey: geminiKey ? 'PRESENT' : 'MISSING'
    };

    if (!isRender || !clientEmail || !privateKey || !spreadsheetId || !geminiKey) {
       return res.status(200).json({ status: 'BLOCKED', envStatus: response });
    }

    // Google Sheets Connectivity Probe (READ-ONLY)
    const config = ConfigValidator.validate({
      clientEmail,
      privateKey,
      spreadsheetId,
      mockMode: false
    });

    const authClient = new GoogleServiceAccountAuth(config);
    const transport = new SecureGoogleSheetsTransport(authClient, config);

    const metadata = await transport.getSpreadsheetMetadata();
    const sheets = metadata.sheets?.map((s: any) => s.properties?.title || '').filter(Boolean) || [];

    // Verify Canonical Identity
    if (spreadsheetId !== '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo') {
       return res.status(200).json({ status: 'BLOCKED', message: 'Spreadsheet ID mismatch' });
    }
    
    // We don't read the rows directly here, we just verify the sheets exist
    const requiredSheets = [
      'categories', 'products', 'payment_methods', 'store_contacts', 
      'store_notices', 'business_hours', 'delivery_configuration', 
      'delivery_zones', 'store_locations', 'store_policies', 'digital_services',
      'tenants', 'stores', 'agent_config', 'store_settings'
    ];

    const missingSheets = requiredSheets.filter(s => !sheets.includes(s));

    res.json({
      ...response,
      status: 'READY',
      canonicalSpreadsheet: 'VERIFIED',
      sheetsRead: 'SUCCESS',
      missingSheets: missingSheets.length > 0 ? missingSheets : 'NONE'
    });
  } catch (error: any) {
    console.error('[ProductionReadiness] Error:', error.message);
    res.status(500).json({ status: 'FAIL', error: 'Internal verification error' });
  }
}
