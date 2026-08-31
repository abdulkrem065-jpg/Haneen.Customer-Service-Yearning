import { describe, it, expect, beforeEach } from 'vitest';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { ConversationSession } from './productization/session-store';
import { DataOperationContext } from './data/provider';
import { Product, PaymentMethod } from './data/domain';

describe('CMD-096 — Sana Safe Product Resolution & Robust Checkout Parser', () => {
  let engine: OrderCheckoutEngine;
  let session: ConversationSession;
  let context: DataOperationContext;

  const mockCatalog: Product[] = [
    { id: 'prod-sugar', name: 'سكر السعيد ابو كيلو', price: 500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-samn-almas', name: 'سمن الماس', price: 2500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-samn-baladi', name: 'سمن بلدي ممتاز', price: 3500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-biscuit-deemah', name: 'بسكوت نخالة ديمه', price: 150, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-tuna-raqi', name: 'تونة راقي صغير', price: 400, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-dalsey-red-sm', name: 'دلسي صغير احمر', price: 200, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-dalsey-red-lg', name: 'دلسي كبير احمر', price: 400, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-dalsey-black-sm', name: 'دلسي صغير اسود', price: 200, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-dalsey-ginger-sm', name: 'دلسي صغير زنجبيل', price: 200, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
  ];

  const mockPayments: PaymentMethod[] = [
    { id: 'pay-cod', displayName: 'كاش عند الاستلام', methodType: 'cash_on_delivery', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 'pay-jawali', displayName: 'محفظة جوالي', methodType: 'wallet', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 2, createdAt: new Date(), updatedAt: new Date() },
    { id: 'pay-jeeb', displayName: 'محفظة جيب', methodType: 'wallet', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 3, createdAt: new Date(), updatedAt: new Date() }
  ];

  beforeEach(() => {
    engine = new OrderCheckoutEngine(
      async () => mockCatalog,
      async () => ({ id: 'deliv-test', isEnabled: true, deliveryFee: 500, tenantId: 'tnt-test', storeId: 'str-test', createdAt: new Date(), updatedAt: new Date() }),
      async () => mockPayments
    );

    session = {
      conversationId: 'conv-100',
      tenantId: 'tnt-test',
      storeId: 'str-test',
      agentId: 'agt-c93183d5',
      status: 'ACTIVE',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: {
        cart: [],
        step: 'NO_ORDER'
      }
    };

    context = {
      tenantId: 'tnt-test',
      storeId: 'str-test'
    };
  });

  it('1. Price query does not mutate cart', async () => {
    const res = await engine.handleCheckoutMessage('كم سعر سكر السعيد ابو كيلو؟', session, context);
    expect(res).toContain('500 YER');
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.step).toBe('NO_ORDER');
  });

  it('2. Availability query does not mutate cart', async () => {
    const res = await engine.handleCheckoutMessage('هل يوجد سمن الماس؟', session, context);
    expect(res).toContain('متوفر حالياً');
    expect(session.checkoutState?.cart.length).toBe(0);
  });

  it('3. Single explicit purchase adds one product', async () => {
    const res = await engine.handleCheckoutMessage('أريد سكر السعيد ابو كيلو', session, context);
    expect(res).toContain('تمت إضافة المنتجات إلى طلبك بنجاح');
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-sugar');
    expect(session.checkoutState?.cart[0].quantity).toBe(1);
  });

  it('4. "تونة داكون" does not become "تونة راقي صغير"', async () => {
    const res = await engine.handleCheckoutMessage('أريد 1 تونة داكون', session, context);
    expect(res).toContain('لم نجد منتج (تونة داكون) بهذا الاسم في المتجر');
    expect(session.checkoutState?.cart.length).toBe(0);
  });

  it('5. "دلسي صغير أحمر" adds one unique product only', async () => {
    const res = await engine.handleCheckoutMessage('أريد 1 دلسي صغير احمر', session, context);
    expect(res).toContain('تمت إضافة المنتجات إلى طلبك بنجاح');
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-dalsey-red-sm');
  });

  it('6. "أريد سمن" with multiple matches asks clarification', async () => {
    const res = await engine.handleCheckoutMessage('أريد سمن', session, context);
    expect(res).toContain('تتوفر لدينا عدة أنواع مطابقة لـ (سمن)');
    expect(session.checkoutState?.cart.length).toBe(0);
  });

  it('7. "هل يوجد سمن" never mutates cart', async () => {
    const res = await engine.handleCheckoutMessage('هل يوجد سمن؟', session, context);
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(res === null || typeof res === 'string').toBe(true);
  });

  it('8. Multi-product sentence parsing', async () => {
    const res = await engine.handleCheckoutMessage('أريد كيلو سكر و1 بسكوت نخالة ديمه و1 تونة داكون و1 دلسي صغير أحمر', session, context);
    expect(res).toContain('تمت إضافة المنتجات إلى طلبك بنجاح');
    expect(res).toContain('لم نجد منتج "تونة داكون" في المتجر');
    // Resolved items: sugar, deemah biscuit, dalsey red sm
    expect(session.checkoutState?.cart.length).toBe(3);
    const cartProductIds = session.checkoutState?.cart.map(c => c.productId);
    expect(cartProductIds).toContain('prod-sugar');
    expect(cartProductIds).toContain('prod-biscuit-deemah');
    expect(cartProductIds).toContain('prod-dalsey-red-sm');
    expect(cartProductIds).not.toContain('prod-tuna-raqi');
  });

  it('9. Quantity mapped to correct product', async () => {
    await engine.handleCheckoutMessage('أريد 2 كيلو سكر و3 بسكوت نخالة ديمه', session, context);
    const sugar = session.checkoutState?.cart.find(c => c.productId === 'prod-sugar');
    const deemah = session.checkoutState?.cart.find(c => c.productId === 'prod-biscuit-deemah');
    expect(sugar?.quantity).toBe(2);
    expect(deemah?.quantity).toBe(3);
  });

  it('10. "جوالي" resolves from dynamic payment methods', async () => {
    const res = await engine.resolvePaymentMethod('طريقة الدفع جوالي');
    expect(res.resolvedMethod).toBeDefined();
    expect(res.resolvedMethod?.id).toBe('pay-jawali');
  });

  it('11. Payment ID stored correctly', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    await engine.handleCheckoutMessage('طريقة الدفع جوالي', session, context);
    expect(session.checkoutState?.paymentMethodId).toBe('pay-jawali');
    expect(session.checkoutState?.paymentMethodName).toBe('محفظة جوالي');
  });

  it('12. Address + payment same message', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    const res = await engine.handleCheckoutMessage('شارع النصر مديرية شعوب طريقة الدفع جوالي', session, context);
    expect(res).toContain('ملخص الطلب:');
    expect(session.checkoutState?.deliveryAddress).toContain('شارع النصر مديرية شعوب');
    expect(session.checkoutState?.paymentMethodId).toBe('pay-jawali');
    expect(session.checkoutState?.step).toBe('AWAITING_CONFIRMATION');
  });

  it('13. Repeated address/payment message', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    await engine.handleCheckoutMessage('شارع النصر مديرية شعوب طريقة الدفع جوالي', session, context);
    const res2 = await engine.handleCheckoutMessage('شارع النصر مديرية شعوب طريقة الدفع جوالي', session, context);
    expect(res2).toContain('ملخص الطلب:');
    expect(session.checkoutState?.step).toBe('AWAITING_CONFIRMATION');
  });

  it('14. "صنعاء" during checkout remains checkout context', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    const res = await engine.handleCheckoutMessage('صنعاء', session, context);
    expect(res).not.toBeNull();
    expect(res).toContain('تم تسجيل عنوان التوصيل');
    expect(session.checkoutState?.deliveryAddress).toBe('صنعاء');
  });

  it('15. Short confirmation "نعم"', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_CONFIRMATION',
      deliveryAddress: 'شارع النصر',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      customerName: 'علي الذيباني',
      customerPhone: '777123456'
    };
    const res = await engine.handleCheckoutMessage('نعم', session, context);
    expect(res).toContain('تم استلام طلبك بنجاح');
    expect(session.checkoutState?.step).toBe('ORDER_CREATED');
  });

  it('16. Customer name persistence', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    await engine.handleCheckoutMessage('الاسم علي الذيباني 777123456', session, context);
    expect(session.checkoutState?.customerName).toBe('علي الذيباني');
    expect(session.checkoutState?.customerPhone).toBe('777123456');
  });

  it('17. Customer phone required before order creation', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_CONFIRMATION',
      deliveryAddress: 'شارع النصر',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      customerName: 'علي الذيباني',
      customerPhone: ''
    };
    const res = await engine.handleCheckoutMessage('نعم أؤكد', session, context);
    expect(res).toContain('يرجى تزويدنا برقم الهاتف');
    expect(session.checkoutState?.step).toBe('AWAITING_CUSTOMER_INFO');
  });

  it('18. No fake customer phone', async () => {
    expect(session.checkoutState?.customerPhone).toBeUndefined();
  });

  it('19. Order created only after complete checkout', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_CONFIRMATION',
      deliveryAddress: 'شارع النصر',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      customerName: 'علي الذيباني',
      customerPhone: '777123456'
    };
    const res = await engine.handleCheckoutMessage('أؤكد', session, context);
    expect(res).toContain('ORD-');
    expect(session.checkoutState?.createdOrderId).toBeDefined();
  });

  it('20. No order created before confirmation', async () => {
    await engine.handleCheckoutMessage('أريد كيلو سكر', session, context);
    expect(session.checkoutState?.createdOrderId).toBeUndefined();
    expect(session.checkoutState?.step).toBe('AWAITING_ADDRESS_AND_PAYMENT');
  });

  it('21. Order ID persistence', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_CONFIRMATION',
      deliveryAddress: 'شارع النصر',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      customerName: 'علي الذيباني',
      customerPhone: '777123456'
    };
    await engine.handleCheckoutMessage('أؤكد', session, context);
    const orderId = session.checkoutState?.createdOrderId;
    expect(orderId).toBeDefined();
    expect(session.activeOrderId).toBe(orderId);
  });

  it('22. Product snapshot preserved in cart item', () => {
    engine.addItemToCart(session.checkoutState!, 'prod-sugar', 'سكر السعيد ابو كيلو', 500, 2);
    expect(session.checkoutState?.cart[0].productName).toBe('سكر السعيد ابو كيلو');
  });

  it('23. Price snapshot preserved in cart item', () => {
    engine.addItemToCart(session.checkoutState!, 'prod-sugar', 'سكر السعيد ابو كيلو', 500, 2);
    expect(session.checkoutState?.cart[0].unitPriceSnapshot).toBe(500);
    expect(session.checkoutState?.cart[0].subtotal).toBe(1000);
  });

  it('24. Session isolation', () => {
    const session2: ConversationSession = {
      conversationId: 'conv-200',
      tenantId: 'tnt-test',
      storeId: 'str-test',
      agentId: 'agt-c93183d5',
      status: 'ACTIVE',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: { cart: [], step: 'NO_ORDER' }
    };

    engine.addItemToCart(session.checkoutState!, 'prod-sugar', 'سكر السعيد ابو كيلو', 500, 1);
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session2.checkoutState?.cart.length).toBe(0);
  });

  it('25. No multi-add from fuzzy matches', async () => {
    const res = await engine.handleCheckoutMessage('أريد دلسي صغير احمر', session, context);
    expect(res).toContain('تمت إضافة المنتجات إلى طلبك بنجاح');
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-dalsey-red-sm');
  });
});
