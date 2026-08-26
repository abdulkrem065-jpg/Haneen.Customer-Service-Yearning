import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleSheetsOrderStore } from './orders/google-sheets-order-store';
import { OrderStore } from './orders/order-store';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { AdminNotifier, IOrderNotificationService, AdminNotificationRecord } from './orders/admin-notifier';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { DataOperationContext } from './data/provider';
import { CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ConversationSession } from './productization/session-store';
import fs from 'fs';
import path from 'path';

describe('CMD-088 — REAL ADMIN ORDER NOTIFICATION & CUSTOMER ORDER VISIBILITY', () => {
  let mockTransport: MockGoogleSheetsTransport;
  let googleSheetsOrderStore: GoogleSheetsOrderStore;
  let orderStore: OrderStore;
  let adminNotifier: AdminNotifier;
  let checkoutEngine: OrderCheckoutEngine;
  const testNotifPath = path.join(process.cwd(), 'data', 'test_cmd_088_admin_notifs.json');

  const context: DataOperationContext = {
    tenantId: CANONICAL_TENANT_ID,
    storeId: CANONICAL_STORE_ID
  };

  function createTestSession(id: string): ConversationSession {
    return {
      conversationId: id,
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: 'sana-agent',
      status: 'ACTIVE',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: {
        cart: [
          {
            productId: 'prod-01',
            productName: 'أناناس طازج',
            quantity: 2,
            unitPriceSnapshot: 500,
            subtotal: 1000
          }
        ],
        step: 'AWAITING_CONFIRMATION',
        deliveryAddress: 'صنعاء - شارع النصر',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش عند الاستلام',
        deliveryFee: 500
      }
    };
  }

  beforeEach(() => {
    if (fs.existsSync(testNotifPath)) {
      try { fs.unlinkSync(testNotifPath); } catch (e) {}
    }

    mockTransport = new MockGoogleSheetsTransport();
    googleSheetsOrderStore = new GoogleSheetsOrderStore(mockTransport);

    OrderStore.resetInstance();
    orderStore = OrderStore.getInstance(googleSheetsOrderStore);

    AdminNotifier.resetInstance();
    adminNotifier = AdminNotifier.getInstance(testNotifPath);

    checkoutEngine = new OrderCheckoutEngine(
      undefined,
      undefined,
      undefined,
      orderStore,
      adminNotifier
    );
  });

  it('1. notification service abstraction - verifies IOrderNotificationService is injectable and decoupled', async () => {
    class MockNotificationService implements IOrderNotificationService {
      public called = false;
      async notifyNewOrder(order: any, ctx: any) {
        this.called = true;
        return { success: true, notificationId: 'notif-mock-1', status: 'PENDING' as const };
      }
      getNotifications(ctx: any) { return []; }
      clear() {}
    }

    const mockService = new MockNotificationService();
    const customEngine = new OrderCheckoutEngine(
      undefined,
      undefined,
      undefined,
      orderStore,
      mockService
    );

    const session = createTestSession('conv-001');
    const reply = await customEngine.handleCheckoutMessage('نعم أؤكد الطلب', session, context);

    expect(mockService.called).toBe(true);
    expect(reply).toContain('تم استلام طلبك بنجاح');
  });

  it('2. pending state - verifies default notification status is PENDING in durable store', async () => {
    const order = await orderStore.createOrder({
      customerId: 'cst-02',
      customerPhone: '777123456',
      items: [{ productId: 'p1', productNameSnapshot: 'جبن ممتاز', quantity: 1, unitPriceSnapshot: 1200 }],
      subtotal: 1200,
      deliveryFee: 500,
      totalAmount: 1700,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'حي الزبيري'
    }, context);

    const res = await adminNotifier.notifyNewOrder(order, context);

    expect(res.success).toBe(true);
    expect(res.status).toBe('PENDING');

    const notifs = adminNotifier.getNotifications(context);
    expect(notifs.length).toBe(1);
    expect(notifs[0].status).toBe('PENDING');
  });

  it('3. sent state - verifies notification status is SENT when external adapter acknowledges delivery', async () => {
    const mockAdapter = {
      async sendNotification(content: string, destination?: string) {
        return true;
      }
    };

    adminNotifier.setChannelAdapter(mockAdapter);

    const order = await orderStore.createOrder({
      customerId: 'cst-03',
      customerPhone: '777123456',
      items: [{ productId: 'p1', productNameSnapshot: 'عسل سدر', quantity: 1, unitPriceSnapshot: 5000 }],
      subtotal: 5000,
      deliveryFee: 500,
      totalAmount: 5500,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'شارع حدة'
    }, context);

    const res = await adminNotifier.notifyNewOrder(order, context);

    expect(res.success).toBe(true);
    expect(res.status).toBe('SENT');
  });

  it('4. failed state - verifies notification status is FAILED when channel adapter fails', async () => {
    const mockFailingAdapter = {
      async sendNotification(content: string, destination?: string) {
        return false;
      }
    };

    adminNotifier.setChannelAdapter(mockFailingAdapter);

    const order = await orderStore.createOrder({
      customerId: 'cst-04',
      customerPhone: '777123456',
      items: [{ productId: 'p1', productNameSnapshot: 'تمر خلاص', quantity: 1, unitPriceSnapshot: 2000 }],
      subtotal: 2000,
      deliveryFee: 500,
      totalAmount: 2500,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء القديمة'
    }, context);

    const res = await adminNotifier.notifyNewOrder(order, context);

    expect(res.success).toBe(false);
    expect(res.status).toBe('FAILED');
  });

  it('5. order/notification separation - verifies order persists even when notification fails', async () => {
    class FailingNotificationService implements IOrderNotificationService {
      async notifyNewOrder(order: any, ctx: any) {
        return { success: false, notificationId: 'notif-fail', status: 'FAILED' as const };
      }
      getNotifications(ctx: any) { return []; }
      clear() {}
    }

    const failingService = new FailingNotificationService();
    const customEngine = new OrderCheckoutEngine(
      undefined,
      undefined,
      undefined,
      orderStore,
      failingService
    );

    const session = createTestSession('conv-sep-1');
    const reply = await customEngine.handleCheckoutMessage('نعم أؤكد الطلب', session, context);

    expect(reply).toBeDefined();
    expect(reply).toContain('ORD-');
    expect(reply).toContain('تعذر إرسال إشعار تلقائي للإدارة');

    const createdId = session.checkoutState.createdOrderId;
    expect(createdId).toBeDefined();

    const savedOrder = await orderStore.getOrderById(createdId!, context);
    expect(savedOrder).toBeDefined();
    expect(savedOrder?.id).toBe(createdId);
  });

  it('6. customer phone integrity - verifies customer phone remains empty/null if omitted without store fallbacks', async () => {
    const session = createTestSession('conv-phone-1');
    session.checkoutState.customerPhone = undefined;

    await checkoutEngine.handleCheckoutMessage('نعم أؤكد', session, context);

    const createdId = session.checkoutState.createdOrderId;
    const savedOrder = await orderStore.getOrderById(createdId!, context);

    expect(savedOrder).toBeDefined();
    expect(savedOrder?.customerPhone).toBe('');
    expect(savedOrder?.customerPhone).not.toContain('770493341'); // Should not fallback to store number
  });

  it('7. notification content - verifies notification contains all required business details', async () => {
    const order = await orderStore.createOrder({
      customerId: 'cst-07',
      customerPhone: '771122334',
      items: [{ productId: 'p1', productNameSnapshot: 'حليب يماني', quantity: 3, unitPriceSnapshot: 400 }],
      subtotal: 1200,
      deliveryFee: 500,
      totalAmount: 1700,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'شارع الأربعين'
    }, context);

    await adminNotifier.notifyNewOrder(order, context);
    const notifs = adminNotifier.getNotifications(context);

    expect(notifs.length).toBe(1);
    const content = notifs[0].content;

    expect(content).toContain(order.id);
    expect(content).toContain('771122334');
    expect(content).toContain('حليب يماني');
    expect(content).toContain('1200 YER');
    expect(content).toContain('500 YER');
    expect(content).toContain('1700 YER');
    expect(content).toContain('كاش عند الاستلام');
    expect(content).toContain('شارع الأربعين');
    expect(content).toContain('PENDING');
  });

  it('8. destination validation - verifies admin destination is dynamically loaded without hardcoding', async () => {
    adminNotifier.setDestinationSupplier(async () => 'https://wa.me/967770493341');

    const order = await orderStore.createOrder({
      customerId: 'cst-08',
      customerPhone: '777000111',
      items: [{ productId: 'p1', productNameSnapshot: 'أرز بسمتي', quantity: 1, unitPriceSnapshot: 8000 }],
      subtotal: 8000,
      deliveryFee: 500,
      totalAmount: 8500,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'حي الروضة'
    }, context);

    await adminNotifier.notifyNewOrder(order, context);
    const notifs = adminNotifier.getNotifications(context);

    expect(notifs[0].destination).toBe('https://wa.me/967770493341');
  });

  it('9. order remains if notification throws error - verifies order safety', async () => {
    class ExceptionNotificationService implements IOrderNotificationService {
      async notifyNewOrder(order: any, ctx: any): Promise<any> {
        throw new Error('Network timeout during notification');
      }
      getNotifications(ctx: any) { return []; }
      clear() {}
    }

    const exceptionEngine = new OrderCheckoutEngine(
      undefined,
      undefined,
      undefined,
      orderStore,
      new ExceptionNotificationService()
    );

    const session = createTestSession('conv-err-1');
    const reply = await exceptionEngine.handleCheckoutMessage('نعم أؤكد', session, context);

    expect(reply).toBeDefined();
    expect(reply).toContain('ORD-');

    const createdId = session.checkoutState.createdOrderId;
    const savedOrder = await orderStore.getOrderById(createdId!, context);

    expect(savedOrder).toBeDefined();
    expect(savedOrder?.id).toBe(createdId);
  });

  it('10. no duplicate order - verifies idempotency on repeated confirmation messages', async () => {
    const session = createTestSession('conv-dup-1');

    const reply1 = await checkoutEngine.handleCheckoutMessage('نعم أؤكد', session, context);
    const orderId1 = session.checkoutState.createdOrderId;

    const reply2 = await checkoutEngine.handleCheckoutMessage('نعم أؤكد', session, context);
    const orderId2 = session.checkoutState.createdOrderId;

    expect(orderId1).toBe(orderId2);
    expect(reply2).toContain('تم استلام طلبك سابقاً بنجاح');

    const allOrders = await orderStore.getOrders(context);
    const matching = allOrders.filter(o => o.id === orderId1);
    expect(matching.length).toBe(1);
  });

  it('11. status update - verifies Admin can update order status in GoogleSheetsOrderStore', async () => {
    const order = await orderStore.createOrder({
      customerId: 'cst-11',
      customerPhone: '777222333',
      items: [{ productId: 'p1', productNameSnapshot: 'عصير طازج', quantity: 2, unitPriceSnapshot: 300 }],
      subtotal: 600,
      deliveryFee: 500,
      totalAmount: 1100,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'شارع بغداد'
    }, context);

    expect(order.status).toBe('PENDING');

    await orderStore.updateOrderStatus(order.id, 'CONFIRMED', context);
    const confirmedOrder = await orderStore.getOrderById(order.id, context);
    expect(confirmedOrder?.status).toBe('CONFIRMED');

    await orderStore.updateOrderStatus(order.id, 'OUT_FOR_DELIVERY', context);
    const deliveringOrder = await orderStore.getOrderById(order.id, context);
    expect(deliveringOrder?.status).toBe('OUT_FOR_DELIVERY');
  });

  it('12. customer status query - verifies customer gets real updated status from OrderStore', async () => {
    const order = await orderStore.createOrder({
      customerId: 'cst-12',
      customerPhone: '777333444',
      items: [{ productId: 'p1', productNameSnapshot: 'كيك شوكولاتة', quantity: 1, unitPriceSnapshot: 1500 }],
      subtotal: 1500,
      deliveryFee: 500,
      totalAmount: 2000,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'شارع صخر'
    }, context);

    await orderStore.updateOrderStatus(order.id, 'READY_FOR_DELIVERY', context);

    const session = createTestSession('conv-query-1');
    session.activeOrderId = order.id;

    const queryReply = await checkoutEngine.handleCheckoutMessage('أين طلبي؟', session, context);

    expect(queryReply).toContain(order.id);
    expect(queryReply).toContain('جاهز للتوصيل');
  });

  it('13. restart survival - verifies order and notification state survive service re-instantiation', async () => {
    const order = await googleSheetsOrderStore.createOrder({
      customerId: 'cst-13',
      customerPhone: '777444555',
      items: [{ productId: 'p1', productNameSnapshot: 'تمر برحي', quantity: 1, unitPriceSnapshot: 1800 }],
      subtotal: 1800,
      deliveryFee: 500,
      totalAmount: 2300,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء - المطار'
    }, context);

    await adminNotifier.notifyNewOrder(order, context);

    // Simulate restart with new instances reading from same transport/file
    const freshGoogleStore = new GoogleSheetsOrderStore(mockTransport);
    OrderStore.resetInstance();
    const freshOrderStore = OrderStore.getInstance(freshGoogleStore);

    AdminNotifier.resetInstance(false);
    const freshAdminNotifier = AdminNotifier.getInstance(testNotifPath);

    const recoveredOrder = await freshOrderStore.getOrderById(order.id, context);
    expect(recoveredOrder).toBeDefined();
    expect(recoveredOrder?.id).toBe(order.id);

    const recoveredNotifs = freshAdminNotifier.getNotifications(context);
    expect(recoveredNotifs.length).toBe(1);
    expect(recoveredNotifs[0].orderId).toBe(order.id);
  });

  it('14. live notification acceptance / tracking - verifies getNotifications filters by context', async () => {
    const orderA = await orderStore.createOrder({
      customerId: 'cst-14a',
      customerPhone: '777555666',
      items: [{ productId: 'p1', productNameSnapshot: 'منتج أ', quantity: 1, unitPriceSnapshot: 100 }],
      subtotal: 100,
      deliveryFee: 500,
      totalAmount: 600,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'عنوان أ'
    }, context);

    await adminNotifier.notifyNewOrder(orderA, context);

    const otherContext: DataOperationContext = {
      tenantId: 'tnt-other',
      storeId: 'str-other'
    };

    const notifsCanonical = adminNotifier.getNotifications(context);
    const notifsOther = adminNotifier.getNotifications(otherContext);

    expect(notifsCanonical.length).toBe(1);
    expect(notifsOther.length).toBe(0);
  });

  it('15. no secrets in notification - verifies sanitization strips API keys and bearer tokens', async () => {
    const secretOrder = await orderStore.createOrder({
      customerId: 'cst-15',
      customerPhone: '777666777',
      items: [{ productId: 'p1', productNameSnapshot: 'منتج عادي', quantity: 1, unitPriceSnapshot: 500 }],
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش - AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6', // Mock key embedded
      paymentStatus: 'UNPAID',
      deliveryAddress: 'عنوان - bearer token_secret_xyz123'
    }, context);

    await adminNotifier.notifyNewOrder(secretOrder, context);
    const notifs = adminNotifier.getNotifications(context);

    expect(notifs.length).toBe(1);
    const content = notifs[0].content;

    expect(content).not.toContain('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6');
    expect(content).toContain('[REDACTED_API_KEY]');
    expect(content).not.toContain('bearer token_secret_xyz123');
    expect(content).toContain('Bearer [REDACTED_TOKEN]');
  });
});
