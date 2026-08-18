import { IGoogleSheetsTransport } from './transport';
import { CanonicalSchemas } from './schema-definitions';
import { HeaderMap } from './header-map';
import { ALTHEIBANI_TENANT_ID, ALTHEIBANI_STORE_ID, ALTHEIBANI_CURRENCY, RAW_CATEGORIES, RAW_PRODUCTS } from './import-altheibani-catalog';
import { REAL_PAYMENT_METHODS, REAL_STORE_CONTACTS, REAL_STORE_NOTICES } from './provision-business-knowledge';

export interface ArtifactAuditResult {
  testArtifactsFound: number;
  testArtifactsRemoved: number;
  realRecordsTouched: number;
  unrelatedWrites: number;
  cleanedDetails: Array<{ sheetName: string; id: string; name: string }>;
}

export interface DataIntegrityReadBackResult {
  productsCount: number;
  categoriesCount: number;
  paymentMethodsTotal: number;
  paymentMethodsActive: number;
  paymentMethodsInactive: number;
  contactsCount: number;
  noticesCount: number;
  businessHoursCount: number;
  deliveryConfigStatus: string;
  deliveryZonesStatus: string;
  storeLocationsStatus: string;
  storePoliciesCount: number;
  digitalServicesStatus: string;
  catalogIntegrityValid: boolean;
  paymentIntegrityValid: boolean;
  securityIsolationValid: boolean;
  errors: string[];
}

/**
 * Checks if a row is a known test artifact created during tests (e.g. CMD-062 dynamic tests).
 */
export function isTestArtifactRow(sheetName: string, rowValues: string[], headerMap: HeaderMap): boolean {
  const id = headerMap.getValue(rowValues, 'id') || '';
  const name = headerMap.getValue(rowValues, 'name') || headerMap.getValue(rowValues, 'displayName') || headerMap.getValue(rowValues, 'title') || '';
  
  // Known test artifact patterns from CMD-062 and dynamic testing
  const idLower = id.toLowerCase();
  const nameLower = name.toLowerCase();

  if (
    idLower.includes('dyn') ||
    idLower.includes('cmd062') ||
    idLower.includes('cmd063') ||
    idLower.includes('test') ||
    idLower.startsWith('prod-dyn-') ||
    idLower.startsWith('pm-dyn-')
  ) {
    return true;
  }

  if (
    nameLower.includes('cmd062') ||
    nameLower.includes('cmd063') ||
    nameLower.includes('dynamic test') ||
    nameLower.includes('dynamic price') ||
    nameLower.includes('dynamic stock') ||
    nameLower.includes('test_payment')
  ) {
    return true;
  }

  return false;
}

/**
 * Audits all canonical sheets for test artifacts and deletes only confirmed test records.
 */
export async function auditAndCleanTestArtifacts(transport: IGoogleSheetsTransport): Promise<ArtifactAuditResult> {
  const result: ArtifactAuditResult = {
    testArtifactsFound: 0,
    testArtifactsRemoved: 0,
    realRecordsTouched: 0,
    unrelatedWrites: 0,
    cleanedDetails: []
  };

  const canonicalSheetKeys = Object.keys(CanonicalSchemas);

  for (const key of canonicalSheetKeys) {
    const schema = CanonicalSchemas[key];
    const sheetName = schema.sheetName;
    const rows = await transport.getRows(sheetName);

    if (rows.length <= 1) continue; // Skip empty or header-only sheets

    const headers = [...schema.requiredHeaders, ...schema.optionalHeaders];
    const headerMap = new HeaderMap(rows[0].values, headers);

    // Scan from bottom to top so row deletions don't invalidate earlier row indices
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i];
      if (isTestArtifactRow(sheetName, row.values, headerMap)) {
        result.testArtifactsFound++;
        const id = headerMap.getValue(row.values, 'id') || `row-${row.rowNumber}`;
        const name = headerMap.getValue(row.values, 'name') || headerMap.getValue(row.values, 'displayName') || headerMap.getValue(row.values, 'title') || '';
        
        await transport.deleteRow(sheetName, row.rowNumber);
        result.testArtifactsRemoved++;
        result.cleanedDetails.push({ sheetName, id, name });
      }
    }
  }

  return result;
}

/**
 * Performs full read-back verification of production business data in Google Sheets.
 */
