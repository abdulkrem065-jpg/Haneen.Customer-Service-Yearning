import { SheetRow } from './transport';
import { HeaderMap } from './header-map';

export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'نعم') return true;
  if (normalized === 'false' || normalized === 'لا') return false;
  throw new Error(`Invalid boolean value: "${value}"`);
}

export function formatBoolean(value: boolean): string {
  return value ? 'TRUE' : 'FALSE';
}

export interface ISheetMapper<T> {
  sheetName: string;
  requiredHeaders: string[];
  defaultHeaders: string[];
  headerAliases?: Record<string, string[]>;
  fromRow(rowValues: string[], headerMap: HeaderMap): T;
  toRow(entity: T, headerMap: HeaderMap): string[];
  getId(entity: T): string;
}
