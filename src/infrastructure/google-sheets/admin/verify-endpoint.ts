import { Request, Response } from 'express';
import { ConfigValidator } from '../config';
import { GoogleServiceAccountAuth } from '../auth';
import { SecureGoogleSheetsTransport } from '../secure-transport';
import { GoogleSheetsDataProvider } from '../provider';
import { ISheetMapper, parseBoolean, formatBoolean } from '../mapper';
import { HeaderMap } from '../header-map';
import { Product } from '../../../core/data/domain';

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

    const config = ConfigValidator.validate({
      clientEmail,
      privateKey,
      spreadsheetId,
      mockMode: false
    });

    const authClient = new GoogleServiceAccountAuth(config);
    const transport = new SecureGoogleSheetsTransport(authClient, config);

    const metadata = await transport.getSpreadsheetMetadata();
    const sheets = metadata.sheets?.map(s => s.properties?.title || '').filter(Boolean) || [];
    
    const canonicalSheets = [
      'tenants', 'stores', 'products', 'categories', 'customers',
      'orders', 'order_items', 'conversations', 'agent_config', 'store_settings'
    ];

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
      authentication: 'PASS',
      metadataRead: 'PASS',
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
