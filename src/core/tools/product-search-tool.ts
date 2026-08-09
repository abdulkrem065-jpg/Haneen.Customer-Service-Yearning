import { ITool, IToolResult, ToolExecutionContext } from '../interfaces';
import { IDataProvider } from '../data/provider';
import { Product } from '../data/domain';
import { DataNotFoundError, DataUnavailableError, UnauthorizedDataAccessError } from '../data/errors';

export class ProductSearchTool implements ITool {
  name = 'ProductSearchTool';
  description = 'Searches for products in the store inventory by name or keyword.';

  constructor(private readonly productProvider: IDataProvider<Product>) {}

  async execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<IToolResult> {
    try {
      const searchTerm = params.searchTerm as string | undefined;

      const result = await this.productProvider.search({
        searchTerm,
        limit: 10
      }, context);

      if (result.items.length === 0) {
        return {
          success: true,
          data: {
            items: [],
            message: 'No products found.'
          }
        };
      }

      return {
        success: true,
        data: {
          items: result.items.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            currency: p.currency,
            inStock: p.inStock,
            description: p.description
          })),
          totalCount: result.totalCount
        }
      };
    } catch (error) {
      if (error instanceof UnauthorizedDataAccessError) {
        return {
          success: false,
          error: 'Access denied.',
          isDataUnavailable: true
        };
      }
      if (error instanceof DataUnavailableError) {
        return {
          success: false,
          error: 'Data temporarily unavailable.',
          isDataUnavailable: true
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred.',
        isDataUnavailable: true
      };
    }
  }
}
