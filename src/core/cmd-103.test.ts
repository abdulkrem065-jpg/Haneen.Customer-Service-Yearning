import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { ConversationSession } from './productization/session-store';
import { DataOperationContext } from './data/provider';
import { Product, PaymentMethod } from './data/domain';
import { UniversalLanguageUnderstandingProvider } from './nlu/language-understanding';

describe('CMD-103 — Live Checkout Correction & Customer Identity Gate Suite', () => {
  let checkoutEngine: OrderCheckoutEngine;
  let mockContext: DataOperationContext;
  let mockSession: ConversationSession;
  let createdOrdersStore: any[] = [];

  const mockCatalog: Product[] = [
    { id: 'prod-sugar', name: 'سكر السعيد ابو كيلو', price: 500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-samn', name: 'سمن الماس', price: 2500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-biscuit', name: 'بسكوت ابو ولد', price: 100, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-biskrem', name: 'بسكوت بسكريم كبير', price: 300, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-ananas', name: 'أناناس طازج', price: 500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-dalsey-red-sm', name: 'دلسي صغير احمر', price: 200, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-dalsey-red-lg', name: 'دلسي كبير احمر', price: 400, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
  ];

  const mockPaymentMethods: PaymentMethod[] = [
    { id: 'pay-cod', displayName: 'كاش عند الاستلام', methodType: 'cash_on_delivery', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 'pay-jawali', displayName: 'جوالي / محفظة جوالي', methodType: 'wallet', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 2, createdAt: new Date(), updatedAt: new Date() }
  ];

  beforeEach(() => {
    createdOrdersStore = [];
    mockContext = { tenantId: 'tnt-test', storeId: 'str-test' };
    mockSession = {
      conversationId: 'conv-103-test',
      channel: 'WEB',
      status: 'ACTIVE',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: { cart: [], step: 'NO_ORDER' }
    } as any;

    const mockOrderStore = {
      createOrder: vi.fn().mockImplementation(async (orderData) => {
        const order = {
          id: `ORD-20260904-${Math.floor(1000 + Math.random() * 9000)}`,
          ...orderData,
          status: 'PENDING',
          createdAt: new Date()
        };
        createdOrdersStore.push(order);
        return order;
      }),
      getOrderById: vi.fn().mockImplementation(async (id) => {
        return createdOrdersStore.find(o => o.id === id) || null;
      })
    };

    const mockAdminNotifier = {
      notifyNewOrder: vi.fn().mockResolvedValue({ success: true, notificationId: 'notif-103', status: 'SENT' }),
      getNotifications: vi.fn().mockReturnValue([]),
      clear: vi.fn()
    };

    checkoutEngine = new OrderCheckoutEngine(
      async () => mockCatalog,
      async () => ({ deliveryFee: 500, isEnabled: true } as any),
      async () => mockPaymentMethods,
      mockOrderStore,
      mockAdminNotifier,
      new UniversalLanguageUnderstandingProvider()
    );
  });

  it('1. Multi-turn Continuation: Multi-product cart preserves all items across turns', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد سمن الماس وبسكوت أبو ولد', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart).toHaveLength(2);

    await checkoutEngine.handleCheckoutMessage('وبسكوت بسكريم ودلسي الصغير', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart).toHaveLength(4);

    const names = mockSession.checkoutState?.cart.map(i => i.productName);
    expect(names).toContain('سمن الماس');
    expect(names).toContain('بسكوت ابو ولد');
    expect(names).toContain('بسكوت بسكريم كبير');
    expect(names).toContain('دلسي صغير احمر');
  });

  it('2. Cart Reconciliation: "الطلب يكون X فقط" replaces previous cart items completely', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد سمن الماس وبسكوت أبو ولد', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart).toHaveLength(2);

    await checkoutEngine.handleCheckoutMessage('الطلب يكون سمن الماس فقط', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart).toHaveLength(1);
    expect(mockSession.checkoutState?.cart[0].productName).toBe('سمن الماس');
  });

  it('3. Item Correction & Replace: "لا، بدل بسكوت ابو ولد خليه سمن الماس" replaces old product cleanly', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد بسكوت ابو ولد وسكر السعيد ابو كيلو', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart).toHaveLength(2);

    await checkoutEngine.handleCheckoutMessage('لا، بدل بسكوت ابو ولد خليه سمن الماس', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart).toHaveLength(2);

    const names = mockSession.checkoutState?.cart.map(i => i.productName);
    expect(names).toContain('سمن الماس');
    expect(names).toContain('سكر السعيد ابو كيلو');
    expect(names).not.toContain('بسكوت ابو ولد');
  });

  it('4. Quantity Update: "اجعل السكر 3" updates product quantity correctly', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد سكر السعيد ابو كيلو', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart[0].quantity).toBe(1);

    await checkoutEngine.handleCheckoutMessage('اجعل السكر 3', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart[0].quantity).toBe(3);
  });

  it('5. Duplicate Prevention & Aggregation: Adding existing product aggregates quantity', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد بسكوت ابو ولد', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('أضف 2 بسكوت ابو ولد', mockSession, mockContext);

    expect(mockSession.checkoutState?.cart).toHaveLength(1);
    expect(mockSession.checkoutState?.cart[0].quantity).toBe(3);
  });

  it('6. Independent Product Resolution: Missing product notice does not prevent adding valid products', async () => {
    const res = await checkoutEngine.handleCheckoutMessage('أريد سمن الماس وبسكوت ابو ولد ومنتج مجهول خيالي', mockSession, mockContext);
    expect(res).toContain('سمن الماس');
    expect(res).toContain('بسكوت ابو ولد');
    expect(res).toContain('منتج مجهول خيالي');
    expect(mockSession.checkoutState?.cart).toHaveLength(2);
  });

  it('7. Customer Name Required Gate: Confirmation fails if customerName is missing', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد سمن الماس', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('صنعاء شارع الزبيري', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('كاش عند الاستلام', mockSession, mockContext);

    // Try confirm without customerName
    const res = await checkoutEngine.handleCheckoutMessage('نعم أؤكد الطلب', mockSession, mockContext);
    expect(res).toContain('الاسم الكريم');
    expect(mockSession.checkoutState?.createdOrderId).toBeUndefined();
  });

  it('8. Customer Phone Required Gate: Confirmation fails if customerPhone is missing with no fallback', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد سمن الماس', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('صنعاء شارع الزبيري', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('كاش عند الاستلام', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('الاسم أحمد علي', mockSession, mockContext);

    // Explicitly clear session phone
    delete (mockSession as any).customerPhone;
    if (mockSession.checkoutState) {
      mockSession.checkoutState.customerPhone = undefined;
    }

    const res = await checkoutEngine.handleCheckoutMessage('نعم أؤكد الطلب', mockSession, mockContext);
    expect(res).toContain('رقم الهاتف');
    expect(mockSession.checkoutState?.createdOrderId).toBeUndefined();
  });

  it('9. Summary vs Cart Equality: Order summary reflects exact cart items, fees, and totals', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد سمن الماس وبسكوت ابو ولد', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('صنعاء شارع الزبيري والكاش عند الاستلام', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('الاسم علي الذيباني وهاتفي 770493341', mockSession, mockContext);

    const summary = checkoutEngine.generateOrderSummary(mockSession.checkoutState!);
    expect(summary).toContain('سمن الماس');
    expect(summary).toContain('بسكوت ابو ولد');
    expect(summary).toContain('مجموع المنتجات: 2600 YER');
    expect(summary).toContain('رسوم التوصيل: 500 YER');
    expect(summary).toContain('الإجمالي النهائي: 3100 YER');
  });

  it('10. Order Read-back Verification: Created order items and total match cart exactly', async () => {
    await checkoutEngine.handleCheckoutMessage('أريد سمن الماس وبسكوت ابو ولد', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('صنعاء شارع الزبيري والكاش عند الاستلام', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('الاسم علي الذيباني وهاتفي 770493341', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('نعم أؤكد الطلب', mockSession, mockContext);

    expect(createdOrdersStore).toHaveLength(1);
    const order = createdOrdersStore[0];
    expect(order.items).toHaveLength(2);
    expect(order.customerName).toBe('علي الذيباني');
    expect(order.customerPhone).toBe('770493341');
    expect(order.subtotal).toBe(2600);
    expect(order.deliveryFee).toBe(500);
    expect(order.totalAmount).toBe(3100);
  });

  it('11. Full Live Multi-turn Scenario: End-to-end checkout execution with correction', async () => {
    // Turn 1
    const t1 = await checkoutEngine.handleCheckoutMessage('أريد بسكوت أبو ولد ودلسي', mockSession, mockContext);
    expect(t1).toContain('دلسي');

    // Turn 2: Specify variant
    await checkoutEngine.handleCheckoutMessage('دلسي الصغير', mockSession, mockContext);
    expect(mockSession.checkoutState?.cart).toHaveLength(2);

    // Turn 3: Correction / Replace
    await checkoutEngine.handleCheckoutMessage('لا، بدل بسكوت أبو ولد خليه بسكوت بسكريم', mockSession, mockContext);
    const cartNames = mockSession.checkoutState?.cart.map(i => i.productName);
    expect(cartNames).toContain('بسكوت بسكريم كبير');
    expect(cartNames).toContain('دلسي صغير احمر');
    expect(cartNames).not.toContain('بسكوت ابو ولد');

    // Turn 4: Address and Payment
    await checkoutEngine.handleCheckoutMessage('العنوان صنعاء شارع الزبيري والدفع كاش عند الاستلام', mockSession, mockContext);

    // Turn 5: Name and Phone
    await checkoutEngine.handleCheckoutMessage('الاسم أحمد علي والهاتف 770493341', mockSession, mockContext);

    // Turn 6: Confirm
    const t6 = await checkoutEngine.handleCheckoutMessage('نعم أؤكد', mockSession, mockContext);
    expect(t6).toContain('تم استلام طلبك بنجاح');

    // Verify Final State
    expect(createdOrdersStore).toHaveLength(1);
    const finalOrder = createdOrdersStore[0];
    expect(finalOrder.customerName).toBe('أحمد علي');
    expect(finalOrder.customerPhone).toBe('770493341');
    expect(finalOrder.deliveryAddress).toBe('صنعاء شارع الزبيري');
    expect(finalOrder.items).toHaveLength(2);
  });
});
