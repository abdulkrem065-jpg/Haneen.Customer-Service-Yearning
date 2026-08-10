import { describe, it } from 'vitest';
import { ConfigValidator } from './config';
import { GoogleServiceAccountAuth } from './auth';
import { SecureGoogleSheetsTransport } from './secure-transport';
import { GoogleSheetsDataProvider } from './provider';
import { ISheetMapper, parseBoolean, formatBoolean } from './mapper';
import { HeaderMap } from './header-map';
import { Product } from '../../core/data/domain';

class ProductMapper implements ISheetMapper<Product> {
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

describe('CMD-019 Real Google Connection Verification', () => {
  it('performs real connection check if credentials are available or reports status cleanly', async () => {
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;

    console.log('--- REAL CONNECTION PRECHECK ---');
    console.log('CLIENT_EMAIL:', clientEmail ? 'PRESENT' : 'MISSING');
    console.log('PRIVATE_KEY:', privateKey ? 'PRESENT' : 'MISSING');
    console.log('SPREADSHEET_ID:', spreadsheetId ? 'PRESENT' : 'MISSING');

    if (!clientEmail || !privateKey || !spreadsheetId) {
      console.log('REAL GOOGLE CONNECTION: NOT CONFIGURED (Missing env credentials)');
      return;
    }

    try {
      const config = ConfigValidator.validate({
        clientEmail,
        privateKey,
        spreadsheetId,
        mockMode: false,
      });

      const authClient = new GoogleServiceAccountAuth(config);
      const transport = new SecureGoogleSheetsTransport(authClient, config);

      console.log('Attempting to fetch spreadsheet metadata...');
      const metadata = await transport.getSpreadsheetMetadata();
      console.log('Spreadsheet Metadata Read SUCCESS');

      const sheets = metadata.sheets?.map(s => s.properties?.title || '').filter(Boolean) || [];
      console.log('Sheet names found:', sheets.join(', '));

      const canonicalSheets = [
        'tenants', 'stores', 'products', 'categories', 'customers',
        'orders', 'order_items', 'conversations', 'agent_config', 'store_settings'
      ];

      const sheetStatus = canonicalSheets.map(s => ({
        name: s,
        status: sheets.includes(s) ? 'PRESENT' : 'MISSING'
      }));

      console.log('Canonical Sheet Status:', JSON.stringify(sheetStatus));

      if (sheets.includes('products')) {
        const productMapper = new ProductMapper();
        const provider = new GoogleSheetsDataProvider(transport, productMapper);

        const searchResult = await provider.search(
          { searchTerm: '' },
          { tenantId: 'tenant-1', storeId: 'store-1', agentId: 'agent-1' }
        );
        console.log('Product Search Result Items Count:', searchResult.items.length);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Real Google Connection Error:', errorMsg);
    }
  });
});
