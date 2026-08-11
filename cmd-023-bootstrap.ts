import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.error("Missing credentials. Make sure GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CLIENT_EMAIL, and GOOGLE_SHEETS_PRIVATE_KEY are set.");
  process.exit(1);
}

const auth = new JWT({
  email: CLIENT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth: auth as any });

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

async function getRows(sheetName: string) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:Z`,
  });
  return response.data.values || [];
}

async function appendRow(sheetName: string, values: string[]) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
}

async function run() {
  try {
    console.log("Starting CMD-023 Bootstrap Process...");
    
    // 1. Fetch current data
    const tenantsRows = await getRows('tenants');
    const storesRows = await getRows('stores');
    const agentConfigRows = await getRows('agent_config');
    const storeSettingsRows = await getRows('store_settings');
    
    // Check for duplicates
    // tenants required headers: ['id', 'name', 'subscriptionPlan', 'isActive', 'createdAt', 'updatedAt']
    const tenantNameIndex = tenantsRows[0]?.indexOf('name') ?? 1;
    const existingTenant = tenantsRows.slice(1).find(row => row[tenantNameIndex] === 'متجر الذيباني');
    
    let tenantId = '';
    
    if (existingTenant) {
      console.log(`[IDEMPOTENCY] Tenant 'متجر الذيباني' already exists.`);
      tenantId = existingTenant[0]; // id is always first column in schema
    } else {
      tenantId = generateId('tnt');
      const now = new Date().toISOString();
      const newTenantRow = [tenantId, 'متجر الذيباني', 'FREE', 'TRUE', now, now];
      console.log(`Creating Tenant: ${tenantId}`);
      await appendRow('tenants', newTenantRow);
    }
    
    // Check for store
    // stores required headers: ['id', 'tenantId', 'name', 'createdAt']
    const storeNameIndex = storesRows[0]?.indexOf('name') ?? 2;
    const storeTenantIndex = storesRows[0]?.indexOf('tenantId') ?? 1;
    const existingStore = storesRows.slice(1).find(row => row[storeNameIndex] === 'بقالة الذيباني' && row[storeTenantIndex] === tenantId);
    
    let storeId = '';
    
    if (existingStore) {
      console.log(`[IDEMPOTENCY] Store 'بقالة الذيباني' already exists for tenant ${tenantId}.`);
      storeId = existingStore[0];
    } else {
      storeId = generateId('str');
      const now = new Date().toISOString();
      const newStoreRow = [storeId, tenantId, 'بقالة الذيباني', now];
      console.log(`Creating Store: ${storeId}`);
      await appendRow('stores', newStoreRow);
    }
    
    // Check for Agent Config
    // agent_config required headers: ['id', 'tenantId', 'storeId', 'name', 'persona', 'tone', 'language']
    const agentNameIndex = agentConfigRows[0]?.indexOf('name') ?? 3;
    const agentStoreIndex = agentConfigRows[0]?.indexOf('storeId') ?? 2;
    const existingAgent = agentConfigRows.slice(1).find(row => row[agentNameIndex] === 'حنين' && row[agentStoreIndex] === storeId);
    
    if (existingAgent) {
      console.log(`[IDEMPOTENCY] Agent config 'حنين' already exists for store ${storeId}.`);
    } else {
      const agentId = generateId('agt');
      const newAgentRow = [agentId, tenantId, storeId, 'حنين', 'AI Customer Service Agent', 'Professional and friendly', 'Arabic and English'];
      console.log(`Creating Agent Config: ${agentId}`);
      await appendRow('agent_config', newAgentRow);
    }
    
    // Check for Store Settings
    // store_settings required headers: ['id', 'tenantId', 'storeId', 'currency', 'language']
    const settingsStoreIndex = storeSettingsRows[0]?.indexOf('storeId') ?? 2;
    const existingSettings = storeSettingsRows.slice(1).find(row => row[settingsStoreIndex] === storeId);
    
    if (existingSettings) {
      console.log(`[IDEMPOTENCY] Store settings already exist for store ${storeId}.`);
    } else {
      const settingsId = generateId('set');
      const newSettingsRow = [settingsId, tenantId, storeId, 'YER', 'Arabic'];
      console.log(`Creating Store Settings: ${settingsId}`);
      await appendRow('store_settings', newSettingsRow);
    }
    
    console.log("\n--- POST-WRITE VERIFICATION ---");
    const vTenants = await getRows('tenants');
    const vStores = await getRows('stores');
    const vAgent = await getRows('agent_config');
    const vSettings = await getRows('store_settings');
    
    const verTenant = vTenants.find(r => r[0] === tenantId);
    console.log(`Verified Tenant: ${verTenant ? verTenant[1] : 'NOT FOUND'} (${tenantId})`);
    
    const verStore = vStores.find(r => r[0] === storeId);
    console.log(`Verified Store: ${verStore ? verStore[2] : 'NOT FOUND'} (${storeId})`);
    if (verStore) {
        console.log(`Isolation Check: store.tenantId === ${verStore[1]} (Expected: ${tenantId}) -> ${verStore[1] === tenantId ? 'PASS' : 'FAIL'}`);
    }

    const verAgent = vAgent.find(r => r[2] === storeId);
    console.log(`Verified Agent: ${verAgent ? verAgent[3] : 'NOT FOUND'}`);
    
    const verSettings = vSettings.find(r => r[2] === storeId);
    console.log(`Verified Settings Currency: ${verSettings ? verSettings[3] : 'NOT FOUND'}`);

    console.log("\n[SUCCESS] CMD-023 Bootstrap completed successfully.");
    
  } catch (err: any) {
    console.error("Bootstrap failed:", err.message);
    process.exit(1);
  }
}

run();
