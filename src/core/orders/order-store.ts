import fs from 'fs';
import path from 'path';
import { Order, OrderItem } from '../data/domain';
import { DataOperationContext } from '../data/provider';
import { UnauthorizedDataAccessError, DataNotFoundError } from '../data/errors';

export interface CreateOrderPayload {
  id?: string;
  tenantId?: string;
  storeId?: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    productId: string;
    productNameSnapshot: string;
    quantity: number;
    unitPriceSnapshot: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  currency?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  paymentStatus?: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED';
  deliveryAddress?: string;
  notes?: string;
}

export interface IOrderStore {
  generateOrderId(): string;
  createOrder(payload: CreateOrderPayload, context: DataOperationContext): Promise<Order>;
  getOrderById(id: string, context: DataOperationContext): Promise<Order | null>;
  getOrdersByCustomer(customerId: string, context: DataOperationContext): Promise<Order[]>;
  getAllOrders(context: DataOperationContext): Promise<Order[]>;
  getOrders(context: DataOperationContext): Promise<Order[]>;
  updateOrderStatus(
    orderId: string,
    newStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED',
    context: DataOperationContext,
    cancellationDetails?: { cancellationReason?: string; cancelledBy?: string; cancelledAt?: Date }
  ): Promise<Order>;
  updatePaymentStatus(
    orderId: string,
    newPaymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED',
    context: DataOperationContext
  ): Promise<Order>;
  clear(): void | Promise<void>;
}

export class PersistentOrderStore implements IOrderStore {
  private static persistentInstance: PersistentOrderStore | null = null;
  private orders: Map<string, Order> = new Map();
  private dailySequence: Map<string, number> = new Map();
  private filePath: string;

  constructor(customFilePath?: string) {
    this.filePath = customFilePath || path.join(process.cwd(), 'data', 'orders_persistent.json');
    this.loadFromDisk();
  }

  public static getInstance(customFilePath?: string): PersistentOrderStore {
    if (!PersistentOrderStore.persistentInstance) {
      PersistentOrderStore.persistentInstance = new PersistentOrderStore(customFilePath);
    }
    return PersistentOrderStore.persistentInstance;
  }

