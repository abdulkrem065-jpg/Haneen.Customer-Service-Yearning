import { ITool, IToolResult, ToolExecutionContext } from '../interfaces';
import { IDataProvider } from '../data/provider';
import { Product } from '../data/domain';
import { DataNotFoundError, DataUnavailableError, UnauthorizedDataAccessError } from '../data/errors';

export class ProductGetTool implements ITool {
  name = 'ProductGetTool';
  description = 'Retrieves detailed information about a specific product by its ID.';

  constructor(private readonly productProvider: IDataProvider<Product>) {}

  async execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<IToolResult> {
    try {
      const productId = params.productId as string;
      if (!productId) {
        return {
          success: false,
          error: 'productId is required.'
        };
      }

      const product = await this.productProvider.getById(productId, context);

      return {
        success: true,
        data: {
          id: product.id,
          name: product.name,
          price: product.price,
          currency: product.currency,
          inStock: product.inStock,
          description: product.description
        }
      };
    } catch (error) {
      if (error instanceof DataNotFoundError) {
        return {
          success: true, // We successfully executed the tool, but the product wasn't found
          data: {
            message: 'Product not found.'
          }
        };
      }
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
