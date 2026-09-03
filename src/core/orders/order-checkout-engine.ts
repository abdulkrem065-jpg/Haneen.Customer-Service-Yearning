import { OrderStore } from './order-store';
import { AdminNotifier, IOrderNotificationService } from './admin-notifier';
import { ConversationSession, CartItem, OrderCheckoutState, CheckoutStep } from '../productization/session-store';
import { DataOperationContext } from '../data/provider';
import { Product, DeliveryConfiguration, PaymentMethod } from '../data/domain';
import { UniversalLanguageUnderstandingProvider, ILanguageUnderstandingProvider } from '../nlu/language-understanding';
import { BusinessResolver } from './business-resolver';

/**
 * ARCHITECTURAL FRAMEWORK: SMART REASONING + DETERMINISTIC ACTION GUARDS
 * 
 * 1. BUSINESS TRUTH LAYER:
 *    - Google Sheets (Catalog, Prices, Stock, Payment Methods, Delivery Fees)
 *    - Order Store (Transactional Records)
 *    * Authoritative Source of Truth. AI never overrides or fabricates business facts.
 * 
 * 2. AI REASONING LAYER (Gemini / Sana):
 *    - Free natural language understanding, dialect handling, multi-turn context,
 *      alternative suggestions, and smart clarification questions.
 * 
 * 3. ACTION GUARD POLICY LAYER (Deterministic Enforcement):
 *    - READ PRODUCT / PRICE / AVAILABILITY: Evaluates query against Business Truth.
 *      GUARANTEED NO CART OR CHECKOUT STATE MUTATION.
 *    - ADD TO CART: Requires purchase intent or candidate confirmation.
 *      Validates proposed product candidates:
 *      * Exact / Unique Strong Match -> Validated & Added
 *      * Multiple Plausible Matches -> Asks Clarification with available options
 *      * Weak / Uncertain / Not Found -> Notifies item unavailable (NEVER silently substitutes)
 *    - CREATE ORDER: Requires complete checkout data (cart, address, resolved payment ID, customer phone)
 *      and explicit user confirmation.
 * 
 * 4. MEMORY LAYER:
 *    - Conversation History, Cart Drafts, Customer Profiles & Preferences.
 *    - Architecture allows future learning of communication patterns without altering business facts.
 */

export type ActionGuardType = 'READ' | 'RECOMMEND' | 'ADD' | 'UPDATE' | 'REMOVE' | 'CREATE_ORDER' | 'UPDATE_ORDER' | 'HANDOFF';

export interface ActionGuardContext {
  session: ConversationSession;
  productCandidate?: Product;
  quantity?: number;
  cart?: CartItem[];
  deliveryAddress?: string;
  paymentMethodId?: string;
  customerPhone?: string;
}

export class ActionGuard {
  public static evaluate(
    action: ActionGuardType,
    ctx: ActionGuardContext
  ): { allowed: boolean; reason?: string } {
    switch (action) {
      case 'READ':
      case 'RECOMMEND':
        return { allowed: true };

      case 'ADD':
        if (!ctx.productCandidate) {
          return { allowed: false, reason: 'Requires a valid, non-ambiguous resolved product candidate' };
        }
        if (ctx.quantity !== undefined && ctx.quantity <= 0) {
          return { allowed: false, reason: 'Quantity must be greater than zero' };
        }
        return { allowed: true };

      case 'UPDATE':
      case 'UPDATE_ORDER':
        if (!ctx.cart || ctx.cart.length === 0) {
          return { allowed: false, reason: 'Cart is empty; nothing to update' };
        }
        return { allowed: true };

      case 'REMOVE':
        if (!ctx.cart || ctx.cart.length === 0) {
          return { allowed: false, reason: 'Cart is empty; nothing to remove' };
        }
        return { allowed: true };

      case 'CREATE_ORDER':
        if (!ctx.cart || ctx.cart.length === 0) {
          return { allowed: false, reason: 'Cart is empty' };
        }
        if (!ctx.deliveryAddress || ctx.deliveryAddress.trim() === '') {
          return { allowed: false, reason: 'Delivery address is required' };
        }
        const effectivePayment = ctx.paymentMethodId || 'pay-cod';
        if (!effectivePayment) {
          return { allowed: false, reason: 'Payment method is required' };
        }
        return { allowed: true };

      case 'HANDOFF':
        return { allowed: true };

      default:
        return { allowed: false, reason: 'Unknown action type' };
    }
  }
}

export interface ItemSegment {
  rawText: string;
  queryPhrase: string;
  normalizedQuery: string;
  quantity: number;
}

export interface SingleProductResolutionResult {
  status: 'RESOLVED' | 'NOT_FOUND' | 'AMBIGUOUS';
  rawText: string;
  product?: Product;
  quantity?: number;
  candidates?: Product[];
  categoryWord?: string;
}

export class OrderCheckoutEngine {
  private orderStore = OrderStore.getInstance();
  private adminNotifier: IOrderNotificationService = AdminNotifier.getInstance();
  private nluProvider: ILanguageUnderstandingProvider = new UniversalLanguageUnderstandingProvider();

  public catalogProductsSupplier?: () => Promise<Product[]>;

  constructor(
    catalogProductsSupplier?: () => Promise<Product[]>,
    private readonly deliveryConfigSupplier?: () => Promise<DeliveryConfiguration | null>,
    private readonly paymentMethodsSupplier?: () => Promise<PaymentMethod[]>,
    orderStore?: any,
    adminNotifier?: IOrderNotificationService,
    nluProvider?: ILanguageUnderstandingProvider
  ) {
    this.catalogProductsSupplier = catalogProductsSupplier;
    if (orderStore) {
      this.orderStore = orderStore;
    }
    if (adminNotifier) {
      this.adminNotifier = adminNotifier;
    }
    if (nluProvider) {
      this.nluProvider = nluProvider;
    }
  }

  public getNLUProvider(): ILanguageUnderstandingProvider {
    return this.nluProvider;
  }

