export interface SheetRow {
  rowNumber: number;
  values: string[];
}

export interface IGoogleSheetsTransport {
  getRows(sheetName: string): Promise<SheetRow[]>;
  addRow(sheetName: string, values: string[]): Promise<SheetRow>;
  updateRow(sheetName: string, rowNumber: number, values: string[]): Promise<void>;
  deleteRow(sheetName: string, rowNumber: number): Promise<void>;
}
