import { IOrderStore, CreateOrderPayload } from './order-store';
import { Order, OrderItem } from '../data/domain';
import { DataOperationContext } from '../data/provider';
import { DataNotFoundError, UnauthorizedDataAccessError } from '../data/errors';
import { IGoogleSheetsTransport } from '../../infrastructure/google-sheets/transport';
import { SecureGoogleSheetsTransport } from '../../infrastructure/google-sheets/secure-transport';
import { MockGoogleSheetsTransport } from '../../infrastructure/google-sheets/mock-transport';
import { GoogleServiceAccountAuth } from '../../infrastructure/google-sheets/auth';
import { ConfigValidator } from '../../infrastructure/google-sheets/config';
import { OrderMapper, OrderItemMapper } from '../../infrastructure/google-sheets/domain-mappers';
import { HeaderMap } from '../../infrastructure/google-sheets/header-map';

export class GoogleSheetsOrderStore implements IOrderStore {
  private transport: IGoogleSheetsTransport;
  private orderMapper = new OrderMapper();
  private orderItemMapper = new OrderItemMapper();
  private dailySequence: Map<string, number> = new Map();
  private initializedTabs: boolean = false;

  constructor(customTransport?: IGoogleSheetsTransport) {
    if (customTransport) {
      this.transport = customTransport;
    } else {
      this.transport = GoogleSheetsOrderStore.createDefaultTransport();
    }
  }

  public static createDefaultTransport(): IGoogleSheetsTransport {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const isMock = process.env.GOOGLE_SHEETS_MOCK_MODE === 'true';

    if (spreadsheetId && clientEmail && privateKey && !isMock) {
      try {
        const config = ConfigValidator.validate({ spreadsheetId, clientEmail, privateKey, mockMode: false });
        const authClient = new GoogleServiceAccountAuth(config);
        return new SecureGoogleSheetsTransport(authClient, config);
      } catch (err) {
        console.warn('[GoogleSheetsOrderStore] Error creating SecureGoogleSheetsTransport, fallback to Mock:', err);
        return new MockGoogleSheetsTransport();
      }
    }
    return new MockGoogleSheetsTransport();
  }

  public getTransport(): IGoogleSheetsTransport {
    return this.transport;
  }

  private async ensureTabsExist(): Promise<void> {
    if (this.initializedTabs) {
      return;
    }

    try {
      if (this.transport.ensureSheetExists) {
        await this.transport.ensureSheetExists(this.orderMapper.sheetName);
        await this.transport.ensureSheetExists(this.orderItemMapper.sheetName);
      } else if (this.transport.createSheet) {
        await this.transport.createSheet(this.orderMapper.sheetName);
        await this.transport.createSheet(this.orderItemMapper.sheetName);
      }

      // Ensure header row exists for orders
      const orderRows = await this.transport.getRows(this.orderMapper.sheetName);
      if (orderRows.length === 0) {
        if (this.transport.writeHeaderRow) {
          await this.transport.writeHeaderRow(this.orderMapper.sheetName, this.orderMapper.defaultHeaders);
        } else {
          await this.transport.addRow(this.orderMapper.sheetName, this.orderMapper.defaultHeaders);
        }
      }

      // Ensure header row exists for order_items
      const itemRows = await this.transport.getRows(this.orderItemMapper.sheetName);
      if (itemRows.length === 0) {
        if (this.transport.writeHeaderRow) {
          await this.transport.writeHeaderRow(this.orderItemMapper.sheetName, this.orderItemMapper.defaultHeaders);
        } else {
          await this.transport.addRow(this.orderItemMapper.sheetName, this.orderItemMapper.defaultHeaders);
        }
      }

      this.initializedTabs = true;
    } catch (err) {
      console.warn('[GoogleSheetsOrderStore] Tab initialization notice:', err);
    }
  }

  private async syncDailySequenceFromSheets(): Promise<void> {
    await this.ensureTabsExist();
    try {
      const orderRows = await this.transport.getRows(this.orderMapper.sheetName);
      if (orderRows.length <= 1) {
        return;
      }

      const orderHeaderMap = new HeaderMap(orderRows[0].values, this.orderMapper.requiredHeaders);

      for (let i = 1; i < orderRows.length; i++) {
        const row = orderRows[i];
        try {
          const rawId = orderHeaderMap.requireValue(row.values, 'id');
          const match = rawId.match(/^ORD-(\d{8})-(\d{4})$/);
          if (match) {
            const dateKey = match[1];
            const seqNum = parseInt(match[2], 10);
            const currentMax = this.dailySequence.get(dateKey) || 0;
            if (seqNum > currentMax) {
              this.dailySequence.set(dateKey, seqNum);
            }
          }
        } catch (e) {
          // Ignore unparseable row
        }
      }
    } catch (err) {
      console.warn('[GoogleSheetsOrderStore] Daily sequence sync error:', err);
    }
  }

