import { Order, OrderItem } from '../data/domain';
import { DataOperationContext } from '../data/provider';
import { UnauthorizedDataAccessError, DataNotFoundError } from '../data/errors';

export class OrderStore {
  private static instance: OrderStore | null = null;
  private orders: Map<string, Order> = new Map();
  private dailySequence: Map<string, number> = new Map();

  public static getInstance(): OrderStore {
    if (!OrderStore.instance) {
      OrderStore.instance = new OrderStore();
    }
    return OrderStore.instance;
  }

  public static resetInstance(): void {
    OrderStore.instance = null;
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

  public async createOrder(
    payload: {
      id?: string;
      customerId: string;
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
    },
    context: DataOperationContext
  ): Promise<Order> {
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

  public async updateOrderStatus(
    orderId: string,
    newStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED',
    context: DataOperationContext
  ): Promise<Order> {
    const order = await this.getOrderById(orderId, context);
    if (!order) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    // Validate status transition rules
    const current = order.status;
    if (current === 'CANCELLED' && newStatus !== 'CANCELLED') {
      throw new Error(`Cannot transition cancelled order ${orderId} to ${newStatus}`);
    }
    if (current === 'DELIVERED' && newStatus !== 'DELIVERED') {
      throw new Error(`Cannot transition completed order ${orderId} to ${newStatus}`);
    }

    order.status = newStatus;
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
