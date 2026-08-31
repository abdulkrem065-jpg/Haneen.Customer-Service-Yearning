import { describe, it, expect, beforeEach } from 'vitest';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { ConversationSession } from './productization/session-store';
import { DataOperationContext } from './data/provider';
import { Product, PaymentMethod } from './data/domain';
import { PersistentOrderStore } from './orders/order-store';

describe('CMD-098 — Sana Checkout State Machine, Cart Semantics & Phone Fix', () => {
  let engine: OrderCheckoutEngine;
  let session: ConversationSession;
  let context: DataOperationContext;
  let orderStore: PersistentOrderStore;

  const mockCatalog: Product[] = [
    { id: 'prod-sugar', name: 'سكر السعيد ابو كيلو', price: 500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-samn-almas', name: 'سمن الماس', price: 2500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-samn-baladi', name: 'سمن بلدي ممتاز', price: 3500, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-biscuit-deemah', name: 'بسكوت نخالة ديمه', price: 150, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-tuna-raqi', name: 'تونة راقي صغير', price: 400, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-dalsey-red-sm', name: 'دلسي صغير احمر', price: 200, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
    { id: 'prod-dalsey-red-lg', name: 'دلسي كبير احمر', price: 400, inStock: true, tenantId: 'tnt-test', storeId: 'str-test', currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
  ];

  const mockPayments: PaymentMethod[] = [
    { id: 'pay-cod', displayName: 'كاش عند الاستلام', methodType: 'cash_on_delivery', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 'pay-jawali', displayName: 'محفظة جوالي', methodType: 'wallet', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 2, createdAt: new Date(), updatedAt: new Date() }
  ];

  beforeEach(async () => {
    orderStore = new PersistentOrderStore(':memory:');
    await orderStore.clear();
    engine = new OrderCheckoutEngine(
      async () => mockCatalog,
      async () => ({ id: 'deliv-test', isEnabled: true, deliveryFee: 500, tenantId: 'tnt-test', storeId: 'str-test', createdAt: new Date(), updatedAt: new Date() }),
      async () => mockPayments,
      orderStore
    );

    session = {
      conversationId: 'conv-098-test',
      tenantId: 'tnt-test',
      storeId: 'str-test',
      agentId: 'agt-test',
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

  it('1. ADD_ITEM semantics', async () => {
    await engine.handleCheckoutMessage('أريد 1 كيلو سكر', session, context);
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-sugar');
    expect(session.checkoutState?.cart[0].quantity).toBe(1);
  });

  it('2. SET_ITEM_QUANTITY semantics', async () => {
    await engine.handleCheckoutMessage('أريد 1 كيلو سكر', session, context);
    await engine.handleCheckoutMessage('اجعل السكر 3', session, context);
    const item = session.checkoutState?.cart.find(c => c.productId === 'prod-sugar');
    expect(item?.quantity).toBe(3);
    expect(item?.subtotal).toBe(1500);
  });

  it('3. REMOVE_ITEM semantics', async () => {
    await engine.handleCheckoutMessage('أريد 1 كيلو سكر و 1 دلسي صغير احمر', session, context);
    expect(session.checkoutState?.cart.length).toBe(2);
    await engine.handleCheckoutMessage('احذف السكر', session, context);
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-dalsey-red-sm');
  });

  it('4. REPLACE_CART semantics', async () => {
    await engine.handleCheckoutMessage('أريد 1 كيلو سكر', session, context);
    const res = await engine.handleCheckoutMessage('عدّل الطلب إلى 1 دلسي صغير احمر', session, context);
    expect(res).toContain('تم تعديل ومزامنة طلبك بنجاح');
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-dalsey-red-sm');
  });

  it('5. RECONCILE_CART semantics', async () => {
    await engine.handleCheckoutMessage('أريد 2 كيلو سكر و1 دلسي صغير احمر', session, context);
    await engine.handleCheckoutMessage('الطلب هو 1 كيلو سكر فقط', session, context);
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-sugar');
    expect(session.checkoutState?.cart[0].quantity).toBe(1);
  });

  it('6. Repeated order message does not duplicate quantities under RECONCILE_CART', async () => {
    await engine.handleCheckoutMessage('أريد 1 كيلو سكر و1 دلسي صغير احمر', session, context);
    await engine.handleCheckoutMessage('ركز على الطلب: 1 كيلو سكر و1 دلسي صغير احمر', session, context);
    expect(session.checkoutState?.cart.length).toBe(2);
    const sugar = session.checkoutState?.cart.find(c => c.productId === 'prod-sugar');
    const dalsey = session.checkoutState?.cart.find(c => c.productId === 'prod-dalsey-red-sm');
    expect(sugar?.quantity).toBe(1);
    expect(dalsey?.quantity).toBe(1);
  });

  it('7. "ركز على الطلب" reconciles cart accurately', async () => {
    await engine.handleCheckoutMessage('أريد 2 سمن الماس', session, context);
    await engine.handleCheckoutMessage('ركز على الطلب أريد 1 كيلو سكر و1 دلسي صغير احمر', session, context);
    const prodIds = session.checkoutState?.cart.map(c => c.productId);
    expect(prodIds).toContain('prod-sugar');
    expect(prodIds).toContain('prod-dalsey-red-sm');
    expect(prodIds).not.toContain('prod-samn-almas');
  });

  it('8. Phrase segmentation', async () => {
    const segments = engine.splitUserTextIntoItemPhrases('1 كيلو سكر و 2 بسكوت نخالة ديمه');
    expect(segments.length).toBe(2);
    expect(segments[0].quantity).toBe(1);
    expect(segments[1].quantity).toBe(2);
  });

  it('9. "كيلو سكر" resolution', async () => {
    const res = engine.resolveSingleProductItem({
      rawText: 'كيلو سكر',
      queryPhrase: 'سكر',
      normalizedQuery: 'سكر',
      quantity: 1
    }, mockCatalog);
    expect(res.status).toBe('RESOLVED');
    expect(res.product?.id).toBe('prod-sugar');
  });

  it('10. Generic "سمن" clarification', async () => {
    const res = await engine.handleCheckoutMessage('أريد سمن', session, context);
    expect(res).toContain('تتوفر لدينا عدة أنواع مطابقة لـ (سمن)');
    expect(session.checkoutState?.cart.length).toBe(0);
  });

  it('11. "تونة داكون" no substitution', async () => {
    const res = await engine.handleCheckoutMessage('أريد 1 تونة داكون', session, context);
    expect(res).toContain('لم نجد منتج (تونة داكون) بهذا الاسم في المتجر');
    expect(session.checkoutState?.cart.length).toBe(0);
  });

  it('12. "دلسي صغير أحمر" unique resolution', async () => {
    await engine.handleCheckoutMessage('أريد 1 دلسي صغير احمر', session, context);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-dalsey-red-sm');
  });

  it('13. Phone-only message in AWAITING_CUSTOMER_INFO step', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'محفظة جوالي',
      step: 'AWAITING_CUSTOMER_INFO'
    };
    const res = await engine.handleCheckoutMessage('7747480112', session, context);
    expect(session.checkoutState?.customerPhone).toBe('7747480112');
    expect(session.checkoutState?.step).toBe('AWAITING_CONFIRMATION');
    expect(res).toContain('ملخص الطلب:');
  });

  it('14. Yemen phone validation (7747480112)', () => {
    const phone = engine.extractYemenPhone('7747480112');
    expect(phone).toBe('7747480112');
  });

  it('15. Phone persistence across messages', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    await engine.handleCheckoutMessage('رقمي 7747480112', session, context);
    expect(session.checkoutState?.customerPhone).toBe('7747480112');
    await engine.handleCheckoutMessage('شارع النصر صنعاء طريقة الدفع جوالي', session, context);
    expect(session.checkoutState?.customerPhone).toBe('7747480112');
  });

  it('16. Phone does not disappear after summary', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    await engine.handleCheckoutMessage('الاسم عبدالكريم رقم الهاتف 7747480112', session, context);
    await engine.handleCheckoutMessage('شارع النصر صنعاء طريقة الدفع جوالي', session, context);
    expect(session.checkoutState?.customerPhone).toBe('7747480112');
    expect(session.checkoutState?.step).toBe('AWAITING_CONFIRMATION');
  });

  it('17. Name persistence', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    await engine.handleCheckoutMessage('الاسم عبدالكريم رقم الهاتف 7747480112', session, context);
    expect(session.checkoutState?.customerName).toBe('عبدالكريم');
  });

  it('18. Address persistence', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    await engine.handleCheckoutMessage('عنواني شارع النصر صنعاء', session, context);
    expect(session.checkoutState?.deliveryAddress).toContain('شارع النصر');
  });

  it('19. Payment persistence', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      step: 'AWAITING_ADDRESS_AND_PAYMENT'
    };
    await engine.handleCheckoutMessage('طريقة الدفع جوالي', session, context);
    expect(session.checkoutState?.paymentMethodId).toBe('pay-jawali');
  });

  it('20. Complete checkout state progression', async () => {
    await engine.handleCheckoutMessage('أريد 1 كيلو سكر', session, context);
    expect(session.checkoutState?.step).toBe('AWAITING_ADDRESS_AND_PAYMENT');

    await engine.handleCheckoutMessage('الاسم عبدالكريم 7747480112 شارع النصر صنعاء طريقة الدفع جوالي', session, context);
    expect(session.checkoutState?.step).toBe('AWAITING_CONFIRMATION');
    expect(session.checkoutState?.customerPhone).toBe('7747480112');
  });

  it('21. Confirmation creates order', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'محفظة جوالي',
      customerName: 'عبدالكريم',
      customerPhone: '7747480112',
      step: 'AWAITING_CONFIRMATION'
    };
    const res = await engine.handleCheckoutMessage('نعم', session, context);
    expect(res).toContain('تم استلام طلبك بنجاح. رقم طلبك: ORD-');
    expect(session.checkoutState?.step).toBe('ORDER_CREATED');
    expect(session.checkoutState?.createdOrderId).toBeDefined();
  });

  it('22. Repeated confirmation idempotency', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'محفظة جوالي',
      customerName: 'عبدالكريم',
      customerPhone: '7747480112',
      step: 'AWAITING_CONFIRMATION'
    };
    await engine.handleCheckoutMessage('نعم', session, context);
    const orderId = session.checkoutState?.createdOrderId;
    const res2 = await engine.handleCheckoutMessage('نعم', session, context);
    expect(res2).toContain(orderId);
    expect(res2).toContain('تم استلام طلبك سابقاً بنجاح');
  });

  it('23. No order before confirmation', async () => {
    await engine.handleCheckoutMessage('أريد 1 كيلو سكر', session, context);
    const allOrders = await orderStore.getAllOrders(context);
    expect(allOrders.length).toBe(0);
  });

  it('24. Session isolation', async () => {
    const session2: ConversationSession = {
      conversationId: 'conv-098-test-2',
      tenantId: 'tnt-test',
      storeId: 'str-test',
      agentId: 'agt-test',
      status: 'ACTIVE',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: { cart: [], step: 'NO_ORDER' }
    };
    await engine.handleCheckoutMessage('أريد 1 كيلو سكر', session, context);
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session2.checkoutState?.cart.length).toBe(0);
  });

  it('25. No fake phone accepted', () => {
    const phone = engine.extractYemenPhone('لا يوجد رقم هاتف 1234');
    expect(phone).toBeNull();
  });

  it('26. No wrong product substitution', async () => {
    const res = await engine.handleCheckoutMessage('أريد 1 تونة داكون', session, context);
    expect(res).toContain('لم نجد منتج (تونة داكون) بهذا الاسم في المتجر');
    expect(session.checkoutState?.cart.length).toBe(0);
  });

  it('27. No multi-add on ambiguous items', async () => {
    const res = await engine.handleCheckoutMessage('أريد سمن', session, context);
    expect(res).toContain('تتوفر لدينا عدة أنواع مطابقة لـ (سمن)');
    expect(session.checkoutState?.cart.length).toBe(0);
  });

  it('28. Order persistence in store', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'محفظة جوالي',
      customerName: 'عبدالكريم',
      customerPhone: '7747480112',
      step: 'AWAITING_CONFIRMATION'
    };
    await engine.handleCheckoutMessage('أؤكد الطلب', session, context);
    const createdId = session.checkoutState?.createdOrderId;
    expect(createdId).toBeDefined();
    const persisted = await orderStore.getOrderById(createdId!, context);
    expect(persisted).toBeDefined();
    expect(persisted?.customerPhone).toBe('7747480112');
  });

  it('29. Read-back created order details', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 2, unitPriceSnapshot: 500, subtotal: 1000 }],
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'محفظة جوالي',
      customerName: 'عبدالكريم',
      customerPhone: '7747480112',
      step: 'AWAITING_CONFIRMATION'
    };
    await engine.handleCheckoutMessage('موافق', session, context);
    const createdId = session.checkoutState?.createdOrderId;
    const order = await orderStore.getOrderById(createdId!, context);
    expect(order?.customerName).toBe('عبدالكريم');
    expect(order?.customerPhone).toBe('7747480112');
    expect(order?.deliveryAddress).toBe('شارع النصر صنعاء');
    expect(order?.paymentMethodId).toBe('pay-jawali');
    expect(order?.totalAmount).toBe(1500); // 1000 + 500 fee
    expect(order?.items.length).toBe(1);
    expect(order?.items[0].quantity).toBe(2);
  });

  it('30. False success prevention when phone is missing', async () => {
    session.checkoutState = {
      cart: [{ productId: 'prod-sugar', productName: 'سكر السعيد ابو كيلو', quantity: 1, unitPriceSnapshot: 500, subtotal: 500 }],
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'محفظة جوالي',
      step: 'AWAITING_CONFIRMATION'
    };
    const res = await engine.handleCheckoutMessage('نعم', session, context);
    expect(res).toContain('يرجى تزويدنا برقم الهاتف');
    expect(session.checkoutState?.step).toBe('AWAITING_CUSTOMER_INFO');
    expect(session.checkoutState?.createdOrderId).toBeUndefined();
  });
});
