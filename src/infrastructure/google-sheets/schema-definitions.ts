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
    optionalHeaders: ['subtotal', 'deliveryFee', 'paymentMethodId', 'paymentMethodName', 'paymentStatus', 'deliveryAddress', 'customerName', 'customerPhone', 'notes', 'cancellationReason', 'cancelledBy', 'cancelledAt'],
    foreignKeys: ['tenantId', 'storeId', 'customerId']
  },
  order_items: {
    sheetName: 'order_items',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'orderId', 'productId', 'quantity', 'unitPrice', 'totalPrice'],
    optionalHeaders: ['productNameSnapshot', 'unitPriceSnapshot', 'subtotal'],
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
    optionalHeaders: ['is24Hours', 'shifts', 'openingTime', 'closingTime', 'timezone', 'isActive', 'displayOrder', 'notes'],
    foreignKeys: ['tenantId', 'storeId']
  },
  delivery_configuration: {
    sheetName: 'delivery_configuration',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'isEnabled', 'createdAt', 'updatedAt'],
    optionalHeaders: ['deliveryAreas', 'deliveryFee', 'currency', 'minimumOrderAmount', 'minimumOrder', 'estimatedDeliveryMinutes', 'estimatedDelivery', 'cashOnDeliveryEnabled', 'notes'],
    foreignKeys: ['tenantId', 'storeId']
  },
  delivery_zones: {
    sheetName: 'delivery_zones',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'name', 'isActive', 'displayOrder', 'createdAt', 'updatedAt'],
    optionalHeaders: ['deliveryFee', 'currency', 'estimatedDeliveryMinutes'],
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
    optionalHeaders: ['name', 'googleMapsUrl', 'mapUrl', 'latitude', 'longitude', 'coordinates', 'displayOrder'],
    foreignKeys: ['tenantId', 'storeId']
  },
  store_notices: {
    sheetName: 'store_notices',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'title', 'content', 'isActive', 'displayOrder', 'createdAt', 'updatedAt'],
    optionalHeaders: ['imageUrl', 'validFrom', 'validUntil'],
    foreignKeys: ['tenantId', 'storeId']
  },
  store_policies: {
    sheetName: 'store_policies',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'policyType', 'title', 'content', 'isActive', 'displayOrder', 'createdAt', 'updatedAt'],
    optionalHeaders: [],
    foreignKeys: ['tenantId', 'storeId']
  },
  digital_services: {
    sheetName: 'digital_services',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'name', 'serviceType', 'isActive', 'displayOrder', 'createdAt', 'updatedAt'],
    optionalHeaders: ['description', 'metadata'],
    foreignKeys: ['tenantId', 'storeId']
  },
  leads: {
    sheetName: 'leads',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'name', 'phone', 'status', 'createdAt', 'updatedAt'],
    optionalHeaders: ['email', 'businessType', 'requestedService', 'branchCount', 'currentSystem', 'customerNeed', 'source', 'notes'],
    foreignKeys: ['tenantId', 'storeId']
  },
  human_handoffs: {
    sheetName: 'human_handoffs',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'conversationId', 'tenantId', 'storeId', 'reason', 'summary', 'status', 'createdAt'],
    optionalHeaders: ['updatedAt'],
    foreignKeys: ['tenantId', 'storeId', 'conversationId']
  },
  feature_toggles: {
    sheetName: 'feature_toggles',
    scope: 'STORE',
    primaryKey: 'id',
    requiredHeaders: ['id', 'tenantId', 'storeId', 'key', 'isEnabled', 'createdAt', 'updatedAt'],
    optionalHeaders: ['metadata'],
    foreignKeys: ['tenantId', 'storeId']
  }
};
