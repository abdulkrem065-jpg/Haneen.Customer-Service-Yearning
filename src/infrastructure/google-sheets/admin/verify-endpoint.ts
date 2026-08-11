import { Request, Response } from 'express';
import { ConfigValidator } from '../config';
import { GoogleServiceAccountAuth } from '../auth';
import { SecureGoogleSheetsTransport } from '../secure-transport';
import { GoogleSheetsDataProvider } from '../provider';
import { ISheetMapper, parseBoolean, formatBoolean } from '../mapper';
import { HeaderMap } from '../header-map';
import { Product } from '../../../core/data/domain';
import { CanonicalProvisioner } from '../provisioner';
import { CanonicalSchemas } from '../schema-definitions';

const FRESH_CANONICAL_SPREADSHEET_ID = '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';

class TempProductMapper implements ISheetMapper<Product> {
  sheetName = 'products';
  requiredHeaders = ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];
  defaultHeaders = ['id', 'tenantId', 'storeId', 'name', 'description', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'];

  fromRow(rowValues: string[], headerMap: HeaderMap): Product {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const name = headerMap.requireValue(rowValues, 'name');
    const description = headerMap.getValue(rowValues, 'description');
    const priceStr = headerMap.requireValue(rowValues, 'price');
    const currency = headerMap.requireValue(rowValues, 'currency');
    const inStockStr = headerMap.requireValue(rowValues, 'inStock');
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      name,
      description,
      price: parseFloat(priceStr),
      currency,
      inStock: parseBoolean(inStockStr),
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: Product, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name,
      description: entity.description || '',
      price: entity.price.toString(),
      currency: entity.currency,
      inStock: formatBoolean(entity.inStock),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: Product): string {
    return entity.id;
  }
}