  public generateOrderId(): string {
    const today = new Date();
    const dateKey = today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');

    const currentSeq = (this.dailySequence.get(dateKey) || 0) + 1;
    this.dailySequence.set(dateKey, currentSeq);

    return `ORD-${dateKey}-${String(currentSeq).padStart(4, '0')}`;
  }

  private generateNextOrderIdForDate(dateKey: string): string {
    const currentSeq = (this.dailySequence.get(dateKey) || 0) + 1;
    this.dailySequence.set(dateKey, currentSeq);
    return `ORD-${dateKey}-${String(currentSeq).padStart(4, '0')}`;
  }

  public async createOrder(payload: CreateOrderPayload, context: DataOperationContext): Promise<Order> {
    await this.ensureTabsExist();

    // Idempotency check: If orderId exists, return existing order (do not write duplicate)
    if (payload.id) {
      const existing = await this.getOrderById(payload.id, context);
      if (existing) {
        return existing;
      }
    }

    await this.syncDailySequenceFromSheets();

    const today = new Date();
    const dateKey = today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');

    const orderId = payload.id || this.generateNextOrderIdForDate(dateKey);

    // Get order header map
    const orderRows = await this.transport.getRows(this.orderMapper.sheetName);
    const orderHeaders = orderRows.length > 0 ? orderRows[0].values : this.orderMapper.defaultHeaders;
    const orderHeaderMap = new HeaderMap(orderHeaders, this.orderMapper.requiredHeaders);

    const now = new Date();
    const subtotal = payload.subtotal;
    const deliveryFee = payload.deliveryFee ?? 500;
    const totalAmount = payload.totalAmount ?? (subtotal + deliveryFee);

    // CRITICAL: Strict Identity - No fallback to store phone!
    const customerPhone = payload.customerPhone?.trim() || '';
    const customerName = payload.customerName?.trim() || '';

    const newOrder: Order = {
      id: orderId,
      tenantId: context.tenantId,
      storeId: context.storeId,
      customerId: payload.customerId || 'cst-web-customer',
      customerName,
      customerPhone,
      items: [],
      subtotal,
      deliveryFee,
      totalAmount,
      total: totalAmount,
      currency: payload.currency || 'YER',
      status: 'PENDING',
      paymentMethodId: payload.paymentMethodId || 'pay-cod',
      paymentMethodName: payload.paymentMethodName || 'كاش عند الاستلام',
      paymentStatus: payload.paymentStatus || 'UNPAID',
      deliveryAddress: payload.deliveryAddress || '',
      notes: payload.notes || '',
      createdAt: now,
      updatedAt: now,
    };

    // 1. Write Order row
    const orderRowValues = this.orderMapper.toRow(newOrder, orderHeaderMap);
    await this.transport.addRow(this.orderMapper.sheetName, orderRowValues);

    // 2. Write Order Items rows
    const itemRows = await this.transport.getRows(this.orderItemMapper.sheetName);
    const itemHeaders = itemRows.length > 0 ? itemRows[0].values : this.orderItemMapper.defaultHeaders;
    const itemHeaderMap = new HeaderMap(itemHeaders, this.orderItemMapper.requiredHeaders);

    const orderItems: OrderItem[] = [];
    for (let index = 0; index < payload.items.length; index++) {
      const itemPayload = payload.items[index];
      const itemId = `item-${orderId}-${index + 1}`;
      const itemTotalPrice = itemPayload.unitPriceSnapshot * itemPayload.quantity;

      const orderItem: OrderItem = {
        id: itemId,
        orderId,
        productId: itemPayload.productId,
        productNameSnapshot: itemPayload.productNameSnapshot,
        productName: itemPayload.productNameSnapshot,
        quantity: itemPayload.quantity,
        unitPriceSnapshot: itemPayload.unitPriceSnapshot,
        unitPrice: itemPayload.unitPriceSnapshot,
        totalPrice: itemTotalPrice,
        subtotal: itemTotalPrice,
      };

      const itemRowValues = this.orderItemMapper.toRow(orderItem, itemHeaderMap);
      await this.transport.addRow(this.orderItemMapper.sheetName, itemRowValues);
      orderItems.push(orderItem);
    }

    newOrder.items = orderItems;

    // 3. READ-BACK VERIFICATION
    const readBackOrder = await this.getOrderById(orderId, context);
    if (!readBackOrder) {
      throw new Error(`Read-back verification failed: Order ${orderId} not found after write`);
    }
    if (readBackOrder.items.length < payload.items.length) {
      throw new Error(`Read-back verification failed: Expected ${payload.items.length} items, found ${readBackOrder.items.length}`);
    }

    return readBackOrder;
  }

