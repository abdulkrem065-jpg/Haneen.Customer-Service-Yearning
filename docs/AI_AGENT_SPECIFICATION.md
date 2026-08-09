# AI Agent Specification

المواصفات الأولية للوكيل الذكي:

## القدرات المستقبلية
- فهم رسائل العملاء.
- الإجابة عن أسئلة المنتجات.
- قراءة الأسعار.
- التعامل مع المخزون وفق البيانات المتاحة.
- مساعدة العميل في اختيار المنتجات.
- جمع بيانات الطلب.
- تسجيل الطلب.
- متابعة حالة الطلب.
- التعامل مع الأسئلة المتكررة.
- معرفة متى يحتاج إلى موظف بشري.
- تحويل المحادثة إلى موظف بشري عند الحاجة.

## حالة التنفيذ الحالية (CMD-003)
تم بناء النواة البرمجية الأساسية (AI Agent Core) بناءً على المفاهيم التالية:
- **Agent Orchestrator:** المنسق المركزي لتدفق المحادثات وإدارتها.
- **Message & Response Contracts:** نماذج موحدة للرسائل تدعم تعدد القنوات (Web, WhatsApp وغيرها).
- **Tenant Context:** دعم Multi-Tenant منذ البداية (tenantId, storeId, agentId).
- **Tool System Abstraction:** نظام أدوات يدعم استدعاء مزودات خارجية مستقبلاً، مع الفصل التام بين المدخلات المولدة من الذكاء الاصطناعي والسياق الموثوق به أمنياً (ToolExecutionContext).
- **Trusted Data First Policy:** عدم اختراع بيانات (Data Unavailable Error) إذا فشلت الأدوات في إحضارها.
- **AI Provider Abstraction:** طبقة تجريد للمزود (مثل Gemini) لعدم الارتباط بمزود محدد.
- **Human Handoff:** دعم حالات المحادثة مثل تحويل المحادثة إلى موظف بشري (WAITING_FOR_HUMAN).


## End-to-End Orchestrator (CMD-014)
The `AgentOrchestrator` implements an iterative tool-execution loop (up to a configured maximum depth) ensuring the AI provider can consume tool results and formulate data-driven answers. 
- **Tool Result Iteration**: Tool outputs are passed back to the AI.
- **Data First**: The Orchestrator safely intercepts `DataUnavailableError` out-of-band and overrides the AI with a safe customer-facing response without breaking the AI context loop.
- **Human Handoff Interception**: If the state changes to `WAITING_FOR_HUMAN`, the orchestrator natively short-circuits the AI provider for future messages.

## Gemini AI Provider Integration (CMD-015)
- `GeminiAIProvider` implemented in `src/infrastructure/ai/gemini/`, fully decoupling `src/core/` from Gemini SDK imports.
- Supports tool function declarations, tool execution result loops, configurable model parameters, and safe error translation.

## Channel Architecture & Unified Message Gateway (CMD-016)
- Unified Gateway architecture intercepts external channel inputs and translates them into `IncomingMessage`.
- `ChannelGateway` handles dynamic instantiation of `IChannelAdapter`s (e.g., `WebAdapter`, `WhatsAppAdapter`).
- `ContextResolutionService` ensures that `tenantId` and `storeId` are resolved strictly by backend authority and never supplied directly from external client payloads, protecting multi-tenant isolation.
