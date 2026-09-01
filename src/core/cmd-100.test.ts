import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleSheetsOrderStore } from './orders/google-sheets-order-store';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { OrderMapper, OrderItemMapper } from '../infrastructure/google-sheets/domain-mappers';
import { HeaderMap, HeaderSchemaError } from '../infrastructure/google-sheets/header-map';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { DataOperationContext } from './data/provider';
import { CanonicalSchemas } from '../infrastructure/google-sheets/schema-definitions';

describe('CMD-100 — Google Sheets Order Schema Self-Healing & Complete Order Data Read-Back', () => {
  let transport: MockGoogleSheetsTransport;
  let orderStore: GoogleSheetsOrderStore;
  const context: DataOperationContext = { tenantId: 'tenant-123', storeId: 'store-456' };

  beforeEach(() => {
    transport = new MockGoogleSheetsTransport();
    orderStore = new GoogleSheetsOrderStore(transport);
  });

  // 1. missing order header detection
  it('1. missing order header detection', async () => {
    // Seed sheet with required headers only
    const requiredOnly = CanonicalSchemas.orders.requiredHeaders; // ['id', 'tenantId', 'storeId', 'customerId', 'totalAmount', 'currency', 'status', 'createdAt', 'updatedAt']
    await transport.writeHeaderRow('orders', requiredOnly);

    const result = await orderStore.ensureSchema();
    expect(result.ordersAdded).toContain('customerName');
    expect(result.ordersAdded).toContain('customerPhone');
    expect(result.ordersAdded).toContain('deliveryAddress');
    expect(result.ordersAdded).toContain('paymentMethodId');
    expect(result.ordersAdded).toContain('paymentMethodName');
    expect(result.ordersAdded).toContain('subtotal');
    expect(result.ordersAdded).toContain('deliveryFee');
  });

  // 2. auto append missing header
  it('2. auto append missing header', async () => {
    const requiredOnly = CanonicalSchemas.orders.requiredHeaders;
    await transport.writeHeaderRow('orders', requiredOnly);

    await orderStore.ensureSchema();

    const rows = await transport.getRows('orders');
    const updatedHeaders = rows[0].values;

    // Must preserve original 9 headers at start
    expect(updatedHeaders.slice(0, requiredOnly.length)).toEqual(requiredOnly);
    // Must contain appended missing headers
    expect(updatedHeaders).toContain('customerName');
    expect(updatedHeaders).toContain('customerPhone');
    expect(updatedHeaders).toContain('deliveryAddress');
  });

  // 3. missing order_item header detection
  it('3. missing order_item header detection', async () => {
    const itemRequiredOnly = CanonicalSchemas.order_items.requiredHeaders; // ['id', 'orderId', 'productId', 'quantity', 'unitPrice', 'totalPrice']
    await transport.writeHeaderRow('order_items', itemRequiredOnly);

    const result = await orderStore.ensureSchema();
    expect(result.orderItemsAdded).toContain('productNameSnapshot');
    expect(result.orderItemsAdded).toContain('unitPriceSnapshot');
    expect(result.orderItemsAdded).toContain('subtotal');
  });

  // 4. auto append productNameSnapshot
  it('4. auto append productNameSnapshot', async () => {
    const itemRequiredOnly = CanonicalSchemas.order_items.requiredHeaders;
    await transport.writeHeaderRow('order_items', itemRequiredOnly);

    await orderStore.ensureSchema();

    const rows = await transport.getRows('order_items');
    expect(rows[0].values).toContain('productNameSnapshot');
  });

  // 5. idempotent ensureSchema
  it('5. idempotent ensureSchema', async () => {
    await orderStore.ensureSchema();
    const rowsAfterFirst = await transport.getRows('orders');
    const headersFirstRun = [...rowsAfterFirst[0].values];

    const resultSecondRun = await orderStore.ensureSchema();
    const rowsAfterSecond = await transport.getRows('orders');

    expect(resultSecondRun.ordersAdded).toEqual([]);
    expect(resultSecondRun.orderItemsAdded).toEqual([]);
    expect(rowsAfterSecond[0].values).toEqual(headersFirstRun);
  });

  // 6. mapper writes all fields
  it('6. mapper writes all fields', async () => {
    await orderStore.ensureSchema();
    const orderRows = await transport.getRows('orders');
    const orderHeaderMap = new HeaderMap(orderRows[0].values, CanonicalSchemas.orders.requiredHeaders);

    const orderMapper = new OrderMapper();
    const testOrder: any = {
      id: 'ORD-20260901-0001',
      tenantId: 'tenant-123',
      storeId: 'store-456',
      customerId: 'cst-web-customer',
      customerName: 'علي',
      customerPhone: '774780112',
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'جوالي',
      paymentStatus: 'UNPAID',
      subtotal: 5000,
      deliveryFee: 500,
      totalAmount: 5500,
      total: 5500,
      currency: 'YER',
      status: 'PENDING',
      notes: 'لا يوجد',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const rowValues = orderMapper.toRow(testOrder, orderHeaderMap);
    expect(rowValues[orderHeaderMap.getIndex('customerName')!]).toBe('علي');
    expect(rowValues[orderHeaderMap.getIndex('customerPhone')!]).toBe('774780112');
    expect(rowValues[orderHeaderMap.getIndex('deliveryAddress')!]).toBe('شارع النصر صنعاء');
    expect(rowValues[orderHeaderMap.getIndex('paymentMethodName')!]).toBe('جوالي');
  });

  // 7. customerName persistence
  it('7. customerName persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي الذهبي',
      customerPhone: '774780112',
      items: [{ productId: 'p1', productNameSnapshot: 'سكر السعيد', quantity: 1, unitPriceSnapshot: 3000 }],
      subtotal: 3000,
      deliveryFee: 500,
      totalAmount: 3500,
      deliveryAddress: 'صنعاء',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام'
    }, context);

    expect(created.customerName).toBe('علي الذهبي');
    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.customerName).toBe('علي الذهبي');
  });

  // 8. customerPhone persistence
  it('8. customerPhone persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي',
      customerPhone: '774780112',
      items: [{ productId: 'p1', productNameSnapshot: 'سمن الماس', quantity: 1, unitPriceSnapshot: 4000 }],
      subtotal: 4000,
      deliveryFee: 500,
      totalAmount: 4500,
      deliveryAddress: 'صنعاء',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام'
    }, context);

    expect(created.customerPhone).toBe('774780112');
    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.customerPhone).toBe('774780112');
  });

  // 9. deliveryAddress persistence
  it('9. deliveryAddress persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي',
      customerPhone: '774780112',
      items: [{ productId: 'p1', productNameSnapshot: 'عسل سدر', quantity: 1, unitPriceSnapshot: 10000 }],
      subtotal: 10000,
      deliveryFee: 500,
      totalAmount: 10500,
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام'
    }, context);

    expect(created.deliveryAddress).toBe('شارع النصر صنعاء');
    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.deliveryAddress).toBe('شارع النصر صنعاء');
  });

  // 10. paymentMethodId persistence
  it('10. paymentMethodId persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي',
      customerPhone: '774780112',
      items: [{ productId: 'p1', productNameSnapshot: 'شاي', quantity: 1, unitPriceSnapshot: 1000 }],
      subtotal: 1000,
      deliveryFee: 500,
      totalAmount: 1500,
      deliveryAddress: 'صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'جوالي'
    }, context);

    expect(created.paymentMethodId).toBe('pay-jawali');
    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.paymentMethodId).toBe('pay-jawali');
  });

  // 11. paymentMethodName persistence
  it('11. paymentMethodName persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي',
      customerPhone: '774780112',
      items: [{ productId: 'p1', productNameSnapshot: 'شاي', quantity: 1, unitPriceSnapshot: 1000 }],
      subtotal: 1000,
      deliveryFee: 500,
      totalAmount: 1500,
      deliveryAddress: 'صنعاء',
      paymentMethodId: 'pay-kuraimi',
      paymentMethodName: 'حاسب الكريمي'
    }, context);

    expect(created.paymentMethodName).toBe('حاسب الكريمي');
    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.paymentMethodName).toBe('حاسب الكريمي');
  });

  // 12. subtotal persistence
  it('12. subtotal persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي',
      customerPhone: '774780112',
      items: [{ productId: 'p1', productNameSnapshot: 'شاي', quantity: 2, unitPriceSnapshot: 1500 }],
      subtotal: 3000,
      deliveryFee: 500,
      totalAmount: 3500,
      deliveryAddress: 'صنعاء',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام'
    }, context);

    expect(created.subtotal).toBe(3000);
    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.subtotal).toBe(3000);
  });

  // 13. deliveryFee persistence
  it('13. deliveryFee persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي',
      customerPhone: '774780112',
      items: [{ productId: 'p1', productNameSnapshot: 'شاي', quantity: 1, unitPriceSnapshot: 1000 }],
      subtotal: 1000,
      deliveryFee: 700,
      totalAmount: 1700,
      deliveryAddress: 'صنعاء',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام'
    }, context);

    expect(created.deliveryFee).toBe(700);
    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.deliveryFee).toBe(700);
  });

  // 14. totalAmount persistence
  it('14. totalAmount persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي',
      customerPhone: '774780112',
      items: [{ productId: 'p1', productNameSnapshot: 'شاي', quantity: 1, unitPriceSnapshot: 1000 }],
      subtotal: 1000,
      deliveryFee: 500,
      totalAmount: 1500,
      deliveryAddress: 'صنعاء',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام'
    }, context);

    expect(created.totalAmount).toBe(1500);
    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.totalAmount).toBe(1500);
  });

  // 15. productNameSnapshot persistence
  it('15. productNameSnapshot persistence', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'علي',
      customerPhone: '774780112',
      items: [
        { productId: 'p100', productNameSnapshot: 'سكر السعيد الممتاز', quantity: 2, unitPriceSnapshot: 2500 },
        { productId: 'p200', productNameSnapshot: 'سمن الماس الذهبي', quantity: 1, unitPriceSnapshot: 4500 }
      ],
      subtotal: 9500,
      deliveryFee: 500,
      totalAmount: 10000,
      deliveryAddress: 'شارع النصر صنعاء',
      paymentMethodId: 'pay-jawali',
      paymentMethodName: 'جوالي'
    }, context);

    expect(created.items[0].productNameSnapshot).toBe('سكر السعيد الممتاز');
    expect(created.items[1].productNameSnapshot).toBe('سمن الماس الذهبي');

    const read = await orderStore.getOrderById(created.id, context);
    expect(read?.items[0].productNameSnapshot).toBe('سكر السعيد الممتاز');
    expect(read?.items[1].productNameSnapshot).toBe('سمن الماس الذهبي');
  });

  // 16. full order read-back
  it('16. full order read-back', async () => {
    const payload = {
      customerId: 'cst-999',
      customerName: 'محمد أحمد',
      customerPhone: '771234567',
      items: [{ productId: 'p1', productNameSnapshot: 'عصير برتقال', quantity: 3, unitPriceSnapshot: 1000 }],
      subtotal: 3000,
      deliveryFee: 500,
      totalAmount: 3500,
      deliveryAddress: 'حدة صنعاء',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'الدفع عند الاستلام'
    };

    const created = await orderStore.createOrder(payload, context);
    const read = await orderStore.getOrderById(created.id, context);

    expect(read).not.toBeNull();
    expect(read?.id).toBe(created.id);
    expect(read?.tenantId).toBe(context.tenantId);
    expect(read?.storeId).toBe(context.storeId);
    expect(read?.customerName).toBe(payload.customerName);
    expect(read?.customerPhone).toBe(payload.customerPhone);
    expect(read?.deliveryAddress).toBe(payload.deliveryAddress);
    expect(read?.paymentMethodId).toBe(payload.paymentMethodId);
    expect(read?.paymentMethodName).toBe(payload.paymentMethodName);
    expect(read?.subtotal).toBe(payload.subtotal);
    expect(read?.deliveryFee).toBe(payload.deliveryFee);
    expect(read?.totalAmount).toBe(payload.totalAmount);
    expect(read?.status).toBe('PENDING');
  });

  // 17. full item read-back
  it('17. full item read-back', async () => {
    const payload = {
      customerId: 'cst-888',
      customerName: 'سارة',
      customerPhone: '779998877',
      items: [
        { productId: 'prod-a', productNameSnapshot: 'حليب الهناء', quantity: 2, unitPriceSnapshot: 1200 },
        { productId: 'prod-b', productNameSnapshot: 'زيت الذرة', quantity: 1, unitPriceSnapshot: 3500 }
      ],
      subtotal: 5900,
      deliveryFee: 500,
      totalAmount: 6400,
      deliveryAddress: 'الستين صنعاء',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش'
    };

    const created = await orderStore.createOrder(payload, context);
    const read = await orderStore.getOrderById(created.id, context);

    expect(read?.items.length).toBe(2);
    expect(read?.items[0].productId).toBe('prod-a');
    expect(read?.items[0].productNameSnapshot).toBe('حليب الهناء');
    expect(read?.items[0].quantity).toBe(2);
    expect(read?.items[0].unitPriceSnapshot).toBe(1200);
    expect(read?.items[0].totalPrice).toBe(2400);

    expect(read?.items[1].productId).toBe('prod-b');
    expect(read?.items[1].productNameSnapshot).toBe('زيت الذرة');
    expect(read?.items[1].quantity).toBe(1);
    expect(read?.items[1].unitPriceSnapshot).toBe(3500);
    expect(read?.items[1].totalPrice).toBe(3500);
  });

  // 18. no silent field dropping
  it('18. no silent field dropping', () => {
    const partialHeaderMap = new HeaderMap(['id', 'tenantId', 'storeId'], ['id']);
    expect(() => {
      partialHeaderMap.buildRow({
        id: 'ORD-1',
        tenantId: 'tenant-123',
        customerPhone: '774780112' // Non-empty field missing from header map
      });
    }).toThrow(HeaderSchemaError);
  });

  // 19. false success prevention
  it('19. false success prevention', async () => {
    // Create engine with store that fails read-back
    const faultyStore = new GoogleSheetsOrderStore(transport);
    // Override getOrderById to simulate read-back mismatch / failure
    faultyStore.getOrderById = async () => null;

    const engine = new OrderCheckoutEngine(undefined, undefined, undefined, faultyStore);
    const mockSession: any = {
      id: 'sess-1',
      activeOrderId: null,
      context,
      checkoutState: {
        step: 'AWAITING_CONFIRMATION',
        cart: [{ productId: 'p1', productName: 'تمر', quantity: 1, unitPriceSnapshot: 2000 }],
        subtotal: 2000,
        deliveryFee: 500,
        total: 2500,
        customerName: 'اختبار',
        customerPhone: '771112233',
        deliveryAddress: 'صنعاء',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش'
      }
    };

    const response = await engine.handleCheckoutMessage('نعم أؤكد', mockSession, context);
    expect(response).toBe('Persistence verification failed');
    expect(mockSession.checkoutState.step).toBe('AWAITING_CONFIRMATION');
  });

  // 20. old rows preserved
  it('20. old rows preserved', async () => {
    // Write required headers only + an existing data row
    const requiredOnly = CanonicalSchemas.orders.requiredHeaders;
    await transport.writeHeaderRow('orders', requiredOnly);
    await transport.addRow('orders', ['ORD-OLD-001', 'tenant-123', 'store-456', 'cst-old', '1000', 'YER', 'DELIVERED', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);

    await orderStore.ensureSchema();

    const rows = await transport.getRows('orders');
    expect(rows.length).toBe(2); // Header + 1 data row
    expect(rows[1].values[0]).toBe('ORD-OLD-001'); // Old row ID preserved
    expect(rows[1].values[6]).toBe('DELIVERED'); // Old status preserved
  });

  // 21. tenant isolation
  it('21. tenant isolation', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'عميل 1',
      items: [{ productId: 'p1', productNameSnapshot: 'منتج', quantity: 1, unitPriceSnapshot: 1000 }],
      subtotal: 1000,
      deliveryFee: 500,
      totalAmount: 1500
    }, context);

    const otherContext: DataOperationContext = { tenantId: 'other-tenant', storeId: 'store-456' };
    await expect(orderStore.getOrderById(created.id, otherContext)).rejects.toThrow();
  });

  // 22. store isolation
  it('22. store isolation', async () => {
    const created = await orderStore.createOrder({
      customerId: 'cst-1',
      customerName: 'عميل 1',
      items: [{ productId: 'p1', productNameSnapshot: 'منتج', quantity: 1, unitPriceSnapshot: 1000 }],
      subtotal: 1000,
      deliveryFee: 500,
      totalAmount: 1500
    }, context);

    const otherStoreContext: DataOperationContext = { tenantId: 'tenant-123', storeId: 'other-store' };
    await expect(orderStore.getOrderById(created.id, otherStoreContext)).rejects.toThrow();
  });
});
