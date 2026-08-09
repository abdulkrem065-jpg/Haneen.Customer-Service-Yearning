import { IGoogleSheetsTransport } from './transport';
import { ISheetMapper } from './mapper';
import { HeaderMap } from './header-map';
import {
  RecordClassification,
  MigrationEligibility,
  LegacyRecordAnalysis,
  MigrationPlanResult,
  ILegacyMigrationAnalyzer
} from '../../core/data/migration';

export class GoogleSheetsLegacyMigrationAnalyzer implements ILegacyMigrationAnalyzer {
  constructor(
    private transport: IGoogleSheetsTransport,
    private mapper: ISheetMapper<any>,
    private trustedMigrationContext?: { tenantId: string; storeId: string }
  ) {}

  async analyze(): Promise<MigrationPlanResult> {
    const rows = await this.transport.getRows(this.mapper.sheetName);
    if (rows.length === 0) {
      return this.createEmptyResult();
    }

    const headerMap = new HeaderMap(rows[0].values, [], this.mapper.headerAliases);
    const result = this.createEmptyResult();
    
    // Start from row 1 (skip header)
    for (let i = 1; i < rows.length; i++) {
      const rowValues = rows[i].values;
      const id = headerMap.getValue(rowValues, 'id') || `row-${i}`;
      const tenantId = headerMap.getValue(rowValues, 'tenantId')?.trim();
      const storeId = headerMap.getValue(rowValues, 'storeId')?.trim();
      
      let classification = RecordClassification.FULLY_ASSIGNED;
      
      if (!tenantId && !storeId) {
        classification = RecordClassification.BOTH_MISSING;
      } else if (!tenantId) {
        classification = RecordClassification.TENANT_MISSING;
      } else if (!storeId) {
        classification = RecordClassification.STORE_MISSING;
      } else if (this.trustedMigrationContext && 
                 (tenantId !== this.trustedMigrationContext.tenantId || storeId !== this.trustedMigrationContext.storeId)) {
        // Optional logic: if there is a trusted context, but existing values conflict, we could consider it INVALID_SCOPE.
        // For standard dry run, if it has both, it's fully assigned to *something*.
        classification = RecordClassification.FULLY_ASSIGNED;
      }

      let eligibility = MigrationEligibility.BLOCKED;
      let reason = '';
      let proposedTenantId: string | undefined = undefined;
      let proposedStoreId: string | undefined = undefined;

      if (classification === RecordClassification.FULLY_ASSIGNED) {
        eligibility = MigrationEligibility.BLOCKED;
        reason = 'Record is already fully assigned to a context.';
      } else if (this.trustedMigrationContext) {
        eligibility = MigrationEligibility.ELIGIBLE;
        proposedTenantId = this.trustedMigrationContext.tenantId;
        proposedStoreId = this.trustedMigrationContext.storeId;
        reason = 'Trusted migration context provided explicit ownership.';
      } else {
        eligibility = MigrationEligibility.BLOCKED;
        reason = 'Missing context ID and no trusted source of ownership available. AI guessing is prohibited.';
      }

      const analysis: LegacyRecordAnalysis = {
        recordId: id,
        classification,
        eligibility,
        proposedTenantId,
        proposedStoreId,
        reason
      };

      result.records.push(analysis);
      result.totalRecords++;
      result.classifications[classification]++;
      result.eligibility[eligibility]++;
    }

    return result;
  }

  private createEmptyResult(): MigrationPlanResult {
    return {
      totalRecords: 0,
      classifications: {
        [RecordClassification.FULLY_ASSIGNED]: 0,
        [RecordClassification.TENANT_MISSING]: 0,
        [RecordClassification.STORE_MISSING]: 0,
        [RecordClassification.BOTH_MISSING]: 0,
        [RecordClassification.INVALID_SCOPE]: 0,
      },
      eligibility: {
        [MigrationEligibility.ELIGIBLE]: 0,
        [MigrationEligibility.BLOCKED]: 0,
      },
      records: []
    };
  }
}
