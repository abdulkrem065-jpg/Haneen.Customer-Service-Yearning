import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleSheetsLegacyMigrationAnalyzer } from './migration';
import { IGoogleSheetsTransport } from './transport';
import { ISheetMapper } from './mapper';
import { RecordClassification, MigrationEligibility } from '../../core/data/migration';

describe('GoogleSheetsLegacyMigrationAnalyzer', () => {
  let mockTransport: any;
  let mockMapper: any;

  beforeEach(() => {
    mockTransport = {
      getRows: vi.fn(),
      addRow: vi.fn(), // Make sure these are not called
      updateRow: vi.fn(), // Make sure these are not called
    };

    mockMapper = {
      sheetName: 'Products',
      headerAliases: { id: 'code' },
    };
  });

  const createAnalyzer = (trustedContext?: { tenantId: string; storeId: string }) => {
    return new GoogleSheetsLegacyMigrationAnalyzer(mockTransport, mockMapper, trustedContext);
  };

  it('1. should classify fully assigned record', async () => {
    mockTransport.getRows.mockResolvedValue([
      { rowNumber: 1, values: ['code', 'tenantId', 'storeId', 'name'] },
      { rowNumber: 2, values: ['p1', 't1', 's1', 'Product 1'] },
    ]);

    const analyzer = createAnalyzer();
    const result = await analyzer.analyze();

    expect(result.totalRecords).toBe(1);
    expect(result.records[0].classification).toBe(RecordClassification.FULLY_ASSIGNED);
    expect(result.records[0].eligibility).toBe(MigrationEligibility.BLOCKED);
    expect(result.records[0].reason).toContain('already fully assigned');
    expect(mockTransport.updateRow).not.toHaveBeenCalled();
  });

  it('2. should classify missing tenant', async () => {
    mockTransport.getRows.mockResolvedValue([
      { rowNumber: 1, values: ['code', 'tenantId', 'storeId', 'name'] },
      { rowNumber: 2, values: ['p2', '', 's1', 'Product 2'] },
    ]);

    const analyzer = createAnalyzer();
    const result = await analyzer.analyze();

    expect(result.records[0].classification).toBe(RecordClassification.TENANT_MISSING);
    expect(result.records[0].eligibility).toBe(MigrationEligibility.BLOCKED);
    expect(result.records[0].reason).toContain('no trusted source of ownership available');
  });

  it('3. should classify missing store', async () => {
    mockTransport.getRows.mockResolvedValue([
      { rowNumber: 1, values: ['code', 'tenantId', 'storeId', 'name'] },
      { rowNumber: 2, values: ['p3', 't1', '', 'Product 3'] },
    ]);

    const analyzer = createAnalyzer();
    const result = await analyzer.analyze();

    expect(result.records[0].classification).toBe(RecordClassification.STORE_MISSING);
    expect(result.records[0].eligibility).toBe(MigrationEligibility.BLOCKED);
  });

  it('4. should classify both missing', async () => {
    mockTransport.getRows.mockResolvedValue([
      { rowNumber: 1, values: ['code', 'tenantId', 'storeId', 'name'] },
      { rowNumber: 2, values: ['p4', '', '', 'Product 4'] },
    ]);

    const analyzer = createAnalyzer();
    const result = await analyzer.analyze();

    expect(result.records[0].classification).toBe(RecordClassification.BOTH_MISSING);
    expect(result.records[0].eligibility).toBe(MigrationEligibility.BLOCKED);
  });

  it('5. should make record eligible only if trusted context is provided', async () => {
    mockTransport.getRows.mockResolvedValue([
      { rowNumber: 1, values: ['code', 'tenantId', 'storeId', 'name'] },
      { rowNumber: 2, values: ['p5', '', '', 'Product 5'] },
    ]);

    const analyzer = createAnalyzer({ tenantId: 't-new', storeId: 's-new' });
    const result = await analyzer.analyze();

    expect(result.records[0].classification).toBe(RecordClassification.BOTH_MISSING);
    expect(result.records[0].eligibility).toBe(MigrationEligibility.ELIGIBLE);
    expect(result.records[0].proposedTenantId).toBe('t-new');
    expect(result.records[0].proposedStoreId).toBe('s-new');
    expect(mockTransport.updateRow).not.toHaveBeenCalled(); // zero write policy
  });

  it('6. should ensure no write operations occur', async () => {
     mockTransport.getRows.mockResolvedValue([
      { rowNumber: 1, values: ['code', 'tenantId', 'storeId', 'name'] },
      { rowNumber: 2, values: ['p6', '', '', 'Product 6'] },
    ]);

    const analyzer = createAnalyzer({ tenantId: 't-new', storeId: 's-new' });
    await analyzer.analyze();

    expect(mockTransport.updateRow).not.toHaveBeenCalled();
    expect(mockTransport.addRow).not.toHaveBeenCalled();
  });
});