  public static resetInstance(): void {
    PersistentOrderStore.persistentInstance = null;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const rawData = fs.readFileSync(this.filePath, 'utf-8');
        const parsed: Order[] = JSON.parse(rawData);
        this.orders.clear();
        this.dailySequence.clear();

        for (const o of parsed) {
          const hydratedOrder: Order = {
            ...o,
            createdAt: new Date(o.createdAt),
            updatedAt: new Date(o.updatedAt),
            items: (o.items || []).map(item => ({
              ...item
            }))
          };
          this.orders.set(hydratedOrder.id, hydratedOrder);

          // Restore sequence index from order IDs
          const match = hydratedOrder.id.match(/^ORD-(\d{8})-(\d{4})$/);
          if (match) {
            const dateKey = match[1];
            const seqNum = parseInt(match[2], 10);
            const currentMax = this.dailySequence.get(dateKey) || 0;
            if (seqNum > currentMax) {
              this.dailySequence.set(dateKey, seqNum);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[PersistentOrderStore] Error loading orders from disk:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.orders.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PersistentOrderStore] Error saving orders to disk:', err);
      throw new Error(`Failed to save order to persistent storage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  public generateOrderId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateKey = `${year}${month}${day}`;

    const seq = (this.dailySequence.get(dateKey) || 0) + 1;
    this.dailySequence.set(dateKey, seq);
    const paddedSeq = String(seq).padStart(4, '0');

    return `ORD-${dateKey}-${paddedSeq}`;
  }

  private enforceContext(tenantId: string, storeId: string, context: DataOperationContext): void {
    if (tenantId !== context.tenantId) {
      throw new UnauthorizedDataAccessError(`Cross-tenant order access denied. Expected tenant ${context.tenantId}, got ${tenantId}`);
    }
    if (storeId !== context.storeId) {
      throw new UnauthorizedDataAccessError(`Cross-store order access denied. Expected store ${context.storeId}, got ${storeId}`);
    }
  }

  public async createOrder(payload: CreateOrderPayload, context: DataOperationContext): Promise<Order> {
    const orderId = payload.id || this.generateOrderId();
    const now = new Date();
    const currency = payload.currency || 'YER';

    const orderItems: OrderItem[] = payload.items.map((item, idx) => {
      const subtotal = item.quantity * item.unitPriceSnapshot;
      return {
        id: `item-${orderId}-${idx + 1}`,
        orderId,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        productName: item.productNameSnapshot,
        quantity: item.quantity,
        unitPriceSnapshot: item.unitPriceSnapshot,
        unitPrice: item.unitPriceSnapshot,
        totalPrice: subtotal,
        subtotal
      };
    });

    const newOrder: Order = {
      id: orderId,
      tenantId: context.tenantId,
      storeId: context.storeId,
      customerId: payload.customerId,
      customerName: payload.customerName || '',
      customerPhone: payload.customerPhone || '',
      items: orderItems,
      subtotal: payload.subtotal,
      deliveryFee: payload.deliveryFee,
      totalAmount: payload.totalAmount,
      total: payload.totalAmount,
      currency,
      status: 'PENDING',
      paymentMethodId: payload.paymentMethodId || '',
      paymentMethodName: payload.paymentMethodName || '',
      paymentStatus: payload.paymentStatus || 'UNPAID',
      deliveryAddress: payload.deliveryAddress || '',
      notes: payload.notes || '',
      createdAt: now,
      updatedAt: now
    };

    this.orders.set(orderId, newOrder);
    this.saveToDisk();
    return newOrder;
  }

  public async getOrderById(id: string, context: DataOperationContext): Promise<Order | null> {
    const order = this.orders.get(id);
    if (!order) return null;
    this.enforceContext(order.tenantId, order.storeId, context);
    return order;
  }

  public async getOrdersByCustomer(customerId: string, context: DataOperationContext): Promise<Order[]> {
    const customerOrders: Order[] = [];
    for (const order of this.orders.values()) {
      if (order.customerId === customerId) {
        this.enforceContext(order.tenantId, order.storeId, context);
        customerOrders.push(order);
      }
    }
    return customerOrders;
  }

  public async getAllOrders(context: DataOperationContext): Promise<Order[]> {
    const matched: Order[] = [];
    for (const order of this.orders.values()) {
      if (order.tenantId === context.tenantId && order.storeId === context.storeId) {
        matched.push(order);
      }
    }
    return matched;
  }

  public async getOrders(context: DataOperationContext): Promise<Order[]> {
    return this.getAllOrders(context);
  }

  public async updateOrderStatus(
    orderId: string,
    newStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED',
    context: DataOperationContext,
    cancellationDetails?: { cancellationReason?: string; cancelledBy?: string; cancelledAt?: Date }
  ): Promise<Order> {
    const order = await this.getOrderById(orderId, context);
    if (!order) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    const current = order.status;
    if (current === 'CANCELLED' && newStatus !== 'CANCELLED') {
      throw new Error(`Cannot transition cancelled order ${orderId} to ${newStatus}`);
    }
    if (current === 'DELIVERED' && newStatus !== 'DELIVERED') {
      throw new Error(`Cannot transition completed order ${orderId} to ${newStatus}`);
    }

    order.status = newStatus;
    if (newStatus === 'CANCELLED' && cancellationDetails) {
      if (cancellationDetails.cancellationReason) {
        order.cancellationReason = cancellationDetails.cancellationReason;
      }
      if (cancellationDetails.cancelledBy) {
        order.cancelledBy = cancellationDetails.cancelledBy;
      }
      order.cancelledAt = cancellationDetails.cancelledAt || new Date();
    }
    order.updatedAt = new Date();
    this.orders.set(orderId, order);
    this.saveToDisk();
    return order;
  }

  public async updatePaymentStatus(
    orderId: string,
    newPaymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED',
    context: DataOperationContext
  ): Promise<Order> {
    const order = await this.getOrderById(orderId, context);
    if (!order) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    order.paymentStatus = newPaymentStatus;
    order.updatedAt = new Date();
    this.orders.set(orderId, order);
    this.saveToDisk();
    return order;
  }

  public clear(): void {
    this.orders.clear();
    this.dailySequence.clear();
    if (fs.existsSync(this.filePath)) {
      try {
        fs.unlinkSync(this.filePath);
      } catch (err) {
        // Ignore unlink error
      }
    }
  }
}

export class InMemoryOrderStore implements IOrderStore {
  private orders: Map<string, Order> = new Map();
  private dailySequence: Map<string, number> = new Map();

  public generateOrderId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateKey = `${year}${month}${day}`;

    const seq = (this.dailySequence.get(dateKey) || 0) + 1;
    this.dailySequence.set(dateKey, seq);
    const paddedSeq = String(seq).padStart(4, '0');

    return `ORD-${dateKey}-${paddedSeq}`;
  }

  private enforceContext(tenantId: string, storeId: string, context: DataOperationContext): void {
    if (tenantId !== context.tenantId) {
      throw new UnauthorizedDataAccessError(`Cross-tenant order access denied. Expected tenant ${context.tenantId}, got ${tenantId}`);
    }
    if (storeId !== context.storeId) {
      throw new UnauthorizedDataAccessError(`Cross-store order access denied. Expected store ${context.storeId}, got ${storeId}`);
    }
  }

  public async createOrder(payload: CreateOrderPayload, context: DataOperationContext): Promise<Order> {
    const orderId = payload.id || this.generateOrderId();
    const now = new Date();
    const currency = payload.currency || 'YER';

    const orderItems: OrderItem[] = payload.items.map((item, idx) => {
      const subtotal = item.quantity * item.unitPriceSnapshot;
      return {
        id: `item-${orderId}-${idx + 1}`,
        orderId,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        productName: item.productNameSnapshot,
        quantity: item.quantity,
        unitPriceSnapshot: item.unitPriceSnapshot,
        unitPrice: item.unitPriceSnapshot,
        totalPrice: subtotal,
        subtotal
      };
    });

    const newOrder: Order = {
      id: orderId,
      tenantId: context.tenantId,
      storeId: context.storeId,
      customerId: payload.customerId,
      customerName: payload.customerName || '',
      customerPhone: payload.customerPhone || '',
      items: orderItems,
      subtotal: payload.subtotal,
      deliveryFee: payload.deliveryFee,
      totalAmount: payload.totalAmount,
      total: payload.totalAmount,
      currency,
      status: 'PENDING',
      paymentMethodId: payload.paymentMethodId || '',
      paymentMethodName: payload.paymentMethodName || '',
      paymentStatus: payload.paymentStatus || 'UNPAID',
      deliveryAddress: payload.deliveryAddress || '',
      notes: payload.notes || '',
      createdAt: now,
      updatedAt: now
    };

    this.orders.set(orderId, newOrder);
    return newOrder;
  }

  public async getOrderById(id: string, context: DataOperationContext): Promise<Order | null> {
    const order = this.orders.get(id);
    if (!order) return null;
    this.enforceContext(order.tenantId, order.storeId, context);
    return order;
  }

  public async getOrdersByCustomer(customerId: string, context: DataOperationContext): Promise<Order[]> {
    const customerOrders: Order[] = [];
    for (const order of this.orders.values()) {
      if (order.customerId === customerId) {
        this.enforceContext(order.tenantId, order.storeId, context);
        customerOrders.push(order);
      }
    }
    return customerOrders;
  }

  public async getAllOrders(context: DataOperationContext): Promise<Order[]> {
    const matched: Order[] = [];
    for (const order of this.orders.values()) {
      if (order.tenantId === context.tenantId && order.storeId === context.storeId) {
        matched.push(order);
      }
    }
    return matched;
  }

  public async getOrders(context: DataOperationContext): Promise<Order[]> {
    return this.getAllOrders(context);
  }

  public async updateOrderStatus(
    orderId: string,
    newStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED',
    context: DataOperationContext,
    cancellationDetails?: { cancellationReason?: string; cancelledBy?: string; cancelledAt?: Date }
  ): Promise<Order> {
    const order = await this.getOrderById(orderId, context);
    if (!order) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    const current = order.status;
    if (current === 'CANCELLED' && newStatus !== 'CANCELLED') {
      throw new Error(`Cannot transition cancelled order ${orderId} to ${newStatus}`);
    }
    if (current === 'DELIVERED' && newStatus !== 'DELIVERED') {
      throw new Error(`Cannot transition completed order ${orderId} to ${newStatus}`);
    }

    order.status = newStatus;
    if (newStatus === 'CANCELLED' && cancellationDetails) {
      if (cancellationDetails.cancellationReason) {
        order.cancellationReason = cancellationDetails.cancellationReason;
      }
      if (cancellationDetails.cancelledBy) {
        order.cancelledBy = cancellationDetails.cancelledBy;
      }
      order.cancelledAt = cancellationDetails.cancelledAt || new Date();
    }
    order.updatedAt = new Date();
    this.orders.set(orderId, order);
    return order;
  }

  public async updatePaymentStatus(
    orderId: string,
    newPaymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED',
    context: DataOperationContext
  ): Promise<Order> {
    const order = await this.getOrderById(orderId, context);
    if (!order) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    order.paymentStatus = newPaymentStatus;
    order.updatedAt = new Date();
    this.orders.set(orderId, order);
    return order;
  }

  public clear(): void {
    this.orders.clear();
    this.dailySequence.clear();
  }
}

import { GoogleSheetsOrderStore } from './google-sheets-order-store';
export { GoogleSheetsOrderStore };

export class OrderStore implements IOrderStore {
  private static instance: OrderStore | null = null;
  private delegate: IOrderStore;

  constructor(delegate?: IOrderStore) {
    this.delegate = delegate || new GoogleSheetsOrderStore();
  }

  public static getInstance(overrideDelegate?: IOrderStore): OrderStore {
    if (!OrderStore.instance) {
      OrderStore.instance = new OrderStore(overrideDelegate || new GoogleSheetsOrderStore());
    }
    return OrderStore.instance;
  }

  public static resetInstance(overrideDelegate?: IOrderStore): void {
    if (OrderStore.instance) {
      OrderStore.instance.clear();
    }
    OrderStore.instance = overrideDelegate ? new OrderStore(overrideDelegate) : null;
    PersistentOrderStore.resetInstance();
  }

  public setImplementation(impl: IOrderStore): void {
    this.delegate = impl;
  }

  public generateOrderId(): string {
    return this.delegate.generateOrderId();
  }

  public async createOrder(payload: CreateOrderPayload, context: DataOperationContext): Promise<Order> {
    return this.delegate.createOrder(payload, context);
  }

  public async getOrderById(id: string, context: DataOperationContext): Promise<Order | null> {
    return this.delegate.getOrderById(id, context);
  }

  public async getOrdersByCustomer(customerId: string, context: DataOperationContext): Promise<Order[]> {
    return this.delegate.getOrdersByCustomer(customerId, context);
  }

  public async getAllOrders(context: DataOperationContext): Promise<Order[]> {
    return this.delegate.getAllOrders(context);
  }

  public async getOrders(context: DataOperationContext): Promise<Order[]> {
    return this.delegate.getAllOrders(context);
  }

  public async updateOrderStatus(
    orderId: string,
    newStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED',
    context: DataOperationContext,
    cancellationDetails?: { cancellationReason?: string; cancelledBy?: string; cancelledAt?: Date }
  ): Promise<Order> {
    return this.delegate.updateOrderStatus(orderId, newStatus, context, cancellationDetails);
  }

  public async updatePaymentStatus(
    orderId: string,
    newPaymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED',
    context: DataOperationContext
  ): Promise<Order> {
    return this.delegate.updatePaymentStatus(orderId, newPaymentStatus, context);
  }

  public clear(): void {
    this.delegate.clear();
  }
}

