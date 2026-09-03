import { describe, it, expect, beforeEach } from 'vitest';
import { AdminNotifier, AdminNotificationRecord } from './orders/admin-notifier';
import { OrderStore } from './orders/order-store';
import { GoogleSheetsOrderStore } from './orders/google-sheets-order-store';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { DataOperationContext } from './data/provider';
import { Order } from './data/domain';
import { ConversationSession } from './productization/session-store';

describe('CMD-092: Real-Time Zero-Cost Admin Order Alerts Test Suite', () => {
  const canonicalContext: DataOperationContext = {
    tenantId: 'tnt-41f0d530',
    storeId: 'str-2c6ad81f'
  };

  const otherTenantContext: DataOperationContext = {
    tenantId: 'tnt-other-9999',
    storeId: 'str-2c6ad81f'
  };

  const otherStoreContext: DataOperationContext = {
    tenantId: 'tnt-41f0d530',
    storeId: 'str-other-8888'
  };

  let notifier: AdminNotifier;
  let transport: MockGoogleSheetsTransport;
  let orderStore: OrderStore;
  let checkoutEngine: OrderCheckoutEngine;

  beforeEach(() => {
    AdminNotifier.resetInstance(true);
    notifier = AdminNotifier.getInstance();
    notifier.clear();

    transport = new MockGoogleSheetsTransport();
    const googleStore = new GoogleSheetsOrderStore(transport);
    OrderStore.resetInstance(googleStore);
    orderStore = OrderStore.getInstance();

    checkoutEngine = new OrderCheckoutEngine(
      async () => [
        {
          id: 'prd-001',
          tenantId: canonicalContext.tenantId,
          storeId: canonicalContext.storeId,
          name: 'زبادي المراعي',
          price: 500,
          currency: 'YER',
          inStock: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      async () => ({
        id: 'dc-001',
        tenantId: canonicalContext.tenantId,
        storeId: canonicalContext.storeId,
        isEnabled: true,
        deliveryFee: 1000,
        currency: 'YER',
        minimumOrderAmount: 2000,
        cashOnDeliveryEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      async () => [
        {
          id: 'pm-001',
          tenantId: canonicalContext.tenantId,
          storeId: canonicalContext.storeId,
          methodType: 'cash_on_delivery',
          displayName: 'كاش عند الاستلام',
          isActive: true,
          displayOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      orderStore
    );
  });

  it('1. new order event: should generate admin notification record on new order creation', async () => {
    const order: Order = {
      id: 'ord-test-101',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      subtotal: 1000,
      deliveryFee: 500,
      totalAmount: 1500,
      currency: 'YER',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentMethodId: 'pm-001',
      paymentMethodName: 'كاش عند الاستلام',
      customerName: 'علي أحمد',
      customerPhone: '771234567',
      deliveryAddress: 'صنعاء - التحرير',
      customerId: 'c-test-101',
      updatedAt: new Date(),
      items: [
        {
          id: 'item-101',
          orderId: 'ord-test-101',
          productId: 'prd-001',
          productNameSnapshot: 'زبادي المراعي',
          unitPriceSnapshot: 500,
          unitPrice: 500,
          quantity: 2,
          totalPrice: 1000
        }
      ],
      createdAt: new Date()
    };

    const res = await notifier.notifyNewOrder(order, canonicalContext);
    expect(res.success).toBe(true);
    expect(res.notificationId).toBeDefined();

    const notifs = notifier.getNotifications(canonicalContext);
    expect(notifs.length).toBe(1);
    expect(notifs[0].orderId).toBe('ord-test-101');
  });

  it('2. admin alert: notification payload must contain complete order details', async () => {
    const order: Order = {
      id: 'ord-alert-102',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 2000,
      deliveryFee: 1000,
      totalAmount: 3000,
      currency: 'YER',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentMethodName: 'كاش عند الاستلام',
      customerName: 'فاطمة صالح',
      customerPhone: '779988776',
      deliveryAddress: 'صنعاء - حدة',
      items: [
        {
          id: 'item-102',
          orderId: 'ord-alert-102',
          productId: 'prd-001',
          productNameSnapshot: 'زبادي المراعي',
          unitPriceSnapshot: 1000,
          unitPrice: 1000,
          quantity: 2,
          totalPrice: 2000
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await notifier.notifyNewOrder(order, canonicalContext);
    const notifs = notifier.getNotifications(canonicalContext);
    const content = notifs[0].content;

    expect(content).toContain('ord-alert-102');
    expect(content).toContain('779988776');
    expect(content).toContain('زبادي المراعي');
    expect(content).toContain('3000 YER');
    expect(content).toContain('كاش عند الاستلام');
    expect(content).toContain('صنعاء - حدة');
    expect(content).toContain('PENDING');
  });

  it('3. notification payload: must sanitize sensitive API keys or secrets', async () => {
    const order: Order = {
      id: 'ord-secret-103',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      status: 'PENDING',
      paymentMethodName: 'key=AIzaSySecretApiKeyHere',
      deliveryAddress: 'secret=my_secret_key',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await notifier.notifyNewOrder(order, canonicalContext);
    const notifs = notifier.getNotifications(canonicalContext);
    expect(notifs[0].content).not.toContain('AIzaSySecretApiKeyHere');
    expect(notifs[0].content).toContain('[REDACTED_API_KEY]');
  });

  it('4. unread state: new notifications default to isRead: false / UNREAD', async () => {
    const order: Order = {
      id: 'ord-unread-104',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      status: 'PENDING',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await notifier.notifyNewOrder(order, canonicalContext);
    const notifs = notifier.getNotifications(canonicalContext);
    expect(notifs[0].isRead).toBe(false);
    expect(notifier.getUnreadCount(canonicalContext)).toBe(1);
  });

  it('5. read state: markAsRead must update isRead to true and decrement unread count', async () => {
    const order: Order = {
      id: 'ord-read-105',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      status: 'PENDING',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await notifier.notifyNewOrder(order, canonicalContext);
    expect(notifier.getUnreadCount(canonicalContext)).toBe(1);

    const updated = notifier.markAsRead('ord-read-105', canonicalContext);
    expect(updated).toBe(true);
    expect(notifier.getUnreadCount(canonicalContext)).toBe(0);

    const notifs = notifier.getNotifications(canonicalContext);
    expect(notifs[0].isRead).toBe(true);
  });

  it('6. live refresh mechanism: getNotifications reflects live updates automatically', async () => {
    expect(notifier.getNotifications(canonicalContext).length).toBe(0);

    const order1: Order = {
      id: 'ord-live-106A',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      status: 'PENDING',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await notifier.notifyNewOrder(order1, canonicalContext);

    expect(notifier.getNotifications(canonicalContext).length).toBe(1);

    const order2: Order = {
      id: 'ord-live-106B',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 800,
      deliveryFee: 500,
      totalAmount: 1300,
      currency: 'YER',
      status: 'PENDING',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await notifier.notifyNewOrder(order2, canonicalContext);

    expect(notifier.getNotifications(canonicalContext).length).toBe(2);
    expect(notifier.getUnreadCount(canonicalContext)).toBe(2);
  });

  it('7. order/notification separation: notification failure must NOT corrupt order creation', async () => {
    const failingNotifier = new AdminNotifier(undefined, {
      channelAdapter: {
        sendNotification: async () => {
          throw new Error('Simulated External Notification Adapter Crash');
        }
      }
    });

    const createdOrder = await orderStore.createOrder(
      {
        customerId: 'cust-test',
        deliveryAddress: 'صنعاء - الصافية',
        paymentMethodId: 'pm-001',
        paymentMethodName: 'كاش عند الاستلام',
        subtotal: 1000,
        deliveryFee: 1000,
        totalAmount: 2000,
        currency: 'YER',
        items: []
      },
      canonicalContext
    );

    const notifRes = await failingNotifier.notifyNewOrder(createdOrder, canonicalContext);
    expect(notifRes.status).toBe('FAILED');

    const retrievedOrder = await orderStore.getOrderById(createdOrder.id, canonicalContext);
    expect(retrievedOrder).toBeDefined();
    expect(retrievedOrder?.id).toBe(createdOrder.id);
  });

  it('8. tenant isolation: notifications from tenant A must not leak to tenant B', async () => {
    const orderA: Order = {
      id: 'ord-tenantA-108',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      status: 'PENDING',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await notifier.notifyNewOrder(orderA, canonicalContext);

    const tenantANotifs = notifier.getNotifications(canonicalContext);
    const tenantBNotifs = notifier.getNotifications(otherTenantContext);

    expect(tenantANotifs.length).toBe(1);
    expect(tenantBNotifs.length).toBe(0);
  });

  it('9. store isolation: notifications from store A must not leak to store B', async () => {
    const orderStoreA: Order = {
      id: 'ord-storeA-109',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      status: 'PENDING',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await notifier.notifyNewOrder(orderStoreA, canonicalContext);

    const storeANotifs = notifier.getNotifications(canonicalContext);
    const storeBNotifs = notifier.getNotifications(otherStoreContext);

    expect(storeANotifs.length).toBe(1);
    expect(storeBNotifs.length).toBe(0);
  });

  it('10. customer phone integrity: missing customer phone must stay empty/null without 777123456 fallback', async () => {
    const order: Order = {
      id: 'ord-nophone-110',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      status: 'PENDING',
      customerPhone: undefined,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await notifier.notifyNewOrder(order, canonicalContext);
    const notifs = notifier.getNotifications(canonicalContext);

    expect(notifs[0].content).not.toContain('777123456');
    expect(notifs[0].content).toContain('هاتف العميل: غير محدد');
  });

  it('11. order status change: admin updating order status persists in OrderStore and maintains notification integrity', async () => {
    const created = await orderStore.createOrder(
      {
        customerId: 'cust-test',
        deliveryAddress: 'صنعاء - المطار',
        paymentMethodId: 'pm-001',
        paymentMethodName: 'كاش عند الاستلام',
        subtotal: 1500,
        deliveryFee: 500,
        totalAmount: 2000,
        currency: 'YER',
        items: []
      },
      canonicalContext
    );

    await notifier.notifyNewOrder(created, canonicalContext);

    const updated = await orderStore.updateOrderStatus(created.id, 'CONFIRMED', canonicalContext);
    expect(updated.status).toBe('CONFIRMED');

    const freshOrder = await orderStore.getOrderById(created.id, canonicalContext);
    expect(freshOrder?.status).toBe('CONFIRMED');
  });

  it('12. customer status query: customer querying order status gets updated real-time status', async () => {
    const created = await orderStore.createOrder(
      {
        customerId: 'cust-test',
        deliveryAddress: 'صنعاء - السبعين',
        paymentMethodId: 'pm-001',
        paymentMethodName: 'كاش عند الاستلام',
        subtotal: 2000,
        deliveryFee: 1000,
        totalAmount: 3000,
        currency: 'YER',
        items: []
      },
      canonicalContext
    );

    await orderStore.updateOrderStatus(created.id, 'CONFIRMED', canonicalContext);

    const session: ConversationSession = {
      conversationId: 'conv-123',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      agentId: canonicalContext.agentId,
      messages: [],
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      activeOrderId: created.id,
      checkoutState: {
        step: 'ORDER_CREATED',
        cart: [],
        createdOrderId: created.id
      }
    };

    const statusMsg = await checkoutEngine.handleCheckoutMessage('أين طلبي؟', session, canonicalContext);
    expect(statusMsg).toContain(created.id);
    expect(statusMsg).toContain('CONFIRMED');
  });

  it('13. duplicate notification prevention: syncFromOrders does not duplicate notification records', async () => {
    const order1: Order = {
      id: 'ord-dedup-113',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'c1',
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      status: 'PENDING',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await notifier.notifyNewOrder(order1, canonicalContext);
    expect(notifier.getNotifications(canonicalContext).length).toBe(1);

    const added = notifier.syncFromOrders([order1], canonicalContext);
    expect(added).toBe(0);
    expect(notifier.getNotifications(canonicalContext).length).toBe(1);
  });

  it('14. restart survival: syncFromOrders derives notifications from persistent order store after simulated restart', async () => {
    const persistentOrder = await orderStore.createOrder(
      {
        customerId: 'cust-test',
        deliveryAddress: 'صنعاء - الروضة',
        paymentMethodId: 'pm-001',
        paymentMethodName: 'كاش عند الاستلام',
        subtotal: 2000,
        deliveryFee: 500,
        totalAmount: 2500,
        currency: 'YER',
        items: []
      },
      canonicalContext
    );

    AdminNotifier.resetInstance(false);
    const freshNotifier = AdminNotifier.getInstance();

    const ordersInStore = await orderStore.getOrders(canonicalContext);
    expect(ordersInStore.length).toBeGreaterThanOrEqual(1);

    freshNotifier.syncFromOrders(ordersInStore, canonicalContext);
    const notifications = freshNotifier.getNotifications(canonicalContext);

    expect(notifications.some(n => n.orderId === persistentOrder.id)).toBe(true);
  });

  it('15. no false delivery claim: checkout engine reports notification state accurately without false success claims', async () => {
    const failingNotifier = new AdminNotifier(undefined, {
      channelAdapter: {
        sendNotification: async () => false
      }
    });

    const customCheckoutEngine = new OrderCheckoutEngine(
      async () => [{ id: 'prd-001', tenantId: canonicalContext.tenantId, storeId: canonicalContext.storeId, name: 'زبادي', price: 500, currency: 'YER', inStock: true, createdAt: new Date(), updatedAt: new Date() }],
      async () => ({ id: 'dc-001', tenantId: canonicalContext.tenantId, storeId: canonicalContext.storeId, isEnabled: true, deliveryFee: 1000, currency: 'YER', minimumOrderAmount: 2000, cashOnDeliveryEnabled: true, createdAt: new Date(), updatedAt: new Date() }),
      async () => [{ id: 'pm-001', tenantId: canonicalContext.tenantId, storeId: canonicalContext.storeId, methodType: 'cash_on_delivery', displayName: 'كاش', isActive: true, displayOrder: 1, createdAt: new Date(), updatedAt: new Date() }],
      orderStore,
      failingNotifier
    );

    const session: ConversationSession = {
      conversationId: 'conv-456',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      agentId: canonicalContext.agentId,
      messages: [],
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: {
        step: 'AWAITING_CONFIRMATION',
        cart: [{ productId: 'prd-001', productName: 'زبادي', quantity: 2, unitPriceSnapshot: 500, subtotal: 1000 }],
        deliveryAddress: 'صنعاء - حدة',
        paymentMethodId: 'pm-001',
        paymentMethodName: 'كاش عند الاستلام',
        customerName: 'أحمد',
        customerPhone: '770000000'
      }
    };

    const response = await customCheckoutEngine.handleCheckoutMessage('نعم تأكيد الطلب', session, canonicalContext);
    expect(response).toContain('تم تسجيل طلبك، لكن تعذر إرسال إشعار تلقائي للإدارة حالياً.');
    expect(response).not.toContain('وصل للإدارة');
  });
});
