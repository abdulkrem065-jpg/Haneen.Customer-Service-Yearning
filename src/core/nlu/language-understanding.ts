import { Product, PaymentMethod } from '../data/domain';

/**
 * Universal Intent Types for Sana Core Understanding
 */
export type UniversalIntentType =
  | 'PURCHASE'
  | 'PRICE_QUERY'
  | 'AVAILABILITY_QUERY'
  | 'RECOMMENDATION_SEARCH'
  | 'ADDRESS_PAYMENT_PROVIDE'
  | 'PHONE_PROVIDE'
  | 'NAME_PROVIDE'
  | 'CONFIRMATION'
  | 'ORDER_STATUS_QUERY'
  | 'HUMAN_HANDOFF'
  | 'RECONCILE_CART'
  | 'QUANTITY_CHANGE'
  | 'REMOVE_ITEM'
  | 'UNKNOWN';

export type ProductResolutionConfidence =
  | 'HIGH_CONFIDENCE_UNIQUE'
  | 'MEDIUM_AMBIGUOUS'
  | 'LOW_UNRESOLVED';

export interface ProductRequestItem {
  rawText: string;
  queryPhrase: string;
  quantity: number;
  unit?: string;
  productDescription?: string;
  category?: string;
  attributes?: Record<string, string>;
  brand?: string;
  color?: string;
  size?: string;
}

export interface StructuredIntent {
  intent: UniversalIntentType;
  confidence: number;
  productRequests: ProductRequestItem[];
  quantity?: number;
  unit?: string;
  productDescription?: string;
  category?: string;
  priceConstraint?: 'CHEAPEST' | 'EXPENSIVE' | 'EXACT' | 'UNDER_MAX';
  availabilityConstraint?: boolean;
  paymentMethodQuery?: string;
  paymentRequest?: string;
  paymentMethodName?: string;
  address?: string;
  customerName?: string;
  customerPhone?: string;
  confirmation?: boolean;
  cartOperation: 'ADD' | 'SET_QUANTITY' | 'REMOVE' | 'RECONCILE' | 'CONFIRM' | 'NONE';
  contextReference?: boolean;
  searchQuery?: string;
  targetOrderId?: string;
}

/**
 * Extensible Conversation Memory & Learning Signal Interfaces (Learning-Ready Architecture)
 */
export interface LearningSignal {
  signalId: string;
  conversationId: string;
  userUtterance: string;
  parsedIntent: UniversalIntentType;
  resolvedEntities: Record<string, unknown>;
  userFeedback?: 'SUCCESS' | 'CORRECTION' | 'ABANDONMENT';
  timestamp: Date;
}

export interface ConversationMemory {
  conversationId: string;
  recentIntents: UniversalIntentType[];
  customerPreferences?: {
    preferredPayment?: string;
    preferredAddress?: string;
    frequentItems?: string[];
  };
  learningSignals: LearningSignal[];
}

export interface ILearningSignalStore {
  recordSignal(signal: LearningSignal): Promise<void>;
  getSignals(conversationId: string): Promise<LearningSignal[]>;
}

export class InMemoryLearningSignalStore implements ILearningSignalStore {
  private signals: Map<string, LearningSignal[]> = new Map();

  async recordSignal(signal: LearningSignal): Promise<void> {
    const list = this.signals.get(signal.conversationId) || [];
    list.push(signal);
    this.signals.set(signal.conversationId, list);
  }

  async getSignals(conversationId: string): Promise<LearningSignal[]> {
    return this.signals.get(conversationId) || [];
  }
}

export interface IConversationMemoryStore {
  getMemory(conversationId: string): Promise<ConversationMemory | null>;
  saveMemory(memory: ConversationMemory): Promise<void>;
}

export class InMemoryConversationMemoryStore implements IConversationMemoryStore {
  private memoryStore: Map<string, ConversationMemory> = new Map();

  async getMemory(conversationId: string): Promise<ConversationMemory | null> {
    return this.memoryStore.get(conversationId) || null;
  }

  async saveMemory(memory: ConversationMemory): Promise<void> {
    this.memoryStore.set(memory.conversationId, memory);
  }
}

/**
 * Translation Adapter Interface (ILanguageUnderstandingProvider)
 * Allows plugging in Gemini LLM, translation engines, or local NLU models seamlessly.
 */
export interface ILanguageUnderstandingProvider {
  understand(
    message: string,
    context?: {
      history?: any[];
      checkoutStep?: string;
      currentCart?: any[];
      catalog?: Product[];
      paymentMethods?: PaymentMethod[];
    }
  ): Promise<StructuredIntent>;
}

