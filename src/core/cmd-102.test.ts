import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { ConversationSession } from './productization/session-store';
import { DataOperationContext } from './data/provider';
import { Product, PaymentMethod } from './data/domain';
import { UniversalLanguageUnderstandingProvider } from './nlu/language-understanding';

describe('CMD-102 — Sana Core Refactor & Universal Understanding', () => {
  let checkoutEngine: OrderCheckoutEngine;
  let nluProvider: UniversalLanguageUnderstandingProvider;
  let mockContext: DataOperationContext;
  let mockSession: ConversationSession;

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
    { id: 'pay-jawali', displayName: 'جوالي / محفظة جوالي', methodType: 'wallet', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 2, createdAt: new Date(), updatedAt: new Date() },
    { id: 'pay-jeeb', displayName: 'محفظة جيب', methodType: 'wallet', isActive: true, tenantId: 'tnt-test', storeId: 'str-test', displayOrder: 3, createdAt: new Date(), updatedAt: new Date() }
  ];

  beforeEach(() => {
    mockContext = { tenantId: 'tnt-test', storeId: 'str-test' };
    mockSession = {
      conversationId: 'conv-102-test',
      customerPhone: '774780112',
      customerName: 'علي الذيباني',
      channel: 'WEB',
      status: 'ACTIVE',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: { cart: [], step: 'NO_ORDER' }
    } as any;

    const mockOrderStore = {
      createOrder: vi.fn().mockImplementation(async (orderData) => ({
        id: 'ORD-20260901-0102',
        ...orderData,
        status: 'PENDING',
        createdAt: new Date()
      })),
      getOrderById: vi.fn().mockImplementation(async (id) => ({
        id,
        status: 'PENDING',
        totalAmount: 3000
      }))
    };

    const mockAdminNotifier = {
      notifyNewOrder: vi.fn().mockResolvedValue({ success: true, notificationId: 'notif-102', status: 'SENT' }),
      getNotifications: vi.fn().mockReturnValue([]),
      clear: vi.fn()
    };

    nluProvider = new UniversalLanguageUnderstandingProvider();
    checkoutEngine = new OrderCheckoutEngine(
      async () => mockCatalog,
      async () => ({ deliveryFee: 500, isEnabled: true } as any),
      async () => mockPaymentMethods,
      mockOrderStore,
      mockAdminNotifier
    );
  });

  it('1. Live Test Case: "أبي سمن الماس" resolves intent=PURCHASE and adds product correctly', async () => {
    const res = await checkoutEngine.handleCheckoutMessage('أبي سمن الماس', mockSession, mockContext);
    expect(res).toBeDefined();
    expect(mockSession.checkoutState?.cart).toHaveLength(1);
    expect(mockSession.checkoutState?.cart[0].productName).toContain('سمن الماس');
    expect(mockSession.checkoutState?.cart[0].unitPriceSnapshot).toBe(2500);
  });

  it('2. Live Test Case: "أبي علبة الماس" resolves "علبة" unit phrase to "سمن الماس"', async () => {
    const res = await checkoutEngine.handleCheckoutMessage('أبي علبة الماس', mockSession, mockContext);
    expect(res).toBeDefined();
    expect(mockSession.checkoutState?.cart).toHaveLength(1);
    expect(mockSession.checkoutState?.cart[0].productName).toContain('سمن الماس');
  });

  it('3. Live Test Case: "أبغى كيلو من السكر حقكم" resolves unit/possessive phrase to "سكر السعيد ابو كيلو"', async () => {
    const res = await checkoutEngine.handleCheckoutMessage('أبغى كيلو من السكر حقكم', mockSession, mockContext);
    expect(res).toBeDefined();
    expect(mockSession.checkoutState?.cart).toHaveLength(1);
    expect(mockSession.checkoutState?.cart[0].productName).toContain('سكر السعيد');
  });

  it('4. Live Test Case: "عندكم بسكوت للعيال؟" triggers availability/recommendation query without mutating cart', async () => {
    const res = await checkoutEngine.handleCheckoutMessage('عندكم بسكوت للعيال؟', mockSession, mockContext);
    expect(res).toBeDefined();
    expect(res).toContain('بسكوت');
    expect(mockSession.checkoutState?.cart).toHaveLength(0); // ZERO mutation!
  });

  it('5. Live Test Case: "الدفع بالجيب" resolves payment method to "محفظة جيب"', async () => {
    // Stage 1 item first
    await checkoutEngine.handleCheckoutMessage('أبي سمن الماس', mockSession, mockContext);
    const res = await checkoutEngine.handleCheckoutMessage('الدفع بالجيب', mockSession, mockContext);

    expect(mockSession.checkoutState?.paymentMethodId).toBe('pay-jeeb');
    expect(mockSession.checkoutState?.paymentMethodName).toContain('جيب');
  });

  it('6. Live Test Case: Unknown item "تونة داكون" returns NOT FOUND without silent substitution', async () => {
    const res = await checkoutEngine.handleCheckoutMessage('أريد تونة داكون', mockSession, mockContext);
    expect(res).toContain('لم نجد');
    expect(mockSession.checkoutState?.cart).toHaveLength(0); // Never substitute!
  });

  it('7. Universal NLU Provider: parses phone-only message correctly', async () => {
    const intent = await nluProvider.understand('774780112');
    expect(intent.intent).toBe('PHONE_PROVIDE');
    expect(intent.customerPhone).toBe('774780112');
  });

  it('8. Complete Flow: item -> address + payment -> confirmation creates order', async () => {
    await checkoutEngine.handleCheckoutMessage('أبي سمن الماس', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('شارع الزبيري جوار برج الأمل', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('كاش عند الاستلام', mockSession, mockContext);
    await checkoutEngine.handleCheckoutMessage('الاسم علي الذيباني وهاتفي 774780112', mockSession, mockContext);
    const confirmRes = await checkoutEngine.handleCheckoutMessage('نعم أؤكد الطلب', mockSession, mockContext);

    expect(confirmRes).toContain('تم استلام طلبك بنجاح');
    expect(confirmRes).toContain('ORD-20260901-0102');
  });
});
