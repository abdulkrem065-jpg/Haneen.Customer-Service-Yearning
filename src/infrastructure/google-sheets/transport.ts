export interface SheetRow {
  rowNumber: number;
  values: string[];
}

export interface IGoogleSheetsTransport {
  getRows(sheetName: string): Promise<SheetRow[]>;
  addRow(sheetName: string, values: string[]): Promise<SheetRow>;
  updateRow(sheetName: string, rowNumber: number, values: string[]): Promise<void>;
  deleteRow(sheetName: string, rowNumber: number): Promise<void>;
  writeHeaderRow?(sheetName: string, headers: string[]): Promise<void>;
  createSheet?(sheetName: string): Promise<void>;
  ensureSheetExists?(sheetName: string): Promise<boolean>;
  applyDataValidation?(sheetName: string, columnIndex: number, options: string[]): Promise<void>;
  applyNumberValidation?(sheetName: string, columnIndex: number, minVal?: number, isInteger?: boolean): Promise<void>;
}
