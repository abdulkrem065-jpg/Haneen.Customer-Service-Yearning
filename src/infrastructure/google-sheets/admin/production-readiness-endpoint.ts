import { Request, Response } from 'express';
import { GoogleServiceAccountAuth } from '../auth.js';
import { SecureGoogleSheetsTransport } from '../secure-transport.js';
import { ConfigValidator } from '../config.js';

const CANONICAL_SPREADSHEET_ID = '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';
const CANONICAL_TENANT_ID = 'tnt-41f0d530';
const CANONICAL_STORE_ID = 'str-2c6ad81f';
const CANONICAL_AGENT_ID = 'agt-c93183d5';
const CANONICAL_CURRENCY = 'YER';

export async function productionReadinessEndpoint(req: Request, res: Response) {
  try {
    const adminSecret = process.env.ADMIN_VERIFY_SECRET;
    if (!adminSecret) {
      return res.status(403).json({
        status: 'BLOCKED',
        message: 'Admin verification secret is not configured in the environment.',
        writesExecuted: 0
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
      return res.status(401).json({
        status: 'BLOCKED',
        message: 'Unauthorized. Invalid or missing Admin secret.',
        writesExecuted: 0
      });
    }

    const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;
    const geminiKey = process.env.GEMINI_API_KEY;

    const envStatus = {
      render: isRender ? 'READY' : 'MISSING',
      googleSheetsClientEmail: clientEmail ? 'PRESENT' : 'MISSING',
      googleSheetsPrivateKey: privateKey ? 'PRESENT' : 'MISSING',
      googleSheetsSpreadsheetId: spreadsheetId ? 'PRESENT' : 'MISSING',
      geminiApiKey: geminiKey ? 'PRESENT' : 'MISSING'
    };

    if (!isRender || !clientEmail || !privateKey || !spreadsheetId || !geminiKey) {
      return res.status(200).json({
        status: 'BLOCKED',
        envStatus,
        message: 'Production credentials or Render environment missing',
        writesExecuted: 0
      });
    }

    // Verify Canonical Identity Spreadsheet ID
    if (spreadsheetId !== CANONICAL_SPREADSHEET_ID) {
      return res.status(200).json({
        status: 'BLOCKED',
        envStatus,
        spreadsheetIdCheck: 'MISMATCH',
        expectedSpreadsheetId: CANONICAL_SPREADSHEET_ID,
        message: `GOOGLE_SHEETS_SPREADSHEET_ID in Render environment must match canonical spreadsheet (${CANONICAL_SPREADSHEET_ID}).`,
        writesExecuted: 0
      });
    }

    // Google Sheets Connectivity Probe (STRICT READ-ONLY)
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

    const requiredSheets = [
      'categories', 'products', 'payment_methods', 'store_contacts',
      'store_notices', 'business_hours', 'delivery_configuration',
      'delivery_zones', 'store_locations', 'store_policies', 'digital_services',
      'tenants', 'stores', 'agent_config', 'store_settings'
    ];

    const missingSheets = requiredSheets.filter(s => !sheets.includes(s));

    // Optional read-only identity inspection
    let tenantFound = false;
    let storeFound = false;
    let agentFound = false;
    let currencyVerified = false;

    if (sheets.includes('tenants')) {
      const rows = await transport.getRows('tenants');
      tenantFound = rows.some(r => r.values.includes(CANONICAL_TENANT_ID) || r.values.some(v => v?.includes('متجر الذيباني')));
    }

    if (sheets.includes('stores')) {
      const rows = await transport.getRows('stores');
      storeFound = rows.some(r => r.values.includes(CANONICAL_STORE_ID) || r.values.some(v => v?.includes('بقالة الذيباني')));
    }

    if (sheets.includes('agent_config')) {
      const rows = await transport.getRows('agent_config');
      agentFound = rows.some(r => r.values.includes(CANONICAL_AGENT_ID) || r.values.some(v => v?.includes('سناء') || v?.includes('حنين')));
    }

    if (sheets.includes('store_settings')) {
      const rows = await transport.getRows('store_settings');
      currencyVerified = rows.some(r => r.values.includes(CANONICAL_CURRENCY));
    }

    return res.json({
      status: 'READY',
      envStatus,
      canonicalSpreadsheet: 'VERIFIED',
      spreadsheetId: CANONICAL_SPREADSHEET_ID,
      connectivity: 'CONNECTED',
      sheetsRead: 'SUCCESS',
      missingSheets: missingSheets.length > 0 ? missingSheets : 'NONE',
      authoritativeIdentity: {
        tenantId: CANONICAL_TENANT_ID,
        storeId: CANONICAL_STORE_ID,
        agentId: CANONICAL_AGENT_ID,
        currency: CANONICAL_CURRENCY,
        tenantVerified: tenantFound ? 'VERIFIED' : 'NOT_FOUND',
        storeVerified: storeFound ? 'VERIFIED' : 'NOT_FOUND',
        agentVerified: agentFound ? 'VERIFIED' : 'NOT_FOUND',
        currencyVerified: currencyVerified ? 'VERIFIED' : 'NOT_FOUND'
      },
      writesExecuted: 0
    });
  } catch (error: any) {
    console.error('[ProductionReadiness] Connectivity Error:', error.message);
    return res.status(500).json({
      status: 'FAIL',
      error: 'Google Sheets live read failed: ' + error.message,
      writesExecuted: 0
    });
  }
}

export function renderProductionReadinessUI(req: Request, res: Response) {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>التحقق من جاهزية بيئة الإنتاج — Production Readiness Verification</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 2rem 1rem;
      margin: 0;
      display: flex;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .container {
      width: 100%;
      max-width: 680px;
    }
    .card {
      background: var(--card-bg);
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
      border: 1px solid var(--border);
    }
    h1 {
      font-size: 1.35rem;
      margin-top: 0;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    p {
      font-size: 0.9rem;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .notice {
      background: rgba(37, 99, 235, 0.1);
      border-right: 4px solid var(--primary);
      padding: 0.875rem 1rem;
      border-radius: 6px;
      font-size: 0.85rem;
      margin-bottom: 1.5rem;
      color: #93c5fd;
    }
    form {
      margin-bottom: 1.5rem;
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      color: var(--text);
    }
    input[type="password"] {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #0f172a;
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 8px;
      box-sizing: border-box;
      margin-bottom: 1rem;
      font-size: 1rem;
      direction: ltr;
    }
    input[type="password"]:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
    }
    button {
      background: var(--primary);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.95rem;
      width: 100%;
      transition: background 0.2s;
    }
    button:hover {
      background: var(--primary-hover);
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    #resultArea {
      display: none;
      margin-top: 1.5rem;
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
    }
    .status-badge {
      display: inline-block;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 700;
      margin-bottom: 1rem;
    }
    .badge-ready { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-blocked { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-fail { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.875rem;
      margin-bottom: 1rem;
    }
    .metric-card {
      background: #0f172a;
      padding: 0.875rem;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .metric-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; }
    .metric-value { font-size: 0.9rem; font-weight: 600; font-family: monospace; }
    pre {
      background: #090d16;
      color: #38bdf8;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.8rem;
      direction: ltr;
      border: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        التحقق من جاهزية بيئة الإنتاج (Render)
      </h1>
      <p>أدخل كلمة المرور السرية للإدارة <code>ADMIN_VERIFY_SECRET</code> للتحقق المباشر والقراءة فقط (Strict Read-Only) من جاهزية بيئة الإنتاج على Render والربط بـ Google Sheets.</p>
      
      <div class="notice">
        <strong>ضمانات الأمان والتصفح:</strong>
        <br>• لا يتم حفظ السر في المتصفح، الكوكيز، أو أي قاعدة بيانات.
        <br>• هذا الفحص مخصص للقراءة فقط (Read-Only) مع التأكد من أن عدد الكتابات = 0.
      </div>

      <form id="verifyForm">
        <label for="secret">كلمة المرور الإدارية (ADMIN_VERIFY_SECRET)</label>
        <input type="password" id="secret" required placeholder="أدخل ADMIN_VERIFY_SECRET المحددة في Render" autocomplete="off">
        <button type="submit" id="btnSubmit">تحقق من بيئة الإنتاج</button>
      </form>

      <div id="resultArea">
        <div id="badgeContainer"></div>
        <div id="metricsGrid" class="metrics-grid"></div>
        <details>
          <summary style="cursor: pointer; font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">عرض التقرير البرمجي الكامل (Raw JSON)</summary>
          <pre id="jsonOutput"></pre>
        </details>
      </div>
    </div>
  </div>

  <script>
    document.getElementById('verifyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const secretInput = document.getElementById('secret');
      const secret = secretInput.value;
      const btnSubmit = document.getElementById('btnSubmit');
      const resultArea = document.getElementById('resultArea');
      const badgeContainer = document.getElementById('badgeContainer');
      const metricsGrid = document.getElementById('metricsGrid');
      const jsonOutput = document.getElementById('jsonOutput');

      if (!secret) return;

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'جاري التحقق من خادم الإنتاج...';
      resultArea.style.display = 'block';
      badgeContainer.innerHTML = '<span class="status-badge badge-blocked">جاري الفحص...</span>';
      metricsGrid.innerHTML = '';
      jsonOutput.textContent = 'جاري الاتصال...';

      try {
        const res = await fetch('/api/admin/production-readiness', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + secret
          }
        });

        const data = await res.json();
        jsonOutput.textContent = JSON.stringify(data, null, 2);

        if (data.status === 'READY') {
          badgeContainer.innerHTML = '<span class="status-badge badge-ready">✓ APPROVED — LIVE RENDER PRODUCTION READY</span>';
        } else if (data.status === 'BLOCKED') {
          badgeContainer.innerHTML = '<span class="status-badge badge-blocked">⚠ BLOCKED — ' + (data.message || 'Credentials or Environment Missing') + '</span>';
        } else {
          badgeContainer.innerHTML = '<span class="status-badge badge-fail">✕ FAILED — ' + (data.error || data.message || 'Verification Failed') + '</span>';
        }

        const env = data.envStatus || {};

        metricsGrid.innerHTML = \`
          <div class="metric-card">
            <div class="metric-label">بيئة Render</div>
            <div class="metric-value">\${env.render || data.render || 'MISSING'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Google Service Email</div>
            <div class="metric-value">\${env.googleSheetsClientEmail || 'MISSING'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Google Private Key</div>
            <div class="metric-value">\${env.googleSheetsPrivateKey || 'MISSING'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Spreadsheet ID Match</div>
            <div class="metric-value">\${data.canonicalSpreadsheet || env.googleSheetsSpreadsheetId || 'MISSING'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Gemini API Key</div>
            <div class="metric-value">\${env.geminiApiKey || 'MISSING'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Google Sheets Writes</div>
            <div class="metric-value" style="color: #34d399;">\${data.writesExecuted ?? 0} (Strict Read-Only)</div>
          </div>
        \`;

      } catch (err) {
        badgeContainer.innerHTML = '<span class="status-badge badge-fail">✕ FAILED — Network or Client Error</span>';
        jsonOutput.textContent = 'Error: ' + err.message;
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'تحقق من بيئة الإنتاج';
      }
    });
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}
