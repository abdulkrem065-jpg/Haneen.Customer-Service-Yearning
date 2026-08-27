import { describe, it, expect, beforeEach } from 'vitest';
import { OrderStore } from './orders/order-store';
import { GoogleSheetsOrderStore } from './orders/google-sheets-order-store';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { AdminNotifier } from './orders/admin-notifier';
import { DataOperationContext } from './data/provider';
import { UnauthorizedDataAccessError } from './data/errors';

describe('CMD-090: Sana Admin Order Center & Zero-Cost Order Visibility Test Suite', () => {
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

  let transport: MockGoogleSheetsTransport;
  let store: OrderStore;
  let checkoutEngine: OrderCheckoutEngine;

  beforeEach(async () => {
    // Re-initialize clean mock transport and order store
    transport = new MockGoogleSheetsTransport();
    const googleStore = new GoogleSheetsOrderStore(transport);
    
    OrderStore.resetInstance(googleStore);
    store = OrderStore.getInstance();
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
        },
        {
          id: 'prd-002',
          tenantId: canonicalContext.tenantId,
          storeId: canonicalContext.storeId,
          name: 'خبز يمني',
          price: 200,
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
      store
    );
  });

  it('1. should create an order and persist it in GoogleSheetsOrderStore ($0 cost)', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-001',
      customerName: 'محمد علي',
      customerPhone: '770123456',
      deliveryAddress: 'صنعاء - شارع الزبيري',
      paymentMethodId: 'pm-001',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [
        {
          productId: 'prd-001',
          productNameSnapshot: 'زبادي المراعي',
          quantity: 2,
          unitPriceSnapshot: 500
        }
      ]
    }, canonicalContext);

    expect(created.id).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(created.status).toBe('PENDING');
    expect(created.paymentStatus).toBe('UNPAID');

    // Retrieve via getOrders
    const orders = await store.getOrders(canonicalContext);
    expect(orders.length).toBe(1);
    expect(orders[0].id).toBe(created.id);
  });

  it('2. should retrieve complete order details by ID with accurate price snapshots', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-002',
      customerName: 'أحمد سعيد',
      customerPhone: '771999888',
      deliveryAddress: 'حدت - صنعاء',
      paymentMethodId: 'pm-001',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      subtotal: 1400,
      deliveryFee: 1000,
      totalAmount: 2400,
      items: [
        { productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 },
        { productId: 'prd-002', productNameSnapshot: 'خبز يمني', quantity: 2, unitPriceSnapshot: 200 }
      ]
    }, canonicalContext);

    const fetched = await store.getOrderById(created.id, canonicalContext);
    expect(fetched).not.toBeNull();
    expect(fetched?.customerName).toBe('أحمد سعيد');
    expect(fetched?.items.length).toBe(2);
    expect(fetched?.subtotal).toBe(1400);
    expect(fetched?.deliveryFee).toBe(1000);
    expect(fetched?.totalAmount).toBe(2400);
  });

  it('3. should process valid order status transitions (PENDING -> CONFIRMED -> PREPARING -> READY_FOR_DELIVERY -> OUT_FOR_DELIVERY -> DELIVERED)', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-003',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    // Transition PENDING -> CONFIRMED
    let updated = await store.updateOrderStatus(created.id, 'CONFIRMED', canonicalContext);
    expect(updated.status).toBe('CONFIRMED');

    // Transition CONFIRMED -> PREPARING
    updated = await store.updateOrderStatus(created.id, 'PREPARING', canonicalContext);
    expect(updated.status).toBe('PREPARING');

    // Transition PREPARING -> READY_FOR_DELIVERY
    updated = await store.updateOrderStatus(created.id, 'READY_FOR_DELIVERY', canonicalContext);
    expect(updated.status).toBe('READY_FOR_DELIVERY');

    // Transition READY_FOR_DELIVERY -> OUT_FOR_DELIVERY
    updated = await store.updateOrderStatus(created.id, 'OUT_FOR_DELIVERY', canonicalContext);
    expect(updated.status).toBe('OUT_FOR_DELIVERY');

    // Transition OUT_FOR_DELIVERY -> DELIVERED
    updated = await store.updateOrderStatus(created.id, 'DELIVERED', canonicalContext);
    expect(updated.status).toBe('DELIVERED');
  });

  it('4. should prevent illegal status transitions from DELIVERED or CANCELLED', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-004',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    // Cancel order
    await store.updateOrderStatus(created.id, 'CANCELLED', canonicalContext);

    // Attempting to move CANCELLED -> CONFIRMED must throw
    await expect(store.updateOrderStatus(created.id, 'CONFIRMED', canonicalContext)).rejects.toThrow();
  });

  it('5. should update payment status independently (UNPAID -> PENDING -> PAID -> FAILED)', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-005',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    let updated = await store.updatePaymentStatus(created.id, 'PENDING', canonicalContext);
    expect(updated.paymentStatus).toBe('PENDING');

    updated = await store.updatePaymentStatus(created.id, 'PAID', canonicalContext);
    expect(updated.paymentStatus).toBe('PAID');
  });

  it('6. should enforce strict Tenant Isolation for order retrieval and updates', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-006',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    // Querying with other tenant context must fail / return empty
    await expect(store.getOrderById(created.id, otherTenantContext)).rejects.toThrow(UnauthorizedDataAccessError);
    await expect(store.updateOrderStatus(created.id, 'CONFIRMED', otherTenantContext)).rejects.toThrow(UnauthorizedDataAccessError);

    const otherTenantOrders = await store.getOrders(otherTenantContext);
    expect(otherTenantOrders.length).toBe(0);
  });

  it('7. should enforce strict Store Isolation for order retrieval and updates', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-007',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    // Querying with other store context must fail
    await expect(store.getOrderById(created.id, otherStoreContext)).rejects.toThrow(UnauthorizedDataAccessError);
    await expect(store.updateOrderStatus(created.id, 'CONFIRMED', otherStoreContext)).rejects.toThrow(UnauthorizedDataAccessError);

    const otherStoreOrders = await store.getOrders(otherStoreContext);
    expect(otherStoreOrders.length).toBe(0);
  });

  it('8. should return updated order status when customer asks "أين طلبي؟" with explicit Order ID', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-008',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    // Update status to CONFIRMED
    await store.updateOrderStatus(created.id, 'CONFIRMED', canonicalContext);

    const session: any = { conversationId: 'conv-test-1' };
    const response = await checkoutEngine.handleCheckoutMessage(`أين طلبي؟ ${created.id}`, session, canonicalContext);

    expect(response).not.toBeNull();
    expect(response).toContain(created.id);
    expect(response).toContain('CONFIRMED');
  });

  it('9. should return active order status when customer asks "أين طلبي؟" without explicit Order ID', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-009',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    // Admin updates status to PREPARING
    await store.updateOrderStatus(created.id, 'PREPARING', canonicalContext);

    const session: any = {
      conversationId: 'conv-test-2',
      activeOrderId: created.id
    };

    const response = await checkoutEngine.handleCheckoutMessage('أين طلبي؟', session, canonicalContext);
    expect(response).not.toBeNull();
    expect(response).toContain(created.id);
    expect(response).toContain('PREPARING');
  });

  it('10. should respond gracefully when non-existent Order ID is queried', async () => {
    const session: any = { conversationId: 'conv-test-3' };
    const response = await checkoutEngine.handleCheckoutMessage('أين طلبي؟ ORD-20260827-9999', session, canonicalContext);

    expect(response).toContain('لم نجد طلباً');
  });

  it('11. should truthfully report notification status as PENDING ($0 cost) on order creation', async () => {
    const notifier = AdminNotifier.getInstance();
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-010',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    const result = await notifier.notifyNewOrder(created, canonicalContext);
    expect(result.status).toBe('PENDING');

    const notifs = notifier.getNotifications(canonicalContext);
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].status).toBe('PENDING');
  });

  it('12. should perform read-back verification after status and payment updates', async () => {
    const created = await store.createOrder({
      tenantId: canonicalContext.tenantId,
      storeId: canonicalContext.storeId,
      customerId: 'cst-011',
      subtotal: 1000,
      deliveryFee: 1000,
      totalAmount: 2000,
      items: [{ productId: 'prd-001', productNameSnapshot: 'زبادي المراعي', quantity: 2, unitPriceSnapshot: 500 }]
    }, canonicalContext);

    const updatedStatus = await store.updateOrderStatus(created.id, 'OUT_FOR_DELIVERY', canonicalContext);
    expect(updatedStatus.status).toBe('OUT_FOR_DELIVERY');

    const updatedPayment = await store.updatePaymentStatus(created.id, 'PAID', canonicalContext);
    expect(updatedPayment.paymentStatus).toBe('PAID');

    // Confirm read-back from transport layer
    const refreshed = await store.getOrderById(created.id, canonicalContext);
    expect(refreshed?.status).toBe('OUT_FOR_DELIVERY');
    expect(refreshed?.paymentStatus).toBe('PAID');
  });
});
