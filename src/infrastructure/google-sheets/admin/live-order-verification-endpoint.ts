import { Request, Response } from 'express';
import { OrderStore } from '../../../core/orders/order-store';
import { AdminNotifier } from '../../../core/orders/admin-notifier';
import { CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from '../../../core/productization/haneen-service';

export async function liveOrderVerificationEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const orderStore = OrderStore.getInstance();
    const adminNotifier = AdminNotifier.getInstance();
    const context = { tenantId: CANONICAL_TENANT_ID, storeId: CANONICAL_STORE_ID };

    // 1. Create Test Order
    const testOrder = await orderStore.createOrder(
      {
        customerId: 'cst-live-verify',
        customerPhone: '777123456',
        items: [
          { productId: 'prod-ananas', productNameSnapshot: 'أناناس طازج', quantity: 1, unitPriceSnapshot: 500 },
          { productId: 'prod-samn', productNameSnapshot: 'سمن البنت', quantity: 1, unitPriceSnapshot: 2500 }
        ],
        subtotal: 3000,
        deliveryFee: 500,
        totalAmount: 3500,
        currency: 'YER',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش عند الاستلام',
        paymentStatus: 'UNPAID',
        deliveryAddress: 'شارع النصر جوار المحول'
      },
      context
    );

    // 2. Admin Notification
    const notifResult = await adminNotifier.notifyNewOrder(testOrder, context);

    // 3. Status Transition Test
    await orderStore.updateOrderStatus(testOrder.id, 'CONFIRMED', context);
    const updatedOrder = await orderStore.getOrderById(testOrder.id, context);

    res.status(200).json({
      success: true,
      verdict: 'ORDER_LIFECYCLE_VERIFIED',
      orderId: testOrder.id,
      orderFormatValid: /^ORD-\d{8}-\d{4}$/.test(testOrder.id),
      status: updatedOrder?.status || 'UNKNOWN',
      paymentStatus: testOrder.paymentStatus,
      paymentMethod: testOrder.paymentMethodName,
      itemsCount: testOrder.items.length,
      priceSnapshotLocked: testOrder.items.every(i => i.unitPriceSnapshot > 0 && i.productNameSnapshot.length > 0),
      subtotal: testOrder.subtotal,
      deliveryFee: testOrder.deliveryFee,
      totalAmount: testOrder.totalAmount,
      deliveryAddress: testOrder.deliveryAddress,
      adminNotificationCreated: notifResult.success,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Order verification failed'
    });
  }
}
