import { describe, it, expect } from 'vitest';
import { CanonicalProvisioner, ISheetInfo } from './provisioner';
import { CanonicalSchemas } from './schema-definitions';

describe('CMD-020 Canonical Google Sheets Provisioner', () => {
  const provisioner = new CanonicalProvisioner();

  it('1. Generates all canonical sheets to create when spreadsheet is completely empty', () => {
    const totalCanonical = Object.keys(CanonicalSchemas).length;
    const plan = provisioner.analyzeSpreadsheet([]);
    expect(plan.sheetsToCreate.length).toBe(totalCanonical);
    expect(plan.sheetsExisting.length).toBe(0);
    expect(plan.legacySheets.length).toBe(0);
    expect(plan.hasAmbiguity).toBe(false);
    expect(plan.safetyGuarantees.zeroLegacyModification).toBe(true);
    expect(plan.safetyGuarantees.zeroLegacyMigration).toBe(true);
    expect(plan.safetyGuarantees.zeroBusinessDataSeeding).toBe(true);

    const productsSheet = plan.sheetsToCreate.find((s) => s.name === 'products');
    expect(productsSheet).toBeDefined();
    expect(productsSheet?.headers).toEqual([
      'id',
      'tenantId',
      'storeId',
      'name',
      'price',
      'currency',
      'inStock',
      'createdAt',
      'updatedAt',
      'categoryId',
      'description',
      'quantity',
      'imageUrl',
      'metadata',
    ]);
  });

  it('2. Correctly flags legacy products sheet and reports ambiguity without modifying legacy sheet', () => {
    const existingSheets: ISheetInfo[] = [
      {
        title: 'products',
        headers: ['id', 'name', 'price', 'description', 'quantity', 'imageUrl'],
      },
    ];

    const plan = provisioner.analyzeSpreadsheet(existingSheets);

    expect(plan.legacySheets.length).toBe(1);
    expect(plan.legacySheets[0].name).toBe('products');
    expect(plan.legacySheets[0].reason).toContain('Missing required headers: tenantId, storeId, currency, inStock, createdAt, updatedAt');
    expect(plan.hasAmbiguity).toBe(true);
    expect(plan.ambiguityDetails).toContain('Legacy sheet \'products\' exists and cannot be modified');
    
    // Safety guarantees MUST be true
    expect(plan.safetyGuarantees.zeroLegacyModification).toBe(true);
    expect(plan.safetyGuarantees.zeroLegacyMigration).toBe(true);
    expect(plan.safetyGuarantees.zeroBusinessDataSeeding).toBe(true);

    // Remaining missing canonical sheets are queued for creation
    expect(plan.sheetsToCreate.length).toBe(Object.keys(CanonicalSchemas).length - 1);
    const createdNames = plan.sheetsToCreate.map((s) => s.name);
    expect(createdNames).toContain('tenants');
    expect(createdNames).toContain('stores');
    expect(createdNames).toContain('categories');
    expect(createdNames).toContain('customers');
    expect(createdNames).not.toContain('products'); // Does not recreate 'products' over legacy sheet
  });

  it('3. Reports existing canonical sheets when spreadsheet is fully provisioned', () => {
    const existingSheets: ISheetInfo[] = Object.keys(CanonicalSchemas).map((key) => {
      const schema = CanonicalSchemas[key];
      return {
        title: schema.sheetName,
        headers: [...schema.requiredHeaders, ...schema.optionalHeaders],
      };
    });

    const plan = provisioner.analyzeSpreadsheet(existingSheets);

    expect(plan.sheetsToCreate.length).toBe(0);
    expect(plan.sheetsExisting.length).toBe(Object.keys(CanonicalSchemas).length);
    expect(plan.legacySheets.length).toBe(0);
    expect(plan.hasAmbiguity).toBe(false);
  });

  it('4. Header row generator outputs only row 1 header values without data records', () => {
    const headers = provisioner.getHeaderRowForSheet('tenants');
    expect(headers).toEqual(['id', 'name', 'subscriptionPlan', 'isActive', 'createdAt', 'updatedAt']);
  });
});
