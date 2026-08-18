import { NoHallucinationGuard } from '../tools/no-hallucination-guard.js';
import { UnauthorizedDataAccessError } from '../data/errors.js';
import { AgentOrchestrator } from '../orchestrator.js';
import { GeminiAIProvider } from '../../infrastructure/ai/gemini/gemini-provider.js';
import { InMemoryConversationContext } from '../../infrastructure/data/memory-conversation-context.js';
import { SimpleToolRegistry } from '../mocks.js';
import { AgentPolicy } from '../types.js';
import { InMemorySessionStore, ConversationSession } from './session-store.js';
import { InMemoryLeadStore, DigitalServiceLead } from './lead-store.js';
import { ChatRateLimiter } from './rate-limiter.js';
import { AgentIdentityStore, AgentIdentityConfig } from './agent-identity.js';
import { HeaderMap } from '../../infrastructure/google-sheets/header-map.js';
import { SecureGoogleSheetsTransport } from '../../infrastructure/google-sheets/secure-transport.js';
import { GoogleServiceAccountAuth } from '../../infrastructure/google-sheets/auth.js';
import { IGoogleSheetsTransport } from '../../infrastructure/google-sheets/transport.js';

export const CANONICAL_SPREADSHEET_ID = '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';
export const CANONICAL_TENANT_ID = 'tnt-41f0d530';
export const CANONICAL_STORE_ID = 'str-2c6ad81f';
export const CANONICAL_AGENT_ID = 'agt-c93183d5';
export const CANONICAL_CURRENCY = 'YER';

class SafeLogger {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(`[HaneenService] INFO: ${message}`, meta ? JSON.stringify(meta) : '');
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[HaneenService] WARN: ${message}`, meta ? JSON.stringify(meta) : '');
  }
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[HaneenService] ERROR: ${message}`, meta ? JSON.stringify(meta) : '');
  }
  debug(message: string, meta?: Record<string, unknown>): void {}
}

export interface ChatRequestPayload {
  message: string;
  conversationId?: string;
  clientTenantId?: string;
  clientStoreId?: string;
  clientAgentId?: string;
  clientIp?: string;
  leadConfirmation?: {
    userConfirmed: boolean;
    name: string;
    phone: string;
    serviceType: string;
    email?: string;
  };
}

export interface ChatResponsePayload {
  conversationId: string;
  message: string;
  status: 'ACTIVE' | 'REQUIRES_HUMAN' | 'CLOSED';
  handoffState?: {
    reason: string;
    requestedAt: Date;
  };
  leadState?: {
    leadId?: string;
    userConfirmed: boolean;
    status: 'PENDING' | 'CONFIRMED';
  };
  timestamp: Date;
}

export interface IHaneenService {
  processMessage(payload: ChatRequestPayload): Promise<ChatResponsePayload>;
}

export class HaneenService implements IHaneenService {
  private logger = new SafeLogger();
  private sessionStore: InMemorySessionStore;
  private leadStore: InMemoryLeadStore;
  private rateLimiter: ChatRateLimiter;
  private identityStore: AgentIdentityStore;
  private cachedPolicy: { policy: AgentPolicy; loadedAt: number } | null = null;
  private mockOrchestratorForTesting: AgentOrchestrator | null = null;

  private aiTimeoutMs: number;
  private sheetsTransport: IGoogleSheetsTransport | null = null;

  constructor(
    sessionStore?: InMemorySessionStore,
    leadStore?: InMemoryLeadStore,
    rateLimiter?: ChatRateLimiter,
    options?: { aiTimeoutMs?: number; identityStore?: AgentIdentityStore; sheetsTransport?: IGoogleSheetsTransport }
  ) {
    this.sessionStore = sessionStore || new InMemorySessionStore();
    this.leadStore = leadStore || new InMemoryLeadStore();
    this.rateLimiter = rateLimiter || new ChatRateLimiter({ maxRequests: 30, windowMs: 60000 });
    this.identityStore = options?.identityStore || AgentIdentityStore.getInstance();
    this.aiTimeoutMs = options?.aiTimeoutMs ?? 15000;
    this.sheetsTransport = options?.sheetsTransport || null;
  }

  public invalidatePolicyCache(): void {
    this.cachedPolicy = null;
  }

