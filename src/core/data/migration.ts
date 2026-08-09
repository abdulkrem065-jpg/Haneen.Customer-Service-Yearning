export enum RecordClassification {
  FULLY_ASSIGNED = 'FULLY_ASSIGNED',
  TENANT_MISSING = 'TENANT_MISSING',
  STORE_MISSING = 'STORE_MISSING',
  BOTH_MISSING = 'BOTH_MISSING',
  INVALID_SCOPE = 'INVALID_SCOPE',
}

export enum MigrationEligibility {
  ELIGIBLE = 'ELIGIBLE',
  BLOCKED = 'BLOCKED',
}

export interface LegacyRecordAnalysis {
  recordId: string;
  classification: RecordClassification;
  eligibility: MigrationEligibility;
  proposedTenantId?: string;
  proposedStoreId?: string;
  reason: string;
}

export interface MigrationPlanResult {
  totalRecords: number;
  classifications: Record<RecordClassification, number>;
  eligibility: Record<MigrationEligibility, number>;
  records: LegacyRecordAnalysis[];
}

export interface ILegacyMigrationAnalyzer {
  analyze(): Promise<MigrationPlanResult>;
}
