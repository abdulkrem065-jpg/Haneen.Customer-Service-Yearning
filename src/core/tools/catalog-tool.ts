import { IDataProvider, DataOperationContext, SearchQuery } from '../data/provider';
import { Product, Category } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export class CatalogTool {
  constructor(
    private readonly productProvider: IDataProvider<Product>,
    private readonly categoryProvider?: IDataProvider<Category>
  ) {}

  async searchProducts(
    query: SearchQuery & { tenantId?: string; storeId?: string },
    context: DataOperationContext
  ): Promise<GuardEvaluationResult<Product[]>> {
    NoHallucinationGuard.validateTrustedContext(query, context);

    const result = await this.productProvider.search(query, context);
    return NoHallucinationGuard.evaluateData(result.items, { entityNameAr: 'المنتجات' });
  }

  async getProductById(
    productId: string,
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<Product>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    try {
      const product = await this.productProvider.getById(productId, context);
      if (!product) {
        return NoHallucinationGuard.evaluateData(null, { entityNameAr: 'المنتج المطلوب' });
      }
      return NoHallucinationGuard.evaluateData(product, { entityNameAr: 'المنتج' });
    } catch {
      return NoHallucinationGuard.evaluateData(null, { entityNameAr: 'المنتج المطلوب' });
    }
  }

  async getCategories(
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<Category[]>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    if (!this.categoryProvider) {
      return NoHallucinationGuard.evaluateData([], { entityNameAr: 'التصنيفات' });
    }

    const result = await this.categoryProvider.search({}, context);
    return NoHallucinationGuard.evaluateData(result.items, { entityNameAr: 'التصنيفات' });
  }
}
