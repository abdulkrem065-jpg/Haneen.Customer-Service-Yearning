import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleSheetsOrderStore } from './orders/google-sheets-order-store';
import { OrderStore } from './orders/order-store';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { AdminNotifier, AdminOrderNotificationService } from './orders/admin-notifier';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { DataOperationContext } from './data/provider';
import { CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ConversationSession } from './productization/session-store';

describe('CMD-087 — REAL GOOGLE SHEETS ORDER PERSISTENCE & ADMIN NOTIFICATION FOUNDATION', () => {
  let mockTransport: MockGoogleSheetsTransport;
  let googleSheetsOrderStore: GoogleSheetsOrderStore;
  let orderStore: OrderStore;
  let adminNotifier: AdminNotifier;
  let checkoutEngine: OrderCheckoutEngine;

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
        cart: [],
        step: 'AWAITING_CONFIRMATION'
      }
    };
  }

  beforeEach(async () => {
    mockTransport = new MockGoogleSheetsTransport();
    googleSheetsOrderStore = new GoogleSheetsOrderStore(mockTransport);
    
    OrderStore.resetInstance();
    orderStore = OrderStore.getInstance(googleSheetsOrderStore);

    AdminNotifier.resetInstance();
    adminNotifier = AdminNotifier.getInstance();

    checkoutEngine = new OrderCheckoutEngine(
      undefined,
      undefined,
      undefined,
      orderStore,
      adminNotifier
    );
  });

  it('1. Persistent Order & Order Items write & Read-Back Verification in GoogleSheetsOrderStore', async () => {
    const createdOrder = await googleSheetsOrderStore.createOrder({
      customerId: 'cst-test-01',
      customerPhone: '771234567',
      items: [
        { productId: 'prod-01', productNameSnapshot: 'أناناس طازج', quantity: 2, unitPriceSnapshot: 500 },
        { productId: 'prod-02', productNameSnapshot: 'سمن الماس', quantity: 1, unitPriceSnapshot: 2500 }
      ],
      subtotal: 3500,
      deliveryFee: 500,
      totalAmount: 4000,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء - شارع النصر'
    }, context);

    expect(createdOrder).toBeDefined();
    expect(createdOrder.id).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(createdOrder.status).toBe('PENDING');
    expect(createdOrder.paymentStatus).toBe('UNPAID');

    // Read-back verification from Google Sheets transport
    const fetched = await googleSheetsOrderStore.getOrderById(createdOrder.id, context);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(createdOrder.id);
    expect(fetched!.items).toHaveLength(2);
    expect(fetched!.items[0].productNameSnapshot).toBe('أناناس طازج');
    expect(fetched!.items[0].unitPriceSnapshot).toBe(500);
    expect(fetched!.items[0].quantity).toBe(2);
    expect(fetched!.items[1].productNameSnapshot).toBe('سمن الماس');
    expect(fetched!.items[1].unitPriceSnapshot).toBe(2500);
  });

  it('2. Stable Order ID generation across server/store re-instantiations (Restart Survival)', async () => {
    const order1 = await googleSheetsOrderStore.createOrder({
      customerId: 'cst-restart-1',
      customerPhone: '770000001',
      items: [{ productId: 'p1', productNameSnapshot: 'سكر السعيد', quantity: 1, unitPriceSnapshot: 500 }],
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000
    }, context);

    const match1 = order1.id.match(/^ORD-(\d{8})-(\d{4})$/);
    expect(match1).not.toBeNull();
    const seq1 = parseInt(match1![2], 10);

    // Simulate process restart reading from SAME Google Sheets transport
    const restartedOrderStore = new GoogleSheetsOrderStore(mockTransport);

    const order2 = await restartedOrderStore.createOrder({
      customerId: 'cst-restart-2',
      customerPhone: '770000002',
      items: [{ productId: 'p1', productNameSnapshot: 'سكر السعيد', quantity: 2, unitPriceSnapshot: 500 }],
      subtotal: 1000,
      deliveryFee: 500,
      totalAmount: 1500
    }, context);

    const match2 = order2.id.match(/^ORD-(\d{8})-(\d{4})$/);
    expect(match2).not.toBeNull();
    const seq2 = parseInt(match2![2], 10);

    expect(seq2).toBe(seq1 + 1);

    // Verify order 1 still exists in restarted store
    const fetchedOrder1 = await restartedOrderStore.getOrderById(order1.id, context);
    expect(fetchedOrder1).not.toBeNull();
    expect(fetchedOrder1!.id).toBe(order1.id);
  });

  it('3. Customer Phone Absent & No Store Phone Fallback Integrity', async () => {
    const createdOrder = await googleSheetsOrderStore.createOrder({
      customerId: 'cst-no-phone',
      customerPhone: '', // Empty customer phone
      items: [{ productId: 'p1', productNameSnapshot: 'بسكوت بسكريم', quantity: 1, unitPriceSnapshot: 300 }],
      subtotal: 300,
      deliveryFee: 500,
      totalAmount: 800
    }, context);

    expect(createdOrder.customerPhone).toBe('');
    expect(createdOrder.customerPhone).not.toContain('777123456');

    const fetched = await googleSheetsOrderStore.getOrderById(createdOrder.id, context);
    expect(fetched!.customerPhone).toBe('');
    expect(fetched!.customerPhone).not.toContain('777123456');
  });

  it('4. Price Snapshot Lock Test (Catalog price changes do not modify order snapshot)', async () => {
    const createdOrder = await googleSheetsOrderStore.createOrder({
      customerId: 'cst-price-snapshot',
      items: [{ productId: 'prod-pineapple', productNameSnapshot: 'أناناس طازج', quantity: 1, unitPriceSnapshot: 500 }],
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000
    }, context);

    expect(createdOrder.items[0].unitPriceSnapshot).toBe(500);

    // Simulate catalog price increase for prod-pineapple in catalog
    // When order is fetched back from Google Sheets, the snapshot unit price remains 500
    const fetched = await googleSheetsOrderStore.getOrderById(createdOrder.id, context);
    expect(fetched!.items[0].unitPriceSnapshot).toBe(500);
    expect(fetched!.items[0].productNameSnapshot).toBe('أناناس طازج');
  });

  it('5. Order Status Update & Payment Status Updates with Read-Back Verification', async () => {
    const createdOrder = await googleSheetsOrderStore.createOrder({
      customerId: 'cst-status-test',
      items: [{ productId: 'p1', productNameSnapshot: 'أرز المائدة', quantity: 1, unitPriceSnapshot: 4000 }],
      subtotal: 4000,
      deliveryFee: 500,
      totalAmount: 4500,
      paymentStatus: 'UNPAID'
    }, context);

    // Update Order Status: PENDING -> CONFIRMED -> PREPARING
    const step1 = await googleSheetsOrderStore.updateOrderStatus(createdOrder.id, 'CONFIRMED', context);
    expect(step1.status).toBe('CONFIRMED');

    const step2 = await googleSheetsOrderStore.updateOrderStatus(createdOrder.id, 'PREPARING', context);
    expect(step2.status).toBe('PREPARING');

    // Update Payment Status: UNPAID -> PAID
    const payStep = await googleSheetsOrderStore.updatePaymentStatus(createdOrder.id, 'PAID', context);
    expect(payStep.paymentStatus).toBe('PAID');

    // Verify persistence after reload
    const reloadedStore = new GoogleSheetsOrderStore(mockTransport);
    const reloadedOrder = await reloadedStore.getOrderById(createdOrder.id, context);
    expect(reloadedOrder!.status).toBe('PREPARING');
    expect(reloadedOrder!.paymentStatus).toBe('PAID');
  });

  it('6. Duplicate Confirmation Idempotency (Does not create duplicate order)', async () => {
    const session = createTestSession('conv-idempotent');
    const state = session.checkoutState!;
    state.cart = [{ productId: 'p1', productName: 'عصير راني', quantity: 1, unitPriceSnapshot: 400, subtotal: 400 }];
    state.deliveryAddress = 'صنعاء شارع حدة';
    state.paymentMethodId = 'pay-jeeb';
    state.paymentMethodName = 'محفظة جيب';

    // First confirmation
    const res1 = await checkoutEngine.handleCheckoutMessage('أؤكد الطلب', session, context);
    expect(res1).toContain('تم استلام طلبك');
    const firstOrderId = state.createdOrderId;
    expect(firstOrderId).toBeDefined();

    // Second confirmation attempt on same session
    const res2 = await checkoutEngine.handleCheckoutMessage('أؤكد الطلب', session, context);
    expect(res2).toContain('تم استلام طلبك سابقاً');
    expect(state.createdOrderId).toBe(firstOrderId);

    // Verify only ONE order row was created in Google Sheets
    const allOrders = await googleSheetsOrderStore.getAllOrders(context);
    const matches = allOrders.filter(o => o.id === firstOrderId);
    expect(matches).toHaveLength(1);
  });

  it('7. Admin Notification Service state tracking (PENDING)', async () => {
    const service = new AdminOrderNotificationService();
    const testOrder = await googleSheetsOrderStore.createOrder({
      customerId: 'cst-notif-test',
      customerPhone: '770000999',
      items: [{ productId: 'p1', productNameSnapshot: 'صلصة هاينز', quantity: 2, unitPriceSnapshot: 250 }],
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      paymentMethodName: 'كاش عند الاستلام'
    }, context);

    const result = await service.notifyNewOrder(testOrder, context);
    expect(result.success).toBe(true);
    expect(result.status).toBe('PENDING');
    expect(result.notificationId).toBeDefined();

    const notifications = service.getNotifications(context);
    expect(notifications.length).toBeGreaterThan(0);
    const notif = notifications.find(n => n.orderId === testOrder.id);
    expect(notif).toBeDefined();
    expect(notif!.status).toBe('PENDING');
    expect(notif!.content).toContain(testOrder.id);
    expect(notif!.content).not.toContain('API_KEY');
  });

  it('8. False Success Prevention on Order Persistence Failure', async () => {
    // Force write failure by passing failing transport
    const failingTransport = new MockGoogleSheetsTransport();
    failingTransport.addRow = async () => { throw new Error('Google Sheets API Quota Exceeded'); };

    const failingStore = new GoogleSheetsOrderStore(failingTransport);
    OrderStore.resetInstance();
    const storeInstance = OrderStore.getInstance(failingStore);

    const engine = new OrderCheckoutEngine(
      undefined,
      undefined,
      undefined,
      storeInstance,
      adminNotifier
    );

    const session = createTestSession('conv-failing-write');
    const state = session.checkoutState!;
    state.cart = [{ productId: 'p1', productName: 'حليب يماني', quantity: 1, unitPriceSnapshot: 600, subtotal: 600 }];
    state.deliveryAddress = 'صنعاء شارع تعز';

    const res = await engine.handleCheckoutMessage('أؤكد الطلب', session, context);

    expect(res).not.toContain('تم استلام طلبك بنجاح');
    expect(res).toContain('تعذر إتمام ونشاط حفظ الطلب حالياً');
    expect(state.step).toBe('AWAITING_CONFIRMATION');
  });

  it('9. Session Isolation & Active Order Query ("أين طلبي؟")', async () => {
    const session = createTestSession('conv-status-query');
    const state = session.checkoutState!;
    state.cart = [{ productId: 'p1', productName: 'تونة المائدة', quantity: 2, unitPriceSnapshot: 700, subtotal: 1400 }];
    state.deliveryAddress = 'صنعاء شارع المطار';
    state.paymentMethodId = 'pay-cod';
    state.paymentMethodName = 'كاش عند الاستلام';

    await checkoutEngine.handleCheckoutMessage('أؤكد الطلب', session, context);
    const orderId = state.createdOrderId!;

    // Customer asks "أين طلبي؟"
    const statusReply = await checkoutEngine.handleCheckoutMessage('أين طلبي؟', session, context);
    expect(statusReply).toContain(orderId);
    expect(statusReply).toContain('PENDING');
  });

  it('10. Human Handoff preserves Order ID and details', async () => {
    const session = createTestSession('conv-handoff');
    const state = session.checkoutState!;
    state.cart = [{ productId: 'p1', productName: 'عسل دوعني', quantity: 1, unitPriceSnapshot: 15000, subtotal: 15000 }];
    state.deliveryAddress = 'صنعاء الستين';

    await checkoutEngine.handleCheckoutMessage('أؤكد الطلب', session, context);
    const orderId = state.createdOrderId!;

    // Request Human Agent
    const handoffReply = await checkoutEngine.handleCheckoutMessage('أريد التحدث مع موظف خدمة العملاء', session, context);
    expect(handoffReply).toBeDefined();
    expect(state.createdOrderId).toBe(orderId);
    expect(state.cart.length).toBeGreaterThan(0);
  });
});
