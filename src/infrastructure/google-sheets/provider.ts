import { IDataProvider, DataOperationContext, SearchQuery, PaginatedResult } from '../../core/data/provider';
import { DataNotFoundError, UnauthorizedDataAccessError, ProviderError } from '../../core/data/errors';
import { IGoogleSheetsTransport, SheetRow } from './transport';
import { ISheetMapper } from './mapper';
import { HeaderMap, HeaderSchemaError } from './header-map';

export interface GoogleSheetsProviderOptions {
  onInvalidRow?: (error: Error, rowNumber: number, sheetName: string) => void;
}

export class GoogleSheetsDataProvider<T extends { tenantId: string; storeId: string }> implements IDataProvider<T> {
  constructor(
    private readonly transport: IGoogleSheetsTransport,
    private readonly mapper: ISheetMapper<T>,
    private readonly options?: GoogleSheetsProviderOptions
  ) {}

  private enforceContext(item: T, context: DataOperationContext): void {
    if (item.tenantId !== context.tenantId) {
      throw new UnauthorizedDataAccessError(`Cross-tenant access denied. Expected tenant ${context.tenantId}, got ${item.tenantId}`);
    }
    if (item.storeId !== context.storeId) {
      throw new UnauthorizedDataAccessError(`Cross-store access denied. Expected store ${context.storeId}, got ${item.storeId}`);
    }
  }

  private async getHeaderMap(): Promise<HeaderMap> {
    const rows = await this.transport.getRows(this.mapper.sheetName);
    if (rows.length === 0) {
      const headerRow = await this.transport.addRow(this.mapper.sheetName, this.mapper.defaultHeaders);
      return new HeaderMap(headerRow.values, this.mapper.requiredHeaders, this.mapper.headerAliases);
    }
    return new HeaderMap(rows[0].values, this.mapper.requiredHeaders, this.mapper.headerAliases);
  }

  private async fetchAllRows(): Promise<{ row: SheetRow, item: T, headerMap: HeaderMap }[]> {
    try {
      const rows = await this.transport.getRows(this.mapper.sheetName);
      if (rows.length === 0) {
        return [];
      }
      
      const headerMap = new HeaderMap(rows[0].values, this.mapper.requiredHeaders, this.mapper.headerAliases);
      
      const results: { row: SheetRow, item: T, headerMap: HeaderMap }[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        try {
          const item = this.mapper.fromRow(row.values, headerMap);
          results.push({ row, item, headerMap });
        } catch (err) {
          if (this.options?.onInvalidRow) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.options.onInvalidRow(error, row.rowNumber, this.mapper.sheetName);
          }
        }
      }
      return results;
    } catch (error: unknown) {
      if (error instanceof HeaderSchemaError) {
        throw new ProviderError(`Schema error in sheet ${this.mapper.sheetName}: ${error.message}`);
      }
      throw new ProviderError(`Provider error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getById(id: string, context: DataOperationContext): Promise<T> {
    const all = await this.fetchAllRows();
    const match = all.find(x => this.mapper.getId(x.item) === id);
    if (!match) {
      throw new DataNotFoundError(`Item with id ${id} not found in ${this.mapper.sheetName}`);
    }
    this.enforceContext(match.item, context);
    return match.item;
  }

  async search(query: SearchQuery, context: DataOperationContext): Promise<PaginatedResult<T>> {
    const all = await this.fetchAllRows();
    
    // 1. Strict tenant/store filtering
    let filtered = all.filter(x => x.item.tenantId === context.tenantId && x.item.storeId === context.storeId);
    
    // 2. Additional filters
    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        filtered = filtered.filter(x => (x.item as Record<string, unknown>)[key] === value);
      }
    }
    
    // 3. Search term
    if (query.searchTerm) {
      const term = query.searchTerm.toLowerCase();
      filtered = filtered.filter(x => {
         const rowStr = x.row.values.join(' ').toLowerCase();
         return rowStr.includes(term);
      });
    }

    // 4. Sorting
    if (query.sortBy) {
      const sortBy = query.sortBy;
      filtered.sort((a, b) => {
        const valA = (a.item as Record<string, any>)[sortBy];
        const valB = (b.item as Record<string, any>)[sortBy];
        if (valA < valB) return query.sortDirection === 'desc' ? 1 : -1;
        if (valA > valB) return query.sortDirection === 'desc' ? -1 : 1;
        return 0;
      });
    }

    // 5. Pagination
    const limit = query.limit || 10;
    const offset = query.offset || 0;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      items: paginated.map(x => x.item),
      totalCount: filtered.length,
      hasMore: offset + limit < filtered.length
    };
  }

  async create(data: Omit<T, 'id' | 'tenantId' | 'storeId' | 'createdAt' | 'updatedAt'>, context: DataOperationContext): Promise<T> {
    const now = new Date();
    const id = `id-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const newItem = {
      ...data,
      id,
      tenantId: context.tenantId,
      storeId: context.storeId,
      createdAt: now,
      updatedAt: now
    } as unknown as T;
    
    const headerMap = await this.getHeaderMap();
    const values = this.mapper.toRow(newItem, headerMap);
    
    try {
      await this.transport.addRow(this.mapper.sheetName, values);
    } catch (error: unknown) {
      throw new ProviderError(`Provider error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return newItem;
  }

  async update(id: string, data: Partial<Omit<T, 'id' | 'tenantId' | 'storeId'>>, context: DataOperationContext): Promise<T> {
    const all = await this.fetchAllRows();
    const match = all.find(x => this.mapper.getId(x.item) === id);
    
    if (!match) {
      throw new DataNotFoundError(`Item with id ${id} not found in ${this.mapper.sheetName}`);
    }
    
    this.enforceContext(match.item, context);
    
    const updatedItem = {
      ...match.item,
      ...data,
      updatedAt: new Date()
    };
    
    const values = this.mapper.toRow(updatedItem, match.headerMap);
    
    try {
      await this.transport.updateRow(this.mapper.sheetName, match.row.rowNumber, values);
    } catch (error: unknown) {
      throw new ProviderError(`Provider error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return updatedItem;
  }

  async delete(id: string, context: DataOperationContext): Promise<boolean> {
    const all = await this.fetchAllRows();
    const match = all.find(x => this.mapper.getId(x.item) === id);
    
    if (!match) {
      throw new DataNotFoundError(`Item with id ${id} not found in ${this.mapper.sheetName}`);
    }
    
    this.enforceContext(match.item, context);
    
    try {
      await this.transport.deleteRow(this.mapper.sheetName, match.row.rowNumber);
    } catch (error: unknown) {
      throw new ProviderError(`Provider error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return true;
  }
}
