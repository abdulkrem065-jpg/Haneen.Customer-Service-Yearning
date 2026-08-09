import { IDataProvider, SearchQuery, PaginatedResult, DataOperationContext } from './provider';
import { DataNotFoundError, UnauthorizedDataAccessError } from './errors';

type Identifiable = {
  id: string;
  tenantId: string;
  storeId: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class InMemoryDataProvider<T extends Identifiable> implements IDataProvider<T> {
  private items: Map<string, T> = new Map();
  private idCounter = 1;

  constructor(private entityName: string = 'Entity') {}

  private generateId(): string {
    return `${this.entityName.toLowerCase()}-${Date.now()}-${this.idCounter++}`;
  }

  async getById(id: string, context: DataOperationContext): Promise<T> {
    const item = this.items.get(id);
    if (!item) {
      throw new DataNotFoundError(`${this.entityName} with id ${id} not found`);
    }
    
    // Strict isolation check
    if (item.tenantId !== context.tenantId) {
      throw new UnauthorizedDataAccessError(`Cross-tenant access denied for ${this.entityName}`);
    }
    if (item.storeId !== context.storeId) {
      throw new UnauthorizedDataAccessError(`Cross-store access denied for ${this.entityName}`);
    }
    
    return { ...item };
  }
  
  async search(query: SearchQuery, context: DataOperationContext): Promise<PaginatedResult<T>> {
    const allItems = Array.from(this.items.values());
    
    // Always filter by context first!
    const tenantItems = allItems.filter(item => 
      item.tenantId === context.tenantId && 
      item.storeId === context.storeId
    );
    
    // Simple pagination mock
    const limit = query.limit || 10;
    const offset = query.offset || 0;
    
    const paginatedItems = tenantItems.slice(offset, offset + limit);
    
    return {
      items: paginatedItems.map(item => ({ ...item })),
      totalCount: tenantItems.length,
      hasMore: offset + limit < tenantItems.length
    };
  }

  async create(data: Omit<T, 'id' | 'tenantId' | 'storeId' | 'createdAt' | 'updatedAt'>, context: DataOperationContext): Promise<T> {
    const id = this.generateId();
    const now = new Date();
    
    const newItem = { 
      ...data, 
      id, 
      tenantId: context.tenantId, 
      storeId: context.storeId,
      createdAt: now,
      updatedAt: now
    } as unknown as T;
    
    this.items.set(id, newItem);
    return { ...newItem };
  }

  async update(id: string, data: Partial<Omit<T, 'id' | 'tenantId' | 'storeId'>>, context: DataOperationContext): Promise<T> {
    const existing = await this.getById(id, context); // This enforces context check
    
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date()
    };
    
    this.items.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, context: DataOperationContext): Promise<boolean> {
    await this.getById(id, context); // Enforces context check before delete
    this.items.delete(id);
    return true;
  }
}