  public async getOrderById(orderId: string, context: DataOperationContext): Promise<Order | null> {
    await this.ensureTabsExist();

    const orderRows = await this.transport.getRows(this.orderMapper.sheetName);
    if (orderRows.length <= 1) {
      return null;
    }

    const orderHeaderMap = new HeaderMap(orderRows[0].values, this.orderMapper.requiredHeaders);

    let foundOrder: Order | null = null;
    for (let i = 1; i < orderRows.length; i++) {
      const row = orderRows[i];
      try {
        const order = this.orderMapper.fromRow(row.values, orderHeaderMap);
        if (order.id === orderId) {
          if (order.tenantId !== context.tenantId || order.storeId !== context.storeId) {
            throw new UnauthorizedDataAccessError(`Unauthorized access to order ${orderId}`);
          }
          foundOrder = order;
          break;
        }
      } catch (err) {
        if (err instanceof UnauthorizedDataAccessError) {
          throw err;
        }
        // Skip unparseable row
      }
    }

    if (!foundOrder) {
      return null;
    }

    // Hydrate items for found order
    const itemRows = await this.transport.getRows(this.orderItemMapper.sheetName);
    const items: OrderItem[] = [];
    if (itemRows.length > 1) {
      const itemHeaderMap = new HeaderMap(itemRows[0].values, this.orderItemMapper.requiredHeaders);
      for (let i = 1; i < itemRows.length; i++) {
        const row = itemRows[i];
        try {
          const item = this.orderItemMapper.fromRow(row.values, itemHeaderMap);
          if (item.orderId === orderId) {
            items.push(item);
          }
        } catch (err) {
          // Skip invalid item row
        }
      }
    }

    foundOrder.items = items;
    return foundOrder;
  }

  public async getOrdersByCustomer(customerId: string, context: DataOperationContext): Promise<Order[]> {
    const all = await this.getAllOrders(context);
    return all.filter(o => o.customerId === customerId);
  }

  public async getOrders(context: DataOperationContext): Promise<Order[]> {
    return this.getAllOrders(context);
  }

  public async getAllOrders(context: DataOperationContext): Promise<Order[]> {
    await this.ensureTabsExist();

    const orderRows = await this.transport.getRows(this.orderMapper.sheetName);
    if (orderRows.length <= 1) {
      return [];
    }

    const orderHeaderMap = new HeaderMap(orderRows[0].values, this.orderMapper.requiredHeaders);
    const ordersMap = new Map<string, Order>();

    for (let i = 1; i < orderRows.length; i++) {
      const row = orderRows[i];
      try {
        const order = this.orderMapper.fromRow(row.values, orderHeaderMap);
        if (order.tenantId === context.tenantId && order.storeId === context.storeId) {
          order.items = [];
          ordersMap.set(order.id, order);
        }
      } catch (err) {
        // Skip
      }
    }

    if (ordersMap.size === 0) {
      return [];
    }

    // Hydrate items
    const itemRows = await this.transport.getRows(this.orderItemMapper.sheetName);
    if (itemRows.length > 1) {
      const itemHeaderMap = new HeaderMap(itemRows[0].values, this.orderItemMapper.requiredHeaders);
      for (let i = 1; i < itemRows.length; i++) {
        const row = itemRows[i];
        try {
          const item = this.orderItemMapper.fromRow(row.values, itemHeaderMap);
          const parentOrder = ordersMap.get(item.orderId);
          if (parentOrder) {
            parentOrder.items.push(item);
          }
        } catch (err) {
          // Skip
        }
      }
    }

    return Array.from(ordersMap.values());
  }

