import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataProvider } from './mocks';
import { DataOperationContext } from './provider';
import { UnauthorizedDataAccessError, DataNotFoundError } from './errors';

interface TestEntity {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

describe('Data Provider Contract & Isolation', () => {
  let provider: InMemoryDataProvider<TestEntity>;
  
  const tenantAContext: DataOperationContext = { tenantId: 'tenant-a', storeId: 'store-1', agentId: 'agent-1' };
  const tenantBContext: DataOperationContext = { tenantId: 'tenant-b', storeId: 'store-2', agentId: 'agent-2' };
  const sameTenantDifferentStoreContext: DataOperationContext = { tenantId: 'tenant-a', storeId: 'store-3', agentId: 'agent-1' };

  beforeEach(() => {
    provider = new InMemoryDataProvider<TestEntity>('TestEntity');
  });

  it('Provider contract can represent tenant-scoped operations (Test 1)', async () => {
    const item = await provider.create({ name: 'Item A' }, tenantAContext);
    expect(item.id).toBeDefined();
    expect(item.tenantId).toBe('tenant-a');
    expect(item.storeId).toBe('store-1');
    
    const fetchedItem = await provider.getById(item.id, tenantAContext);
    expect(fetchedItem.name).toBe('Item A');
  });

  it('Cross-tenant access can be rejected (Test 3)', async () => {
    const item = await provider.create({ name: 'Item A' }, tenantAContext);
    
    // Tenant B tries to access Tenant A's item
    await expect(provider.getById(item.id, tenantBContext)).rejects.toThrow(UnauthorizedDataAccessError);
  });

  it('Cross-store access can be rejected (Test 4)', async () => {
    const item = await provider.create({ name: 'Item A' }, tenantAContext);
    
    // Same tenant, different store tries to access the item
    await expect(provider.getById(item.id, sameTenantDifferentStoreContext)).rejects.toThrow(UnauthorizedDataAccessError);
  });

  it('Tenant context cannot be overridden during creation', async () => {
    // A caller attempts to supply a different tenantId inside the creation data, 
    // but the provider contract explicitly omits it and uses the context.
    const createData = { name: 'Item A' } as any;
    createData.tenantId = 'tenant-x'; // Malicious attempt
    
    const item = await provider.create(createData, tenantAContext);
    
    // The trusted context should prevail
    expect(item.tenantId).toBe('tenant-a');
    expect(item.tenantId).not.toBe('tenant-x');
  });

  it('Provider throws proper DataNotFoundError', async () => {
    await expect(provider.getById('non-existent', tenantAContext)).rejects.toThrow(DataNotFoundError);
  });

  it('Search results are strictly isolated by context', async () => {
    await provider.create({ name: 'Item A1' }, tenantAContext);
    await provider.create({ name: 'Item A2' }, tenantAContext);
    
    await provider.create({ name: 'Item B1' }, tenantBContext);

    const resultsA = await provider.search({}, tenantAContext);
    expect(resultsA.totalCount).toBe(2);
    
    const resultsB = await provider.search({}, tenantBContext);
    expect(resultsB.totalCount).toBe(1);
  });
});
