import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductSearchTool } from './product-search-tool';
import { ProductGetTool } from './product-get-tool';
import { IDataProvider } from '../data/provider';
import { Product } from '../data/domain';
import { ToolExecutionContext } from '../interfaces';
import { DataNotFoundError, UnauthorizedDataAccessError, DataUnavailableError } from '../data/errors';

describe('Product Tools', () => {
  let mockProvider: any;
  let searchTool: ProductSearchTool;
  let getTool: ProductGetTool;
  let trustedContext: ToolExecutionContext;

  beforeEach(() => {
    mockProvider = {
      search: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    
    searchTool = new ProductSearchTool(mockProvider);
    getTool = new ProductGetTool(mockProvider);
    
    trustedContext = {
      tenantId: 'trusted-tenant',
      storeId: 'trusted-store',
      agentId: 'trusted-agent'
    };
  });

  describe('ProductSearchTool', () => {
    it('should search products passing the trusted context', async () => {
      mockProvider.search.mockResolvedValue({
        items: [{ id: '1', name: 'Product 1', price: 10, currency: 'USD', inStock: true }],
        totalCount: 1,
        hasMore: false
      });

      const params = { searchTerm: 'Product', tenantId: 'malicious-tenant' }; // AI tries to override
      const result = await searchTool.execute(params, trustedContext);

      expect(mockProvider.search).toHaveBeenCalledWith(
        { searchTerm: 'Product', limit: 10 },
        trustedContext
      );
      
      // Ensure the malicious tenant override from AI was ignored (not passed to the provider's query context)
      expect(result.success).toBe(true);
      expect((result.data as any).items.length).toBe(1);
    });

    it('should handle DataUnavailableError', async () => {
      mockProvider.search.mockRejectedValue(new DataUnavailableError('DB down'));

      const result = await searchTool.execute({}, trustedContext);

      expect(result.success).toBe(false);
      expect(result.isDataUnavailable).toBe(true);
      expect(result.error).toBe('Data temporarily unavailable.');
    });

    it('should handle UnauthorizedDataAccessError', async () => {
      mockProvider.search.mockRejectedValue(new UnauthorizedDataAccessError('Bad scope'));

      const result = await searchTool.execute({}, trustedContext);

      expect(result.success).toBe(false);
      expect(result.isDataUnavailable).toBe(true);
      expect(result.error).toBe('Access denied.');
    });
    
    it('should return empty list when no products found', async () => {
      mockProvider.search.mockResolvedValue({
        items: [],
        totalCount: 0,
        hasMore: false
      });

      const result = await searchTool.execute({}, trustedContext);

      expect(result.success).toBe(true);
      expect((result.data as any).items.length).toBe(0);
      expect((result.data as any).message).toBe('No products found.');
    });
  });

  describe('ProductGetTool', () => {
    it('should retrieve a product by id passing the trusted context', async () => {
      mockProvider.getById.mockResolvedValue({
        id: 'p1', name: 'Product 1', price: 10, currency: 'USD', inStock: true
      });

      const params = { productId: 'p1', storeId: 'malicious-store' };
      const result = await getTool.execute(params, trustedContext);

      expect(mockProvider.getById).toHaveBeenCalledWith('p1', trustedContext);
      
      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('p1');
    });

    it('should handle DataNotFoundError gracefully', async () => {
      mockProvider.getById.mockRejectedValue(new DataNotFoundError('Product not found'));

      const result = await getTool.execute({ productId: 'p1' }, trustedContext);

      expect(result.success).toBe(true); // Tool execution was successful, just business logic outcome
      expect((result.data as any).message).toBe('Product not found.');
    });

    it('should require productId', async () => {
      const result = await getTool.execute({}, trustedContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('productId is required');
    });
  });
});
