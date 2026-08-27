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
  baseCurrency: string;
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
  id?: string;
  orderId?: string;
  productId: string;
  productNameSnapshot?: string;
  productName?: string;
  quantity: number;
  unitPriceSnapshot?: number;
  unitPrice: number;
  totalPrice: number;
  subtotal?: number;
}

export interface Order {
  id: string;
  tenantId: string;
  storeId: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  items: OrderItem[];
  subtotal?: number;
  deliveryFee?: number;
  totalAmount: number;
  total?: number;
  currency: string;
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  paymentStatus?: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | string;
  deliveryAddress?: string;
  notes?: string;
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

export interface PaymentMethod {
  id: string;
  tenantId: string;
  storeId: string;
  methodType: string;
  displayName: string;
  accountDetails?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessHourShift {
  openingTime: string;
  closingTime: string;
}

export interface BusinessHour {
  id: string;
  tenantId: string;
  storeId: string;
  dayOfWeek: string;
  isClosed: boolean;
  is24Hours?: boolean;
  shifts?: BusinessHourShift[] | string;
  openingTime?: string;
  closingTime?: string;
  timezone?: string;
  isActive?: boolean;
  displayOrder?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryConfiguration {
  id: string;
  tenantId: string;
  storeId: string;
  isEnabled: boolean;
  deliveryAreas?: string;
  deliveryFee?: number;
  currency?: string;
  minimumOrderAmount?: number;
  minimumOrder?: number;
  estimatedDeliveryMinutes?: number | string;
  estimatedDelivery?: string;
  cashOnDeliveryEnabled?: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryZone {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  isActive: boolean;
  deliveryFee?: number;
  currency?: string;
  estimatedDeliveryMinutes?: number | string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreContact {
  id: string;
  tenantId: string;
  storeId: string;
  channelType: string;
  contactValue: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreLocation {
  id: string;
  tenantId: string;
  storeId: string;
  name?: string;
  address: string;
  googleMapsUrl?: string;
  mapUrl?: string;
  latitude?: number | string;
  longitude?: number | string;
  coordinates?: string;
  isActive: boolean;
  displayOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreNotice {
  id: string;
  tenantId: string;
  storeId: string;
  title: string;
  content: string;
  imageUrl?: string;
  isActive: boolean;
  displayOrder: number;
  validFrom?: Date;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorePolicy {
  id: string;
  tenantId: string;
  storeId: string;
  policyType: string;
  title: string;
  content: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DigitalService {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  description?: string;
  serviceType: string;
  isActive: boolean;
  displayOrder: number;
  metadata?: Record<string, unknown> | string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lead {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  phone: string;
  email?: string;
  businessType?: string;
  requestedService?: string;
  branchCount?: number;
  currentSystem?: string;
  customerNeed?: string;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'CLOSED' | string;
  source?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HumanHandoff {
  id: string;
  conversationId: string;
  tenantId: string;
  storeId: string;
  reason: string;
  summary: string;
  status: 'PENDING' | 'ASSIGNED' | 'RESOLVED' | 'CANCELLED' | string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface FeatureToggle {
  id: string;
  tenantId: string;
  storeId: string;
  key: string;
  isEnabled: boolean;
  metadata?: Record<string, unknown> | string;
  createdAt: Date;
  updatedAt: Date;
}
