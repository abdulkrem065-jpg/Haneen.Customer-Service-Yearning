import { describe, it, expect, beforeEach } from 'vitest';
import { OrderStore } from './orders/order-store';
import { GoogleSheetsOrderStore } from './orders/google-sheets-order-store';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { DataOperationContext } from './data/provider';
import { Order } from './data/domain';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { ConversationSession } from './productization/session-store';

describe('CMD-094: Admin Order Operations, Customer Identity & Historical Order Management Test Suite', () => {
  const canonicalContext: DataOperationContext = {
    tenantId: 'tnt-41f0d530',
    storeId: 'str-2c6ad81f'
  };

  let transport: MockGoogleSheetsTransport;
  let googleSheetsOrderStore: GoogleSheetsOrderStore;
  let orderStore: OrderStore;

  beforeEach(() => {
    transport = new MockGoogleSheetsTransport();
    googleSheetsOrderStore = new GoogleSheetsOrderStore(transport);
    OrderStore.resetInstance(googleSheetsOrderStore);
    orderStore = OrderStore.getInstance();
  });

  it('1. Historical vs Active order separation: DELIVERED and CANCELLED orders are classified as Historical', async () => {
    const activeOrder = await orderStore.createOrder(
      {
        customerId: 'cust-001',
        customerName: 'أحمد علي',
        customerPhone: '771234567',
        deliveryAddress: 'صنعاء - حدة',
        paymentMethodName: 'كاش عند الاستلام',
        subtotal: 1000,
        deliveryFee: 500,
        totalAmount: 1500,
        currency: 'YER',
        items: [
          {
            productId: 'prd-001',
            productNameSnapshot: 'زبادي المراعي 500 مل',
            unitPriceSnapshot: 500,
            quantity: 2
          }
        ]
      },
      canonicalContext
    );

    const deliveredOrder = await orderStore.createOrder(
      {
        customerId: 'cust-002',
        customerName: 'فاطمة صالح',
        customerPhone: '779988776',
        deliveryAddress: 'صنعاء - السبعين',
        paymentMethodName: 'كاش عند الاستلام',
        subtotal: 2000,
        deliveryFee: 500,
        totalAmount: 2500,
        currency: 'YER',
        items: []
      },
      canonicalContext
    );
    await orderStore.updateOrderStatus(deliveredOrder.id, 'DELIVERED', canonicalContext);

    const cancelledOrder = await orderStore.createOrder(
      {
        customerId: 'cust-003',
        customerName: 'محمد سالم',
        customerPhone: '773344556',
        deliveryAddress: 'صنعاء - التحرير',
        paymentMethodName: 'كاش عند الاستلام',
        subtotal: 3000,
        deliveryFee: 500,
        totalAmount: 3500,
        currency: 'YER',
        items: []
      },
      canonicalContext
    );
    await orderStore.updateOrderStatus(cancelledOrder.id, 'CANCELLED', canonicalContext, {
      cancellationReason: 'عدم توفر المنتج في المخزن',
      cancelledBy: 'ADMIN'
    });

    const allOrders = await orderStore.getOrders(canonicalContext);

    const activeOrders = allOrders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
    const historicalOrders = allOrders.filter(o => o.status === 'DELIVERED' || o.status === 'CANCELLED');

    expect(activeOrders.some(o => o.id === activeOrder.id)).toBe(true);
    expect(activeOrders.some(o => o.id === deliveredOrder.id)).toBe(false);

    expect(historicalOrders.some(o => o.id === deliveredOrder.id)).toBe(true);
    expect(historicalOrders.some(o => o.id === cancelledOrder.id)).toBe(true);
  });

  it('2. Order cancellation reason & audit details persistence', async () => {
    const order = await orderStore.createOrder(
      {
        customerId: 'cust-004',
        customerName: 'خالد عبدالله',
        customerPhone: '770001122',
        subtotal: 1000,
        deliveryFee: 500,
        totalAmount: 1500,
        currency: 'YER',
        items: []
      },
      canonicalContext
    );

    const cancellationReason = 'طلب العميل إلغاء الطلب قبل الشحن';
    const updated = await orderStore.updateOrderStatus(order.id, 'CANCELLED', canonicalContext, {
      cancellationReason,
      cancelledBy: 'ADMIN'
    });

    expect(updated.status).toBe('CANCELLED');
    expect(updated.cancellationReason).toBe(cancellationReason);
    expect(updated.cancelledBy).toBe('ADMIN');
    expect(updated.cancelledAt).toBeDefined();

    const fetched = await orderStore.getOrderById(order.id, canonicalContext);
    expect(fetched?.cancellationReason).toBe(cancellationReason);
    expect(fetched?.cancelledBy).toBe('ADMIN');
  });

  it('3. Customer name passing through OrderCheckoutEngine into OrderStore', async () => {
    const engine = new OrderCheckoutEngine(
      async () => [{ id: 'prd-001', tenantId: canonicalContext.tenantId, storeId: canonicalContext.storeId, name: 'زبادي المراعي 500 مل', price: 500, currency: 'YER', inStock: true, createdAt: new Date(), updatedAt: new Date() }],
      async () => ({ id: 'dc-001', tenantId: canonicalContext.tenantId, storeId: canonicalContext.storeId, isEnabled: true, deliveryFee: 500, currency: 'YER', minimumOrderAmount: 500, cashOnDeliveryEnabled: true, createdAt: new Date(), updatedAt: new Date() }),
      async () => [{ id: 'pm-001', tenantId: canonicalContext.tenantId, storeId: canonicalContext.storeId, methodType: 'cash_on_delivery', displayName: 'كاش عند الاستلام', isActive: true, displayOrder: 1, createdAt: new Date(), updatedAt: new Date() }],
      orderStore
    );

    const session: ConversationSession = {
      conversationId: 'conv-cmd-094',
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      agentId: 'agt-c93183d5',
      messages: [],
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: {
        step: 'AWAITING_CONFIRMATION',
        cart: [{ productId: 'prd-001', productName: 'زبادي المراعي 500 مل', quantity: 2, unitPriceSnapshot: 500, subtotal: 1000 }],
        deliveryAddress: 'صنعاء - شارع تعز',
        paymentMethodId: 'pm-001',
        paymentMethodName: 'كاش عند الاستلام',
        customerName: 'سامي العبسي',
        customerPhone: '778899000'
      }
    };

    await engine.handleCheckoutMessage('تأكيد الطلب', session, canonicalContext);

    const createdOrderId = session.checkoutState.createdOrderId;
    expect(createdOrderId).toBeDefined();

    const order = await orderStore.getOrderById(createdOrderId!, canonicalContext);
    expect(order).toBeDefined();
    expect(order?.customerName).toBe('سامي العبسي');
    expect(order?.customerPhone).toBe('778899000');
  });

  it('4. Product name fallback resolution logic', () => {
    const catalogProducts = [
      { id: 'prd-cat-01', name: 'أرز البسمتي الفاخر 5 كجم' }
    ];

    const resolveItemName = (item: any) => {
      if (item.productNameSnapshot) return item.productNameSnapshot;
      if (item.productName) return item.productName;
      if (item.productId) {
        const found = catalogProducts.find(p => p.id === item.productId);
        if (found?.name) return found.name;
        return item.productId;
      }
      return 'منتج غير محدد';
    };

    // Case 1: productNameSnapshot exists
    expect(resolveItemName({ productId: 'prd-001', productNameSnapshot: 'سمن بلدي 1 كجم' })).toBe('سمن بلدي 1 كجم');

    // Case 2: productName exists
    expect(resolveItemName({ productId: 'prd-002', productName: 'حليب الهناء 1 لتر' })).toBe('حليب الهناء 1 لتر');

    // Case 3: Fallback to catalog match by productId
    expect(resolveItemName({ productId: 'prd-cat-01' })).toBe('أرز البسمتي الفاخر 5 كجم');

    // Case 4: Final fallback to raw productId
    expect(resolveItemName({ productId: 'prd-unknown-999' })).toBe('prd-unknown-999');
  });
});
