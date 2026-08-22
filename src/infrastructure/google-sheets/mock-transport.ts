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

  async createSheet(sheetName: string): Promise<void> {
    this.initSheet(sheetName);
  }

  async ensureSheetExists(sheetName: string): Promise<boolean> {
    if (!this.sheets.has(sheetName)) {
      this.initSheet(sheetName);
      return true;
    }
    return false;
  }

  async writeHeaderRow(sheetName: string, headers: string[]): Promise<void> {
    this.initSheet(sheetName);
    const rows = this.sheets.get(sheetName)!;
    if (rows.length === 0) {
      rows.push({ rowNumber: 1, values: [...headers] });
      this.nextRowNumber.set(sheetName, 2);
    } else {
      rows[0] = { rowNumber: 1, values: [...headers] };
    }
  }

  private validations: Map<string, Array<{ col: number; options: string[] }>> = new Map();
  private numberValidations: Map<string, Array<{ col: number; minVal: number; isInteger: boolean }>> = new Map();

  async applyDataValidation(sheetName: string, columnIndex: number, options: string[]): Promise<void> {
    this.initSheet(sheetName);
    if (!this.validations.has(sheetName)) {
      this.validations.set(sheetName, []);
    }
    const list = this.validations.get(sheetName)!;
    const existingIdx = list.findIndex(v => v.col === columnIndex);
    if (existingIdx >= 0) {
      list[existingIdx].options = [...options];
    } else {
      list.push({ col: columnIndex, options: [...options] });
    }
  }

  async applyNumberValidation(sheetName: string, columnIndex: number, minVal: number = 0, isInteger: boolean = false): Promise<void> {
    this.initSheet(sheetName);
    if (!this.numberValidations.has(sheetName)) {
      this.numberValidations.set(sheetName, []);
    }
    const list = this.numberValidations.get(sheetName)!;
    const existingIdx = list.findIndex(v => v.col === columnIndex);
    if (existingIdx >= 0) {
      list[existingIdx] = { col: columnIndex, minVal, isInteger };
    } else {
      list.push({ col: columnIndex, minVal, isInteger });
    }
  }

  getValidations(sheetName: string): Array<{ col: number; options: string[] }> {
    return this.validations.get(sheetName) || [];
  }

  getNumberValidations(sheetName: string): Array<{ col: number; minVal: number; isInteger: boolean }> {
    return this.numberValidations.get(sheetName) || [];
  }
}
