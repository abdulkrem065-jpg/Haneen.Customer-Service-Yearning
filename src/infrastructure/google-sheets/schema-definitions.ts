export type ScopeType = 'PLATFORM' | 'TENANT' | 'STORE';

export interface ISchemaDefinition {
  sheetName: string;
  scope: ScopeType;
  primaryKey: string;
  requiredHeaders: string[];
  optionalHeaders: string[];
  foreignKeys: string[];
}

export const CanonicalSchemas: Record<string, ISchemaDefinition> = {
  tenants: {
    sheetName: 'tenants',
    scope: 'PLATFORM',
    primaryKey: 'id',
    requiredHeaders: ['id', 'name', 'subscriptionPlan', 'isActive', 'createdAt', 'updatedAt'],
    optionalHeaders: [],
    foreignKeys: []
  },
  stores: {
    sheetName: 'stores',
    scope: 'TENANT',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'name', 'createdAt'],
    optionalHeaders: [],
    foreignKeys: ['tenantId']
  },
  products: {
    sheetName: 'products',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'],
    optionalHeaders: ['categoryId', 'description', 'quantity', 'imageUrl', 'metadata'],
    foreignKeys: ['tenantId', 'storeId', 'categoryId']
  },
  categories: {
    sheetName: 'categories',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'name'],
    optionalHeaders: ['description'],
    foreignKeys: ['tenantId', 'storeId']
  },
  customers: {
    sheetName: 'customers',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'name', 'createdAt'],
    optionalHeaders: ['phoneNumber', 'email', 'metadata'],
    foreignKeys: ['tenantId', 'storeId']
  },
  orders: {
    sheetName: 'orders',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'customerId', 'totalAmount', 'currency', 'status', 'createdAt', 'updatedAt'],
    optionalHeaders: [],
    foreignKeys: ['tenantId', 'storeId', 'customerId']
  },
  order_items: {
    sheetName: 'order_items',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'orderId', 'productId', 'quantity', 'unitPrice', 'totalPrice'],
    optionalHeaders: [],
    foreignKeys: ['orderId', 'productId']
  },
  conversations: {
    sheetName: 'conversations',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'customerId', 'agentId', 'channel', 'status', 'createdAt', 'updatedAt'],
    optionalHeaders: [],
    foreignKeys: ['tenantId', 'storeId', 'customerId', 'agentId']
  },
  agent_config: {
    sheetName: 'agent_config',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'name', 'persona', 'tone', 'language'],
    optionalHeaders: ['rules'],
    foreignKeys: ['tenantId', 'storeId']
  },
  store_settings: {
    sheetName: 'store_settings',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'baseCurrency', 'language'],
    optionalHeaders: ['timezone', 'contactInformation', 'policies'],
    foreignKeys: ['tenantId', 'storeId']
  },
  payment_methods: {
    sheetName: 'payment_methods',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'methodType', 'displayName', 'isActive', 'displayOrder', 'createdAt', 'updatedAt'],
    optionalHeaders: ['accountDetails'],
    foreignKeys: ['tenantId', 'storeId']
  },
  business_hours: {
    sheetName: 'business_hours',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'dayOfWeek', 'isClosed', 'createdAt', 'updatedAt'],
    optionalHeaders: ['openingTime', 'closingTime', 'notes'],
    foreignKeys: ['tenantId', 'storeId']
  },
  delivery_configuration: {
    sheetName: 'delivery_configuration',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'isEnabled', 'createdAt', 'updatedAt'],
    optionalHeaders: ['deliveryAreas', 'deliveryFee', 'minimumOrder', 'estimatedDelivery', 'notes'],
    foreignKeys: ['tenantId', 'storeId']
  },
  store_contacts: {
    sheetName: 'store_contacts',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'channelType', 'contactValue', 'isActive', 'displayOrder', 'createdAt', 'updatedAt'],
    optionalHeaders: [],
    foreignKeys: ['tenantId', 'storeId']
  },
  store_locations: {
    sheetName: 'store_locations',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'address', 'isActive', 'createdAt', 'updatedAt'],
    optionalHeaders: ['mapUrl', 'coordinates'],
    foreignKeys: ['tenantId', 'storeId']
  },
  store_notices: {
    sheetName: 'store_notices',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'title', 'content', 'isActive', 'displayOrder', 'createdAt', 'updatedAt'],
    optionalHeaders: ['imageUrl', 'validFrom', 'validUntil'],
    foreignKeys: ['tenantId', 'storeId']
  }
};
