import { OrderStore } from './order-store';
import { AdminNotifier } from './admin-notifier';
import { ConversationSession, CartItem, OrderCheckoutState, CheckoutStep } from '../productization/session-store';
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
        step: 'NO_ORDER'
      };
    }

    const state = session.checkoutState;

    // Safe Internal Trace Logging for production debugging (no secrets)
    console.log(`[OrderCheckoutEngine] Trace: conv=${session.conversationId}, draft=${state.activeOrderDraftId || 'none'}, step=${state.step}, cartCount=${state.cart.length}`);

    // --- 1. Order Status Queries & Tracking ("أين طلبي؟", "هل طلبي جاهز؟", "حالة الطلب", "ORD-...") ---
    const explicitOrderMatch = text.match(/ORD-\d{8}-\d{4}/i);
    const isStatusKeyword = (
      lowerText.includes('أين طلبي') ||
      lowerText.includes('اين طلبي') ||
      lowerText.includes('هل طلبي جاهز') ||
      lowerText.includes('حالة طلبي') ||
      lowerText.includes('متابعة الطلب') ||
      lowerText.includes('حالة الطلب')
    );

    if (explicitOrderMatch) {
      const targetOrderId = explicitOrderMatch[0].toUpperCase();
      const order = await this.orderStore.getOrderById(targetOrderId, context);
      if (order) {
        const readableStatus = this.formatOrderStatus(order.status);
        return `طلبك رقم ${order.id} حالياً ${readableStatus}. مجموع الطلب: ${order.totalAmount} YER.`;
      } else {
        return `عذراً، لم نجد طلباً بالرقم (${targetOrderId}). يرجى التثبت من رقم الطلب.`;
      }
    }

    if (isStatusKeyword && !state.activeOrderDraftId && state.cart.length === 0) {
      if (session.activeOrderId) {
        const order = await this.orderStore.getOrderById(session.activeOrderId, context);
        if (order) {
          const readableStatus = this.formatOrderStatus(order.status);
          return `طلبك رقم ${order.id} حالياً ${readableStatus}. مجموع الطلب: ${order.totalAmount} YER.`;
        }
      }
      return `يرجى تزويدنا برقم الطلب (مثل: ORD-20260825-0001) لمتابعة حالته.`;
    }

    // --- 2. "الطلب قد أرسلته سابقاً" / Active Draft Priority (Section 8) ---
    const isSentPreviouslyText = (
      lowerText.includes('الطلب قد ارسلته') ||
      lowerText.includes('الطلب قد أرسلته') ||
      lowerText.includes('ارسلت الطلب') ||
      lowerText.includes('أرسلت الطلب')
    );

    if (isSentPreviouslyText) {
      if (state.activeOrderDraftId || state.cart.length > 0) {
        const subtotal = this.calculateSubtotal(state.cart);
        const fee = state.deliveryFee || 0;
        const total = subtotal + fee;
        return `طلبك الحالي قيد التجهيز للتأكيد.
ملخص الطلب الحالي:
${this.formatCartItemsList(state.cart)}
الإجمالي: ${total} YER
العنوان: ${state.deliveryAddress || 'لم يحدد بعد'}
طريقة الدفع: ${state.paymentMethodName || 'لم تحدد بعد'}

هل تود تأكيد الطلب الآن؟ (أجب بـ "أؤكد" أو "نعم")`;
      } else if (session.activeOrderId) {
        const order = await this.orderStore.getOrderById(session.activeOrderId, context);
        if (order) {
          const readableStatus = this.formatOrderStatus(order.status);
          return `تم استلام طلبك سابقاً بنجاح (رقم الطلب: ${order.id}). الحالة الحالية: ${readableStatus}. الإجمالي: ${order.totalAmount} YER.`;
        }
      }
    }

    // --- 3. Customer Identity (Name & Phone Number Parsing) (Section 7) ---
    const phoneMatch = text.match(/(?:0?7[013778]\d{7}|7\d{8})/);
    const hasNameLikeText = text.replace(/[\d\+\-\s]/g, '').length >= 3;
    const isExplicitIdentity = lowerText.includes('الاسم') || lowerText.includes('الهاتف') || lowerText.includes('جوال') || (phoneMatch && hasNameLikeText && (state.activeOrderDraftId || state.cart.length > 0));

    if (isExplicitIdentity && (state.activeOrderDraftId || state.cart.length > 0)) {
      let phone = state.customerPhone || '777123456';
      if (phoneMatch) {
        phone = phoneMatch[0];
      }
      let name = state.customerName;
      if (hasNameLikeText) {
        const cleanedName = text
          .replace(/(?:0?7[013778]\d{7}|7\d{8})/, '')
          .replace(/الاسم[:\s]*/i, '')
          .replace(/رقم الهاتف[:\s]*/i, '')
          .replace(/الجوال[:\s]*/i, '')
          .trim();
        if (cleanedName.length >= 2) {
          name = cleanedName;
        }
      }
      state.customerName = name;
      state.customerPhone = phone;

      // PRESERVE cart items
      if (state.deliveryAddress && state.paymentMethodId) {
        state.step = 'AWAITING_CONFIRMATION';
        return this.generateOrderSummary(state);
      } else {
        state.step = 'AWAITING_ADDRESS_AND_PAYMENT';
        return `تم تسجيل بياناتك بنجاح: ${name ? `${name} - ` : ''}رقم الهاتف (${phone}).
يرجى تزويدنا بعنوان التوصيل وطريقة الدفع لإكمال الطلب.`;
      }
    }

    // --- 4. Add product offered in previous turn ("نعم" / "أضفه" after "هل تريد إضافة X؟") ---
    if (state.lastOfferedProduct && (lowerText === 'نعم' || lowerText === 'أضفه' || lowerText === 'ايوه' || lowerText === 'إضافة' || lowerText === 'تمام')) {
      const prod = state.lastOfferedProduct;
      this.addItemToCart(state, prod.id, prod.name, prod.price, 1);
      state.lastOfferedProduct = undefined;
      if (!state.activeOrderDraftId) {
        state.activeOrderDraftId = `draft-${Date.now()}`;
      }
      state.step = state.deliveryAddress && state.paymentMethodId ? 'AWAITING_CONFIRMATION' : 'AWAITING_ADDRESS_AND_PAYMENT';

      const subtotal = this.calculateSubtotal(state.cart);
      if (state.step === 'AWAITING_CONFIRMATION') {
        return this.generateOrderSummary(state);
      }
      return `تمت إضافة 1 (${prod.name}) إلى طلبك بنجاح بسعر ${prod.price} YER. إجمالي المنتجات في السلة: ${subtotal} YER. يرجى تزويدنا بعنوان التوصيل وطريقة الدفع لإكمال الطلب.`;
    }

    // --- 5. Short Confirmation Messages in AWAITING_CONFIRMATION ("نعم", "أؤكد", "موافق", "جهز الطلب") ---
    const isShortConfirmation = (
      lowerText.includes('نعم') ||
      lowerText.includes('أيوه') ||
      lowerText.includes('ايوه') ||
      lowerText.includes('أؤكد') ||
      lowerText.includes('اوكد') ||
      lowerText.includes('موافق') ||
      lowerText.includes('تمام') ||
      lowerText.includes('جهز') ||
      lowerText.includes('تأكيد')
    );

    // Idempotency Protection for already created order
    if ((state.step === 'ORDER_CREATED' || state.step === 'CONFIRMED') && state.createdOrderId && isShortConfirmation) {
      const existingOrder = await this.orderStore.getOrderById(state.createdOrderId, context);
      if (existingOrder) {
        return `تم استلام طلبك سابقاً بنجاح. رقم طلبك: ${existingOrder.id} - الحالة: ${this.formatOrderStatus(existingOrder.status)}`;
      }
    }

    if (isShortConfirmation && state.cart.length > 0 && (state.step === 'AWAITING_CONFIRMATION' || (state.deliveryAddress && state.paymentMethodId))) {
      // Re-verify Product Prices and Availability from Google Sheets (Section 10)
      if (this.catalogProductsSupplier) {
        try {
          const liveProducts = await this.catalogProductsSupplier();
          for (const cartItem of state.cart) {
            const liveProd = liveProducts.find(p => p.id === cartItem.productId || p.name.toLowerCase() === cartItem.productName.toLowerCase());
            if (liveProd) {
              if (liveProd.inStock === false) {
                return `عذراً، المنتج (${cartItem.productName}) غير متوفر حالياً بالمخزن. هل تود استبداله بمنتج آخر أو مواصلة بقية الطلب؟`;
              }
              if (liveProd.price !== cartItem.unitPriceSnapshot) {
                cartItem.unitPriceSnapshot = liveProd.price;
                cartItem.subtotal = liveProd.price * cartItem.quantity;
              }
            }
          }
        } catch (e) {
          // Ignore transient catalog supplier errors during confirmation
        }
      }

      // Calculate Totals
      const subtotal = this.calculateSubtotal(state.cart);
      if (state.deliveryFee === undefined) {
        state.deliveryFee = 500;
      }
      const totalAmount = subtotal + state.deliveryFee;
      state.subtotal = subtotal;
      state.total = totalAmount;

      // Create Order in OrderStore (Section 14)
      state.step = 'ORDER_CREATING';
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
          paymentMethodId: state.paymentMethodId || 'pay-cod',
          paymentMethodName: state.paymentMethodName || 'كاش عند الاستلام',
          paymentStatus: 'UNPAID',
          deliveryAddress: state.deliveryAddress || 'استلام من الفرع / العنوان الافتراضي'
        },
        context
      );

      // Resilient Admin Notification (Section 16)
      try {
        await this.adminNotifier.notifyNewOrder(createdOrder, context);
      } catch (err) {
        console.warn('[OrderCheckoutEngine] Admin notification failure (non-blocking):', err);
      }

      // Update State
      state.createdOrderId = createdOrder.id;
      state.step = 'ORDER_CREATED';
      session.activeOrderId = createdOrder.id;

      const customerDisplay = state.customerName ? `${state.customerName} (${createdOrder.customerPhone})` : createdOrder.customerPhone;

      return `تم استلام طلبك بنجاح. رقم طلبك: ${createdOrder.id}
الحالة: PENDING (قيد الانتظار والتأكيد)
الإجمالي: ${totalAmount} YER
العميل: ${customerDisplay}
طريقة الدفع: ${createdOrder.paymentMethodName}
عنوان التوصيل: ${createdOrder.deliveryAddress}
سيتم إشعار الإدارة ومتابعة طلبك فوراً.`;
    }

    // --- 6. Address and Payment Parsing (Single or Combined Message) (Section 4, 11, 12) ---
    const isQuestion = lowerText.includes('هل') || lowerText.includes('متى') || lowerText.includes('كم') || lowerText.includes('أين') || lowerText.includes('اين') || lowerText.includes('؟');
    const isAddressOrPayment = (
      lowerText.includes('عنوان') ||
      lowerText.includes('شارع') ||
      lowerText.includes('حي ') ||
      lowerText.includes('جوار') ||
      lowerText.includes('توصيل') ||
      lowerText.includes('دفع') ||
      lowerText.includes('كاش') ||
      lowerText.includes('حاسب') ||
      lowerText.includes('جيب') ||
      lowerText.includes('محفظة')
    );

    if (isAddressOrPayment && !isQuestion && state.cart.length > 0 && !lowerText.includes('أؤكد')) {
      // Parse Payment Method
      if (lowerText.includes('جيب') || lowerText.includes('حاسب') || lowerText.includes('كاش') || lowerText.includes('عند الاستلام') || lowerText.includes('محفظة')) {
        let activeMethods: PaymentMethod[] = [];
        if (this.paymentMethodsSupplier) {
          try {
            activeMethods = await this.paymentMethodsSupplier();
          } catch (e) {
            // Ignore
          }
        }

        if (lowerText.includes('جيب') || lowerText.includes('حاسب') || lowerText.includes('محفظة')) {
          const matchedActive = activeMethods.find(m =>
            m.isActive && (
              m.displayName.toLowerCase().includes('جيب') ||
              m.displayName.toLowerCase().includes('حاسب') ||
              m.displayName.toLowerCase().includes('محفظة') ||
              m.id.includes('jeeb') ||
              m.id.includes('haseb')
            )
          );

          const matchedDisabled = activeMethods.find(m =>
            !m.isActive && (
              m.displayName.toLowerCase().includes('جيب') ||
              m.displayName.toLowerCase().includes('حاسب') ||
              m.id.includes('jeeb')
            )
          );

          if (matchedDisabled && !matchedActive) {
            const activeList = activeMethods.filter(m => m.isActive).map(m => m.displayName).join('، ') || 'كاش عند الاستلام';
            return `عذراً، طريقة الدفع (محفظة جيب) غير مفعلة حالياً. الطرق المتاحة هي: ${activeList}.`;
          }

          state.paymentMethodId = matchedActive ? matchedActive.id : 'pay-jeeb';
          state.paymentMethodName = matchedActive ? matchedActive.displayName : 'محفظة جيب / تحويل حاسب';
        } else if (lowerText.includes('كاش') || lowerText.includes('عند الاستلام')) {
          state.paymentMethodId = 'pay-cod';
          state.paymentMethodName = 'كاش عند الاستلام';
        }
      }

      // Parse Delivery Address
      if (lowerText.includes('شارع') || lowerText.includes('حي ') || lowerText.includes('جوار') || lowerText.includes('توصيل') || lowerText.includes('عنوان')) {
        let cleanAddress = text
          .replace(/طريقة الدفع[:\s]*/gi, ' ')
          .replace(/الدفع[:\s]*/gi, ' ')
          .replace(/جيب/gi, ' ')
          .replace(/كاش/gi, ' ')
          .replace(/عند الاستلام/gi, ' ')
          .replace(/تحويل حاسب/gi, ' ')
          .replace(/العنوان[:\s]*/gi, '')
          .replace(/توصيل إلى[:\s]*/gi, '')
          .trim();
        if (!cleanAddress) cleanAddress = text;
        state.deliveryAddress = cleanAddress;
      }

      // Calculate Delivery Fee
      let fee = state.deliveryFee || 500;
      if (this.deliveryConfigSupplier) {
        try {
          const config = await this.deliveryConfigSupplier();
          if (config && config.isEnabled) {
            fee = config.deliveryFee || 500;
          }
        } catch (e) {
          // Fallback fee
        }
      }
      state.deliveryFee = fee;
      state.subtotal = this.calculateSubtotal(state.cart);
      state.total = state.subtotal + state.deliveryFee;

      if (!state.activeOrderDraftId) {
        state.activeOrderDraftId = `draft-${Date.now()}`;
      }

      if (state.deliveryAddress && state.paymentMethodId) {
        state.step = 'AWAITING_CONFIRMATION';
        return this.generateOrderSummary(state);
      } else if (!state.deliveryAddress) {
        state.step = 'AWAITING_ADDRESS_AND_PAYMENT';
        return `تم تحديد طريقة الدفع: (${state.paymentMethodName}). يرجى تزويدنا بعنوان التوصيل (مثال: شارع النصر جوار المحول) لعرض ملخص الطلب النهائي.`;
      } else {
        state.step = 'AWAITING_ADDRESS_AND_PAYMENT';
        return `تم تسجيل عنوان التوصيل: (${state.deliveryAddress}). رسوم التوصيل: ${fee} YER. يرجى تحديد طريقة الدفع (مثال: كاش عند الاستلام، محفظة جيب) لإكمال الطلب.`;
      }
    }

    // --- 7. Product Request / Item Parsing (Section 3) ---
    const isOrderRequest = (
      lowerText.includes('اريد') ||
      lowerText.includes('أريد') ||
      lowerText.includes('بدنا') ||
      lowerText.includes('اشتري') ||
      lowerText.includes('أشتري') ||
      lowerText.includes('كيلو') ||
      lowerText.includes('سمن') ||
      lowerText.includes('بسكوت') ||
      lowerText.includes('سكر')
    );

    if (isOrderRequest) {
      let catalog: Product[] = [
        { id: 'prod-sugar', name: 'سكر', price: 500, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
        { id: 'prod-samn', name: 'سمن الماس', price: 2500, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
        { id: 'prod-biscuit', name: 'بسكوت ابو ولد', price: 100, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
        { id: 'prod-ananas', name: 'أناناس طازج', price: 500, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
      ];

      if (this.catalogProductsSupplier) {
        try {
          const live = await this.catalogProductsSupplier();
          if (live && live.length > 0) catalog = live;
        } catch (e) {
          // Fallback to default catalog
        }
      }

      let addedAny = false;
      for (const prod of catalog) {
        const prodNameLower = prod.name.toLowerCase();
        if (lowerText.includes(prodNameLower) || (prodNameLower === 'سكر' && lowerText.includes('سكر')) || (prodNameLower.includes('سمن') && lowerText.includes('سمن')) || (prodNameLower.includes('بسكوت') && lowerText.includes('بسكوت'))) {
          let qty = 1;
          const qtyMatch = text.match(new RegExp(`(\\d+)\\s*${prod.name.split(' ')[0]}`, 'i'));
          if (qtyMatch) {
            qty = parseInt(qtyMatch[1], 10) || 1;
          }
          this.addItemToCart(state, prod.id, prod.name, prod.price, qty);
          addedAny = true;
        }
      }

      if (addedAny) {
        if (!state.activeOrderDraftId) {
          state.activeOrderDraftId = `draft-${Date.now()}`;
        }
        state.subtotal = this.calculateSubtotal(state.cart);

        if (state.deliveryAddress && state.paymentMethodId) {
          state.step = 'AWAITING_CONFIRMATION';
          return this.generateOrderSummary(state);
        } else {
          state.step = 'AWAITING_ADDRESS_AND_PAYMENT';
          return `تمت إضافة المنتجات إلى طلبك بنجاح:
${this.formatCartItemsList(state.cart)}
مجموع المنتجات: ${state.subtotal} YER.

يرجى تزويدنا بعنوان التوصيل وطريقة الدفع لإكمال الطلب.`;
        }
      }
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

  public formatCartItemsList(cart: CartItem[]): string {
    return cart.map(i => `- ${i.productName} (عدد ${i.quantity}): ${i.subtotal} YER`).join('\n');
  }

  public generateOrderSummary(state: OrderCheckoutState): string {
    state.step = 'AWAITING_CONFIRMATION';
    const subtotal = this.calculateSubtotal(state.cart);
    const fee = state.deliveryFee || 0;
    const total = subtotal + fee;
    state.subtotal = subtotal;
    state.total = total;

    const itemsText = this.formatCartItemsList(state.cart);

    return `ملخص الطلب:
${itemsText}
---
مجموع المنتجات: ${subtotal} YER
رسوم التوصيل: ${fee} YER
الإجمالي النهائي: ${total} YER
طريقة الدفع: ${state.paymentMethodName || 'كاش عند الاستلام'}
عنوان التوصيل: ${state.deliveryAddress || 'لم يحدد'}
${state.customerName ? `اسم العميل: ${state.customerName}\n` : ''}${state.customerPhone ? `رقم الهاتف: ${state.customerPhone}\n` : ''}
هل تؤكد الطلب؟ (يرجى الرد بـ "أؤكد" أو "نعم")`;
  }

  private formatOrderStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'PENDING': 'قيد الانتظار والتأكيد (PENDING)',
      'CONFIRMED': 'تم التأكيد (CONFIRMED)',
      'PREPARING': 'قيد التجهيز (PREPARING)',
      'READY_FOR_DELIVERY': 'جاهز للتوصيل (READY_FOR_DELIVERY)',
      'OUT_FOR_DELIVERY': 'خرج للتوصيل (OUT_FOR_DELIVERY)',
      'DELIVERED': 'تم التوصيل بنجاح (DELIVERED)',
      'CANCELLED': 'ملغي (CANCELLED)'
    };
    return statusMap[status] || status;
  }
}
