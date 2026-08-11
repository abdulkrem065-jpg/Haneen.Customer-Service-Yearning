import { CanonicalSchemas, ISchemaDefinition } from './schema-definitions';

export interface ISheetInfo {
  title: string;
  sheetId?: number;
  headers?: string[];
}

export interface SheetToCreate {
  name: string;
  headers: string[];
}

export interface LegacySheetInfo {
  name: string;
  reason: string;
  headers?: string[];
}

export interface ProvisioningPlan {
  sheetsToCreate: SheetToCreate[];
  sheetsExisting: string[];
  legacySheets: LegacySheetInfo[];
  hasAmbiguity: boolean;
  ambiguityDetails?: string;
  safetyGuarantees: {
    zeroLegacyModification: boolean;
    zeroLegacyMigration: boolean;
    zeroBusinessDataSeeding: boolean;
  };
}

export class CanonicalProvisioner {
  /**
   * Constructs a provisioning plan based on the existing sheets in a spreadsheet.
   * Strictly adheres to DEC-003 and CMD-020 safety guidelines.
   */
  public analyzeSpreadsheet(existingSheets: ISheetInfo[]): ProvisioningPlan {
    const existingMap = new Map<string, ISheetInfo>();
    for (const sheet of existingSheets) {
      existingMap.set(sheet.title, sheet);
    }

    const sheetsToCreate: SheetToCreate[] = [];
    const sheetsExisting: string[] = [];
    const legacySheets: LegacySheetInfo[] = [];

    let hasAmbiguity = false;
    let ambiguityDetails: string | undefined = undefined;

    const canonicalKeys = Object.keys(CanonicalSchemas);

    for (const key of canonicalKeys) {
      const schema: ISchemaDefinition = CanonicalSchemas[key];
      const targetName = schema.sheetName;
      const existingSheet = existingMap.get(targetName);

      if (!existingSheet) {
        // Sheet does not exist at all, queue for creation with canonical headers
        const headers = [...schema.requiredHeaders, ...schema.optionalHeaders];
        sheetsToCreate.push({ name: targetName, headers });
      } else {
        // Sheet exists. Check if it matches canonical schema
        const existingHeaders = existingSheet.headers || [];
        const missingRequired = schema.requiredHeaders.filter(
          (h) => !existingHeaders.includes(h)
        );

        if (missingRequired.length === 0) {
          // Exists and has all required canonical headers
          sheetsExisting.push(targetName);
        } else {
          // Sheet exists with the canonical name, but lacks required canonical headers (e.g., legacy products sheet)
          legacySheets.push({
            name: targetName,
            reason: `Sheet '${targetName}' exists but is legacy / schema misaligned. Missing required headers: ${missingRequired.join(', ')}.`,
            headers: existingHeaders,
          });

          // Check if DEC-003 / documentation defines an approved alternate sheet name for this entity
          // Since Google Sheets cannot have two sheets named 'products', and no alternate sheet name is defined in documentation,
          // flag ambiguity as mandated by CMD-020.
          hasAmbiguity = true;
          ambiguityDetails = `Legacy sheet '${targetName}' exists and cannot be modified or overwritten. Google Sheets forbids duplicate sheet names in a single spreadsheet, and no alternate canonical sheet name for '${targetName}' is defined in project documentation. Per CMD-020 rules, operation MUST STOP to prevent modifying legacy data or inventing unapproved sheet names. Per DEC-003, a Fresh Canonical Spreadsheet should be provisioned instead.`;
        }
      }
    }

    return {
      sheetsToCreate,
      sheetsExisting,
      legacySheets,
      hasAmbiguity,
      ambiguityDetails,
      safetyGuarantees: {
        zeroLegacyModification: true,
        zeroLegacyMigration: true,
        zeroBusinessDataSeeding: true,
      },
    };
  }

  /**
   * Helper method to format headers row for writing.
   * Guarantees only row 1 header values are created without any data records.
   */
  public getHeaderRowForSheet(sheetName: string): string[] {
    const schema = CanonicalSchemas[sheetName];
    if (!schema) {
      throw new Error(`Unknown canonical sheet schema: ${sheetName}`);
    }
    return [...schema.requiredHeaders, ...schema.optionalHeaders];
  }
}
