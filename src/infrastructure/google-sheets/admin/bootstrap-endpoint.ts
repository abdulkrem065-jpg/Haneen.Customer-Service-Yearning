import { Request, Response } from 'express';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import crypto from 'crypto';
import { normalizePrivateKey, validatePrivateKey } from '../key-utils';

const FRESH_CANONICAL_SPREADSHEET_ID = '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function bootstrapTenantEndpoint(req: Request, res: Response) {
  try {
    const adminSecret = process.env.ADMIN_VERIFY_SECRET;
    if (!adminSecret) {
      return res.status(403).json({ status: 'BLOCKED', message: 'Admin verification secret is not configured.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ status: 'BLOCKED', message: 'Unauthorized. Invalid or missing Admin secret.' });
    }

    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const rawPrivateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!clientEmail || !rawPrivateKey || !spreadsheetId) {
      return res.status(500).json({ status: 'BLOCKED', message: 'Missing Google credentials in environment.' });
    }

    const privateKey = normalizePrivateKey(rawPrivateKey);
    const keyValidation = validatePrivateKey(privateKey);
    if (!keyValidation.valid) {
      return res.status(500).json({ status: 'BLOCKED', message: `Invalid Google private key format: ${keyValidation.reason || 'Unsupported format'}` });
    }

    if (spreadsheetId !== FRESH_CANONICAL_SPREADSHEET_ID) {
       return res.status(400).json({ status: 'BLOCKED', message: 'Target spreadsheet ID does not match Fresh Canonical ID.' });
    }

    const auth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth: auth as any });

    async function getRows(sheetName: string) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:Z`,
        });
        return response.data.values || [];
      } catch (e: any) {
        if (e.code === 400 && e.message.includes('Unable to parse range')) {
            return []; // Sheet might be empty or missing, though CMD-022 proved they exist
        }
        throw e;
      }
    }

    async function appendRow(sheetName: string, values: string[]) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] },
      });
    }

    const tenantsRows = await getRows('tenants');
    const storesRows = await getRows('stores');
    const agentConfigRows = await getRows('agent_config');
    const storeSettingsRows = await getRows('store_settings');
    
    const tenantNameIndex = tenantsRows[0]?.indexOf('name') ?? 1;
    const existingTenant = tenantsRows.slice(1).find(row => row[tenantNameIndex] === 'متجر الذيباني');
    
    let tenantId = '';
    const results: string[] = [];
    
    if (existingTenant) {
      tenantId = existingTenant[0];
      results.push(`[IDEMPOTENCY] Tenant 'متجر الذيباني' already exists with ID: ${tenantId}.`);
    } else {
      tenantId = generateId('tnt');
      const now = new Date().toISOString();
      await appendRow('tenants', [tenantId, 'متجر الذيباني', 'FREE', 'TRUE', now, now]);
      results.push(`[CREATED] Tenant 'متجر الذيباني' with ID: ${tenantId}.`);
    }
    
    const storeNameIndex = storesRows[0]?.indexOf('name') ?? 2;
    const storeTenantIndex = storesRows[0]?.indexOf('tenantId') ?? 1;
    const existingStore = storesRows.slice(1).find(row => row[storeNameIndex] === 'بقالة الذيباني' && row[storeTenantIndex] === tenantId);
    
    let storeId = '';
    if (existingStore) {
      storeId = existingStore[0];
      results.push(`[IDEMPOTENCY] Store 'بقالة الذيباني' already exists with ID: ${storeId}.`);
    } else {
      storeId = generateId('str');
      const now = new Date().toISOString();
      await appendRow('stores', [storeId, tenantId, 'بقالة الذيباني', now]);
      results.push(`[CREATED] Store 'بقالة الذيباني' with ID: ${storeId}.`);
    }
    
    const agentNameIndex = agentConfigRows[0]?.indexOf('name') ?? 3;
    const agentStoreIndex = agentConfigRows[0]?.indexOf('storeId') ?? 2;
    const existingAgent = agentConfigRows.slice(1).find(row => (row[agentNameIndex] === 'سناء' || row[agentNameIndex] === 'حنين') && row[agentStoreIndex] === storeId);
    
    if (existingAgent) {
      results.push(`[IDEMPOTENCY] Agent config 'سناء' already exists for store ${storeId}.`);
    } else {
      const agentId = generateId('agt');
      await appendRow('agent_config', [agentId, tenantId, storeId, 'سناء', 'AI Customer Service Agent', 'Professional and friendly', 'Arabic and English']);
      results.push(`[CREATED] Agent config 'سناء' with ID: ${agentId}.`);
    }
    
    const settingsStoreIndex = storeSettingsRows[0]?.indexOf('storeId') ?? 2;
    const existingSettings = storeSettingsRows.slice(1).find(row => row[settingsStoreIndex] === storeId);
    
    if (existingSettings) {
      results.push(`[IDEMPOTENCY] Store settings already exist for store ${storeId}.`);
    } else {
      const settingsId = generateId('set');
      await appendRow('store_settings', [settingsId, tenantId, storeId, 'YER', 'Arabic']);
      results.push(`[CREATED] Store settings with Base Currency YER for store ${storeId}.`);
    }
    
    // Post-Write Read-Back Verification
    const vTenants = await getRows('tenants');
    const vStores = await getRows('stores');
    const vAgent = await getRows('agent_config');
    const vSettings = await getRows('store_settings');
    
    const verTenant = vTenants.find(r => r[0] === tenantId);
    const verStore = vStores.find(r => r[0] === storeId);
    const verAgent = vAgent.find(r => r[2] === storeId);
    const verSettings = vSettings.find(r => r[2] === storeId);
    
    const verification = {
      tenantIsolation: verStore ? (verStore[1] === tenantId ? 'PASS' : 'FAIL') : 'FAIL',
      tenantExists: verTenant ? 'PASS' : 'FAIL',
      storeExists: verStore ? 'PASS' : 'FAIL',
      agentExists: verAgent ? 'PASS' : 'FAIL',
      currencyMatched: verSettings && verSettings[3] === 'YER' ? 'PASS' : 'FAIL'
    };

    res.json({
      status: 'COMPLETED',
      results,
      verification,
      tenantId,
      storeId
    });

  } catch (error: any) {
    console.error('[BootstrapEndpoint] Error:', error.message);
    res.status(500).json({
      status: 'BLOCKED',
      error: error.message
    });
  }
}

export function renderBootstrapUI(req: Request, res: Response) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CMD-023 Tenant Bootstrap</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 2rem; max-width: 600px; margin: 0 auto; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    h1 { font-size: 1.25rem; margin-top: 0; color: #1e293b; }
    p { font-size: 0.875rem; color: #64748b; line-height: 1.5; }
    label { display: block; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.875rem; color: #334155; }
    input[type="password"] { width: 100%; padding: 0.625rem; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; margin-bottom: 1rem; font-size: 1rem; }
    button { background: #16a34a; color: white; border: none; padding: 0.625rem 1.25rem; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.875rem; width: 100%; }
    button:hover { background: #15803d; }
    pre { background: #0f172a; color: #38bdf8; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.875rem; display: none; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>CMD-023: Tenant Bootstrap</h1>
    <p>Execute the authoritative provisioning of "متجر الذيباني" directly on the Live Canonical Spreadsheet.</p>
    <form id="bootstrapForm">
      <label for="secret">Admin Verification Secret</label>
      <input type="password" id="secret" required placeholder="Enter ADMIN_VERIFY_SECRET">
      <button type="submit">Run Bootstrap Provisioning</button>
    </form>
    <pre id="output"></pre>
  </div>
  <script>
    document.getElementById('bootstrapForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const secret = document.getElementById('secret').value;
      const output = document.getElementById('output');
      output.style.display = 'block';
      output.textContent = 'Executing authoritative provision...';
      try {
        const res = await fetch('/api/admin/bootstrap-tenant', {
          method: 'POST',
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
