# Google Sheets Provisioning Plan

## Purpose
This document outlines the provisioning methodology for the Multi-Tenant Google Sheets database as designed in CMD-012. 
At this stage (PH-003), this process represents a **future procedure** and describes the configuration requirements. 
**No real provisioning script will write to a live Google Sheet in this phase.**

## Overview
Because the system depends on a Fresh Canonical MVP Data Source (DEC-003), a new Google Spreadsheet will be created and formatted strictly according to `GOOGLE_SHEETS_SCHEMA.md`.

## Provider Configuration Abstraction
The system's core relies on the `IDataProvider` abstraction. When Google Sheets is configured, the `GoogleSheetsDataProvider` acts as the implementation.

To maintain environmental decoupling (Dev vs. Prod, Mock vs. Real), the codebase must NOT hardcode the `Spreadsheet ID`. The configuration must be injected via:
1. **Environment Variables**: e.g., `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY` (or similar OAuth).
2. **Configuration Interfaces**: e.g., an `IConfigurationProvider` that loads secrets securely from environment configuration and passes them to the transport layer.

## Provisioning Steps (Future Execution)

1. **Create the Spreadsheet**
   - An administrator or automated script creates a new Google Spreadsheet.
   - The Spreadsheet ID is noted for environment configuration.

2. **Add Canonical Sheets**
   - Exactly 10 sheets must be created with the exact names:
     `tenants`, `stores`, `products`, `categories`, `customers`, `orders`, `order_items`, `conversations`, `agent_config`, `store_settings`.

3. **Set Up Headers**
   - The first row (Row 1) of every sheet is reserved for headers.
   - The headers must strictly match the field names defined in `GOOGLE_SHEETS_SCHEMA.md` (e.g., `id`, `tenantId`, `storeId`, `name`, `price`, `currency`).
   - No aliases or legacy mapping will be used on the Fresh Canonical Sheets.

4. **Service Account Permissions**
   - A Google Cloud Service Account must be granted `Editor` permission on the Spreadsheet.
   - The Service Account credentials must be provided via the secure configuration provider.

5. **Initial Platform Setup**
   - A platform administrator inserts the first `tenantId` and `storeId` records manually or via an initial setup script to allow the first tenant to onboard.
   - **Zero Secrets Rule:** Passwords, tokens, or API keys are strictly forbidden from being placed in this sheet.

## Empty Database State
Upon creation, the new canonical database will be entirely empty except for the headers. 
Legacy data will remain in the separate Archive Spreadsheet and will NOT be copied over automatically.
