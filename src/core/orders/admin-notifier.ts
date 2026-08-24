import { Order } from '../data/domain';
import { DataOperationContext } from '../data/provider';

export interface AdminNotificationRecord {
  id: string;
  orderId: string;
  tenantId: string;
  storeId: string;
  title: string;
  content: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  createdAt: Date;
}

export class AdminNotifier {
  private static instance: AdminNotifier | null = null;
  private notifications: AdminNotificationRecord[] = [];

  public static getInstance(): AdminNotifier {
    if (!AdminNotifier.instance) {
      AdminNotifier.instance = new AdminNotifier();
    }
    return AdminNotifier.instance;
  }

  public static resetInstance(): void {
    AdminNotifier.instance = null;
  }

  public async notifyNewOrder(order: Order, context: DataOperationContext): Promise<{ success: boolean; notificationId: string }> {
    const notificationId = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const itemsSummary = order.items
      .map(i => `- ${i.productNameSnapshot || i.productName} (عدد ${i.quantity}): ${i.totalPrice} ${order.currency}`)
      .join('\n');

    const content = `إشعار طلب جديد للـ إدارة:
رقم الطلب: ${order.id}
العميل: ${order.customerPhone || order.customerId}
المنتجات:
${itemsSummary}
مجموع المنتجات: ${order.subtotal} ${order.currency}
رسوم التوصيل: ${order.deliveryFee} ${order.currency}
الإجمالي النهائي: ${order.totalAmount} ${order.currency}
طريقة الدفع: ${order.paymentMethodName || order.paymentMethodId || 'غير محدد'}
حالة الدفع: ${order.paymentStatus || 'UNPAID'}
عنوان التوصيل: ${order.deliveryAddress || 'لم يحدد'}
حالة الطلب: ${order.status}`;

    const record: AdminNotificationRecord = {
      id: notificationId,
      orderId: order.id,
      tenantId: context.tenantId,
      storeId: context.storeId,
      title: `طلب جديد - ${order.id}`,
      content,
      status: 'SENT',
      createdAt: new Date()
    };

    try {
      this.notifications.push(record);
      return { success: true, notificationId };
    } catch (err) {
      console.error('[AdminNotifier] Failed to deliver admin notification', err);
      return { success: false, notificationId };
    }
  }

  public getNotifications(context: DataOperationContext): AdminNotificationRecord[] {
    return this.notifications.filter(
      n => n.tenantId === context.tenantId && n.storeId === context.storeId
    );
  }

  public clear(): void {
    this.notifications = [];
  }
}