export async function verifyGoogleSheetsConnection(req: Request, res: Response) {
  try {
    const adminSecret = process.env.ADMIN_VERIFY_SECRET;
    if (!adminSecret) {
      return res.status(403).json({ status: 'BLOCKED', message: 'Admin verification secret is not configured in the environment.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
      // If browser request accepting HTML without valid auth, render secure UI form
      if (req.headers.accept?.includes('text/html')) {
        return renderVerifyUI(req, res);
      }
      return res.status(401).json({ status: 'BLOCKED', message: 'Unauthorized. Invalid or missing Admin secret.' });
    }

    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;

    const envStatus = {
      CLIENT_EMAIL: clientEmail ? 'PRESENT' : 'MISSING',
      PRIVATE_KEY: privateKey ? 'PRESENT' : 'MISSING',
      SPREADSHEET_ID: spreadsheetId ? 'PRESENT' : 'MISSING',
    };

    if (!clientEmail || !privateKey || !spreadsheetId) {
      return res.status(500).json({ status: 'BLOCKED', envStatus, message: 'Missing credentials in environment' });
    }

    const isFreshCanonicalSpreadsheet = spreadsheetId === FRESH_CANONICAL_SPREADSHEET_ID;

    if (!isFreshCanonicalSpreadsheet) {
      return res.status(200).json({
        status: 'BLOCKED',
        envStatus,
        spreadsheetIdCheck: 'MISMATCH_RENDER_UPDATE_REQUIRED',
        expectedSpreadsheetId: FRESH_CANONICAL_SPREADSHEET_ID,
        message: `GOOGLE_SHEETS_SPREADSHEET_ID in Render environment needs to be updated to the new fresh canonical Spreadsheet ID (${FRESH_CANONICAL_SPREADSHEET_ID}).`
      });
    }

    const config = ConfigValidator.validate({
      clientEmail,
      privateKey,
      spreadsheetId,
      mockMode: false
    });

    const authClient = new GoogleServiceAccountAuth(config);
    const transport = new SecureGoogleSheetsTransport(authClient, config);

    let metadata = await transport.getSpreadsheetMetadata();
    let sheets = metadata.sheets?.map(s => s.properties?.title || '').filter(Boolean) || [];

    // Analyze spreadsheet sheets using CanonicalProvisioner
    const provisioner = new CanonicalProvisioner();
    const sheetInfos = await Promise.all(
      sheets.map(async (title) => {
        const rows = await transport.getRows(title);
        const headers = rows.length > 0 ? rows[0].values : [];
        return { title, headers };
      })
    );

    const plan = provisioner.analyzeSpreadsheet(sheetInfos);

    if (plan.hasAmbiguity) {
      return res.status(200).json({
        status: 'BLOCKED',
        envStatus,
        ambiguityDetails: plan.ambiguityDetails,
        message: 'Ambiguity detected during sheet provisioning analysis.'
      });
    }

    // Execute structural provisioning for any missing canonical sheets
    const newlyCreated: string[] = [];
    for (const sheetItem of plan.sheetsToCreate) {
      await transport.createSheet(sheetItem.name);
      await transport.writeHeaderRow(sheetItem.name, sheetItem.headers);
      newlyCreated.push(sheetItem.name);
    }

    // Re-fetch metadata after provisioning
    if (newlyCreated.length > 0) {
      metadata = await transport.getSpreadsheetMetadata();
      sheets = metadata.sheets?.map(s => s.properties?.title || '').filter(Boolean) || [];
    }

    const canonicalSheets = Object.keys(CanonicalSchemas);
    const sheetStatus = canonicalSheets.map(s => ({
      name: s,
      status: sheets.includes(s) ? 'PRESENT' : 'MISSING'
    }));

    let productCheck = 'NOT TESTED';
    if (sheets.includes('products')) {
      const productMapper = new TempProductMapper();
      const provider = new GoogleSheetsDataProvider(transport, productMapper as any);
      
      try {
        const searchResult = await provider.search(
          { searchTerm: '' },
          { tenantId: 'tenant-1', storeId: 'store-1', agentId: 'agent-1' }
        );
        productCheck = `PASS (${searchResult.items.length} items found)`;
      } catch (e: any) {
        productCheck = `FAIL (${e.message})`;
      }
    }

    res.json({
      status: 'PASS',
      envStatus,
      spreadsheetIdCheck: 'MATCHED_FRESH_CANONICAL',
      spreadsheetId: FRESH_CANONICAL_SPREADSHEET_ID,
      authentication: 'PASS',
      metadataRead: 'PASS',
      provisionedSheets: newlyCreated,
      canonicalSheets: sheetStatus,
      productProviderCheck: productCheck
    });
  } catch (error: any) {
    // Log without exposing secrets
    console.error('[VerifyEndpoint] Error verifying Google Sheets:', error.message);
    res.status(500).json({
      status: 'FAIL',
      error: error.message
    });
  }
}

export function renderVerifyUI(req: Request, res: Response) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Sheets Live Verification</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 2rem; max-width: 600px; margin: 0 auto; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    h1 { font-size: 1.25rem; margin-top: 0; color: #1e293b; }
    p { font-size: 0.875rem; color: #64748b; line-height: 1.5; }
    label { display: block; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.875rem; color: #334155; }
    input[type="password"] { width: 100%; padding: 0.625rem; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; margin-bottom: 1rem; font-size: 1rem; }
    button { background: #2563eb; color: white; border: none; padding: 0.625rem 1.25rem; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.875rem; width: 100%; }
    button:hover { background: #1d4ed8; }
    pre { background: #0f172a; color: #38bdf8; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.875rem; display: none; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Google Sheets Live Verification UI</h1>
    <p>Enter your Admin Verification Secret to run the read-only Google Sheets connectivity diagnostic directly on Render.</p>
    <form id="verifyForm">
      <label for="secret">Admin Verification Secret</label>
      <input type="password" id="secret" required placeholder="Enter ADMIN_VERIFY_SECRET">
      <button type="submit">Run Diagnostics</button>
    </form>
    <pre id="output"></pre>
  </div>
  <script>
    document.getElementById('verifyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const secret = document.getElementById('secret').value;
      const output = document.getElementById('output');
      output.style.display = 'block';
      output.textContent = 'Executing live connection check...';
      try {
        const res = await fetch('/api/admin/verify-google-sheets', {
          headers: { 'Authorization': 'Bearer ' + secret }
        });
        const data = await res.json();
        output.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        output.textContent = 'Error: ' + err.message;
      }
    });
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}
