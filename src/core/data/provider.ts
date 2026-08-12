import { TenantContext } from '../types';
import { 
  Product, 
  Customer, 
  Order, 
  ConversationData,
  PaymentMethod,
  BusinessHour,
  DeliveryConfiguration,
  StoreContact,
  StoreLocation,
  StoreNotice
} from './domain';

// The DataOperationContext represents the trusted execution scope.
export type DataOperationContext = TenantContext;

// Query abstractions
export interface QueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface SearchQuery extends QueryOptions {
  searchTerm?: string;
  filters?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
}

// Base Data Provider Contract
export interface IDataProvider<T> {
  getById(id: string, context: DataOperationContext): Promise<T>;
  search(query: SearchQuery, context: DataOperationContext): Promise<PaginatedResult<T>>;
  create(data: Omit<T, 'id' | 'tenantId' | 'storeId' | 'createdAt' | 'updatedAt'>, context: DataOperationContext): Promise<T>;
  update(id: string, data: Partial<Omit<T, 'id' | 'tenantId' | 'storeId'>>, context: DataOperationContext): Promise<T>;
  delete(id: string, context: DataOperationContext): Promise<boolean>;
}

// Domain-Specific Provider Facade
export interface IStoreDataFacade {
  products: IDataProvider<Product>;
  customers: IDataProvider<Customer>;
  orders: IDataProvider<Order>;
  conversations: IDataProvider<ConversationData>;
  
  paymentMethods: IDataProvider<PaymentMethod>;
  businessHours: IDataProvider<BusinessHour>;
  deliveryConfig: IDataProvider<DeliveryConfiguration>;
  storeContacts: IDataProvider<StoreContact>;
  storeLocations: IDataProvider<StoreLocation>;
  storeNotices: IDataProvider<StoreNotice>;
  
  // Custom Domain Operations
  checkProductAvailability(productId: string, quantity: number, context: DataOperationContext): Promise<boolean>;
  getOrdersByCustomer(customerId: string, context: DataOperationContext): Promise<Order[]>;
}