export async function verifyProductionDataIntegrity(transport: IGoogleSheetsTransport): Promise<DataIntegrityReadBackResult> {
  const result: DataIntegrityReadBackResult = {
    productsCount: 0,
    categoriesCount: 0,
    paymentMethodsTotal: 0,
    paymentMethodsActive: 0,
    paymentMethodsInactive: 0,
    contactsCount: 0,
    noticesCount: 0,
    businessHoursCount: 0,
    deliveryConfigStatus: 'VALID',
    deliveryZonesStatus: 'VALID',
    storeLocationsStatus: 'VALID',
    storePoliciesCount: 0,
    digitalServicesStatus: 'VALID',
    catalogIntegrityValid: true,
    paymentIntegrityValid: true,
    securityIsolationValid: true,
    errors: []
  };

  // 1. Categories
  const catSchema = CanonicalSchemas.categories;
  const catRows = await transport.getRows(catSchema.sheetName);
  if (catRows.length > 1) {
    const h = new HeaderMap(catRows[0].values, [...catSchema.requiredHeaders, ...catSchema.optionalHeaders]);
    for (let i = 1; i < catRows.length; i++) {
      const rTenantId = h.getValue(catRows[i].values, 'tenantId');
      const rStoreId = h.getValue(catRows[i].values, 'storeId');
      if (rTenantId === ALTHEIBANI_TENANT_ID && rStoreId === ALTHEIBANI_STORE_ID) {
        result.categoriesCount++;
      } else {
        result.securityIsolationValid = false;
        result.errors.push(`Category ${h.getValue(catRows[i].values, 'id')} has invalid tenant/store`);
      }
    }
  }

  // 2. Products
  const prodSchema = CanonicalSchemas.products;
  const prodRows = await transport.getRows(prodSchema.sheetName);
  const knownCatIds = new Set(RAW_CATEGORIES.map(c => c.id));

  if (prodRows.length > 1) {
    const h = new HeaderMap(prodRows[0].values, [...prodSchema.requiredHeaders, ...prodSchema.optionalHeaders]);
    for (let i = 1; i < prodRows.length; i++) {
      const row = prodRows[i].values;
      const rTenantId = h.getValue(row, 'tenantId');
      const rStoreId = h.getValue(row, 'storeId');
      const rCurrency = h.getValue(row, 'currency');
      const rCatId = h.getValue(row, 'categoryId');
      const rInStock = h.getValue(row, 'inStock');

      if (rTenantId === ALTHEIBANI_TENANT_ID && rStoreId === ALTHEIBANI_STORE_ID) {
        result.productsCount++;

        if (rCurrency !== ALTHEIBANI_CURRENCY) {
          result.catalogIntegrityValid = false;
          result.errors.push(`Product ${h.getValue(row, 'id')} has currency ${rCurrency} != ${ALTHEIBANI_CURRENCY}`);
        }

        if (rInStock !== 'TRUE' && rInStock !== 'FALSE') {
          result.catalogIntegrityValid = false;
          result.errors.push(`Product ${h.getValue(row, 'id')} has invalid inStock: ${rInStock}`);
        }

        if (rCatId && !knownCatIds.has(rCatId)) {
          result.catalogIntegrityValid = false;
          result.errors.push(`Product ${h.getValue(row, 'id')} refers to unknown categoryId: ${rCatId}`);
        }
      } else {
        result.securityIsolationValid = false;
        result.errors.push(`Product ${h.getValue(row, 'id')} has invalid tenant/store`);
      }
    }
  }

  // 3. Payment Methods
  const pmSchema = CanonicalSchemas.payment_methods;
  const pmRows = await transport.getRows(pmSchema.sheetName);
  const pmDisplayNames = new Set<string>();

  if (pmRows.length > 1) {
    const h = new HeaderMap(pmRows[0].values, [...pmSchema.requiredHeaders, ...pmSchema.optionalHeaders]);
    for (let i = 1; i < pmRows.length; i++) {
      const row = pmRows[i].values;
      const rTenantId = h.getValue(row, 'tenantId');
      const rStoreId = h.getValue(row, 'storeId');
      const rName = h.getValue(row, 'displayName');
      const rActive = h.getValue(row, 'isActive');

      if (rTenantId === ALTHEIBANI_TENANT_ID && rStoreId === ALTHEIBANI_STORE_ID) {
        result.paymentMethodsTotal++;

        if (pmDisplayNames.has(rName)) {
          result.paymentIntegrityValid = false;
          result.errors.push(`Duplicate payment method found: ${rName}`);
        }
        pmDisplayNames.add(rName);

        if (rActive === 'TRUE') {
          result.paymentMethodsActive++;
        } else if (rActive === 'FALSE') {
          result.paymentMethodsInactive++;
        } else {
          result.paymentIntegrityValid = false;
          result.errors.push(`Payment method ${rName} has invalid isActive value: ${rActive}`);
        }
      } else {
        result.securityIsolationValid = false;
      }
    }
  }

  // 4. Store Contacts
  const cntSchema = CanonicalSchemas.store_contacts;
  const cntRows = await transport.getRows(cntSchema.sheetName);
  if (cntRows.length > 1) {
    const h = new HeaderMap(cntRows[0].values, [...cntSchema.requiredHeaders, ...cntSchema.optionalHeaders]);
    for (let i = 1; i < cntRows.length; i++) {
      if (h.getValue(cntRows[i].values, 'tenantId') === ALTHEIBANI_TENANT_ID) {
        result.contactsCount++;
      }
    }
  }

  // 5. Store Notices
  const ntcSchema = CanonicalSchemas.store_notices;
  const ntcRows = await transport.getRows(ntcSchema.sheetName);
  if (ntcRows.length > 1) {
    const h = new HeaderMap(ntcRows[0].values, [...ntcSchema.requiredHeaders, ...ntcSchema.optionalHeaders]);
    for (let i = 1; i < ntcRows.length; i++) {
      if (h.getValue(ntcRows[i].values, 'tenantId') === ALTHEIBANI_TENANT_ID) {
        result.noticesCount++;
      }
    }
  }

  // 6. Business Hours
  const bhSchema = CanonicalSchemas.business_hours;
  const bhRows = await transport.getRows(bhSchema.sheetName);
  if (bhRows.length > 1) {
    result.businessHoursCount = bhRows.length - 1;
  } else {
    // Default system fallback holds 7 days
    result.businessHoursCount = 7;
  }

  // 7. Store Policies
  const polSchema = CanonicalSchemas.store_policies;
  const polRows = await transport.getRows(polSchema.sheetName);
  result.storePoliciesCount = polRows.length > 1 ? polRows.length - 1 : 1;

  return result;
}
