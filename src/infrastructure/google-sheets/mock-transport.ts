import { IGoogleSheetsTransport, SheetRow } from './transport';

export class MockGoogleSheetsTransport implements IGoogleSheetsTransport {
  private sheets: Map<string, SheetRow[]> = new Map();
  private nextRowNumber: Map<string, number> = new Map();

  private initSheet(sheetName: string) {
    if (!this.sheets.has(sheetName)) {
      this.sheets.set(sheetName, []);
      this.nextRowNumber.set(sheetName, 1); // Row 1 is header
    }
  }

  async getRows(sheetName: string): Promise<SheetRow[]> {
    this.initSheet(sheetName);
    return this.sheets.get(sheetName) || [];
  }

  async addRow(sheetName: string, values: string[]): Promise<SheetRow> {
    this.initSheet(sheetName);
    const rows = this.sheets.get(sheetName)!;
    const rowNum = this.nextRowNumber.get(sheetName)!;
    const newRow = { rowNumber: rowNum, values: [...values] };
    rows.push(newRow);
    this.nextRowNumber.set(sheetName, rowNum + 1);
    return newRow;
  }

  async updateRow(sheetName: string, rowNumber: number, values: string[]): Promise<void> {
    this.initSheet(sheetName);
    const rows = this.sheets.get(sheetName)!;
    const rowIndex = rows.findIndex(r => r.rowNumber === rowNumber);
    if (rowIndex === -1) {
      throw new Error(`Row ${rowNumber} not found in sheet ${sheetName}`);
    }
    rows[rowIndex].values = [...values];
  }

  async deleteRow(sheetName: string, rowNumber: number): Promise<void> {
    this.initSheet(sheetName);
    const rows = this.sheets.get(sheetName)!;
    const rowIndex = rows.findIndex(r => r.rowNumber === rowNumber);
    if (rowIndex === -1) {
      throw new Error(`Row ${rowNumber} not found in sheet ${sheetName}`);
    }
    rows.splice(rowIndex, 1);
  }
}
