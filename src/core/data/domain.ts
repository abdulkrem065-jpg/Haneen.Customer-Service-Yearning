// Platform Data
export interface Tenant {
  id: string;
  name: string;
  subscriptionPlan: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Tenant/Store Data
export interface Store {
  id: string;
  tenantId: string;
  name: string;
  settings: StoreSettings;
  createdAt: Date;
}

export interface StoreSettings {
  currency: string;
  language: string;
  policies?: Record<string, string>;
}

export interface AgentConfig {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  persona: string;
  tone: string;
  rules: string[];
}

// Domain Entities
export interface Product {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  inStock: boolean;
  inventoryCount?: number;
  categoryId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  description?: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  phoneNumber?: string;
  email?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  tenantId: string;
  storeId: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationData {
  id: string;
  tenantId: string;
  storeId: string;
  customerId: string;
  agentId: string;
  status: 'ACTIVE' | 'CLOSED' | 'HUMAN_HANDOFF' | 'WAITING_FOR_HUMAN';
  channel: string;
  createdAt: Date;
  updatedAt: Date;
}
