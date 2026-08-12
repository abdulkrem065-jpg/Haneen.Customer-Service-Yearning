import dotenv from 'dotenv';
dotenv.config();

console.log("=== CMD-030 PRE-FLIGHT VERIFICATION ===");
const targetSpreadsheetId = "1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo";
const envSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;

if (!envSpreadsheetId) {
    console.error("FAIL: GOOGLE_SHEETS_SPREADSHEET_ID is missing from the environment.");
    process.exit(1);
}

if (envSpreadsheetId !== targetSpreadsheetId) {
    console.error(`FAIL: Environment Spreadsheet ID (${envSpreadsheetId}) does not match Target ID (${targetSpreadsheetId}).`);
    process.exit(1);
}

const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

if (!clientEmail || !privateKey) {
    console.error("FAIL: Google Service Account credentials are not present in the environment.");
    process.exit(1);
}

console.log("Pre-flight checks passed.");