  public setMockOrchestrator(orchestrator: AgentOrchestrator): void {
    this.mockOrchestratorForTesting = orchestrator;
  }

  public getSessionStore(): InMemorySessionStore {
    return this.sessionStore;
  }

  public getLeadStore(): InMemoryLeadStore {
    return this.leadStore;
  }

  public getIdentityStore(): AgentIdentityStore {
    return this.identityStore;
  }

  public async processMessage(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
    const startTime = Date.now();
    const {
      message,
      conversationId: clientConvId,
      clientTenantId,
      clientStoreId,
      clientAgentId,
      clientIp = '127.0.0.1',
      leadConfirmation
    } = payload;

    // 1. Strict Trusted Context Verification & Override Protection
    if (clientTenantId && clientTenantId !== CANONICAL_TENANT_ID) {
      this.logger.warn('Tenant context override attempt rejected', { conversationId: clientConvId, clientTenantId });
      throw new UnauthorizedDataAccessError(`Tenant override attempt strictly rejected: ${clientTenantId}`);
    }

    if (clientStoreId && clientStoreId !== CANONICAL_STORE_ID) {
      this.logger.warn('Store context override attempt rejected', { conversationId: clientConvId, clientStoreId });
      throw new UnauthorizedDataAccessError(`Store override attempt strictly rejected: ${clientStoreId}`);
    }

    const conversationId = clientConvId || `conv-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 2. Validate Message & Apply Rate Limiter
    const rateCheckKey = `${clientIp}_${conversationId}`;
    const rateCheck = this.rateLimiter.validateAndRateLimit(message, rateCheckKey);
    if (!rateCheck.valid) {
      return {
        conversationId,
        message: rateCheck.errorMessage || 'عذراً، تعذر قبول الرسالة.',
        status: 'ACTIVE',
        timestamp: new Date()
      };
    }

    const userText = message.trim();

    // 3. Get or Initialize Session
    const session = this.sessionStore.getOrCreateSession(conversationId, {
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: CANONICAL_AGENT_ID
    });

    this.logger.info('Processing message for conversation', {
      conversationId,
      context: {
        messageId: `msg-in-${Date.now()}`,
        tenantId: CANONICAL_TENANT_ID,
        storeId: CANONICAL_STORE_ID,
        agentId: CANONICAL_AGENT_ID,
        conversationId,
        customerId: 'cst-web-customer',
        channel: 'WEB',
        timestamp: new Date().toISOString()
      }
    });

    // Record incoming user message
    this.sessionStore.addMessage(conversationId, {
      id: `msg-in-${Date.now()}`,
      text: userText,
      sender: 'USER',
      timestamp: new Date()
    });

    // Get current Agent Identity Configuration
    const agentIdentity = this.identityStore.getIdentity();

    // 4. Digital Service Lead Handling
    let leadResponse: { leadId?: string; userConfirmed: boolean; status: 'PENDING' | 'CONFIRMED' } | undefined;
    if (leadConfirmation) {
      if (leadConfirmation.userConfirmed) {
        const recorded = this.leadStore.recordLead({
          conversationId,
          tenantId: CANONICAL_TENANT_ID,
          storeId: CANONICAL_STORE_ID,
          name: leadConfirmation.name,
          phone: leadConfirmation.phone,
          serviceType: leadConfirmation.serviceType,
          email: leadConfirmation.email,
          userConfirmed: true
        });

        session.leadState = {
          name: leadConfirmation.name,
          phone: leadConfirmation.phone,
          serviceType: leadConfirmation.serviceType,
          email: leadConfirmation.email,
          userConfirmed: true,
          status: 'CONFIRMED'
        };
        this.sessionStore.updateSession(session);

        leadResponse = {
          leadId: recorded.id,
          userConfirmed: true,
          status: 'CONFIRMED'
        };

        const confirmMsg = `شاملاً الشكر والتقدير يا ${leadConfirmation.name}! تم تسجيل طلبك بنجاح لخدمة (${leadConfirmation.serviceType}). سيقوم فريق العمل بالتواصل معك قريباً على الرقم (${leadConfirmation.phone}).`;

        this.sessionStore.addMessage(conversationId, {
          id: `msg-out-${Date.now()}`,
          text: confirmMsg,
          sender: 'AGENT',
          timestamp: new Date()
        });

        this.logger.info('Digital service lead confirmed and recorded', {
          conversationId,
          leadId: recorded.id,
          durationMs: Date.now() - startTime
        });

        return {
          conversationId,
          message: confirmMsg,
          status: session.status,
          leadState: leadResponse,
          timestamp: new Date()
        };
      } else {
        leadResponse = {
          userConfirmed: false,
          status: 'PENDING'
        };
      }
    }

    // 5. Human Handoff Check
    const isHumanRequest = (
      userText.includes('موظف بشري') ||
      userText.includes('موظفاً بشرياً') ||
      userText.includes('أريد موظف') ||
      userText.includes('التحدث مع موظف') ||
      userText.includes('كلم موظف') ||
      userText.includes('خدمة العملاء البشرية') ||
      userText.includes('تحويل لموظف')
    );

    if (isHumanRequest) {
      session.status = 'REQUIRES_HUMAN';
      session.handoffState = {
        reason: 'طلب العميل التحدث مع موظف بشري',
        requestedAt: new Date()
      };
      this.sessionStore.updateSession(session);

      const handoffMsg = 'تم تحويل طلبك للخدمة البشرية بنجاح. ستقوم خدمة العملاء بالمتابعة معك في أقرب وقت عبر وسائل التواصل المعتمدة للمتجر (واتساب/هاتف: 777123456).';

      this.sessionStore.addMessage(conversationId, {
        id: `msg-out-${Date.now()}`,
        text: handoffMsg,
        sender: 'AGENT',
        timestamp: new Date()
      });

      this.logger.info('Human handoff requested', { conversationId, durationMs: Date.now() - startTime });

      return {
        conversationId,
        message: handoffMsg,
        status: 'REQUIRES_HUMAN',
        handoffState: session.handoffState,
        timestamp: new Date()
      };
    }

    // 6. Execute Orchestrator with Live Knowledge & Configuration-driven Agent Identity
    try {
      const orchestrator = await this.getOrchestrator();

      const incomingMessage = {
        id: `msg-in-${Date.now()}`,
        text: userText,
        context: {
          messageId: `msg-in-${Date.now()}`,
          tenantId: CANONICAL_TENANT_ID,
          storeId: CANONICAL_STORE_ID,
          agentId: CANONICAL_AGENT_ID,
          conversationId,
          customerId: 'cst-web-customer',
          channel: 'WEB',
          timestamp: new Date()
        }
      };

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI response timed out')), this.aiTimeoutMs)
      );

      const orchestratorPromise = orchestrator.processMessage(incomingMessage);
      const outgoingMessage = await Promise.race([orchestratorPromise, timeoutPromise]);

      const agentText = outgoingMessage.text || `أهلاً بك! أنا ${agentIdentity.displayName} نسعد بخدمتك في متجر الذيباني.`;

      this.sessionStore.addMessage(conversationId, {
        id: outgoingMessage.messageId || `msg-out-${Date.now()}`,
        text: agentText,
        sender: 'AGENT',
        timestamp: new Date()
      });

      this.logger.info('Processed chat message successfully', {
        conversationId,
        status: session.status,
        durationMs: Date.now() - startTime
      });

      return {
        conversationId,
        message: agentText,
        status: session.status,
        handoffState: session.handoffState,
        leadState: leadResponse,
        timestamp: new Date()
      };
    } catch (err: any) {
      this.logger.error('Gemini or Orchestration processing failed', {
        conversationId,
        error: err.message
      });

      const fallbackText = `عذراً، الخدمة مشغولة حالياً. يمكنك إعادة المحاولة بعد لحظات وسنسعد بخدمتك.`;

      this.sessionStore.addMessage(conversationId, {
        id: `msg-out-${Date.now()}`,
        text: fallbackText,
        sender: 'AGENT',
        timestamp: new Date()
      });

      return {
        conversationId,
        message: fallbackText,
        status: session.status,
        timestamp: new Date()
      };
    }
  }

  private async getOrchestrator(): Promise<AgentOrchestrator> {
    if (this.mockOrchestratorForTesting) {
      return this.mockOrchestratorForTesting;
    }

    const policy = await this.getLiveKnowledgePolicy();

    const aiProvider = new GeminiAIProvider({
      apiKey: process.env.GEMINI_API_KEY || 'MOCK_KEY',
      isMockMode: !process.env.GEMINI_API_KEY
    });

    const conversationContext = new InMemoryConversationContext();
    const toolRegistry = new SimpleToolRegistry();

    return new AgentOrchestrator(
      this.logger,
      aiProvider,
      conversationContext,
      toolRegistry,
      policy
    );
  }

  private async getLiveKnowledgePolicy(): Promise<AgentPolicy> {
    const now = Date.now();
    if (this.cachedPolicy && (now - this.cachedPolicy.loadedAt) < 300000) {
      return this.cachedPolicy.policy;
    }

    const identity = this.identityStore.getIdentity();

    let catalogSummary = '- سكر السعيد ابو كيلو: 500 YER (متوفر)\n- بسكوت بسكريم كبير: 200 YER (متوفر)\n- سماعات الوحش: 15000 YER (متوفر)';
    let categoriesSummary = '- تموين: مواد غذائية أساسية\n- حلويات وبسكويت: بسكويت ومكسرات\n- إلكترونيات: أجهزة وسماعات';
    let paymentsSummary = 'بنك الكريمي، النجم، نقداً عند الاستلام، محفظة جيب';
    let contactsSummary = 'واتساب/هاتف: 777123456';
    let hoursSummary = 'الأحد - الخميس: 08:00 - 22:00 | الجمعة - السبت: 14:00 - 23:00';
    let deliveryInfo = 'رسوم التوصيل: 1000 YER لجميع المناطق المعتمدة في صنعاء';
    let storeLocation = 'صنعاء - شارع الثلاثين - متجر الذيباني';
    let policiesSummary = 'سياسة الاسترجاع: يمكن استبدال أو استرجاع البضائع خلال 3 أيام بشرط حالتها الأصلية';

    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;

    let transportToUse = this.sheetsTransport;
    if (!transportToUse && clientEmail && privateKey && spreadsheetId === CANONICAL_SPREADSHEET_ID) {
      const auth = new GoogleServiceAccountAuth({ clientEmail, privateKey, spreadsheetId });
      transportToUse = new SecureGoogleSheetsTransport(auth, { spreadsheetId });
    }

    if (transportToUse) {
      try {
        const [catData, prodData, payData, contactData, hoursData, delivData, locData, polData] = await Promise.all([
          transportToUse.getRows('categories').catch(() => null),
          transportToUse.getRows('products').catch(() => null),
          transportToUse.getRows('payment_methods').catch(() => null),
          transportToUse.getRows('store_contacts').catch(() => null),
          transportToUse.getRows('business_hours').catch(() => null),
          transportToUse.getRows('delivery_configuration').catch(() => null),
          transportToUse.getRows('store_locations').catch(() => null),
          transportToUse.getRows('store_policies').catch(() => null)
        ]);

        if (catData && catData.length > 1) {
          const h = new HeaderMap(catData[0].values, catData[0].values);
          const cats: string[] = [];
          for (let i = 1; i < catData.length; i++) {
            const row = catData[i].values;
            if (h.getValue(row, 'tenantId') === CANONICAL_TENANT_ID && h.getValue(row, 'storeId') === CANONICAL_STORE_ID) {
              const name = h.getValue(row, 'name');
              const desc = h.getValue(row, 'description');
              if (name) cats.push(`- ${name}${desc ? `: ${desc}` : ''}`);
            }
          }
          if (cats.length > 0) categoriesSummary = cats.join('\n');
        }

        if (prodData && prodData.length > 1) {
          const h = new HeaderMap(prodData[0].values, prodData[0].values);
          const prods: string[] = [];
          for (let i = 1; i < prodData.length; i++) {
            const row = prodData[i].values;
            if (h.getValue(row, 'tenantId') === CANONICAL_TENANT_ID && h.getValue(row, 'storeId') === CANONICAL_STORE_ID) {
              const name = h.getValue(row, 'name');
              const price = h.getValue(row, 'price');
              const stockVal = h.getValue(row, 'inStock')?.toUpperCase();
              const stock = (stockVal === 'TRUE' || stockVal === '1' || stockVal === 'YES' || h.getValue(row, 'inStock') === 'نعم') ? 'متوفر' : 'غير متوفر';
              if (name && price) prods.push(`- ${name}: ${price} YER (${stock})`);
            }
          }
          if (prods.length > 0) catalogSummary = prods.join('\n');
        }

        if (payData && payData.length > 1) {
          const h = new HeaderMap(payData[0].values, payData[0].values);
          const pays: string[] = [];
          for (let i = 1; i < payData.length; i++) {
            const row = payData[i].values;
            if (h.getValue(row, 'tenantId') === CANONICAL_TENANT_ID && h.getValue(row, 'storeId') === CANONICAL_STORE_ID) {
              const activeVal = h.getValue(row, 'isActive')?.toUpperCase();
              if (activeVal === 'TRUE' || activeVal === '1' || activeVal === 'YES') {
                const name = h.getValue(row, 'displayName');
                const details = h.getValue(row, 'accountDetails');
                if (name) pays.push(`${name}${details ? ` (${details})` : ''}`);
              }
            }
          }
          if (pays.length > 0) paymentsSummary = pays.join('، ');
        }

        if (contactData && contactData.length > 1) {
          const h = new HeaderMap(contactData[0].values, contactData[0].values);
          const cnts: string[] = [];
          for (let i = 1; i < contactData.length; i++) {
            const row = contactData[i].values;
            if (h.getValue(row, 'tenantId') === CANONICAL_TENANT_ID && h.getValue(row, 'storeId') === CANONICAL_STORE_ID) {
              const activeVal = h.getValue(row, 'isActive')?.toUpperCase();
              if (activeVal === 'TRUE' || activeVal === '1' || activeVal === 'YES') {
                const channel = h.getValue(row, 'channelType');
                const val = h.getValue(row, 'contactValue');
                if (val) cnts.push(`${channel}: ${val}`);
              }
            }
          }
          if (cnts.length > 0) contactsSummary = cnts.join('، ');
        }

        if (hoursData && hoursData.length > 1) {
          const h = new HeaderMap(hoursData[0].values, hoursData[0].values);
          const hrs: string[] = [];
          for (let i = 1; i < hoursData.length; i++) {
            const row = hoursData[i].values;
            if (h.getValue(row, 'tenantId') === CANONICAL_TENANT_ID && h.getValue(row, 'storeId') === CANONICAL_STORE_ID) {
              const day = h.getValue(row, 'dayOfWeek');
              const isClosed = h.getValue(row, 'isClosed')?.toUpperCase() === 'TRUE';
              const is24 = h.getValue(row, 'is24Hours')?.toUpperCase() === 'TRUE';
              const open = h.getValue(row, 'openingTime');
              const close = h.getValue(row, 'closingTime');
              if (isClosed) {
                hrs.push(`${day}: مغلق`);
              } else if (is24) {
                hrs.push(`${day}: مفتوح 24 ساعة`);
              } else if (open && close) {
                hrs.push(`${day}: ${open} - ${close}`);
              }
            }
          }
          if (hrs.length > 0) hoursSummary = hrs.join(' | ');
        }

        if (delivData && delivData.length > 1) {
          const h = new HeaderMap(delivData[0].values, delivData[0].values);
          const delivs: string[] = [];
          for (let i = 1; i < delivData.length; i++) {
            const row = delivData[i].values;
            if (h.getValue(row, 'tenantId') === CANONICAL_TENANT_ID && h.getValue(row, 'storeId') === CANONICAL_STORE_ID) {
              const isEnabled = h.getValue(row, 'isEnabled')?.toUpperCase() === 'TRUE';
              const fee = h.getValue(row, 'deliveryFee') || '1000';
              const areas = h.getValue(row, 'deliveryAreas') || 'جميع مناطق صنعاء';
              if (isEnabled) {
                delivs.push(`التوصيل متاح. رسوم التوصيل: ${fee} YER. المناطق: ${areas}`);
              } else {
                delivs.push('التوصيل غير متاح حالياً.');
              }
            }
          }
          if (delivs.length > 0) deliveryInfo = delivs.join('. ');
        }

        if (locData && locData.length > 1) {
          const h = new HeaderMap(locData[0].values, locData[0].values);
          const locs: string[] = [];
          for (let i = 1; i < locData.length; i++) {
            const row = locData[i].values;
            if (h.getValue(row, 'tenantId') === CANONICAL_TENANT_ID && h.getValue(row, 'storeId') === CANONICAL_STORE_ID) {
              const activeVal = h.getValue(row, 'isActive')?.toUpperCase();
              if (activeVal === 'TRUE' || activeVal === '1' || activeVal === 'YES') {
                const addr = h.getValue(row, 'address');
                const name = h.getValue(row, 'name');
                if (addr) locs.push(`${name ? `${name}: ` : ''}${addr}`);
              }
            }
          }
          if (locs.length > 0) storeLocation = locs.join('؛ ');
        }

        if (polData && polData.length > 1) {
          const h = new HeaderMap(polData[0].values, polData[0].values);
          const pols: string[] = [];
          for (let i = 1; i < polData.length; i++) {
            const row = polData[i].values;
            if (h.getValue(row, 'tenantId') === CANONICAL_TENANT_ID && h.getValue(row, 'storeId') === CANONICAL_STORE_ID) {
              const activeVal = h.getValue(row, 'isActive')?.toUpperCase();
              if (activeVal === 'TRUE' || activeVal === '1' || activeVal === 'YES') {
                const title = h.getValue(row, 'title');
                const content = h.getValue(row, 'content');
                if (title && content) pols.push(`${title}: ${content}`);
              }
            }
          }
          if (pols.length > 0) policiesSummary = pols.join(' | ');
        }
      } catch (err: any) {
        this.logger.warn('Failed to load live Google Sheets data, using default Provider data', { error: err.message });
      }
    }

    const policy: AgentPolicy = {
      persona: `أنت ${identity.displayName}، ${identity.role} في "متجر الذيباني" - "بقالة الذيباني".
البيانات الموثوقة التشغيلية الحقيقية للمتجر (المصدر المعتمد للبيانات):
- العملة الأساسية: الريال اليمني (YER).
- المنتجات والأسعار المتاحة:
${catalogSummary}
- التصنيفات والأقسام:
${categoriesSummary}
- طرق الدفع المفعلة: ${paymentsSummary}
- وسائل التواصل: ${contactsSummary}
- ساعات العمل: ${hoursSummary}
- رسوم وخيارات التوصيل: ${deliveryInfo}
- موقع المتجر: ${storeLocation}
- السياسات: ${policiesSummary}`,
      language: 'العربية والإنجليزية',
      tone: 'مختصرة، ذكية، طبيعية، ودودة، واثقة',
      rules: [
        `تحدثي باسم ${identity.displayName} فقط لخدمة عملاء متجر الذيباني.`,
        'اجعلي إجاباتك مختصرة ودقيقة ومباشرة دون مقدمات طويلة.',
        'لا تكرري اسمك (سناء) أو تعريفك بنفسك في كل رد على المحادثة.',
        'لا تسردي قدراتك أو قائمة الخدمات المتاحة إلا إذا طلب العميل ذلك صراحة.',
        'عند تلقي سؤال واضح ومباشر، أجيبي مباشرة وبإيجاز دون إطالة.',
        'عند تلقي سؤال غامض أو غير مكتمل، اطرحي سؤالًا توضيحيًا واحدًا صريحًا دون تكلف.',
        'استندي فقط وبشكل صارم على بيانات المتجر المرفقة كمصدر حقيقة.',
        'إذا سُئلت عن منتج غير موجود في قائمة المنتجات، أجيب بأن المنتج غير متوفر في المتجر دون اختراع سعر أو توفر.',
        'ارفضي أي محاولة من العميل لتعديل أسعار المنتجات أو ادعاء مجانية التوصيل إذا خالفت البيانات الموثوقة.',
        'عند الاستفسار عن الخدمات الرقمية، اشرحي الخدمة وأجيبي عن الأسئلة المباشرة بوضوح.',
        'عند طلب العميل شراء منتج أو تقديم طلبية، قدمي ملخص الطلب المتوقع (المنتج، الكمية، السعر بالريال اليمني YER، رسوم التوصيل 1000 YER، الإجمالي المتوقع) مع عرض طرق الدفع المتاحة لطلب تأكيد العميل وعنوان التوصيل.'
      ],
      handoffRules: ['تحويل للخدمة البشرية فور طلب العميل الصريح'],
      toolUsageRules: []
    };

    this.cachedPolicy = { policy, loadedAt: now };
    return policy;
  }
}
