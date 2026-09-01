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

  public async ensureSchema(): Promise<{ ordersAdded: string[]; orderItemsAdded: string[] }> {
    try {
      if (this.transport.ensureSheetExists) {
        await this.transport.ensureSheetExists(this.orderMapper.sheetName);
        await this.transport.ensureSheetExists(this.orderItemMapper.sheetName);
      } else if (this.transport.createSheet) {
        await this.transport.createSheet(this.orderMapper.sheetName);
        await this.transport.createSheet(this.orderItemMapper.sheetName);
      }
    } catch (err) {
      console.warn('[GoogleSheetsOrderStore] Tab creation warning:', err);
    }

    const ordersAdded: string[] = [];
    const orderItemsAdded: string[] = [];

    // 1. Self-healing for 'orders' sheet
    try {
      const orderRows = await this.transport.getRows(this.orderMapper.sheetName);
      if (orderRows.length === 0) {
        if (this.transport.writeHeaderRow) {
          await this.transport.writeHeaderRow(this.orderMapper.sheetName, this.orderMapper.defaultHeaders);
        } else {
          await this.transport.addRow(this.orderMapper.sheetName, this.orderMapper.defaultHeaders);
        }
        ordersAdded.push(...this.orderMapper.defaultHeaders);
      } else {
        const existingHeaders = orderRows[0].values || [];
        const existingMap = new HeaderMap(existingHeaders, []);
        
        const missingOrderHeaders = this.orderMapper.defaultHeaders.filter(h => !existingMap.hasHeader(h));
        if (missingOrderHeaders.length > 0) {
          const updatedOrderHeaders = [...existingHeaders, ...missingOrderHeaders];
          if (this.transport.writeHeaderRow) {
            await this.transport.writeHeaderRow(this.orderMapper.sheetName, updatedOrderHeaders);
          } else {
            await this.transport.updateRow(this.orderMapper.sheetName, 1, updatedOrderHeaders);
          }
          ordersAdded.push(...missingOrderHeaders);
        }
      }
    } catch (err) {
      console.warn('[GoogleSheetsOrderStore] Order schema self-healing notice:', err);
    }

    // 2. Self-healing for 'order_items' sheet
    try {
      const itemRows = await this.transport.getRows(this.orderItemMapper.sheetName);
      if (itemRows.length === 0) {
        if (this.transport.writeHeaderRow) {
          await this.transport.writeHeaderRow(this.orderItemMapper.sheetName, this.orderItemMapper.defaultHeaders);
        } else {
          await this.transport.addRow(this.orderItemMapper.sheetName, this.orderItemMapper.defaultHeaders);
        }
        orderItemsAdded.push(...this.orderItemMapper.defaultHeaders);
      } else {
        const existingItemHeaders = itemRows[0].values || [];
        const existingItemMap = new HeaderMap(existingItemHeaders, []);
        
        const missingItemHeaders = this.orderItemMapper.defaultHeaders.filter(h => !existingItemMap.hasHeader(h));
        if (missingItemHeaders.length > 0) {
          const updatedItemHeaders = [...existingItemHeaders, ...missingItemHeaders];
          if (this.transport.writeHeaderRow) {
            await this.transport.writeHeaderRow(this.orderItemMapper.sheetName, updatedItemHeaders);
          } else {
            await this.transport.updateRow(this.orderItemMapper.sheetName, 1, updatedItemHeaders);
          }
          orderItemsAdded.push(...missingItemHeaders);
        }
      }
    } catch (err) {
      console.warn('[GoogleSheetsOrderStore] Order items schema self-healing notice:', err);
    }

    this.initializedTabs = true;
    return { ordersAdded, orderItemsAdded };
  }

  private async ensureTabsExist(): Promise<void> {
    await this.ensureSchema();
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

    // 3. READ-BACK VERIFICATION & STRICT FIELD ASSERTION
    const readBackOrder = await this.getOrderById(orderId, context);
    if (!readBackOrder) {
      throw new Error(`Read-back verification failed: Order ${orderId} not found after write`);
    }

    this.assertReadBackOrder(newOrder, readBackOrder);

    return readBackOrder;
  }

  private assertReadBackOrder(expected: Order, actual: Order): void {
    if (actual.id !== expected.id) {
      throw new Error(`Read-back verification mismatch [id]: expected "${expected.id}", got "${actual.id}"`);
    }
    if (actual.tenantId !== expected.tenantId) {
      throw new Error(`Read-back verification mismatch [tenantId]: expected "${expected.tenantId}", got "${actual.tenantId}"`);
    }
    if (actual.storeId !== expected.storeId) {
      throw new Error(`Read-back verification mismatch [storeId]: expected "${expected.storeId}", got "${actual.storeId}"`);
    }
    if (expected.customerName && actual.customerName !== expected.customerName) {
      throw new Error(`Read-back verification mismatch [customerName]: expected "${expected.customerName}", got "${actual.customerName}"`);
    }
    if (expected.customerPhone && actual.customerPhone !== expected.customerPhone) {
      throw new Error(`Read-back verification mismatch [customerPhone]: expected "${expected.customerPhone}", got "${actual.customerPhone}"`);
    }
    if (expected.deliveryAddress && actual.deliveryAddress !== expected.deliveryAddress) {
      throw new Error(`Read-back verification mismatch [deliveryAddress]: expected "${expected.deliveryAddress}", got "${actual.deliveryAddress}"`);
    }
    if (expected.paymentMethodId && actual.paymentMethodId !== expected.paymentMethodId) {
      throw new Error(`Read-back verification mismatch [paymentMethodId]: expected "${expected.paymentMethodId}", got "${actual.paymentMethodId}"`);
    }
    if (expected.paymentMethodName && actual.paymentMethodName !== expected.paymentMethodName) {
      throw new Error(`Read-back verification mismatch [paymentMethodName]: expected "${expected.paymentMethodName}", got "${actual.paymentMethodName}"`);
    }
    if (actual.subtotal !== expected.subtotal) {
      throw new Error(`Read-back verification mismatch [subtotal]: expected ${expected.subtotal}, got ${actual.subtotal}`);
    }
    if (actual.deliveryFee !== expected.deliveryFee) {
      throw new Error(`Read-back verification mismatch [deliveryFee]: expected ${expected.deliveryFee}, got ${actual.deliveryFee}`);
    }
    if (actual.totalAmount !== expected.totalAmount) {
      throw new Error(`Read-back verification mismatch [totalAmount]: expected ${expected.totalAmount}, got ${actual.totalAmount}`);
    }

    // Items assertions
    if (actual.items.length !== expected.items.length) {
      throw new Error(`Read-back verification mismatch [items length]: expected ${expected.items.length}, got ${actual.items.length}`);
    }

    for (let i = 0; i < expected.items.length; i++) {
      const expItem = expected.items[i];
      const actItem = actual.items.find(it => it.productId === expItem.productId || it.id === expItem.id);
      if (!actItem) {
        throw new Error(`Read-back verification mismatch [item missing]: item for product ${expItem.productId} not found`);
      }
      if (expItem.productNameSnapshot && actItem.productNameSnapshot !== expItem.productNameSnapshot) {
        throw new Error(`Read-back verification mismatch [productNameSnapshot]: expected "${expItem.productNameSnapshot}", got "${actItem.productNameSnapshot}"`);
      }
      if (actItem.quantity !== expItem.quantity) {
        throw new Error(`Read-back verification mismatch [quantity]: expected ${expItem.quantity}, got ${actItem.quantity}`);
      }
      if (actItem.unitPriceSnapshot !== expItem.unitPriceSnapshot) {
        throw new Error(`Read-back verification mismatch [unitPrice]: expected ${expItem.unitPriceSnapshot}, got ${actItem.unitPriceSnapshot}`);
      }
      if (actItem.totalPrice !== expItem.totalPrice) {
        throw new Error(`Read-back verification mismatch [totalPrice]: expected ${expItem.totalPrice}, got ${actItem.totalPrice}`);
      }
    }
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