  public async updateOrderStatus(
    orderId: string,
    newStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED',
    context: DataOperationContext,
    cancellationDetails?: { cancellationReason?: string; cancelledBy?: string; cancelledAt?: Date }
  ): Promise<Order> {
    await this.ensureTabsExist();

    const orderRows = await this.transport.getRows(this.orderMapper.sheetName);
    if (orderRows.length <= 1) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    const orderHeaderMap = new HeaderMap(orderRows[0].values, this.orderMapper.requiredHeaders);
    let targetRowIndex = -1;
    let existingOrder: Order | null = null;

    for (let i = 1; i < orderRows.length; i++) {
      const row = orderRows[i];
      try {
        const order = this.orderMapper.fromRow(row.values, orderHeaderMap);
        if (order.id === orderId) {
          if (order.tenantId !== context.tenantId || order.storeId !== context.storeId) {
            throw new UnauthorizedDataAccessError(`Unauthorized access to order ${orderId}`);
          }
          targetRowIndex = row.rowNumber;
          existingOrder = order;
          break;
        }
      } catch (err) {
        if (err instanceof UnauthorizedDataAccessError) {
          throw err;
        }
        // Skip
      }
    }

    if (targetRowIndex === -1 || !existingOrder) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    if (existingOrder.status === 'CANCELLED' && newStatus !== 'CANCELLED') {
      throw new Error('Cannot transition cancelled order');
    }

    existingOrder.status = newStatus;
    if (newStatus === 'CANCELLED' && cancellationDetails) {
      if (cancellationDetails.cancellationReason) {
        existingOrder.cancellationReason = cancellationDetails.cancellationReason;
      }
      if (cancellationDetails.cancelledBy) {
        existingOrder.cancelledBy = cancellationDetails.cancelledBy;
      }
      existingOrder.cancelledAt = cancellationDetails.cancelledAt || new Date();
    }
    existingOrder.updatedAt = new Date();

    const updatedRowValues = this.orderMapper.toRow(existingOrder, orderHeaderMap);
    await this.transport.updateRow(this.orderMapper.sheetName, targetRowIndex, updatedRowValues);

    // Read-back verification
    const verified = await this.getOrderById(orderId, context);
    if (!verified || verified.status !== newStatus) {
      throw new Error(`Order status update read-back verification failed for ${orderId}`);
    }

    return verified;
  }

  public async updatePaymentStatus(
    orderId: string,
    newPaymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED',
    context: DataOperationContext
  ): Promise<Order> {
    await this.ensureTabsExist();

    const orderRows = await this.transport.getRows(this.orderMapper.sheetName);
    if (orderRows.length <= 1) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    const orderHeaderMap = new HeaderMap(orderRows[0].values, this.orderMapper.requiredHeaders);
    let targetRowIndex = -1;
    let existingOrder: Order | null = null;

    for (let i = 1; i < orderRows.length; i++) {
      const row = orderRows[i];
      try {
        const order = this.orderMapper.fromRow(row.values, orderHeaderMap);
        if (order.id === orderId) {
          if (order.tenantId !== context.tenantId || order.storeId !== context.storeId) {
            throw new UnauthorizedDataAccessError(`Unauthorized access to order ${orderId}`);
          }
          targetRowIndex = row.rowNumber;
          existingOrder = order;
          break;
        }
      } catch (err) {
        if (err instanceof UnauthorizedDataAccessError) {
          throw err;
        }
        // Skip
      }
    }

    if (targetRowIndex === -1 || !existingOrder) {
      throw new DataNotFoundError(`Order ${orderId} not found`);
    }

    existingOrder.paymentStatus = newPaymentStatus;
    existingOrder.updatedAt = new Date();

    const updatedRowValues = this.orderMapper.toRow(existingOrder, orderHeaderMap);
    await this.transport.updateRow(this.orderMapper.sheetName, targetRowIndex, updatedRowValues);

    // Read-back verification
    const verified = await this.getOrderById(orderId, context);
    if (!verified || verified.paymentStatus !== newPaymentStatus) {
      throw new Error(`Payment status update read-back verification failed for ${orderId}`);
    }

    return verified;
  }

  public async clear(): Promise<void> {
    this.dailySequence.clear();
    this.initializedTabs = false;
  }
}