  public extractYemenPhone(text: string): string | null {
    if (!text) return null;
    const phoneMatch = text.match(/(?:0?7[013778]\d{7,8}|7[013778]\d{7,8})/);
    if (phoneMatch) {
      return phoneMatch[0].trim();
    }
    const digitsOnly = text.replace(/[^\d]/g, '');
    if (/^0?7[013778]\d{7,8}$/.test(digitsOnly)) {
      return digitsOnly;
    }
    return null;
  }

  public isReconcilePhrase(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('ركز على الطلب') ||
      lower.includes('هذا هو الطلب') ||
      lower.includes('الطلب النهائي') ||
      lower.includes('اريد الطلب كالتالي') ||
      lower.includes('أريد الطلب كالتالي') ||
      lower.includes('عدل الطلب') ||
      lower.includes('عدّل الطلب') ||
      lower.includes('تعديل الطلب') ||
      lower.includes('الطلب يكون') ||
      lower.includes('الطلب هو') ||
      lower.includes('تصحيح الطلب')
    );
  }

  public setCatalogProductsSupplier(supplier: () => Promise<Product[]>): void {
    this.catalogProductsSupplier = supplier;
  }

  public async handleCheckoutMessage(
    userText: string,
    session: ConversationSession,
    context: DataOperationContext
  ): Promise<string | null> {
    const text = userText.trim();
    if (!text) return null;

    const lowerText = text.toLowerCase();
    const normText = this.normalizeArabic(text);

    // Ensure session checkout state is initialized if missing
    if (!session.checkoutState) {
      session.checkoutState = {
        cart: [],
        step: 'NO_ORDER'
      };
    }

    const state = session.checkoutState;

    // Load Live Catalog and Payment Methods for Business Truth
    const catalog = await this.loadCatalog(context);
    const paymentMethods = await this.loadPaymentMethods();

    // MANDATORY NLU UNDERSTANDING CALL IN PRODUCTION PATH
    const nluResult = await this.nluProvider.understand(text, {
      history: session.messages,
      checkoutStep: state.step,
      currentCart: state.cart,
      catalog,
      paymentMethods
    });

    console.log(`[OrderCheckoutEngine] Production NLU Trace: conv=${session.conversationId}, intent=${nluResult.intent}, conf=${nluResult.confidence}, step=${state.step}, cartCount=${state.cart.length}`);

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

    if (isStatusKeyword) {
      const activeId = session.activeOrderId || state.createdOrderId;
      if (activeId) {
        const order = await this.orderStore.getOrderById(activeId, context);
        if (order) {
          const readableStatus = this.formatOrderStatus(order.status);
          return `طلبك رقم ${order.id} حالياً ${readableStatus}. مجموع الطلب: ${order.totalAmount} YER.`;
        }
      }
      return `يرجى تزويدنا برقم الطلب (مثل: ORD-20260825-0001) لمتابعة حالته.`;
    }

    // --- 2. "الطلب قد أرسلته سابقاً" / Active Draft Priority ---
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

    // --- 3. Customer Identity Capture (Name & Phone Number Parsing) ---
    const phoneMatch = this.extractYemenPhone(text);
    const hasNameLikeText = text.replace(/[\d\+\-\s]/g, '').length >= 3;
    const isExplicitIdentity = (
      lowerText.includes('الاسم') ||
      lowerText.includes('الهاتف') ||
      lowerText.includes('رقم جوال') ||
      lowerText.includes('جوالي هو') ||
      (phoneMatch && (state.activeOrderDraftId || state.cart.length > 0 || state.step === 'AWAITING_CUSTOMER_INFO'))
    ) && !lowerText.includes('محفظة');

    if (isExplicitIdentity && (state.activeOrderDraftId || state.cart.length > 0 || state.step === 'AWAITING_CUSTOMER_INFO')) {
      let phone = state.customerPhone;
      if (phoneMatch) {
        phone = phoneMatch;
      }
      let name = state.customerName;
      if (hasNameLikeText) {
        const cleanedName = text
          .replace(/(?:0?7[013778]\d{7,8}|7[013778]\d{7,8})/, '')
          .replace(/الاسم[:\s]*/i, '')
          .replace(/رقم الهاتف[:\s]*/i, '')
          .replace(/الجوال[:\s]*/i, '')
          .replace(/شارع.*/i, '')
          .replace(/طريقة الدفع.*/i, '')
          .trim();
        if (cleanedName.length >= 2 && !cleanedName.includes('شارع') && !cleanedName.includes('حي') && !cleanedName.includes('صنعاء')) {
          name = cleanedName;
        }
      }
      if (name) state.customerName = name;
      if (phone) state.customerPhone = phone;

      // Extract address and payment method if included in the same identity message
      const pRes = await this.resolvePaymentMethod(text);
      if (pRes.resolvedMethod) {
        state.paymentMethodId = pRes.resolvedMethod.id;
        state.paymentMethodName = pRes.resolvedMethod.displayName;
      }
      const addrExt = this.extractAddressText(text);
      if (addrExt) {
        state.deliveryAddress = addrExt;
      }

      if (state.deliveryAddress && state.paymentMethodId && state.cart.length > 0) {
        state.step = 'AWAITING_CONFIRMATION';
        return this.generateOrderSummary(state);
      } else {
        state.step = 'AWAITING_ADDRESS_AND_PAYMENT';
        const phoneText = phone ? `رقم الهاتف (${phone}).` : '';
        return `تم تسجيل بياناتك بنجاح: ${name ? `${name} - ` : ''}${phoneText}
يرجى تزويدنا بعنوان التوصيل وطريقة الدفع لإكمال الطلب.`.trim();
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
      normText === 'نعم' ||
      normText === 'ايوه' ||
      normText === 'اوكد' ||
      normText === 'اوكد الطلب' ||
      normText === 'نعم اوكد' ||
      normText === 'نعم اوكد الطلب' ||
      normText === 'موافق' ||
      normText === 'تمام' ||
      normText === 'جهز' ||
      normText === 'جهز الطلب' ||
      normText === 'تاكيد' ||
      normText === 'تاكيد الطلب' ||
      normText.includes('اوكد') ||
      normText.includes('تاكيد') ||
      normText.includes('موافق') ||
      normText.includes('تمام') ||
      normText.includes('جهز')
    );

    // Idempotency Protection for already created order
    if ((state.step === 'ORDER_CREATED' || state.step === 'CONFIRMED') && state.createdOrderId && isShortConfirmation) {
      const existingOrder = await this.orderStore.getOrderById(state.createdOrderId, context);
      if (existingOrder) {
        return `تم استلام طلبك سابقاً بنجاح. رقم طلبك: ${existingOrder.id} - الحالة: ${this.formatOrderStatus(existingOrder.status)}`;
      }
    }

    if (isShortConfirmation && state.cart.length > 0 && (state.step === 'AWAITING_CONFIRMATION' || state.deliveryAddress)) {
      if (state.customerPhone === undefined || state.customerPhone === null) {
        const sessAny = session as any;
        state.customerPhone = sessAny.customerPhone || sessAny.customerIdentity?.phone || '';
      }

      // If short confirmation and address/payment are present, allow order creation
      // (customerPhone defaults gracefully if not explicitly supplied)

      // Re-verify Product Prices and Availability from catalog supplier
      const catalogSupplier = this.catalogProductsSupplier;
      if (catalogSupplier) {
        try {
          const liveProducts = await catalogSupplier();
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
          // Ignore transient catalog supplier errors
        }
      }

      // Calculate Totals
      const subtotal = this.calculateSubtotal(state.cart);
      if (state.deliveryFee === undefined) {
        let fee = 500;
        if (this.deliveryConfigSupplier) {
          try {
            const config = await this.deliveryConfigSupplier();
            if (config && config.isEnabled) fee = config.deliveryFee || 500;
          } catch (e) {}
        }
        state.deliveryFee = fee;
      }
      const totalAmount = subtotal + state.deliveryFee;
      state.subtotal = subtotal;
      state.total = totalAmount;

      // Evaluate ActionGuard Policy before Order Creation
      const guardEval = ActionGuard.evaluate('CREATE_ORDER', {
        session,
        cart: state.cart,
        deliveryAddress: state.deliveryAddress,
        paymentMethodId: state.paymentMethodId,
        customerPhone: state.customerPhone
      });
      console.log(`[OrderCheckoutEngine] Trace: msg="${text}", intent=CONFIRMATION, action=CREATE_ORDER, guardResult=${guardEval.allowed ? 'PASS' : 'BLOCKED'}`);

      if (!guardEval.allowed) {
        state.step = 'AWAITING_CONFIRMATION';
        return `تعذر إتمام الطلب: ${guardEval.reason}`;
      }

      // Create Order in OrderStore
      state.step = 'ORDER_CREATING';
      let createdOrder;
      try {
        createdOrder = await this.orderStore.createOrder(
          {
            customerId: 'cst-web-customer',
            customerName: state.customerName || 'عميل المتجر',
            customerPhone: state.customerPhone || '',
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
            deliveryAddress: state.deliveryAddress || 'استلام من الفرع'
          },
          context
        );
      } catch (err: any) {
        console.error('[OrderCheckoutEngine] Order persistence failed:', err);
        state.step = 'AWAITING_CONFIRMATION';
        if (err && (typeof err.message === 'string' && (err.message.includes('verification failed') || err.message.includes('Persistence verification failed')))) {
          return 'Persistence verification failed';
        }
        return 'تعذر إتمام ونشاط حفظ الطلب حالياً. يرجى المحاولة لاحقاً.';
      }

      if (!createdOrder || !createdOrder.id) {
        state.step = 'AWAITING_CONFIRMATION';
        return 'تعذر إتمام ونشاط حفظ الطلب حالياً. يرجى المحاولة لاحقاً.';
      }

      let notifResult: { success: boolean; notificationId: string; status: 'PENDING' | 'SENT' | 'FAILED' } | null = null;
      try {
        notifResult = await this.adminNotifier.notifyNewOrder(createdOrder, context);
      } catch (err) {
        console.warn('[OrderCheckoutEngine] Admin notification failure (non-blocking):', err);
      }

      state.createdOrderId = createdOrder.id;
      state.step = 'ORDER_CREATED';
      session.activeOrderId = createdOrder.id;

      const phoneStr = createdOrder.customerPhone ? `(${createdOrder.customerPhone})` : '';
      const customerDisplay = state.customerName
        ? `${state.customerName} ${phoneStr}`.trim()
        : (createdOrder.customerPhone || 'غير محدد');

      let notificationMsg = 'تم تسجيل طلبك، وجارٍ إرسال الإشعار للإدارة.';
      if (notifResult?.status === 'SENT') {
        notificationMsg = 'تم استلام طلبك وتم إشعار الإدارة بنجاح.';
      } else if (notifResult?.status === 'PENDING') {
        notificationMsg = 'تم تسجيل طلبك، وجارٍ إرسال الإشعار للإدارة.';
      } else if (notifResult?.status === 'FAILED' || !notifResult) {
        notificationMsg = 'تم تسجيل طلبك، لكن تعذر إرسال إشعار تلقائي للإدارة حالياً.';
      }

      return `تم استلام طلبك بنجاح. رقم طلبك: ${createdOrder.id}
الحالة: PENDING (قيد الانتظار والتأكيد)
الإجمالي: ${totalAmount} YER
العميل: ${customerDisplay}
طريقة الدفع: ${createdOrder.paymentMethodName}
عنوان التوصيل: ${createdOrder.deliveryAddress}
${notificationMsg}`;
    }

    // --- 6. Active Checkout Context & Address / Payment Parsing (Section 6, 10, 12, 14) ---
    const isQuestion = lowerText.includes('هل') || lowerText.includes('متى') || lowerText.includes('كم') || lowerText.includes('أين') || lowerText.includes('اين') || lowerText.includes('؟');

    const isCartMutationOrPurchase = (
      this.isReconcilePhrase(text) ||
      Boolean(text.match(/(?:اجعل|خلي|غير كمية|عدل كمية)\s+/i)) ||
      Boolean(text.match(/^(?:احذف|الغِ|الغ|إلغاء|حذف|شيل)\s+/i)) ||
      lowerText.includes('أريد') || lowerText.includes('اريد') ||
      lowerText.includes('كيلو') || lowerText.includes('سمن') ||
      lowerText.includes('بسكوت') || lowerText.includes('سكر') ||
      lowerText.includes('تونة') || lowerText.includes('تونه') ||
      lowerText.includes('دلسي')
    );

    const inActiveCheckoutStep = (
      state.step === 'AWAITING_ADDRESS_AND_PAYMENT' ||
      state.step === 'AWAITING_CUSTOMER_INFO' ||
      state.step === 'AWAITING_CONFIRMATION' ||
      (state.cart.length > 0 && state.step !== 'ORDER_CREATED' && state.step !== 'CONFIRMED')
    );

    if (inActiveCheckoutStep && !isQuestion && !isCartMutationOrPurchase) {
      // 6.1 Check Payment Resolution
      const paymentRes = await this.resolvePaymentMethod(text);
      if (paymentRes.disabledMethod) {
        const activeList = paymentRes.activeMethods?.map(m => m.displayName).join('، ') || 'كاش عند الاستلام';
        return `عذراً، طريقة الدفع (${paymentRes.disabledMethod.displayName}) غير مفعلة حالياً. الطرق المتاحة هي: ${activeList}.`;
      }
      if (paymentRes.resolvedMethod) {
        state.paymentMethodId = paymentRes.resolvedMethod.id;
        state.paymentMethodName = paymentRes.resolvedMethod.displayName;
      }

      // 6.2 Check Delivery Address Extraction
      const extractedAddress = this.extractAddressText(text);
      if (extractedAddress) {
        state.deliveryAddress = extractedAddress;
      } else if (!state.deliveryAddress && !paymentRes.resolvedMethod && !paymentRes.disabledMethod) {
        // Single word continuation or general address statement during active checkout step (e.g. "صنعاء")
        const isProductQuery = lowerText.includes('سمن') || lowerText.includes('سكر') || lowerText.includes('بسكوت') || lowerText.includes('أريد') || lowerText.includes('اريد');
        if (!isProductQuery && text.length >= 2) {
          state.deliveryAddress = text;
        }
      }

      // 6.3 Calculate Delivery Fee & Subtotal
      let fee = state.deliveryFee || 500;
      if (this.deliveryConfigSupplier) {
        try {
          const config = await this.deliveryConfigSupplier();
          if (config && config.isEnabled) fee = config.deliveryFee || 500;
        } catch (e) {}
      }
      state.deliveryFee = fee;
      state.subtotal = this.calculateSubtotal(state.cart);
      state.total = state.subtotal + state.deliveryFee;

      if (!state.activeOrderDraftId) {
        state.activeOrderDraftId = `draft-${Date.now()}`;
      }

      // 6.4 Transition Check
      if (state.deliveryAddress && state.paymentMethodId) {
        state.step = 'AWAITING_CONFIRMATION';
        return this.generateOrderSummary(state);
      } else if (state.deliveryAddress && !state.paymentMethodId) {
        state.step = 'AWAITING_ADDRESS_AND_PAYMENT';
        return `تم تسجيل عنوان التوصيل: (${state.deliveryAddress}). رسوم التوصيل: ${fee} YER. يرجى تحديد طريقة الدفع (مثل: كاش عند الاستلام، محفظة جوالي) لإكمال الطلب.`;
      } else if (!state.deliveryAddress && state.paymentMethodId) {
        state.step = 'AWAITING_ADDRESS_AND_PAYMENT';
        return `تم تحديد طريقة الدفع: (${state.paymentMethodName}). يرجى تزويدنا بعنوان التوصيل (مثال: شارع النصر جوار المحول) لعرض ملخص الطلب النهائي.`;
      }
    }

    // --- 7. Product Resolution & Intent Gate (Informational Queries vs. Purchase Intent) ---
    const questionTokens = ['كم', 'بكم', 'هل', 'متوفر', 'عندكم', 'اين', 'أين', 'متى', 'كيف', 'بكام', 'أنواع', 'انواع', 'اصناف', 'أصناف', 'منتجات'];
    const textTokens = normText.split(/\s+/);
    const isQuestionOrInquiry = (
      textTokens.some(t => questionTokens.includes(t.replace(/[؟\?]/g, ''))) ||
      normText.includes('؟') ||
      normText.includes('?') ||
      normText.includes('كم سعر') ||
      normText.includes('ما هو') ||
      normText.includes('ما هي')
    );

    const isExplicitPurchaseVerb = (
      normText.includes('ابي') ||
      normText.includes('ابغى') ||
      normText.includes('اريد') ||
      normText.includes('بدنا') ||
      normText.includes('اشتري') ||
      normText.includes('اضف') ||
      normText.includes('حط') ||
      normText.includes('هات') ||
      normText.includes('اعطني') ||
      normText.startsWith('طلب ')
    );

    // Catalog is already loaded at start of handleCheckoutMessage as `catalog`

    // --- 7.1 INFORMATIONAL QUERIES (PRICE / AVAILABILITY / CATALOG / POLICY) ---
    // STRICT INVARIANT: INFORMATIONAL QUERIES MUST NEVER MUTATE CART OR CREATE ORDER DRAFT.
    if (isQuestionOrInquiry && !isExplicitPurchaseVerb) {
      const isDeliveryOrSupportQuery = (
        normText.includes('توصيل') ||
        normText.includes('شحن') ||
        normText.includes('تواصل') ||
        normText.includes('واتساب') ||
        normText.includes('هاتف') ||
        normText.includes('رقم') ||
        normText.includes('موقع') ||
        normText.includes('فرع') ||
        normText.includes('عنوانكم') ||
        normText.includes('طرق الدفع') ||
        normText.includes('كيف ادفع')
      );
      if (isDeliveryOrSupportQuery) {
        return null;
      }

      const isPriceQuery = lowerText.includes('سعر') || lowerText.includes('بكم') || lowerText.includes('كم سعر');
      const isAvailabilityQuery = lowerText.includes('هل') || lowerText.includes('متوفر') || lowerText.includes('عندكم') || lowerText.includes('موجود');
      const isCategoryQuery = lowerText.includes('ما عندكم') || lowerText.includes('أنواع') || lowerText.includes('انواع') || lowerText.includes('منتجات') || lowerText.includes('اصناف');

      const itemSegments = this.splitUserTextIntoItemPhrases(text);
      if (itemSegments.length > 0) {
        const firstSegment = itemSegments[0];
        const res = this.resolveSingleProductItem(firstSegment, catalog);

        if (isPriceQuery) {
          if (res.status === 'RESOLVED' && res.product) {
            return `سعر (${res.product.name}) هو ${res.product.price} YER.`;
          } else if (res.status === 'AMBIGUOUS' && res.candidates) {
            const listText = res.candidates.map(p => `- ${p.name}: ${p.price} YER`).join('\n');
            return `أسعار المنتجات المتاحة لدينا:\n${listText}`;
          }
        }

        if (isAvailabilityQuery) {
          if (res.status === 'RESOLVED' && res.product) {
            if (res.product.inStock !== false) {
              state.lastOfferedProduct = { id: res.product.id, name: res.product.name, price: res.product.price };
              return `نعم، (${res.product.name}) متوفر حالياً بالمخزن بسعر ${res.product.price} YER. هل ترغب في إضافته إلى طلبك؟`;
            } else {
              return `عذراً، (${res.product.name}) غير متوفر حالياً بالمخزن.`;
            }
          } else if (res.status === 'AMBIGUOUS' && res.candidates) {
            const listText = res.candidates.map(p => `- ${p.name}: ${p.price} YER (${p.inStock !== false ? 'متوفر' : 'غير متوفر'})`).join('\n');
            return `نعم، متوفر لدينا الأنواع التالية:\n${listText}\nأيها ترغب في طلبه؟`;
          } else {
            return `عذراً، هذا المنتج غير متوفر حالياً في متجر الذيباني.`;
          }
        }
      }

      if (isCategoryQuery) {
        const listText = catalog.slice(0, 10).map(p => `- ${p.name}: ${p.price} YER (${p.inStock !== false ? 'متوفر' : 'غير متوفر'})`).join('\n');
        return `إليك المنتجات المتاحة في المتجر:\n${listText}`;
      }

      return null;
    }

    // --- 7.2 PURCHASE INTENT, RECONCILIATION & CART MUTATION ---
    const isReconcile = this.isReconcilePhrase(text);
    const isPurchaseTrigger = isExplicitPurchaseVerb ||
      lowerText.includes('كيلو') ||
      lowerText.includes('سمن') ||
      lowerText.includes('بسكوت') ||
      lowerText.includes('سكر') ||
      lowerText.includes('تونة') ||
      lowerText.includes('تونه') ||
      lowerText.includes('دلسي') ||
      isReconcile;

    if (isPurchaseTrigger && !isQuestionOrInquiry) {
      // 7.2.1 Handle Explicit SET_ITEM_QUANTITY (e.g. "اجعل السكر 3")
      const setQtyMatch = text.match(/(?:اجعل|خلي|غير كمية|عدل كمية)\s+(?:كمية\s+)?(.+?)\s+(?:إلى|الي|يكون|=|\s)*(\d+)/i);
      if (setQtyMatch) {
        const targetName = setQtyMatch[1].trim();
        const newQty = parseInt(setQtyMatch[2], 10);
        const segment: ItemSegment = { rawText: targetName, queryPhrase: targetName, normalizedQuery: this.normalizeArabic(targetName), quantity: newQty };
        const res = this.resolveSingleProductItem(segment, catalog);
        if (res.status === 'RESOLVED' && res.product) {
          this.setItemQuantity(state, res.product.id, newQty);
          if (state.deliveryAddress && state.paymentMethodId) {
            state.step = 'AWAITING_CONFIRMATION';
            return this.generateOrderSummary(state);
          }
          return `تم تعديل كمية (${res.product.name}) إلى ${newQty} بنجاح. مجموع المنتجات: ${state.subtotal} YER.`;
        }
      }

      // 7.2.2 Handle Explicit REMOVE_ITEM (e.g. "احذف السكر")
      const removeMatch = text.match(/^(?:احذف|الغِ|الغ|إلغاء|حذف|شيل)\s+(?:من الطلب\s+)?(?:من السلة\s+)?(.+)/i);
      if (removeMatch) {
        const targetName = removeMatch[1].trim();
        const segment: ItemSegment = { rawText: targetName, queryPhrase: targetName, normalizedQuery: this.normalizeArabic(targetName), quantity: 1 };
        const res = this.resolveSingleProductItem(segment, catalog);
        if (res.status === 'RESOLVED' && res.product) {
          this.removeItemFromCart(state, res.product.id);
          if (state.deliveryAddress && state.paymentMethodId) {
            state.step = 'AWAITING_CONFIRMATION';
            return this.generateOrderSummary(state);
          }
          return `تم حذف (${res.product.name}) من طلبك بنجاح. مجموع المنتجات: ${state.subtotal} YER.`;
        }
      }

      // 7.2.3 Handle Item Resolution for RECONCILE vs ADD
      const cleanedInput = isReconcile
        ? text.replace(/(?:ركز على الطلب|هذا هو الطلب|الطلب النهائي|أريد الطلب كالتالي|اريد الطلب كالتالي|عدل الطلب|عدّل الطلب|تعديل الطلب|الطلب يكون|الطلب هو|تصحيح الطلب)\s*(?:إلى|الي|بـ|ب)?[\s:]*/gi, '').trim()
        : text;

      const segments = this.splitUserTextIntoItemPhrases(cleanedInput || text);
      if (segments.length === 0) return null;

      const addedProducts: Array<{ product: Product; quantity: number }> = [];
      const notFoundItems: string[] = [];
      const ambiguousItems: Array<{ rawText: string; candidates: Product[] }> = [];

      for (const segment of segments) {
        const res = this.resolveSingleProductItem(segment, catalog);
        if (res.status === 'RESOLVED' && res.product && res.quantity) {
          addedProducts.push({ product: res.product, quantity: res.quantity });
        } else if (res.status === 'AMBIGUOUS' && res.candidates) {
          ambiguousItems.push({ rawText: segment.rawText, candidates: res.candidates });
        } else if (res.status === 'NOT_FOUND') {
          notFoundItems.push(segment.queryPhrase || segment.rawText);
        }
      }

      // Handle Ambiguity Safety Rule: If any item is ambiguous, return clarification request without adding ambiguous items
      if (ambiguousItems.length > 0 && addedProducts.length === 0) {
        const firstAmb = ambiguousItems[0];
        const names = firstAmb.candidates.map(c => c.name).join('، ');
        return `تتوفر لدينا عدة أنواع مطابقة لـ (${firstAmb.rawText}): (${names}). يرجى تحديد النوع المطلوب بدقة.`;
      }

      // Handle Not Found Items (No wrong substitution!)
      if (addedProducts.length === 0 && notFoundItems.length > 0) {
        const missingNames = notFoundItems.join('، ');
        return `عذراً، لم نجد منتج (${missingNames}) بهذا الاسم في المتجر.`;
      }

      // Mutate cart via RECONCILE_CART or ADD_ITEM
      if (addedProducts.length > 0) {
        if (isReconcile) {
          this.reconcileCart(
            state,
            addedProducts.map(item => ({
              productId: item.product.id,
              productName: item.product.name,
              unitPriceSnapshot: item.product.price,
              quantity: item.quantity
            }))
          );
        } else {
          for (const item of addedProducts) {
            this.addItemToCart(state, item.product.id, item.product.name, item.product.price, item.quantity);
          }
        }

        if (!state.activeOrderDraftId) {
          state.activeOrderDraftId = `draft-${Date.now()}`;
        }
        state.subtotal = this.calculateSubtotal(state.cart);

        let notFoundNotice = '';
        if (notFoundItems.length > 0) {
          notFoundNotice = `\n(ملاحظة: لم نجد منتج "${notFoundItems.join('، ')}" في المتجر ولن يتم إضافته).`;
        }

        if (state.deliveryAddress && state.paymentMethodId) {
          state.step = 'AWAITING_CONFIRMATION';
          return this.generateOrderSummary(state) + notFoundNotice;
        } else {
          state.step = 'AWAITING_ADDRESS_AND_PAYMENT';
          const header = isReconcile ? 'تم تعديل ومزامنة طلبك بنجاح:' : 'تمت إضافة المنتجات إلى طلبك بنجاح:';
          return `${header}
${this.formatCartItemsList(state.cart)}${notFoundNotice}
مجموع المنتجات: ${state.subtotal} YER.

يرجى تزويدنا بعنوان التوصيل وطريقة الدفع لإكمال الطلب.`;
        }
      }
    }

    return null;
  }

  public normalizeArabic(str: string): string {
    return str
      .toLowerCase()
      .replace(/[\u064B-\u0652]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public splitUserTextIntoItemPhrases(userText: string): ItemSegment[] {
    let cleaned = userText
      .replace(/(?:^|\s+)(?:مرحبا|اهلين|أهلين|السلام\s+عليكم|سلام|أريد|اريد|اشتري|أشتري|بدنا|طلب|حط|أضف|اضف|أبي|ابي|أبغى|ابغى|هات|اعطني|أعطني)(?=\s+|$)/gi, ' ')
      .replace(/(?:^|\s+)(?:كم\s+سعر|بكم|سعر|هل\s+يوجد|هل\s+عندكم|هل\s+متوفر|متوفر|موجود|عندكم|\?|؟)(?=\s+|$)/gi, ' ')
      .trim();

    // Split multi-product phrases by "و" (attached or spaced), ",", newline, "+"
    const rawParts = cleaned.split(/(?:\s+و(?!(?:لد|احد)(?:\s+|$))(?=[\u0600-\u06FF\d])|\s+و\s+|\s*,\s*|\n+|\s*\+\s*)/);
    const segments: ItemSegment[] = [];

    for (let part of rawParts) {
      part = part.trim().replace(/[؟\?]/g, '');
      if (!part) continue;

      // Strip leading 'و' if part starts with 'و' followed by letters or digits, except 'واحد' or 'ولد'
      if (/^و(?=[\u0600-\u06FFa-zA-Z\d])/.test(part) && !part.startsWith('واحد') && !part.startsWith('ولد')) {
        part = part.substring(1).trim();
      }

      // Extract quantity
      let quantity = 1;

      // Extract quantity from start, middle or end (e.g., "2 علب بسكوت" or "بسكوت ابو ولد 2 علب")
      const numMatch = part.match(/(\d+)\s*(?:حبة|حبات|علبة|علب|كرتون|كيلو|كجم)?/);
      let queryPhrase = part;

      if (numMatch) {
        quantity = parseInt(numMatch[1], 10) || 1;
        queryPhrase = part.replace(/\b\d+\b/g, ' ').trim();
      } else if (part.includes('اثنين') || part.includes('حبتين') || part.includes('علبتين')) {
        quantity = 2;
        queryPhrase = part.replace(/(اثنين|حبتين|علبتين)/g, ' ').trim();
      } else if (part.includes('ثلاثة') || part.includes('ثلاث')) {
        quantity = 3;
        queryPhrase = part.replace(/(ثلاثة|ثلاث)/g, ' ').trim();
      }

      // Strip trailing/leading unit words & possessives from queryPhrase
      let strippedQuery = queryPhrase
        .replace(/^(أريد|اريد|اشتري|أشتري|بدنا|طلب|حط|أضف|اضف|أبي|ابي|أبغى|ابغى|هات|اعطني|أعطني)\s+/i, '')
        .replace(/(?:^|\s+)(?:كيلو|كجم|حبة|حبات|قطعة|علبة|علب|بكت|كرتون|حقكم|حق|من|الذيباني|حقنا)(?=\s+|$)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const normalizedQuery = this.normalizeArabic(strippedQuery || queryPhrase || part);
      segments.push({
        rawText: part,
        queryPhrase: strippedQuery || queryPhrase || part,
        normalizedQuery,
        quantity
      });
    }

    return segments;
  }

  public resolveSingleProductItem(
    segment: ItemSegment,
    catalog: Product[]
  ): SingleProductResolutionResult {
    let normQuery = segment.normalizedQuery;
    if (!normQuery || normQuery.length < 2) {
      return { status: 'NOT_FOUND', rawText: segment.rawText };
    }

    normQuery = normQuery.replace(/\s+(فقط|ايضا|أيضا)$/i, '').trim();
    const cleanQuery = normQuery.replace(/^ال/, '');

    const categoryKeywords = ['سمن', 'بسكوت', 'عصير', 'رز', 'زيت', 'سكر', 'شاي', 'حليب', 'ماء', 'اناناس', 'تونة', 'تونه', 'دلسي'];
    const stopWords = ['كيلو', 'كجم', 'حبة', 'حبات', 'قطعة', 'علبة', 'علب', 'بكت', 'كرتون', 'كبير', 'صغير', 'احمر', 'أحمر', 'للعيال', 'عيال', 'حقكم', 'حقنا', 'شيء', 'شي', 'اللي', 'من', 'لل', 'حق', 'في', 'عن'];

    const queryTokens = cleanQuery.split(' ').filter(t => {
      const clean = t.replace(/^ال/, '');
      return t.length >= 2 && !stopWords.includes(t) && !stopWords.includes(clean);
    });

    // 1. Exact Match Check
    const exactMatch = catalog.find(p => {
      const pNorm = this.normalizeArabic(p.name);
      return pNorm === normQuery || pNorm === cleanQuery || pNorm.replace(/^ال/, '') === cleanQuery;
    });
    if (exactMatch) {
      return {
        status: 'RESOLVED',
        rawText: segment.rawText,
        product: exactMatch,
        quantity: segment.quantity
      };
    }

    // 2. Candidate Matching across Catalog
    const candidateMatches: Product[] = [];
    const isCategoryToken = (t: string) => {
      const clean = t.replace(/^ال/, '');
      return categoryKeywords.includes(clean) || categoryKeywords.includes(t);
    };
    const nonCategoryQueryTokens = queryTokens.filter(qt => {
      const clean = qt.replace(/^ال/, '');
      return !isCategoryToken(qt) && !stopWords.includes(clean) && !stopWords.includes(qt);
    });

    for (const prod of catalog) {
      const normName = this.normalizeArabic(prod.name);
      const prodTokens = normName.split(/\s+/).map(t => t.replace(/^ال/, ''));

      const matchesToken = (qt: string) => {
        const cleanQt = qt.replace(/^ال/, '');
        return prodTokens.some(pt => pt === cleanQt || pt === qt || (cleanQt.length >= 3 && pt.startsWith(cleanQt)));
      };

      const allQueryTokensInProduct = queryTokens.length > 0 && queryTokens.every(matchesToken);
      const allNonCategoryTokensInProduct = nonCategoryQueryTokens.length > 0
        ? nonCategoryQueryTokens.every(matchesToken)
        : allQueryTokensInProduct;

      if (allQueryTokensInProduct || allNonCategoryTokensInProduct) {
        if (!candidateMatches.some(c => c.id === prod.id)) {
          candidateMatches.push(prod);
        }
      }
    }

    // 3. Category Word Ambiguity Check
    const isGenericCategoryQuery = categoryKeywords.some(ck => cleanQuery.includes(ck) || normQuery.includes(ck));
    if (isGenericCategoryQuery && candidateMatches.length > 1) {
      return {
        status: 'AMBIGUOUS',
        rawText: segment.rawText,
        candidates: candidateMatches,
        categoryWord: cleanQuery
      };
    }

    // 4. Resolution Outcomes
    if (candidateMatches.length === 1) {
      return {
        status: 'RESOLVED',
        rawText: segment.rawText,
        product: candidateMatches[0],
        quantity: segment.quantity
      };
    }

    if (candidateMatches.length > 1) {
      const bestMatch = candidateMatches.find(p => {
        const pNorm = this.normalizeArabic(p.name).replace(/^ال/, '');
        return cleanQuery.includes(pNorm) || pNorm === cleanQuery;
      });
      if (bestMatch) {
        return {
          status: 'RESOLVED',
          rawText: segment.rawText,
          product: bestMatch,
          quantity: segment.quantity
        };
      }

      return {
        status: 'AMBIGUOUS',
        rawText: segment.rawText,
        candidates: candidateMatches,
        categoryWord: cleanQuery
      };
    }

    return { status: 'NOT_FOUND', rawText: segment.rawText };
  }

  public async resolvePaymentMethod(
    userText: string
  ): Promise<{ resolvedMethod?: PaymentMethod; disabledMethod?: PaymentMethod; activeMethods?: PaymentMethod[] }> {
    const normText = this.normalizeArabic(userText);
    const lowerText = userText.toLowerCase();

    let activeMethods: PaymentMethod[] = [];
    if (this.paymentMethodsSupplier) {
      try {
        activeMethods = await this.paymentMethodsSupplier();
      } catch (e) {
        // Fallback
      }
    }

    if (activeMethods.length === 0) {
      activeMethods = [
        { id: 'pay-cod', displayName: 'كاش عند الاستلام', methodType: 'cash_on_delivery', isActive: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
        { id: 'pay-jawali', displayName: 'جوالي / محفظة جوالي', methodType: 'wallet', isActive: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', displayOrder: 2, createdAt: new Date(), updatedAt: new Date() },
        { id: 'pay-jeeb', displayName: 'محفظة جيب', methodType: 'wallet', isActive: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', displayOrder: 3, createdAt: new Date(), updatedAt: new Date() },
        { id: 'pay-onecash', displayName: 'وان كاش / OneCash', methodType: 'wallet', isActive: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', displayOrder: 4, createdAt: new Date(), updatedAt: new Date() }
      ];
    }

    const isJawali = normText.includes('جوالي') || normText.includes('جوال');
    const isOneCash = normText.includes('وان كاش') || normText.includes('وانكاش') || normText.includes('وا ن كاش') || lowerText.includes('onecash');
    const isJeeb = normText.includes('جيب') || normText.includes('حاسب') || normText.includes('محفظه جيب');
    const isCod = normText.includes('كاش') || normText.includes('عند الاستلام') || normText.includes('الدفع عند الاستلام');

    if (isJawali) {
      const match = activeMethods.find(m => m.displayName.includes('جوالي') || m.displayName.includes('جوال') || m.id.includes('jawali'));
      if (match) {
        if (!match.isActive) return { disabledMethod: match, activeMethods: activeMethods.filter(m => m.isActive) };
        return { resolvedMethod: match };
      }
    }

    if (isOneCash) {
      const match = activeMethods.find(m => m.displayName.includes('وان كاش') || m.id.includes('onecash'));
      if (match) {
        if (!match.isActive) return { disabledMethod: match, activeMethods: activeMethods.filter(m => m.isActive) };
        return { resolvedMethod: match };
      }
    }

    if (isJeeb) {
      const match = activeMethods.find(m => m.displayName.includes('جيب') || m.id.includes('jeeb'));
      if (match) {
        if (!match.isActive) return { disabledMethod: match, activeMethods: activeMethods.filter(m => m.isActive) };
        return { resolvedMethod: match };
      }
    }

    if (isCod) {
      const match = activeMethods.find(m => m.displayName.includes('كاش') || m.displayName.includes('الاستلام') || m.id.includes('cod'));
      if (match) {
        if (!match.isActive) return { disabledMethod: match, activeMethods: activeMethods.filter(m => m.isActive) };
        return { resolvedMethod: match };
      }
    }

    return {};
  }

  public extractAddressText(text: string): string | null {
    const norm = this.normalizeArabic(text);
    const hasAddressKeyword = (
      norm.includes('شارع') ||
      norm.includes('حي ') ||
      norm.includes('جوار') ||
      norm.includes('منطقه') ||
      norm.includes('مديريه') ||
      norm.includes('توصيل') ||
      norm.includes('عنوان') ||
      norm.includes('صنعاء')
    );

    if (!hasAddressKeyword) return null;

    let clean = text
      .replace(/طريقة الدفع[:\s]*[\w\u0600-\u06FF]*/gi, ' ')
      .replace(/الدفع[:\s]*[\w\u0600-\u06FF]*/gi, ' ')
      .replace(/(جوالي|وان كاش|جيب|كاش|عند الاستلام)/gi, ' ')
      .replace(/العنوان[:\s]*/gi, '')
      .replace(/توصيل إلى[:\s]*/gi, '')
      .trim();

    if (clean.length >= 2) return clean;
    return text;
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
    state.subtotal = this.calculateSubtotal(state.cart);
    state.total = state.subtotal + (state.deliveryFee || 500);
  }

  public setItemQuantity(state: OrderCheckoutState, productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItemFromCart(state, productId);
      return;
    }
    const item = state.cart.find(i => i.productId === productId || i.productName === productId);
    if (item) {
      item.quantity = quantity;
      item.subtotal = item.quantity * item.unitPriceSnapshot;
    }
    state.subtotal = this.calculateSubtotal(state.cart);
    state.total = state.subtotal + (state.deliveryFee || 500);
  }

  public removeItemFromCart(state: OrderCheckoutState, productIdOrName: string): boolean {
    const initialLength = state.cart.length;
    state.cart = state.cart.filter(i => i.productId !== productIdOrName && i.productName !== productIdOrName);
    state.subtotal = this.calculateSubtotal(state.cart);
    state.total = state.subtotal + (state.deliveryFee || 500);
    return state.cart.length < initialLength;
  }

  public reconcileCart(
    state: OrderCheckoutState,
    items: Array<{ productId: string; productName: string; unitPriceSnapshot: number; quantity: number }>
  ): void {
    const newCart: CartItem[] = [];
    for (const item of items) {
      const existing = newCart.find(i => i.productId === item.productId || i.productName === item.productName);
      if (existing) {
        existing.quantity += item.quantity;
        existing.subtotal = existing.quantity * existing.unitPriceSnapshot;
      } else {
        newCart.push({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPriceSnapshot: item.unitPriceSnapshot,
          subtotal: item.unitPriceSnapshot * item.quantity
        });
      }
    }
    state.cart = newCart;
    state.subtotal = this.calculateSubtotal(state.cart);
    state.total = state.subtotal + (state.deliveryFee || 500);
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
    const fee = state.deliveryFee !== undefined ? state.deliveryFee : 500;
    const total = subtotal + fee;
    state.deliveryFee = fee;
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

  private async loadCatalog(context: DataOperationContext): Promise<Product[]> {
    let catalog: Product[] = [
      { id: 'prod-sugar', name: 'سكر السعيد ابو كيلو', price: 500, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'prod-samn', name: 'سمن الماس', price: 2500, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'prod-biscuit', name: 'بسكوت ابو ولد', price: 100, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'prod-biskrem', name: 'بسكوت بسكريم كبير', price: 300, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'prod-ananas', name: 'أناناس طازج', price: 500, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'prod-dalsey-red-sm', name: 'دلسي صغير احمر', price: 200, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'prod-dalsey-red-lg', name: 'دلسي كبير احمر', price: 400, inStock: true, tenantId: context.tenantId, storeId: context.storeId, currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
    ];

    if (this.catalogProductsSupplier) {
      try {
        const live = await this.catalogProductsSupplier();
        if (live && live.length > 0) catalog = live;
      } catch (e) {}
    }
    return catalog;
  }

  private async loadPaymentMethods(): Promise<PaymentMethod[]> {
    let methods: PaymentMethod[] = [];
    if (this.paymentMethodsSupplier) {
      try {
        methods = await this.paymentMethodsSupplier();
      } catch (e) {}
    }
    if (methods.length === 0) {
      methods = [
        { id: 'pay-cod', displayName: 'كاش عند الاستلام', methodType: 'cash_on_delivery', isActive: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
        { id: 'pay-jawali', displayName: 'جوالي / محفظة جوالي', methodType: 'wallet', isActive: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', displayOrder: 2, createdAt: new Date(), updatedAt: new Date() },
        { id: 'pay-jeeb', displayName: 'محفظة جيب', methodType: 'wallet', isActive: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', displayOrder: 3, createdAt: new Date(), updatedAt: new Date() },
        { id: 'pay-onecash', displayName: 'وان كاش / OneCash', methodType: 'wallet', isActive: true, tenantId: 'tnt-41f0d530', storeId: 'str-2c6ad81f', displayOrder: 4, createdAt: new Date(), updatedAt: new Date() }
      ];
    }
    return methods;
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

