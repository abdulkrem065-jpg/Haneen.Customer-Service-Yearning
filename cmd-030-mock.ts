import { CanonicalProvisioner, ISheetInfo } from './src/infrastructure/google-sheets/provisioner';
const provisioner = new CanonicalProvisioner();

const existingSheets: ISheetInfo[] = [
  { title: 'tenants', headers: ['id', 'name', 'subscriptionPlan', 'isActive', 'createdAt', 'updatedAt'] },
  { title: 'stores', headers: ['id', 'tenantId', 'name', 'createdAt'] },
  { title: 'products', headers: ['id', 'tenantId', 'storeId', 'name', 'price', 'currency', 'inStock', 'createdAt', 'updatedAt'] },
  { title: 'categories', headers: ['id', 'tenantId', 'storeId', 'name'] },
  { title: 'customers', headers: ['id', 'tenantId', 'storeId', 'name', 'createdAt'] },
  { title: 'orders', headers: ['id', 'tenantId', 'storeId', 'customerId', 'totalAmount', 'currency', 'status', 'createdAt', 'updatedAt'] },
  { title: 'order_items', headers: ['id', 'orderId', 'productId', 'quantity', 'unitPrice', 'totalPrice'] },
  { title: 'conversations', headers: ['id', 'tenantId', 'storeId', 'customerId', 'agentId', 'channel', 'status', 'createdAt', 'updatedAt'] },
  { title: 'agent_config', headers: ['id', 'tenantId', 'storeId', 'name', 'persona', 'tone', 'language'] },
  { title: 'store_settings', headers: ['id', 'tenantId', 'storeId', 'baseCurrency', 'language'] },
];

const plan = provisioner.analyzeSpreadsheet(existingSheets);
console.log("Sheets to create:", plan.sheetsToCreate.map(s => s.name));
console.log("Existing sheets:", plan.sheetsExisting);
console.log("Legacy sheets:", plan.legacySheets);
