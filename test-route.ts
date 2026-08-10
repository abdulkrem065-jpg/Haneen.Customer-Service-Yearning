import express from 'express';
import { verifyGoogleSheetsConnection } from './src/infrastructure/google-sheets/admin/verify-endpoint.js';
const app = express();
app.get('/api/admin/verify-google-sheets', async (req, res) => {
    await verifyGoogleSheetsConnection(req, res);
});
app.get('*', (req, res) => res.send('SPA HTML'));

const server = app.listen(3001, async () => {
    const res = await fetch('http://localhost:3001/api/admin/verify-google-sheets');
    const body = await res.json();
    console.log('Status:', res.status);
    console.log('Body:', body);
    server.close();
});
