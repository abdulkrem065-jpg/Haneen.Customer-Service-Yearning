import { OrderStore } from './order-store';
import { AdminNotifier } from './admin-notifier';
import { ConversationSession, CartItem, OrderCheckoutState } from '../productization/session-store';
import { DataOperationContext } from '../data/provider';
import { Product, DeliveryConfiguration, PaymentMethod } from '../data/domain';

export class OrderCheckoutEngine {
  private orderStore = OrderStore.getInstance();
  private adminNotifier = AdminNotifier.getInstance();

  constructor(
    private readonly catalogProductsSupplier?: () => Promise<Product[]>,
    private readonly deliveryConfigSupplier?: () => Promise<DeliveryConfiguration | null>,
    private readonly paymentMethodsSupplier?: () => Promise<PaymentMethod[]>
  ) {}

  public async handleCheckoutMessage(
    userText: string,
    session: ConversationSession,
    context: DataOperationContext
  ): Promise<string | null> {
    const text = userText.trim();
    const lowerText = text.toLowerCase();

    // Ensure session checkout state is initialized if missing
    if (!session.checkoutState) {
      session.checkoutState = {
        cart: [],
        step: 'SHOPPING'
      };
    }

    const state = session.checkoutState;

    // 1. Order Status Tracking Query ("أين طلبي؟", "هل طلبي جاهز؟", "حالة الطلب", "ORD-...")
    const isStatusQuery = (
      lowerText.includes('أين طلبي') ||
      lowerText.includes('اين طلبي') ||
      lowerText.includes('هل طلبي جاهز') ||
      lowerText.includes('حالة طلبي') ||
      lowerText.includes('متابعة الطلب') ||
      lowerText.includes('حالة الطلب')
    );

    const explicitOrderMatch = text.match(/ORD-\d{8}-\d{4}/i);
    if (isStatusQuery || explicitOrderMatch) {
      const targetOrderId = explicitOrderMatch ? explicitOrderMatch[0].toUpperCase() : session.activeOrderId;
      if (targetOrderId) {
        const order = await this.orderStore.getOrderById(targetOrderId, context);
        if (order) {
          const statusMap: Record<string, string> = {
            'PENDING': 'قيد الانتظار والتأكيد (PENDING)',
            'CONFIRMED': 'تم التأكيد (CONFIRMED)',
            'PREPARING': 'قيد التجهيز (PREPARING)',
            'READY_FOR_DELIVERY': 'جاهز للتوصيل (READY_FOR_DELIVERY)',
            'OUT_FOR_DELIVERY': 'خرج للتوصيل (OUT_FOR_DELIVERY)',
            'DELIVERED': 'تم التوصيل بنجاح (DELIVERED)',
            'CANCELLED': 'ملغي (CANCELLED)'
          };
          const readableStatus = statusMap[order.status] || order.status;
          return `طلبك رقم ${order.id} حالياً ${readableStatus}. مجموع الطلب: ${order.totalAmount} ${order.currency}.`;
        } else {
          return `عذراً، لم نجد طلباً بالرقم (${targetOrderId}). يرجى التثبت من رقم الطلب.`;
        }
      } else {
        return `يرجى تزويدنا برقم الطلب (مثل: ORD-20260825-0001) لمتابعة حالته.`;
      }
    }

    // 2. Add product offered in previous turn ("نعم" / "أضفه" after "هل تريد إضافة X؟")
    if (state.lastOfferedProduct && (text === 'نعم' || text === 'أضفه' || text === 'ايوه' || text === 'إضافة' || text === 'تمام')) {
      const prod = state.lastOfferedProduct;
      this.addItemToCart(state, prod.id, prod.name, prod.price, 1);
      state.lastOfferedProduct = undefined;
      state.step = 'CART';

      const subtotal = this.calculateSubtotal(state.cart);
      return `تمت إضافة 1 (${prod.name}) إلى طلبك بنجاح بسعر ${prod.price} YER. إجمالي المنتجات في السلة: ${subtotal} YER. هل تود إضافة منتج آخر، أم تحديد عنوان التوصيل وطريقة الدفع لإنهاء الطلب؟`;
    }

    // 3. Address Input ("العنوان ...", "شارع ...", "حي ...", "توصيل إلى ...")
    const isAddressInput = (
      lowerText.includes('العنوان') ||
      lowerText.includes('شارع') ||
      lowerText.includes('حي ') ||
      lowerText.includes('جوار') ||
      lowerText.includes('توصيل إلى') ||
      (state.cart.length > 0 && !state.deliveryAddress && (lowerText.length > 8 && !lowerText.includes('دفع') && !lowerText.includes('كاش') && !lowerText.includes('أكد')) )
    );

    if (isAddressInput && state.cart.length > 0 && !lowerText.includes('أؤكد') && !lowerText.includes('تأكيد')) {
      // Extract clean address
      let cleanAddress = text.replace(/^العنوان[:\s]*/i, '').replace(/^توصيل إلى[:\s]*/i, '').trim();
      if (!cleanAddress) cleanAddress = text;
      state.deliveryAddress = cleanAddress;
      state.step = 'ADDRESS';

      // Get delivery fee
      let fee = 500;
      if (this.deliveryConfigSupplier) {
        const config = await this.deliveryConfigSupplier();
        if (config && config.isEnabled) {
          fee = config.deliveryFee || 500;
        } else if (config && !config.isEnabled) {
          fee = 0;
        }
      }
      state.deliveryFee = fee;

      if (!state.paymentMethodId) {
        return `تم تسجيل عنوان التوصيل: (${cleanAddress}). رسوم التوصيل: ${fee} YER. يرجى اختيار طريقة الدفع المناسبة (مثال: كاش عند الاستلام، أو تحويل حاسب) لإكمال الطلب.`;
      } else {
        return this.generateOrderSummary(state);
      }
    }

    // 4. Payment Method Selection ("كاش", "عند الاستلام", "تحويل حاسب", "دفع")
    const isPaymentInput = (
      lowerText.includes('كاش') ||
      lowerText.includes('عند الاستلام') ||
      lowerText.includes('تحويل حاسب') ||
      lowerText.includes('حاسب') ||
      lowerText.includes('محفظة') ||
      lowerText.includes('بطاقة')
    );

    if (isPaymentInput && state.cart.length > 0) {
      // Check active payment methods if supplier present
      let activeMethods: PaymentMethod[] = [];
      if (this.paymentMethodsSupplier) {
        activeMethods = await this.paymentMethodsSupplier();
      }

      if (lowerText.includes('كاش') || lowerText.includes('عند الاستلام')) {
        state.paymentMethodId = 'pay-cod';
        state.paymentMethodName = 'كاش عند الاستلام';
      } else if (lowerText.includes('حاسب') || lowerText.includes('تحويل')) {
        state.paymentMethodId = 'pay-haseb';
        state.paymentMethodName = 'تحويل حاسب / محفظة';
      } else {
        state.paymentMethodId = 'pay-other';
        state.paymentMethodName = text;
      }
      state.step = 'PAYMENT';

      if (!state.deliveryAddress) {
        return `تم اختيار طريقة الدفع: (${state.paymentMethodName}). يرجى تزويدنا بعنوان التوصيل (مثال: شارع النصر جوار المحول) لعرض ملخص الطلب النهائي.`;
      } else {
        return this.generateOrderSummary(state);
      }
    }

    // 5. Order Confirmation ("أؤكد", "تأكيد الطلب", "جهزه", "موافق", "أكد الطلب")
    const isConfirmation = (
      lowerText === 'أؤكد' ||
      lowerText === 'موافق' ||
      lowerText === 'جهزه' ||
      lowerText === 'أكد' ||
      lowerText.includes('تأكيد الطلب') ||
      lowerText.includes('أؤكد الطلب') ||
      lowerText.includes('جهز الطلب')
    );

    if (isConfirmation && state.cart.length > 0) {
      // Idempotency Protection: If already confirmed in this session, return existing order
      if (state.step === 'CONFIRMED' && state.createdOrderId) {
        const existingOrder = await this.orderStore.getOrderById(state.createdOrderId, context);
        if (existingOrder) {
          return `تم استلام طلبك سابقاً بنجاح. رقم طلبك: ${existingOrder.id} - الحالة: ${existingOrder.status}`;
        }
      }

      // Check default address if missing
      if (!state.deliveryAddress) {
        state.deliveryAddress = 'استلام من الفرع / العنوان الافتراضي';
      }
      if (!state.paymentMethodName) {
        state.paymentMethodId = 'pay-cod';
        state.paymentMethodName = 'كاش عند الاستلام';
      }
      if (state.deliveryFee === undefined) {
        state.deliveryFee = 500;
      }

      const subtotal = this.calculateSubtotal(state.cart);
      const totalAmount = subtotal + state.deliveryFee;

      // Create Order in OrderStore
      const createdOrder = await this.orderStore.createOrder(
        {
          customerId: 'cst-web-customer',
          customerPhone: state.customerPhone || '777123456',
          items: state.cart.map(i => ({
            productId: i.productId,
            productNameSnapshot: i.productName,
            quantity: i.quantity,
            unitPriceSnapshot: i.unitPriceSnapshot
          })),
          subtotal,
          deliveryFee: state.deliveryFee,
          totalAmount,
          currency: 'YER',
          paymentMethodId: state.paymentMethodId,
          paymentMethodName: state.paymentMethodName,
          paymentStatus: 'UNPAID',
          deliveryAddress: state.deliveryAddress
        },
        context
      );

      // Resilient Admin Notification
      await this.adminNotifier.notifyNewOrder(createdOrder, context);

      // Update Session
      state.createdOrderId = createdOrder.id;
      state.step = 'CONFIRMED';
      session.activeOrderId = createdOrder.id;

      return `تم استلام طلبك بنجاح. رقم طلبك: ${createdOrder.id}\nالحالة: PENDING (قيد الانتظار والتأكيد)\nالإجمالي: ${totalAmount} YER\nطريقة الدفع: ${createdOrder.paymentMethodName}\nعنوان التوصيل: ${createdOrder.deliveryAddress}\nسيتم إشعار الإدارة ومتابعة طلبك فوراً.`;
    }

    return null;
  }

