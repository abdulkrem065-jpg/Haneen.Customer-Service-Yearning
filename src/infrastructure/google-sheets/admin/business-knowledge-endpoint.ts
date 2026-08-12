import { Request, Response } from 'express';
import { ConfigValidator } from '../config';
import { GoogleServiceAccountAuth } from '../auth';
import { SecureGoogleSheetsTransport } from '../secure-transport';
import { BusinessKnowledgeProvisioner } from '../provision-business-knowledge';

export async function provisionBusinessKnowledgeEndpoint(req: Request, res: Response) {
  try {
    const adminSecret = process.env.ADMIN_VERIFY_SECRET;
    if (!adminSecret) {
      return res.status(403).json({ status: 'BLOCKED', message: 'Admin verification secret is not configured.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ status: 'BLOCKED', message: 'Unauthorized. Invalid or missing Admin secret.' });
    }

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
    const provisioner = new BusinessKnowledgeProvisioner(transport);

    const result = await provisioner.provisionAll();

    return res.status(200).json({
      success: true,
      message: 'CMD-031 Real business knowledge provisioned successfully',
      result
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Business knowledge provisioning failed',
      error: error.message
    });
  }
}

export function renderProvisionBusinessKnowledgeUI(req: Request, res: Response) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CMD-031 Real Business Knowledge Provisioning</title>
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
    <h1>CMD-031: Provision Real Business Knowledge</h1>
    <p>Provision Al-Theibani Products (31), Categories (10), Payment Methods (6), Store Contacts (2), and Banners/Notices (2) directly into the Fresh Canonical Spreadsheet.</p>
    <form id="provisionForm">
      <label for="secret">Admin Verification Secret</label>
      <input type="password" id="secret" required placeholder="Enter ADMIN_VERIFY_SECRET">
      <button type="submit">Run Real Data Provisioning</button>
    </form>
    <pre id="output"></pre>
  </div>
  <script>
    document.getElementById('provisionForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const secret = document.getElementById('secret').value;
      const output = document.getElementById('output');
      output.style.display = 'block';
      output.textContent = 'Executing real business knowledge provisioning...';
      try {
        const res = await fetch('/api/admin/provision-business-knowledge', {
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