/**
 * Core Universal NLU Provider Implementation
 * Fuses dialect handling, morphological normalization, semantic entity extraction, and contextual understanding.
 */
export class UniversalLanguageUnderstandingProvider implements ILanguageUnderstandingProvider {
  /**
   * Universal Arabic Morphological Normalization
   */
  public normalizeText(text: string): string {
    if (!text) return '';
    return text
      .trim()
      .toLowerCase()
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[[\],.!؟?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract Yemeni Phone Number
   */
  public extractYemenPhone(text: string): string | null {
    if (!text) return null;
    const phoneMatch = text.match(/(?:0?7[013778]\d{7,8}|7[013778]\d{7,8})/);
    if (phoneMatch) return phoneMatch[0].trim();
    const digitsOnly = text.replace(/[^\d]/g, '');
    if (/^0?7[013778]\d{7,8}$/.test(digitsOnly)) return digitsOnly;
    return null;
  }

  /**
   * Main NLU Processing Engine
   */
  public async understand(
    message: string,
    context?: {
      history?: any[];
      checkoutStep?: string;
      currentCart?: any[];
      catalog?: Product[];
      paymentMethods?: PaymentMethod[];
    }
  ): Promise<StructuredIntent> {
    const rawText = message.trim();
    const norm = this.normalizeText(rawText);
    const lower = rawText.toLowerCase();

    // 1. Human Handoff Intent
    if (
      norm.includes('مواظف بشري') ||
      norm.includes('موظف بشري') ||
      norm.includes('اريد موظف') ||
      norm.includes('التحدث مع موظف') ||
      norm.includes('كلم موظف') ||
      norm.includes('خدمه العملاء البشريه') ||
      norm.includes('تحويل لموظف')
    ) {
      return {
        intent: 'HUMAN_HANDOFF',
        confidence: 0.99,
        productRequests: [],
        cartOperation: 'NONE'
      };
    }

    // 2. Order Status Intent
    const explicitOrderMatch = rawText.match(/ORD-\d{8}-\d{4}/i);
    if (
      explicitOrderMatch ||
      norm.includes('اين طلبي') ||
      norm.includes('هل طلبي جاهز') ||
      norm.includes('حاله طلبي') ||
      norm.includes('متابعه الطلب') ||
      norm.includes('حاله الطلب')
    ) {
      return {
        intent: 'ORDER_STATUS_QUERY',
        confidence: 0.95,
        productRequests: [],
        cartOperation: 'NONE',
        targetOrderId: explicitOrderMatch ? explicitOrderMatch[0].toUpperCase() : undefined
      };
    }

    // 3. Confirmation Intent
    const isConfirmationText =
      norm === 'نعم' ||
      norm === 'ايوه' ||
      norm === 'موافق' ||
      norm === 'تاكيد' ||
      norm === 'تاكيد الطلب' ||
      norm === 'جهز' ||
      norm === 'جهز الطلب' ||
      norm === 'اوكد' ||
      norm.includes('اوكد') ||
      norm.includes('تاكيد') ||
      norm.includes('موافق');

    if (isConfirmationText) {
      return {
        intent: 'CONFIRMATION',
        confidence: 0.98,
        productRequests: [],
        confirmation: true,
        cartOperation: 'CONFIRM'
      };
    }

    // 4. Phone-only Input Intent
    const phone = this.extractYemenPhone(rawText);
    const nonDigitCount = rawText.replace(/[\d\+\-\s]/g, '').length;
    if (phone && nonDigitCount < 4) {
      return {
        intent: 'PHONE_PROVIDE',
        confidence: 0.99,
        productRequests: [],
        customerPhone: phone,
        cartOperation: 'NONE'
      };
    }

    // 5. Name Capture Intent (e.g. "الاسم علي الذيباني")
    if (rawText.match(/^الاسم[:\s]+/i) || (context?.checkoutStep === 'AWAITING_CUSTOMER_INFO' && !phone && nonDigitCount >= 3)) {
      const cleanedName = rawText.replace(/^الاسم[:\s]+/i, '').trim();
      return {
        intent: 'NAME_PROVIDE',
        confidence: 0.95,
        productRequests: [],
        customerName: cleanedName,
        cartOperation: 'NONE'
      };
    }

    // 6. Payment & Address Input Detection
    const paymentKeywords = ['جوالي', 'الجيب', 'محفظه', 'جيب', 'كاش', 'عند الاستلام', 'حواله', 'ام فلوس', 'بنك'];
    const hasPaymentMention = paymentKeywords.some(k => norm.includes(k));
    const addressKeywords = ['شارع', 'حي', 'صنعاء', 'حدة', 'الزبيري', 'عمارة', 'جوار', 'منزل', 'بجانب'];
    const hasAddressMention = addressKeywords.some(k => norm.includes(k));

    const isExplicitPurchaseVerb = norm.includes('اريد') || norm.includes('ابي') || norm.includes('ابغى') || norm.includes('اشتري');
    const isExplicitAddressPaymentHeader = norm.startsWith('عنوان') || norm.startsWith('طريقة الدفع') || norm.startsWith('طريقه الدفع') || norm.startsWith('العنوان');

    if ((!isExplicitPurchaseVerb || isExplicitAddressPaymentHeader) && (hasPaymentMention || hasAddressMention || (context?.checkoutStep && context.checkoutStep !== 'NO_ORDER' && (hasPaymentMention || hasAddressMention || phone)))) {
      let resolvedPaymentReq = hasPaymentMention ? rawText : undefined;
      if (norm.includes('جيب') || norm.includes('الجيب')) {
        resolvedPaymentReq = 'محفظة جيب';
      }
      return {
        intent: 'ADDRESS_PAYMENT_PROVIDE',
        confidence: 0.90,
        productRequests: [],
        customerPhone: phone || undefined,
        address: hasAddressMention ? rawText : undefined,
        paymentRequest: resolvedPaymentReq,
        cartOperation: 'NONE'
      };
    }

    // 7. Recommendation / Vague Search Intent
    if (
      norm.includes('ينحط مع الرز') ||
      norm.includes('ينطبخ مع') ||
      norm.includes('اقترح لي') ||
      norm.includes('تنصحني') ||
      norm.includes('وش في عندك') ||
      norm.includes('عندك شي للاطفال') ||
      norm.includes('بسكوت للعيال')
    ) {
      const priceConstraint = (norm.includes('الأرخص') || norm.includes('ارخص') || norm.includes('الارخص')) ? 'CHEAPEST' : undefined;
      if (!norm.includes('ابي') && !norm.includes('اريد') && !norm.includes('اشتري') && !norm.includes('ابغى')) {
        return {
          intent: 'RECOMMENDATION_SEARCH',
          confidence: 0.90,
          productRequests: [],
          searchQuery: rawText,
          priceConstraint,
          cartOperation: 'NONE'
        };
      } else {
        // "أبغى الشيء الأرخص اللي ينحط مع الرز"
        return {
          intent: 'RECOMMENDATION_SEARCH',
          confidence: 0.90,
          productRequests: [{
            rawText,
            queryPhrase: 'ينحط مع الرز',
            quantity: 1,
            productDescription: 'ينحط مع الرز'
          }],
          searchQuery: rawText,
          priceConstraint,
          cartOperation: 'ADD'
        };
      }
    }

    // 8. Price Query vs Availability Query vs Purchase Intent
    const isQuestion =
      norm.includes('كم') ||
      norm.includes('سعر') ||
      norm.includes('بكم') ||
      norm.includes('هل') ||
      norm.includes('متوفر') ||
      norm.includes('عندكم') ||
      norm.includes('موجود') ||
      norm.includes('؟');

    const isPurchaseVerb =
      norm.includes('ابي') ||
      norm.includes('ابغى') ||
      norm.includes('اريد') ||
      norm.includes('بدنا') ||
      norm.includes('اشتري') ||
      norm.includes('اضف') ||
      norm.includes('حط') ||
      norm.includes('هات') ||
      norm.startsWith('طلب ');

    const isReconcile =
      norm.includes('ركز على الطلب') ||
      norm.includes('هذا هو الطلب') ||
      norm.includes('الطلب النهائي') ||
      norm.includes('عدل الطلب') ||
      norm.includes('تصحيح الطلب');

    // Extract Product Requests from text
    const productRequests = this.extractProductRequests(rawText);

    if (isQuestion && !isPurchaseVerb && !isReconcile) {
      if (norm.includes('سعر') || norm.includes('بكم') || norm.includes('كم')) {
        return {
          intent: 'PRICE_QUERY',
          confidence: 0.95,
          productRequests,
          cartOperation: 'NONE'
        };
      } else {
        return {
          intent: 'AVAILABILITY_QUERY',
          confidence: 0.95,
          productRequests,
          cartOperation: 'NONE'
        };
      }
    }

    if (isReconcile) {
      return {
        intent: 'RECONCILE_CART',
        confidence: 0.98,
        productRequests,
        cartOperation: 'RECONCILE'
      };
    }

    // Reconcile quantity changes or removal
    if (rawText.match(/(?:اجعل|خلي|غير كمية|عدل كمية)/i)) {
      return {
        intent: 'QUANTITY_CHANGE',
        confidence: 0.95,
        productRequests,
        cartOperation: 'SET_QUANTITY'
      };
    }

    if (rawText.match(/^(?:احذف|الغِ|الغ|إلغاء|حذف|شيل)/i)) {
      return {
        intent: 'REMOVE_ITEM',
        confidence: 0.95,
        productRequests,
        cartOperation: 'REMOVE'
      };
    }

    if (isPurchaseVerb || productRequests.length > 0) {
      return {
        intent: 'PURCHASE',
        confidence: 0.90,
        productRequests,
        cartOperation: 'ADD'
      };
    }

    return {
      intent: 'UNKNOWN',
      confidence: 0.5,
      productRequests: [],
      cartOperation: 'NONE'
    };
  }

  /**
   * Helper: Parse item segments and quantities from text
   */
  public extractProductRequests(text: string): ProductRequestItem[] {
    let cleaned = text
      .replace(/(?:^|\s+)(?:مرحبا|اهلين|أهلين|السلام\s+عليكم|سلام|أريد|اريد|اشتري|أشتري|بدنا|طلب|حط|أضف|اضف|أبي|ابي|أبغى|ابغى|هات|اعطني|أعطني)(?=\s+|$)/gi, ' ')
      .replace(/(?:^|\s+)(?:كم\s+سعر|بكم|سعر|هل\s+يوجد|هل\s+عندكم|هل\s+متوفر|متوفر|موجود|عندكم|\?|؟)(?=\s+|$)/gi, ' ')
      .trim();

    // Check quantity change syntax (e.g. "خلي السكر اثنين")
    const qtyChangeMatch = text.match(/(?:اجعل|خلي|غير كمية|عدل كمية)\s+(?:كمية\s+)?(.+?)\s+(?:إلى|الي|يكون|=|\s)*(\d+|اثنان|اثنين|ثلاثة|ثلاث|اربعة|اربع|خمسة|خمس)/i);
    if (qtyChangeMatch) {
      const namePart = qtyChangeMatch[1].trim();
      let q = 1;
      const qVal = qtyChangeMatch[2].toLowerCase();
      if (/^\d+$/.test(qVal)) q = parseInt(qVal, 10);
      else if (qVal.includes('اثنين') || qVal.includes('اثنان')) q = 2;
      else if (qVal.includes('ثلاث')) q = 3;
      return [{ rawText: text, queryPhrase: namePart, quantity: q }];
    }

    const rawParts = cleaned.split(/(?:\s+و(?!(?:لد|احد)(?:\s+|$))(?=[\u0600-\u06FF\d])|\s+و\s+|\s*,\s*|\n+|\s*\+\s*)/);
    const requests: ProductRequestItem[] = [];

    for (let rawPart of rawParts) {
      let part = rawPart.trim().replace(/[؟\?]/g, '');
      if (!part) continue;

      // Strip leading 'و' if part starts with 'و' followed by letters or digits, except 'واحد' or 'ولد'
      if (/^و(?=[\u0600-\u06FFa-zA-Z\d])/.test(part) && !part.startsWith('واحد') && !part.startsWith('ولد')) {
        part = part.substring(1).trim();
      }

      let quantity = 1;
      let unit: string | undefined;

      const numMatch = part.match(/(\d+)\s*(حبة|حبات|علبة|علب|كرتون|كيلو|كجم)?/);
      if (numMatch) {
        quantity = parseInt(numMatch[1], 10);
        if (numMatch[2]) unit = numMatch[2];
      } else if (part.includes('اثنان') || part.includes('حبتين') || part.includes('علبتين') || part.includes('كيلوين')) {
        quantity = 2;
      }

      let queryPhrase = part
        .replace(/(?:^|\s+)(?:أريد|اريد|اشتري|أشتري|بدنا|طلب|حط|أضف|اضف|أبي|ابي|أبغى|ابغى|هات|اعطني|أعطني)(?=\s+|$)/gi, ' ')
        .replace(/(?:^|\s+)(?:مرحبا|اهلين|أهلين|سلام)(?=\s+|$)/gi, ' ')
        .replace(/\b\d+\b/g, ' ')
        .replace(/(?:^|\s+)(?:حبة|حبات|علبة|علب|كرتون|كيلو|كجم|من|حقكم|حق|اللي)(?=\s+|$)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!queryPhrase) queryPhrase = part;

      requests.push({
        rawText: part,
        queryPhrase,
        quantity,
        unit
      });
    }

    return requests;
  }
}
