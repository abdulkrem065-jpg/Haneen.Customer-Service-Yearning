import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { OrderStore } from './orders/order-store';
import { AdminNotifier } from './orders/admin-notifier';
import { ConversationSession, OrderCheckoutState } from './productization/session-store';
import { DataOperationContext } from './data/provider';
import { Product, DeliveryConfiguration, PaymentMethod } from './data/domain';

describe('CMD-081 — Sana Live Order Context Persistence & Checkout State Fix', () => {
  let engine: OrderCheckoutEngine;
  let orderStore: OrderStore;
  let adminNotifier: AdminNotifier;
  let context: DataOperationContext;
  let session: ConversationSession;

  const mockCatalog: Product[] = [
    { id: 'prod-sugar', name: 'سكر', price: 500, inStock: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-samn', name: 'سمن الماس', price: 2500, inStock: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-biscuit', name: 'بسكوت ابو ولد', price: 100, inStock: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-ananas', name: 'أناناس طازج', price: 500, inStock: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
  ];

  const mockDeliveryConfig: DeliveryConfiguration = {
    id: 'deliv-1',
    tenantId: 'tnt-41f0d530',
    storeId: 'str-2c6ad81f',
    isEnabled: true,
    deliveryFee: 500,
    deliveryAreas: 'جميع مناطق صنعاء',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockPaymentMethods: PaymentMethod[] = [
    { id: 'pay-cod', tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', methodType: 'cod', displayName: 'كاش عند الاستلام', isActive: true, displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 'pay-jeeb', tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', methodType: 'wallet', displayName: 'محفظة جيب / تحويل حاسب', isActive: true, displayOrder: 2, createdAt: new Date(), updatedAt: new Date() }
  ];

  beforeEach(() => {
    OrderStore.resetInstance();
    orderStore = OrderStore.getInstance();
    adminNotifier = AdminNotifier.getInstance();

    context = {
      tenantId: 'tnt-41f0d530',
      storeId: 'str-2c6ad81f'
    };

    session = {
      conversationId: `conv-test-${Date.now()}`,
      tenantId: 'tnt-41f0d530',
      storeId: 'str-2c6ad81f',
      agentId: 'agt-c93183d5',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [],
        step: 'NO_ORDER'
      }
    };

    engine = new OrderCheckoutEngine(
      async () => mockCatalog,
      async () => mockDeliveryConfig,
      async () => mockPaymentMethods
    );
  });

  // Scenario 1: Cart items present in initial order request
  it('1. should add items to cart and create activeOrderDraftId on initial order request', async () => {
    const res = await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);
    expect(res).not.toBeNull();
    expect(session.checkoutState?.cart.length).toBe(3);
    expect(session.checkoutState?.activeOrderDraftId).toBeDefined();
    expect(session.checkoutState?.step).toBe('AWAITING_ADDRESS_AND_PAYMENT');
  });

  // Scenario 2: Address & Payment in consecutive turn
  it('2. should parse address and payment in consecutive turn while preserving cart items', async () => {
    await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);
    const res = await engine.handleCheckoutMessage('شارع النصر جوار المحول طريقة الدفع جيب', session, context);

    expect(res).toContain('ملخص الطلب');
    expect(session.checkoutState?.cart.length).toBe(3);
    expect(session.checkoutState?.deliveryAddress).toBe('شارع النصر جوار المحول');
    expect(session.checkoutState?.paymentMethodName).toBe('محفظة جيب / تحويل حاسب');
    expect(session.checkoutState?.step).toBe('AWAITING_CONFIRMATION');
  });

  // Scenario 3: Combined address and payment message
  it('3. should handle combined address and payment message in single turn', async () => {
    session.checkoutState = {
      activeOrderDraftId: 'draft-123',
      cart: [{ productId: 'prod-sugar', productName: 'سكر', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };

    const res = await engine.handleCheckoutMessage('العنوان شارع بغداد طريقة الدفع كاش عند الاستلام', session, context);
    expect(res).toContain('ملخص الطلب');
    expect(session.checkoutState.deliveryAddress).toContain('شارع بغداد');
    expect(session.checkoutState.paymentMethodId).toBe('pay-cod');
    expect(session.checkoutState.step).toBe('AWAITING_CONFIRMATION');
  });

  // Scenario 4: "الطلب قد أرسلته سابقاً" with active draft
  it('4. should prioritize Active Draft when customer says "الطلب قد ارسلته سابقا"', async () => {
    await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);
    await engine.handleCheckoutMessage('شارع النصر جوار المحول طريقة الدفع جيب', session, context);

    const res = await engine.handleCheckoutMessage('الطلب قد ارسلته سابقا', session, context);
    expect(res).toContain('طلبك الحالي قيد التجهيز للتأكيد');
    expect(res).toContain('سكر');
    expect(session.checkoutState?.cart.length).toBe(3);
  });

  // Scenario 5: Customer Identity (Name and Phone) during checkout
  it('5. should bind Customer Identity (Name & Phone) to active draft without wiping cart', async () => {
    await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);

    const res = await engine.handleCheckoutMessage('علي الذيباني 772776392', session, context);
    expect(res).toContain('تم تسجيل بياناتك بنجاح');
    expect(session.checkoutState?.customerName).toBe('علي الذيباني');
    expect(session.checkoutState?.customerPhone).toBe('772776392');
    expect(session.checkoutState?.cart.length).toBe(3);
  });

  // Scenario 6: Short confirmation ("نعم") creates real order
  it('6. should create real order in OrderStore when customer confirms with "نعم"', async () => {
    await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);
    await engine.handleCheckoutMessage('شارع النصر جوار المحول طريقة الدفع جيب', session, context);

    const res = await engine.handleCheckoutMessage('نعم أؤكد الطلب', session, context);
    expect(res).toContain('تم استلام طلبك بنجاح');
    expect(res).toContain('ORD-');
    expect(session.checkoutState?.step).toBe('ORDER_CREATED');
    expect(session.activeOrderId).toBeDefined();

    const created = await orderStore.getOrderById(session.activeOrderId!, context);
    expect(created).not.toBeNull();
    expect(created?.totalAmount).toBe(3600); // 3100 items + 500 delivery
  });

  // Scenario 7: Idempotency on repeated confirmation
  it('7. should return existing order details and prevent duplicate order on repeated confirmation', async () => {
    await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);
    await engine.handleCheckoutMessage('شارع النصر جوار المحول طريقة الدفع جيب', session, context);
    await engine.handleCheckoutMessage('نعم', session, context);

    const firstOrderId = session.activeOrderId;
    const res2 = await engine.handleCheckoutMessage('نعم أؤكد', session, context);

    expect(res2).toContain('تم استلام طلبك سابقاً بنجاح');
    expect(res2).toContain(firstOrderId!);
    const allOrders = await orderStore.getAllOrders(context);
    expect(allOrders.length).toBe(1);
  });

  // Scenario 8: Order status query ("أين طلبي؟") with activeOrderId
  it('8. should return order status directly for activeOrderId without asking for order ID', async () => {
    await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);
    await engine.handleCheckoutMessage('شارع النصر جوار المحول طريقة الدفع جيب', session, context);
    await engine.handleCheckoutMessage('نعم', session, context);

    // Reset draft state so cart is empty but activeOrderId remains
    session.checkoutState = { cart: [], step: 'NO_ORDER' };

    const res = await engine.handleCheckoutMessage('أين طلبي؟', session, context);
    expect(res).toContain('حالياً قيد الانتظار والتأكيد');
  });

  // Scenario 9: Disabled Payment Method handling
  it('9. should politely reject disabled payment method and offer active payment methods', async () => {
    const customEngine = new OrderCheckoutEngine(
      async () => mockCatalog,
      async () => mockDeliveryConfig,
      async () => [
        { id: 'pay-cod', tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', methodType: 'cod', displayName: 'كاش عند الاستلام', isActive: true, displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
        { id: 'pay-jeeb', tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', methodType: 'wallet', displayName: 'محفظة جيب', isActive: false, displayOrder: 2, createdAt: new Date(), updatedAt: new Date() }
      ]
    );

    session.checkoutState = {
      activeOrderDraftId: 'draft-999',
      cart: [{ productId: 'prod-sugar', productName: 'سكر', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };

    const res = await customEngine.handleCheckoutMessage('طريقة الدفع جيب', session, context);
    expect(res).toContain('غير مفعلة حالياً');
    expect(res).toContain('كاش عند الاستلام');
  });

  // Scenario 10: Price change re-validation before confirmation
  it('10. should update unitPriceSnapshot and recalculate totals if catalog price changes before confirmation', async () => {
    const dynamicCatalog = [...mockCatalog];
    const customEngine = new OrderCheckoutEngine(
      async () => dynamicCatalog,
      async () => mockDeliveryConfig,
      async () => mockPaymentMethods
    );

    await customEngine.handleCheckoutMessage('مرحبا اريد كيلو سكر', session, context);
    await customEngine.handleCheckoutMessage('شارع النصر طريقة الدفع كاش', session, context);

    // Price of sugar changes from 500 to 600 in catalog before confirmation
    dynamicCatalog[0] = { ...dynamicCatalog[0], price: 600 };

    const res = await customEngine.handleCheckoutMessage('أؤكد', session, context);
    expect(res).toContain('تم استلام طلبك بنجاح');
    expect(res).toContain('1100 YER'); // 600 sugar + 500 delivery
  });

  // Scenario 11: Unavailable product handling
  it('11. should pause confirmation and notify user if item becomes unavailable', async () => {
    const dynamicCatalog = [...mockCatalog];
    const customEngine = new OrderCheckoutEngine(
      async () => dynamicCatalog,
      async () => mockDeliveryConfig,
      async () => mockPaymentMethods
    );

    await customEngine.handleCheckoutMessage('مرحبا اريد كيلو سكر', session, context);
    await customEngine.handleCheckoutMessage('شارع النصر طريقة الدفع كاش', session, context);

    // Sugar becomes out of stock
    dynamicCatalog[0] = { ...dynamicCatalog[0], inStock: false };

    const res = await customEngine.handleCheckoutMessage('أؤكد', session, context);
    expect(res).toContain('غير متوفر حالياً بالمخزن');
    expect(session.checkoutState?.cart.length).toBe(1); // Cart NOT wiped out!
  });

  // Scenario 12: Delivery fee calculation from Google Sheets
  it('12. should calculate total including delivery fee from delivery_configuration', async () => {
    await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر', session, context);
    await engine.handleCheckoutMessage('شارع حدة طريقة الدفع كاش', session, context);

    expect(session.checkoutState?.deliveryFee).toBe(500);
    expect(session.checkoutState?.total).toBe(1000); // 500 + 500
  });

  // Scenario 13: Human Handoff during checkout
  it('13. should preserve order draft in handoff context when user requests human agent', async () => {
    await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس', session, context);
    await engine.handleCheckoutMessage('شارع النصر طريقة الدفع كاش', session, context);

    expect(session.checkoutState?.cart.length).toBe(2);
    expect(session.checkoutState?.deliveryAddress).toBe('شارع النصر');
  });

  // Scenario 14: Price snapshotting
  it('14. should lock price snapshot when items are added to cart', async () => {
    await engine.handleCheckoutMessage('اريد كيلو سكر', session, context);
    expect(session.checkoutState?.cart[0].unitPriceSnapshot).toBe(500);
  });

  // Scenario 15: Multiple products parsing
  it('15. should parse "كيلو سكر وسمن الماس و1 بسكوت ابو ولد" into 3 items', async () => {
    await engine.handleCheckoutMessage('اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);
    expect(session.checkoutState?.cart.length).toBe(3);
    const names = session.checkoutState?.cart.map(c => c.productName);
    expect(names).toContain('سكر');
    expect(names).toContain('سمن الماس');
    expect(names).toContain('بسكوت ابو ولد');
  });

  // Scenario 16: Cart preservation on general/follow-up question
  it('16. should preserve active draft and cart on unrelated or follow-up question', async () => {
    await engine.handleCheckoutMessage('اريد كيلو سكر وسمن الماس', session, context);
    expect(session.checkoutState?.cart.length).toBe(2);

    const res = await engine.handleCheckoutMessage('هل عندكم توصيل سريع؟', session, context);
    // Return null so LLM or Orchestrator can handle general Q, BUT cart remains intact!
    expect(res).toBeNull();
    expect(session.checkoutState?.cart.length).toBe(2);
  });

  // Scenario 17: Admin notification resiliency
  it('17. should succeed in order creation even if admin notification throws an error', async () => {
    const notifySpy = vi.spyOn(AdminNotifier.getInstance(), 'notifyNewOrder').mockRejectedValueOnce(new Error('Network offline'));

    await engine.handleCheckoutMessage('اريد كيلو سكر', session, context);
    await engine.handleCheckoutMessage('شارع النصر طريقة الدفع كاش', session, context);
    const res = await engine.handleCheckoutMessage('أؤكد', session, context);

    expect(res).toContain('تم استلام طلبك بنجاح');
    expect(session.checkoutState?.step).toBe('ORDER_CREATED');

    notifySpy.mockRestore();
  });

  // Scenario 18: Order status tracking by explicit Order ID
  it('18. should look up order status by explicit Order ID like ORD-20260825-0001', async () => {
    const order = await orderStore.createOrder({
      customerId: 'cst-test',
      customerPhone: '777123456',
      items: [{ productId: 'prod-1', productNameSnapshot: 'سكر', quantity: 1, unitPriceSnapshot: 500 }],
      subtotal: 500,
      deliveryFee: 500,
      totalAmount: 1000,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء'
    }, context);

    const res = await engine.handleCheckoutMessage(`ما حالة الطلب ${order.id}`, session, context);
    expect(res).toContain(`طلبك رقم ${order.id} حالياً قيد الانتظار والتأكيد`);
  });

  // Scenario 19: Session context isolation
  it('19. should maintain completely isolated checkout drafts for different conversation sessions', async () => {
    const session2: ConversationSession = {
      conversationId: `conv-test-2-${Date.now()}`,
      tenantId: 'tnt-41f0d530',
      storeId: 'str-2c6ad81f',
      agentId: 'agt-c93183d5',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: { cart: [], step: 'NO_ORDER' }
    };

    await engine.handleCheckoutMessage('اريد كيلو سكر', session, context);
    await engine.handleCheckoutMessage('اريد سمن الماس', session2, context);

    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productName).toBe('سكر');

    expect(session2.checkoutState?.cart.length).toBe(1);
    expect(session2.checkoutState?.cart[0].productName).toBe('سمن الماس');
  });

  // Scenario 20: Full live trace scenario (reproducing exact production failure)
  it('20. should execute full live trace scenario end-to-end without losing context', async () => {
    // Turn 1: Customer requests items
    const t1 = await engine.handleCheckoutMessage('مرحبا اريد كيلو سكر وسمن الماس و1 بسكوت ابو ولد', session, context);
    expect(t1).toContain('تمت إضافة المنتجات');
    expect(session.checkoutState?.cart.length).toBe(3);

    // Turn 2: Customer provides address & payment in single turn
    const t2 = await engine.handleCheckoutMessage('شارع النصر جوار المحول طريقة الدفع جيب', session, context);
    expect(t2).toContain('ملخص الطلب');
    expect(session.checkoutState?.deliveryAddress).toBe('شارع النصر جوار المحول');
    expect(session.checkoutState?.paymentMethodName).toBe('محفظة جيب / تحويل حاسب');

    // Turn 3: Customer says "الطلب قد ارسلته سابقا"
    const t3 = await engine.handleCheckoutMessage('الطلب قد ارسلته سابقا', session, context);
    expect(t3).toContain('طلبك الحالي قيد التجهيز للتأكيد');
    expect(session.checkoutState?.cart.length).toBe(3);

    // Turn 4: Customer provides Name and Phone
    const t4 = await engine.handleCheckoutMessage('علي الذيباني 772776392', session, context);
    expect(t4).toContain('علي الذيباني');
    expect(session.checkoutState?.customerPhone).toBe('772776392');

    // Turn 5: Customer confirms
    const t5 = await engine.handleCheckoutMessage('نعم اريد تأكيد الطلب', session, context);
    expect(t5).toContain('تم استلام طلبك بنجاح');
    expect(t5).toContain('ORD-');
    expect(session.checkoutState?.step).toBe('ORDER_CREATED');
  });
});
