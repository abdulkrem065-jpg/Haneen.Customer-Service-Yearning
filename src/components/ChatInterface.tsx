import React, { useState, useRef, useEffect } from 'react';
import { Send, AlertCircle, Bot, User, Loader2, RotateCcw, Headphones, Sparkles, CheckCircle2, ShieldCheck, Settings } from 'lucide-react';
import { StoreSettingsAdmin } from './admin/StoreSettingsAdmin';
import { AgentIdentityStore, AgentIdentityConfig, DEFAULT_AGENT_IDENTITY } from '../core/productization/agent-identity';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'USER' | 'AGENT';
  timestamp: Date;
}

export const ChatInterface: React.FC = () => {
  const [agentIdentity, setAgentIdentity] = useState<AgentIdentityConfig>(() =>
    AgentIdentityStore.getInstance().getIdentity()
  );
  const [conversationId, setConversationId] = useState<string>(
    () => `conv-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'ACTIVE' | 'REQUIRES_HUMAN' | 'CLOSED'>('ACTIVE');
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadFormData, setLeadFormData] = useState({ name: '', phone: '', serviceType: 'استشارة رقمية', email: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchIdentity = async () => {
    try {
      const res = await fetch('/api/agent-identity');
      if (res.ok) {
        const data = await res.json();
        if (data && data.displayName) {
          setAgentIdentity(data);
          AgentIdentityStore.getInstance().updateIdentity(data);
        }
      }
    } catch {
      // Fallback to local default identity
    }
  };

  useEffect(() => {
    fetchIdentity();
  }, [showAdmin]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Initial welcome message from Agent Identity
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'msg-welcome',
          text: agentIdentity.greeting || `أهلاً بك! أنا ${agentIdentity.displayName}، مساعدتك الذكية لخدمة العملاء في متجر الذيباني. يسعدني إجابة جميع استفساراتك حول المنتجات والأسعار وطرق الدفع وساعات العمل والتوصيل والخدمات الرقمية. كيف يمكنني مساعدتك اليوم؟`,
          sender: 'AGENT',
          timestamp: new Date()
        }
      ]);
    }
  }, [agentIdentity]);

  const handleStartNewConversation = () => {
    const newId = `conv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setConversationId(newId);
    setStatus('ACTIVE');
    setError(null);
    setMessages([
      {
        id: `msg-welcome-${Date.now()}`,
        text: `أهلاً بك في محادثة جديدة! أنا ${agentIdentity.displayName} جاهزة لمساعدتك في متجر الذيباني. تفضل بطرح استفسارك.`,
        sender: 'AGENT',
        timestamp: new Date()
      }
    ]);
  };

  const handleSend = async (customText?: string) => {
    const userText = (customText || inputText).trim();
    if (!userText || isLoading) return;

    if (!customText) {
      setInputText('');
    }
    setError(null);

    const userMessage: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      text: userText,
      sender: 'USER',
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId,
          message: userText
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'فشل إرسال الرسالة إلى الخدمة.');
      }

      const data = await response.json();

      if (data.status) {
        setStatus(data.status);
      }

      const agentMessage: ChatMessage = {
        id: data.messageId || `msg-agent-${Date.now()}`,
        text: data.message || data.text || 'شغال، تم استلام استفسارك.',
        sender: 'AGENT',
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ في الاتصال بالخدمة. يرجى إعادة المحاولة.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadFormData.name || !leadFormData.phone) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: `طلب تسجيل الخدمة الرقمية (${leadFormData.serviceType}) باسم ${leadFormData.name}`,
          leadConfirmation: {
            userConfirmed: true,
            name: leadFormData.name,
            phone: leadFormData.phone,
            serviceType: leadFormData.serviceType,
            email: leadFormData.email
          }
        })
      });

      const data = await response.json();
      setShowLeadModal(false);

      const agentMsg: ChatMessage = {
        id: `msg-lead-conf-${Date.now()}`,
        text: data.message || `تم تأكيد تسجيل طلبك للخدمة الرقمية (${leadFormData.serviceType}) بنجاح!`,
        sender: 'AGENT',
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch {
      setError('فشل تأكيد التسجيل، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    'كم سعر سكر السعيد ابو كيلو؟',
    'ما هي طرق الدفع المتاحة؟',
    'ما تفاصيل ورسوم التوصيل؟',
    'هل المحل مفتوح الآن؟',
    'ما هي الخدمات الرقمية المتاحة؟',
    'أريد التحدث مع موظف بشري'
  ];

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden font-sans" dir="rtl">
      {/* Header Bar */}
      <header className="bg-slate-950 border-b border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 leading-none">
                {agentIdentity.displayName} — خدمة العملاء الذكية
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                مباشر
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">متجر الذيباني (بقالة الذيباني) — الريال اليمني (YER)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleStartNewConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700"
            title="بدء محادثة جديدة"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">محادثة جديدة</span>
          </button>

          <button
            onClick={() => setShowAdmin(!showAdmin)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg text-xs font-medium transition-colors border border-emerald-500/30"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">إعدادات المالك</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      {showAdmin ? (
        <div className="flex-1 p-4 bg-slate-950 overflow-hidden">
          <StoreSettingsAdmin onClose={() => setShowAdmin(false)} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
          {/* Human Handoff Banner */}
          {status === 'REQUIRES_HUMAN' && (
            <div className="bg-amber-950/80 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between text-amber-200 text-xs sm:text-sm shrink-0">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-amber-400 shrink-0" />
                <span>تم تحويل الطلب للخدمة البشرية. سيقوم فريق خدمة العملاء بالتواصل معك قريباً.</span>
              </div>
              <button
                onClick={handleStartNewConversation}
                className="underline hover:text-white text-xs whitespace-nowrap"
              >
                بدء محادثة جديدة
              </button>
            </div>
          )}

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {messages.map((msg) => {
              const isUser = msg.sender === 'USER';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-medium ${
                      isUser
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 border border-slate-700 text-emerald-400'
                    }`}
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-emerald-600 text-white rounded-tr-none shadow-md'
                      : 'bg-slate-850 border border-slate-800 text-slate-200 rounded-tl-none shadow-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <span className={`block text-[10px] mt-1.5 ${isUser ? 'text-emerald-200 text-left' : 'text-slate-500 text-right'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-emerald-400 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-slate-850 border border-slate-800 rounded-2xl rounded-tl-none px-4 py-3 text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span className="text-xs">{agentIdentity.displayName} تكتب الرد الآن...</span>
                </div>
              </div>
            )}

            {/* Error Message Banner */}
            {error && (
              <div className="bg-rose-950/50 border border-rose-500/30 text-rose-200 p-3.5 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  onClick={() => handleSend()}
                  className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800 rounded-lg text-xs font-medium text-rose-100 transition-colors"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Suggestion Chips */}
          <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/60 overflow-x-auto flex gap-2 no-scrollbar shrink-0">
            <span className="text-[11px] text-slate-400 py-1 font-medium whitespace-nowrap shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" /> اقتراحات:
            </span>
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                disabled={isLoading}
                className="px-3 py-1 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-full text-xs whitespace-nowrap border border-slate-700/60 transition-colors shrink-0 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Digital Service Lead Modal */}
          {showLeadModal && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    تسجيل الطلب للخدمة الرقمية
                  </h3>
                  <button
                    onClick={() => setShowLeadModal(false)}
                    className="text-slate-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleConfirmLeadSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">الاسم الكامل *</label>
                    <input
                      type="text"
                      required
                      value={leadFormData.name}
                      onChange={(e) => setLeadFormData({ ...leadFormData, name: e.target.value })}
                      placeholder="أدخل اسمك"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">رقم الهاتف / الواتساب *</label>
                    <input
                      type="tel"
                      required
                      value={leadFormData.phone}
                      onChange={(e) => setLeadFormData({ ...leadFormData, phone: e.target.value })}
                      placeholder="770000000"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">نوع الخدمة الرقمية</label>
                    <input
                      type="text"
                      value={leadFormData.serviceType}
                      onChange={(e) => setLeadFormData({ ...leadFormData, serviceType: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">البريد الإلكتروني (اختياري)</label>
                    <input
                      type="email"
                      value={leadFormData.email}
                      onChange={(e) => setLeadFormData({ ...leadFormData, email: e.target.value })}
                      placeholder="example@domain.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLeadModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      تأكيد وتسجيل الطلب
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Bottom Message Input Bar */}
          <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 sticky bottom-0 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="max-w-4xl mx-auto flex items-center gap-2 relative"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`اكتب استفسارك هنا لـ ${agentIdentity.displayName}...`}
                disabled={isLoading}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-sm text-slate-100 placeholder-slate-500 disabled:opacity-50"
                dir="auto"
              />

              <button
                type="button"
                onClick={() => setShowLeadModal(true)}
                className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors shrink-0 text-xs font-medium hidden sm:flex items-center gap-1 border border-slate-700"
                title="تسجيل طلب خدمة رقمية"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>خدمة رقمية</span>
              </button>

              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 transition-colors shrink-0 flex items-center justify-center"
              >
                <Send className="w-5 h-5 rotate-180" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