  public addItemToCart(state: OrderCheckoutState, productId: string, productName: string, unitPrice: number, quantity: number): void {
    const existing = state.cart.find(i => i.productId === productId || i.productName === productName);
    if (existing) {
      existing.quantity += quantity;
      existing.subtotal = existing.quantity * existing.unitPriceSnapshot;
    } else {
      state.cart.push({
        productId,
        productName,
        quantity,
        unitPriceSnapshot: unitPrice,
        subtotal: unitPrice * quantity
      });
    }
  }

  public calculateSubtotal(cart: CartItem[]): number {
    return cart.reduce((sum, item) => sum + item.subtotal, 0);
  }

  public generateOrderSummary(state: OrderCheckoutState): string {
    state.step = 'SUMMARY';
    const subtotal = this.calculateSubtotal(state.cart);
    const fee = state.deliveryFee || 0;
    const total = subtotal + fee;

    const itemsText = state.cart
      .map(i => `- ${i.productName} (عدد ${i.quantity}): ${i.subtotal} YER`)
      .join('\n');

    return `ملخص الطلب:
${itemsText}
---
مجموع المنتجات: ${subtotal} YER
رسوم التوصيل: ${fee} YER
الإجمالي النهائي: ${total} YER
طريقة الدفع: ${state.paymentMethodName || 'كاش عند الاستلام'}
عنوان التوصيل: ${state.deliveryAddress || 'لم يحدد'}

هل تؤكد الطلب؟ (يرجى الرد بـ "أؤكد" أو "نعم")`;
  }
}
