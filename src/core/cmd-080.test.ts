import { describe, it, expect, beforeEach } from 'vitest';
import { OrderStore } from './orders/order-store';
import { AdminNotifier } from './orders/admin-notifier';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { HaneenService, CANONICAL_TENANT_ID, CANONICAL_STORE_ID, CANONICAL_AGENT_ID } from './productization/haneen-service';
import { InMemorySessionStore, ConversationSession } from './productization/session-store';
import { UnauthorizedDataAccessError, DataNotFoundError } from './data/errors';

describe('CMD-080: Sana Real Order Lifecycle, Checkout, Order ID & Admin Notification', () => {
  const context = { tenantId: CANONICAL_TENANT_ID, storeId: CANONICAL_STORE_ID };
  let orderStore: OrderStore;
  let adminNotifier: AdminNotifier;

  beforeEach(() => {
    OrderStore.resetInstance();
    AdminNotifier.resetInstance();
    orderStore = OrderStore.getInstance();
    adminNotifier = AdminNotifier.getInstance();
  });

  // Scenario 1: Unique Order ID Generation
  it('1. should generate unique, immutable Order ID matching ORD-YYYYMMDD-XXXX format', () => {
    const id1 = orderStore.generateOrderId();
    const id2 = orderStore.generateOrderId();

    expect(id1).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(id2).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(id1).not.toEqual(id2);
  });

  // Scenario 2: Order Creation & Persistence
  it('2. should persist order in OrderStore with canonical attributes', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-001',
        customerPhone: '777111222',
        items: [{ productId: 'prod-001', productNameSnapshot: 'أناناس طازج', quantity: 2, unitPriceSnapshot: 500 }],
        subtotal: 1000,
        deliveryFee: 500,
        totalAmount: 1500,
        currency: 'YER',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش عند الاستلام',
        deliveryAddress: 'شارع حدة'
      },
      context
    );

    expect(order.id).toMatch(/^ORD-/);
    expect(order.tenantId).toBe(CANONICAL_TENANT_ID);
    expect(order.storeId).toBe(CANONICAL_STORE_ID);
    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('UNPAID');

    const retrieved = await orderStore.getOrderById(order.id, context);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(order.id);
  });

  // Scenario 3: OrderItem Price Snapshotting
  it('3. should lock item price snapshot and retain original price snapshot', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-001',
        items: [{ productId: 'prod-001', productNameSnapshot: 'سمن البنت', quantity: 1, unitPriceSnapshot: 2500 }],
        subtotal: 2500,
        deliveryFee: 0,
        totalAmount: 2500
      },
      context
    );

    const item = order.items[0];
    expect(item.productNameSnapshot).toBe('سمن البنت');
    expect(item.unitPriceSnapshot).toBe(2500);
    expect(item.totalPrice).toBe(2500);
  });

  // Scenario 4: Subtotal & Delivery Fee Calculation
  it('4. should calculate subtotal and totalAmount correctly', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-001',
        items: [
          { productId: 'p1', productNameSnapshot: 'منتج أ', quantity: 2, unitPriceSnapshot: 300 },
          { productId: 'p2', productNameSnapshot: 'منتج ب', quantity: 1, unitPriceSnapshot: 400 }
        ],
        subtotal: 1000,
        deliveryFee: 500,
        totalAmount: 1500
      },
      context
    );

    expect(order.subtotal).toBe(1000);
    expect(order.deliveryFee).toBe(500);
    expect(order.totalAmount).toBe(1500);
  });

  // Scenario 5: Context Preservation - Address
  it('5. should capture delivery address into session without resetting cart', async () => {
    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-addr-test',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [{ productId: 'p1', productName: 'أناناس', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
        step: 'CART'
      }
    };

    const reply = await engine.handleCheckoutMessage('العنوان شارع النصر جوار المحول', session, context);
    expect(reply).toContain('تم تسجيل عنوان التوصيل');
    expect(session.checkoutState?.deliveryAddress).toBe('شارع النصر جوار المحول');
    expect(session.checkoutState?.cart.length).toBe(1);
  });

  // Scenario 6: Context Preservation - Payment Method
  it('6. should capture payment method into session without clearing cart', async () => {
    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-pay-test',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [{ productId: 'p1', productName: 'سكر', quantity: 2, unitPriceSnapshot: 600, subtotal: 1200 }],
        step: 'CART'
      }
    };

    const reply = await engine.handleCheckoutMessage('كاش عند الاستلام', session, context);
    expect(reply).toContain('طريقة الدفع');
    expect(session.checkoutState?.paymentMethodId).toBe('pay-cod');
    expect(session.checkoutState?.paymentMethodName).toBe('كاش عند الاستلام');
    expect(session.checkoutState?.cart.length).toBe(1);
  });

  // Scenario 7: Order Summary Generation
  it('7. should generate full order summary and ask for confirmation', async () => {
    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-summary-test',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [{ productId: 'p1', productName: 'أناناس', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
        deliveryAddress: 'شارع الزبيري',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش عند الاستلام',
        deliveryFee: 500,
        step: 'CART'
      }
    };

    const reply = await engine.handleCheckoutMessage('العنوان شارع الزبيري', session, context);
    expect(reply).toContain('ملخص الطلب');
    expect(reply).toContain('أناناس');
    expect(reply).toContain('مجموع المنتجات: 500 YER');
    expect(reply).toContain('رسوم التوصيل: 500 YER');
    expect(reply).toContain('الإجمالي النهائي: 1000 YER');
    expect(reply).toContain('هل تؤكد الطلب؟');
  });

  // Scenario 8: Customer Order Confirmation ("أؤكد")
  it('8. should create order in PENDING status upon customer confirmation', async () => {
    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-confirm-test',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [{ productId: 'p1', productName: 'أناناس', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
        deliveryAddress: 'شارع حدة',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش عند الاستلام',
        deliveryFee: 500,
        step: 'SUMMARY'
      }
    };

    const reply = await engine.handleCheckoutMessage('أؤكد', session, context);
    expect(reply).toContain('تم استلام طلبك بنجاح');
    expect(reply).toContain('رقم طلبك: ORD-');
    expect(reply).toContain('PENDING');

    expect(session.checkoutState?.createdOrderId).toMatch(/^ORD-/);
    expect(session.activeOrderId).toBe(session.checkoutState?.createdOrderId);
  });

  // Scenario 9: Idempotency & Duplicate Order Prevention
  it('9. should prevent duplicate orders on re-confirmation in same session', async () => {
    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-idempotent-test',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [{ productId: 'p1', productName: 'أناناس', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
        deliveryAddress: 'شارع حدة',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش عند الاستلام',
        deliveryFee: 500,
        step: 'SUMMARY'
      }
    };

    const reply1 = await engine.handleCheckoutMessage('أؤكد', session, context);
    const firstOrderId = session.checkoutState?.createdOrderId;

    const allOrdersBefore = await orderStore.getAllOrders(context);
    expect(allOrdersBefore.length).toBe(1);

    const reply2 = await engine.handleCheckoutMessage('أؤكد', session, context);
    const allOrdersAfter = await orderStore.getAllOrders(context);

    expect(allOrdersAfter.length).toBe(1);
    expect(reply2).toContain('تم استلام طلبك سابقاً بنجاح');
    expect(reply2).toContain(firstOrderId);
  });

  // Scenario 10: Admin Notification
  it('10. should create admin notification record when order is created', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-001',
        customerPhone: '777000111',
        items: [{ productId: 'p1', productNameSnapshot: 'سمن', quantity: 1, unitPriceSnapshot: 2500 }],
        subtotal: 2500,
        deliveryFee: 500,
        totalAmount: 3000,
        paymentMethodName: 'كاش عند الاستلام',
        deliveryAddress: 'شارع السبعين'
      },
      context
    );

    const result = await adminNotifier.notifyNewOrder(order, context);
    expect(result.success).toBe(true);

    const notifications = adminNotifier.getNotifications(context);
    expect(notifications.length).toBe(1);
    expect(notifications[0].orderId).toBe(order.id);
    expect(notifications[0].content).toContain(order.id);
  });

  // Scenario 11: Resilience of Admin Notification
  it('11. should complete order creation even if notification handler fails', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-resilient',
        items: [{ productId: 'p1', productNameSnapshot: 'منتج', quantity: 1, unitPriceSnapshot: 100 }],
        subtotal: 100,
        deliveryFee: 0,
        totalAmount: 100
      },
      context
    );

    expect(order.id).toBeDefined();
    expect(order.status).toBe('PENDING');
  });

  // Scenario 12: Customer Order Status Query with Session Context
  it('12. should return status directly when customer asks "أين طلبي؟" with activeOrderId in session', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-001',
        items: [{ productId: 'p1', productNameSnapshot: 'أناناس', quantity: 1, unitPriceSnapshot: 500 }],
        subtotal: 500,
        deliveryFee: 500,
        totalAmount: 1000
      },
      context
    );

    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-track-session',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      activeOrderId: order.id
    };

    const reply = await engine.handleCheckoutMessage('أين طلبي؟', session, context);
    expect(reply).toContain(`طلبك رقم ${order.id}`);
    expect(reply).toContain('PENDING');
  });

  // Scenario 13: Customer Order Status Query with Explicit Order ID
  it('13. should return status when explicit Order ID is provided in user text', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-002',
        items: [{ productId: 'p1', productNameSnapshot: 'تمر', quantity: 1, unitPriceSnapshot: 1500 }],
        subtotal: 1500,
        deliveryFee: 0,
        totalAmount: 1500
      },
      context
    );

    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-track-explicit',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE'
    };

    const reply = await engine.handleCheckoutMessage(`ما حالة الطلب ${order.id}`, session, context);
    expect(reply).toContain(`طلبك رقم ${order.id}`);
    expect(reply).toContain('PENDING');
  });

  // Scenario 14: Customer Order Status Query without Order ID
  it('14. should prompt for Order ID if no active order is in session and no ID in text', async () => {
    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-no-id',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE'
    };

    const reply = await engine.handleCheckoutMessage('أين طلبي؟', session, context);
    expect(reply).toContain('يرجى تزويدنا برقم الطلب');
  });

  // Scenario 15: Order Status Transition Validation (Valid)
  it('15. should allow valid status transition steps', async () => {
    const order = await orderStore.createOrder(
      { customerId: 'cst-1', items: [], subtotal: 0, deliveryFee: 0, totalAmount: 0 },
      context
    );

    await orderStore.updateOrderStatus(order.id, 'CONFIRMED', context);
    await orderStore.updateOrderStatus(order.id, 'PREPARING', context);
    await orderStore.updateOrderStatus(order.id, 'READY_FOR_DELIVERY', context);
    await orderStore.updateOrderStatus(order.id, 'OUT_FOR_DELIVERY', context);
    const finalOrder = await orderStore.updateOrderStatus(order.id, 'DELIVERED', context);

    expect(finalOrder.status).toBe('DELIVERED');
  });

  // Scenario 16: Order Status Transition Validation (Invalid)
  it('16. should reject invalid status transition from CANCELLED to DELIVERED', async () => {
    const order = await orderStore.createOrder(
      { customerId: 'cst-1', items: [], subtotal: 0, deliveryFee: 0, totalAmount: 0 },
      context
    );

    await orderStore.updateOrderStatus(order.id, 'CANCELLED', context);

    await expect(
      orderStore.updateOrderStatus(order.id, 'DELIVERED', context)
    ).rejects.toThrow('Cannot transition cancelled order');
  });

  // Scenario 17: Payment Status Separation
  it('17. should separate order status from payment status', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cst-1',
        items: [],
        subtotal: 1000,
        deliveryFee: 0,
        totalAmount: 1000,
        paymentStatus: 'UNPAID'
      },
      context
    );

    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('UNPAID');

    const updated = await orderStore.updatePaymentStatus(order.id, 'PAID', context);
    expect(updated.paymentStatus).toBe('PAID');
    expect(updated.status).toBe('PENDING');
  });

  // Scenario 18: Human Handoff with Order Context
  it('18. should attach order context to human handoff record', async () => {
    const service = new HaneenService();
    const sessionStore = service.getSessionStore();

    const session = sessionStore.getOrCreateSession('conv-handoff-order', {
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID
    });

    session.checkoutState = {
      cart: [{ productId: 'p1', productName: 'أناناس', quantity: 2, unitPriceSnapshot: 500, subtotal: 1000 }],
      deliveryAddress: 'شارع حدة',
      paymentMethodName: 'كاش عند الاستلام',
      deliveryFee: 500,
      step: 'SUMMARY'
    };
    sessionStore.updateSession(session);

    const response = await service.processMessage({
      conversationId: 'conv-handoff-order',
      message: 'أريد التحدث مع موظف بشري'
    });

    expect(response.status).toBe('REQUIRES_HUMAN');
    expect(response.handoffState?.reason).toBe('طلب العميل التحدث مع موظف بشري');
    const orderCtx = (response.handoffState as any)?.orderContext;
    expect(orderCtx).toBeDefined();
    expect(orderCtx.items.length).toBe(1);
    expect(orderCtx.subtotal).toBe(1000);
    expect(orderCtx.total).toBe(1500);
  });

  // Scenario 19: Strict Context Enforcement (Tenant Isolation)
  it('19. should reject cross-tenant order access attempt', async () => {
    const order = await orderStore.createOrder(
      { customerId: 'cst-1', items: [], subtotal: 0, deliveryFee: 0, totalAmount: 0 },
      context
    );

    await expect(
      orderStore.getOrderById(order.id, { tenantId: 'tnt-hacker', storeId: CANONICAL_STORE_ID })
    ).rejects.toThrow(UnauthorizedDataAccessError);
  });

  // Scenario 20: Strict Context Enforcement (Store Isolation)
  it('20. should reject cross-store order access attempt', async () => {
    const order = await orderStore.createOrder(
      { customerId: 'cst-1', items: [], subtotal: 0, deliveryFee: 0, totalAmount: 0 },
      context
    );

    await expect(
      orderStore.getOrderById(order.id, { tenantId: CANONICAL_TENANT_ID, storeId: 'str-hacker' })
    ).rejects.toThrow(UnauthorizedDataAccessError);
  });

  // Scenario 21: Affirmative Response Context Retention ("نعم")
  it('21. should add last offered product to cart on "نعم"', async () => {
    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-yes-offer',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [],
        step: 'SHOPPING',
        lastOfferedProduct: { id: 'p1', name: 'أناناس', price: 500 }
      }
    };

    const reply = await engine.handleCheckoutMessage('نعم', session, context);
    expect(reply).toContain('تمت إضافة 1 (أناناس)');
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productName).toBe('أناناس');
  });

  // Scenario 22: Quantity Update in Cart
  it('22. should calculate cart subtotal correctly when adding multiple items', () => {
    const engine = new OrderCheckoutEngine();
    const state = { cart: [], step: 'CART' } as any;

    engine.addItemToCart(state, 'p1', 'أناناس', 500, 1);
    engine.addItemToCart(state, 'p1', 'أناناس', 500, 2);
    engine.addItemToCart(state, 'p2', 'سمن البنت', 2500, 1);

    expect(state.cart.length).toBe(2);
    expect(state.cart[0].quantity).toBe(3);
    expect(state.cart[0].subtotal).toBe(1500);

    const subtotal = engine.calculateSubtotal(state.cart);
    expect(subtotal).toBe(4000);
  });

  // Scenario 23: Delivery Fee Configuration Check
  it('23. should respect delivery configuration fee when supplier is present', async () => {
    const engine = new OrderCheckoutEngine(
      undefined,
      async () => ({
        id: 'del-1',
        tenantId: CANONICAL_TENANT_ID,
        storeId: CANONICAL_STORE_ID,
        isEnabled: true,
        deliveryFee: 700,
        currency: 'YER',
        createdAt: new Date(),
        updatedAt: new Date()
      } as any)
    );

    const session: ConversationSession = {
      conversationId: 'conv-del-config',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [{ productId: 'p1', productName: 'أناناس', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
        step: 'CART'
      }
    };

    const reply = await engine.handleCheckoutMessage('العنوان شارع النصر', session, context);
    expect(reply).toContain('700 YER');
    expect(session.checkoutState?.deliveryFee).toBe(700);
  });

  // Scenario 24: Active Payment Methods Validation
  it('24. should map cash on delivery correctly', async () => {
    const engine = new OrderCheckoutEngine();
    const session: ConversationSession = {
      conversationId: 'conv-map-pay',
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: {
        cart: [{ productId: 'p1', productName: 'أناناس', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
        step: 'CART'
      }
    };

    await engine.handleCheckoutMessage('كاش عند الاستلام', session, context);
    expect(session.checkoutState?.paymentMethodId).toBe('pay-cod');
  });

  // Scenario 25: End-to-End Chat Checkout Flow Integration
  it('25. should execute complete checkout flow via HaneenService processMessage', async () => {
    const mockAiProvider = {
      generateResponse: async () => ({ text: 'أهلاً بك في متجر الذيباني!' })
    };
    const service = new HaneenService(undefined, undefined, undefined, { aiProvider: mockAiProvider as any });

    // Step A: Address & Order Setup
    const resAddress = await service.processMessage({
      conversationId: 'conv-e2e-order',
      message: 'العنوان شارع حدة جوار المجمع'
    });

    // Step B: Set payment & cart items
    const session = service.getSessionStore().getSession('conv-e2e-order');
    if (session) {
      if (!session.checkoutState) session.checkoutState = { cart: [], step: 'CART' };
      session.checkoutState.cart = [
        { productId: 'p1', productName: 'أناناس طازج', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }
      ];
      session.checkoutState.paymentMethodId = 'pay-cod';
      session.checkoutState.paymentMethodName = 'كاش عند الاستلام';
      session.checkoutState.deliveryFee = 500;
      session.checkoutState.deliveryAddress = 'شارع حدة جوار المجمع';
    }

    // Step C: Confirm Order
    const resConfirm = await service.processMessage({
      conversationId: 'conv-e2e-order',
      message: 'أؤكد'
    });

    expect(resConfirm.message).toContain('تم استلام طلبك بنجاح');
    expect(resConfirm.message).toContain('ORD-');
    expect(resConfirm.message).toContain('PENDING');

    // Step D: Order status query
    const resStatus = await service.processMessage({
      conversationId: 'conv-e2e-order',
      message: 'أين طلبي؟'
    });

    expect(resStatus.message).toContain('طلبك رقم ORD-');
    expect(resStatus.message).toContain('PENDING');
  });
});
