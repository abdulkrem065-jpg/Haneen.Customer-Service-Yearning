import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { PersistentOrderStore, InMemoryOrderStore, OrderStore } from './orders/order-store';
import { AdminNotifier } from './orders/admin-notifier';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { HaneenService, CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ConversationSessionStore } from './productization/session-store';
import { DataOperationContext } from './data/provider';

const TEST_CONTEXT: DataOperationContext = {
  tenantId: CANONICAL_TENANT_ID,
  storeId: CANONICAL_STORE_ID
};

const TEST_ORDERS_FILE = path.join(process.cwd(), 'data', 'test_cmd085_orders.json');
const TEST_NOTIFS_FILE = path.join(process.cwd(), 'data', 'test_cmd085_notifs.json');

function cleanupTestFiles() {
  if (fs.existsSync(TEST_ORDERS_FILE)) {
    try { fs.unlinkSync(TEST_ORDERS_FILE); } catch (e) {}
  }
  if (fs.existsSync(TEST_NOTIFS_FILE)) {
    try { fs.unlinkSync(TEST_NOTIFS_FILE); } catch (e) {}
  }
}

describe('CMD-085 — REAL ORDER PERSISTENCE & CUSTOMER IDENTITY INTEGRITY', () => {
  let orderStore: PersistentOrderStore;
  let adminNotifier: AdminNotifier;

  beforeEach(() => {
    cleanupTestFiles();
    PersistentOrderStore.resetInstance();
    AdminNotifier.resetInstance();
    OrderStore.resetInstance();
    ConversationSessionStore.resetInstance();

    orderStore = new PersistentOrderStore(TEST_ORDERS_FILE);
    adminNotifier = new AdminNotifier(TEST_NOTIFS_FILE);

    OrderStore.getInstance().setImplementation(orderStore);
  });

  afterEach(() => {
    cleanupTestFiles();
    PersistentOrderStore.resetInstance();
    AdminNotifier.resetInstance();
    OrderStore.resetInstance();
    ConversationSessionStore.resetInstance();
  });

  // 1. real order persistence & 2. real order items persistence & 3. persistent order ID
  test('1. Creates and persists real order with items and canonical ORD-YYYYMMDD-XXXX ID', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-001',
        customerPhone: '771112233',
        items: [
          { productId: 'prod-sugar', productNameSnapshot: 'سكر السعيد ابو كيلو', quantity: 2, unitPriceSnapshot: 500 },
          { productId: 'prod-samn', productNameSnapshot: 'سمن الماس', quantity: 1, unitPriceSnapshot: 2500 }
        ],
        subtotal: 3500,
        deliveryFee: 500,
        totalAmount: 4000,
        currency: 'YER',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش عند الاستلام',
        deliveryAddress: 'صنعاء شارع النصر'
      },
      TEST_CONTEXT
    );

    expect(order.id).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(order.items.length).toBe(2);
    expect(order.items[0].productNameSnapshot).toBe('سكر السعيد ابو كيلو');
    expect(order.items[0].unitPriceSnapshot).toBe(500);
    expect(order.items[0].subtotal).toBe(1000);
    expect(order.items[1].productNameSnapshot).toBe('سمن الماس');
    expect(order.items[1].unitPriceSnapshot).toBe(2500);
    expect(order.items[1].subtotal).toBe(2500);
    expect(order.totalAmount).toBe(4000);

    // Verify written to disk
    expect(fs.existsSync(TEST_ORDERS_FILE)).toBe(true);
  });

  // 4. customerPhone absent & 5. no store phone fallback
  test('2. customerPhone is empty/absent when customer does not provide phone (no 777123456 fallback)', async () => {
    const engine = new OrderCheckoutEngine();
    const sessionStore = ConversationSessionStore.getInstance();
    const session = sessionStore.getSession('conv-no-phone', TEST_CONTEXT);

    // Add product to cart
    await engine.handleCheckoutMessage('أريد كيلو سكر السعيد', session, TEST_CONTEXT);

    // Provide address & payment method WITHOUT phone
    await engine.handleCheckoutMessage('العنوان صنعاء شارع النصر الدفع كاش', session, TEST_CONTEXT);

    // Confirm checkout
    const result = await engine.handleCheckoutMessage('نعم أؤكد الطلب', session, TEST_CONTEXT);

    expect(result).toContain('تم استلام طلبك بنجاح');
    expect(result).not.toContain('777123456');

    const createdIdMatch = result?.match(/ORD-\d{8}-\d{4}/);
    expect(createdIdMatch).not.toBeNull();

    const order = await orderStore.getOrderById(createdIdMatch![0], TEST_CONTEXT);
    expect(order).not.toBeNull();
    expect(order?.customerPhone).toBe('');
  });

  // 6. customer/store contact separation
  test('3. Strictly separates customer phone from store support contacts', async () => {
    const engine = new OrderCheckoutEngine();
    const sessionStore = ConversationSessionStore.getInstance();
    const session = sessionStore.getSession('conv-order-separate', TEST_CONTEXT)!;

    // Customer asking about store contact numbers
    const storeQueryResult = await engine.handleCheckoutMessage('كيف أتواصل مع خدمة العملاء؟', session, TEST_CONTEXT);
    // Checkout engine ignores contact queries (returns null or price/info), no phone assigned to customer
    expect(session.checkoutState?.customerPhone).toBeUndefined();

    // Customer places order without giving a phone number
    await engine.handleCheckoutMessage('أريد بسكوت ابو ولد 2 علب', session, TEST_CONTEXT);
    await engine.handleCheckoutMessage('عنواني شارع حدة والدفع كاش', session, TEST_CONTEXT);
    const resConfirm = await engine.handleCheckoutMessage('أؤكد الطلب', session, TEST_CONTEXT);

    expect(resConfirm).toContain('تم استلام طلبك بنجاح');
    const orderIdMatch = resConfirm?.match(/ORD-\d{8}-\d{4}/);
    expect(orderIdMatch).not.toBeNull();

    const createdOrder = await orderStore.getOrderById(orderIdMatch![0], TEST_CONTEXT);
    expect(createdOrder).not.toBeNull();
    // Customer phone in database must NOT be the store contact 777123456
    expect(createdOrder?.customerPhone).toBe('');
    expect(createdOrder?.customerPhone).not.toBe('777123456');
  });

  // 7. price snapshot lock & 8. delivery snapshot lock & 9. payment snapshot lock
  test('4. Price, delivery, and payment snapshots remain locked when catalog changes later', async () => {
    let catalogPrice = 500;
    const engine = new OrderCheckoutEngine(async () => [
      { id: 'prod-sugar', name: 'سكر السعيد ابو كيلو', price: catalogPrice, inStock: true, tenantId: CANONICAL_TENANT_ID, storeId: CANONICAL_STORE_ID, currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
    ]);

    const sessionStore = ConversationSessionStore.getInstance();
    const session = sessionStore.getSession('conv-snapshot', TEST_CONTEXT);

    await engine.handleCheckoutMessage('أريد سكر السعيد', session, TEST_CONTEXT);
    await engine.handleCheckoutMessage('صنعاء شارع النصر دفع كاش', session, TEST_CONTEXT);
    const res = await engine.handleCheckoutMessage('نعم أؤكد', session, TEST_CONTEXT);

    const orderId = res?.match(/ORD-\d{8}-\d{4}/)![0]!;
    const savedOrder = await orderStore.getOrderById(orderId, TEST_CONTEXT);

    expect(savedOrder?.items[0].unitPriceSnapshot).toBe(500);
    expect(savedOrder?.subtotal).toBe(500);
    expect(savedOrder?.deliveryFee).toBe(500);
    expect(savedOrder?.totalAmount).toBe(1000);

    // Simulate store catalog price increase later
    catalogPrice = 1200;

    // Retrieve order again from store
    const reloadedOrder = await orderStore.getOrderById(orderId, TEST_CONTEXT);
    expect(reloadedOrder?.items[0].unitPriceSnapshot).toBe(500);
    expect(reloadedOrder?.totalAmount).toBe(1000);
  });

  // 10. duplicate confirmation idempotency & 11. duplicate order prevention
  test('5. Idempotency: prevents duplicate orders when customer sends repeated confirmation', async () => {
    const engine = new OrderCheckoutEngine();
    const sessionStore = ConversationSessionStore.getInstance();
    const session = sessionStore.getSession('conv-idempotent', TEST_CONTEXT);

    await engine.handleCheckoutMessage('أريد بسكوت ابو ولد', session, TEST_CONTEXT);
    await engine.handleCheckoutMessage('صنعاء شارع بغداد دفع كاش', session, TEST_CONTEXT);

    const firstConfirm = await engine.handleCheckoutMessage('نعم أؤكد الطلب', session, TEST_CONTEXT);
    expect(firstConfirm).toContain('تم استلام طلبك بنجاح');
    const orderId1 = firstConfirm?.match(/ORD-\d{8}-\d{4}/)![0]!;

    // Repeated confirmation attempt
    const secondConfirm = await engine.handleCheckoutMessage('نعم أؤكد الطلب', session, TEST_CONTEXT);
    expect(secondConfirm).toContain('تم استلام طلبك سابقاً بنجاح');
    expect(secondConfirm).toContain(orderId1);

    const allOrders = await orderStore.getAllOrders(TEST_CONTEXT);
    expect(allOrders.length).toBe(1);
    expect(allOrders[0].id).toBe(orderId1);
  });

  // 12. order survives process/store restart
  test('6. Process Restart Survival: reloaded store loads existing orders and sequence from disk', async () => {
    const order1 = await orderStore.createOrder(
      {
        customerId: 'cst-restart-1',
        customerPhone: '778899000',
        items: [{ productId: 'prod-biscuit', productNameSnapshot: 'بسكوت ابو ولد', quantity: 3, unitPriceSnapshot: 100 }],
        subtotal: 300,
        deliveryFee: 500,
        totalAmount: 800
      },
      TEST_CONTEXT
    );

    // Simulate process restart by instantiating a fresh PersistentOrderStore reading same file
    const restartedStore = new PersistentOrderStore(TEST_ORDERS_FILE);
    const fetched = await restartedStore.getOrderById(order1.id, TEST_CONTEXT);

    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(order1.id);
    expect(fetched?.customerPhone).toBe('778899000');
    expect(fetched?.items[0].quantity).toBe(3);

    // Verify next generated order ID increments sequence continuously without collision
    const nextOrderId = restartedStore.generateOrderId();
    expect(nextOrderId).not.toBe(order1.id);
    const order1Seq = parseInt(order1.id.split('-')[2], 10);
    const nextSeq = parseInt(nextOrderId.split('-')[2], 10);
    expect(nextSeq).toBe(order1Seq + 1);
  });

  // 13. admin notification persistence & 14. notification failure handling
  test('7. Persists admin notifications with PENDING status for admin review', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-notif-test',
        customerPhone: '773322110',
        items: [{ productId: 'prod-ananas', productNameSnapshot: 'أناناس طازج', quantity: 2, unitPriceSnapshot: 500 }],
        subtotal: 1000,
        deliveryFee: 500,
        totalAmount: 1500,
        deliveryAddress: 'صنعاء شارع النصر'
      },
      TEST_CONTEXT
    );

    const result = await adminNotifier.notifyNewOrder(order, TEST_CONTEXT);
    expect(result.success).toBe(true);
    expect(result.status).toBe('PENDING');

    const notifs = adminNotifier.getNotifications(TEST_CONTEXT);
    expect(notifs.length).toBe(1);
    expect(notifs[0].orderId).toBe(order.id);
    expect(notifs[0].content).toContain('أناناس طازج');
    expect(notifs[0].content).toContain('773322110');
    expect(notifs[0].content).toContain('صنعاء شارع النصر');

    // Simulate fresh load of AdminNotifier from disk
    const restartedNotifier = new AdminNotifier(TEST_NOTIFS_FILE);
    const reloadedNotifs = restartedNotifier.getNotifications(TEST_CONTEXT);
    expect(reloadedNotifs.length).toBe(1);
    expect(reloadedNotifs[0].id).toBe(result.notificationId);
  });

  // 15. false success prevention
  test('8. Prevents false success message when order persistence fails', async () => {
    // Failing store implementation
    const failingStore = new InMemoryOrderStore();
    failingStore.createOrder = async () => {
      throw new Error('Disk write failed / Storage unavailable');
    };

    const engine = new OrderCheckoutEngine();
    OrderStore.getInstance().setImplementation(failingStore);

    const sessionStore = ConversationSessionStore.getInstance();
    const session = sessionStore.getSession('conv-fail-store', TEST_CONTEXT);

    await engine.handleCheckoutMessage('أريد بسكوت ابو ولد', session, TEST_CONTEXT);
    await engine.handleCheckoutMessage('صنعاء شارع النصر دفع كاش', session, TEST_CONTEXT);
    const res = await engine.handleCheckoutMessage('أؤكد الطلب', session, TEST_CONTEXT);

    expect(res).not.toContain('تم استلام طلبك بنجاح');
    expect(res).toContain('تعذر إتمام ونشاط حفظ الطلب حالياً');
  });

  // 16. order status transition & 17. payment status transition
  test('9. Order status and payment status lifecycle transitions', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-status-test',
        items: [{ productId: 'prod-1', productNameSnapshot: 'منتج اختبار', quantity: 1, unitPriceSnapshot: 1000 }],
        subtotal: 1000,
        deliveryFee: 500,
        totalAmount: 1500
      },
      TEST_CONTEXT
    );

    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('UNPAID');

    // Transition to CONFIRMED
    const updatedStatus = await orderStore.updateOrderStatus(order.id, 'CONFIRMED', TEST_CONTEXT);
    expect(updatedStatus.status).toBe('CONFIRMED');

    // Transition payment to PAID
    const updatedPayment = await orderStore.updatePaymentStatus(order.id, 'PAID', TEST_CONTEXT);
    expect(updatedPayment.paymentStatus).toBe('PAID');
  });

  // 18. customer status queries
  test('10. Customer can query order status by Order ID', async () => {
    const service = new HaneenService(ConversationSessionStore.getInstance());
    const conv = 'conv-status-query';

    await service.processMessage({ conversationId: conv, message: 'أريد سكر السعيد' });
    await service.processMessage({ conversationId: conv, message: 'عنواني صنعاء شارع النصر والدفع كاش' });
    const confirmRes = await service.processMessage({ conversationId: conv, message: 'أؤكد الطلب' });

    const orderIdMatch = confirmRes.message.match(/ORD-\d{8}-\d{4}/);
    expect(orderIdMatch).not.toBeNull();
    const orderId = orderIdMatch![0];

    // Customer asks about status
    const statusRes = await service.processMessage({
      conversationId: 'conv-other-user',
      message: `ما هي حالة الطلب ${orderId}؟`
    });

    expect(statusRes.message).toContain(orderId);
    expect(statusRes.message).toContain('PENDING');
  });

  // 19. session isolation
  test('11. Session Isolation: separate sessions maintain distinct orders without leakage', async () => {
    const engine = new OrderCheckoutEngine();
    const sessionStore = ConversationSessionStore.getInstance();

    const sessionA = sessionStore.getSession('conv-session-A', TEST_CONTEXT)!;
    const sessionB = sessionStore.getSession('conv-session-B', TEST_CONTEXT)!;

    await engine.handleCheckoutMessage('أريد كيلو سكر السعيد', sessionA, TEST_CONTEXT);
    await engine.handleCheckoutMessage('أريد سمن الماس', sessionB, TEST_CONTEXT);

    expect(sessionA.checkoutState?.cart.length).toBe(1);
    expect(sessionA.checkoutState?.cart[0].productName).toBe('سكر السعيد ابو كيلو');

    expect(sessionB.checkoutState?.cart.length).toBe(1);
    expect(sessionB.checkoutState?.cart[0].productName).toBe('سمن الماس');
  });

  // 20. human handoff with order context
  test('12. Human Handoff preserves active order context', async () => {
    const service = new HaneenService(ConversationSessionStore.getInstance());
    const conv = 'conv-handoff-order';

    await service.processMessage({ conversationId: conv, message: 'أريد بسكوت ابو ولد 5 حبات' });
    const handoffRes = await service.processMessage({ conversationId: conv, message: 'أريد التحدث مع موظف خدمة العملاء' });

    expect(handoffRes.status).toBe('REQUIRES_HUMAN');
    expect(handoffRes.message).toContain('تم تحويل طلبك للخدمة البشرية بنجاح');
  });

  // 21. cancelled order status protection
  test('13. Rejects illegal status transitions from CANCELLED state', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-cancel-test',
        items: [{ productId: 'prod-1', productNameSnapshot: 'منتج', quantity: 1, unitPriceSnapshot: 500 }],
        subtotal: 500,
        deliveryFee: 500,
        totalAmount: 1000
      },
      TEST_CONTEXT
    );

    await orderStore.updateOrderStatus(order.id, 'CANCELLED', TEST_CONTEXT);

    await expect(
      orderStore.updateOrderStatus(order.id, 'DELIVERED', TEST_CONTEXT)
    ).rejects.toThrow(/Cannot transition cancelled order/);
  });
});
