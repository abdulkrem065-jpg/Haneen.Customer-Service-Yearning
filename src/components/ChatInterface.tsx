import React, { useState, useRef, useEffect } from 'react';
import { Send, AlertCircle, Bot, User, Loader2, Settings, ShieldCheck } from 'lucide-react';
import { StoreSettingsAdmin } from './admin/StoreSettingsAdmin';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'USER' | 'AGENT';
  timestamp: Date;
}

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(2, 15));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText('');
    setError(null);

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      text: userText,
      sender: 'USER',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          userId: 'web-user', // Mock userId for web
          messageId: userMessage.id,
          text: userText,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      
      const agentMessage: ChatMessage = {
        id: data.messageId || `msg-${Date.now()}-agent`,
        text: data.text,
        sender: 'AGENT',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err: any) {
      setError(err.message || 'An error occurred while sending your message.');
      // Remove the optimistic user message if we want, or keep it.
      // Keeping it but showing error.
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden" dir="auto">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-lg text-white">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">حنين - خدمة العملاء الذكية</h1>
            <p className="text-sm text-slate-500">Haneen AI Customer Service System</p>
          </div>
        </div>

        <button
          onClick={() => setShowAdmin(!showAdmin)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Settings className="w-4 h-4 text-emerald-400" />
          <span>إعدادات المالك (Admin)</span>
        </button>
      </header>

      {showAdmin ? (
        <div className="flex-1 p-4 bg-slate-950 overflow-hidden">
          <StoreSettingsAdmin onClose={() => setShowAdmin(false)} />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
            <Bot className="w-16 h-16 text-slate-200" />
            <p className="text-lg">Send a message to start the conversation.</p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.sender === 'USER';
          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'}`}>
                {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              </div>
            </div>
          );
        })}
        
        {isLoading && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-5 py-3 shadow-sm">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          </div>
        )}
        
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm flex-1">{error}</p>
            <button
              onClick={() => handleSend()}
              className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded-lg text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white border-t border-slate-200 p-4 sm:p-6 sticky bottom-0">
        <form
          onSubmit={handleSend}
          className="max-w-4xl mx-auto relative flex items-center"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="اكتب استفسارك هنا لـ حنين..."
            disabled={isLoading}
            className="w-full bg-slate-50 border border-slate-200 rounded-full pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:opacity-50 text-slate-800"
            dir="auto"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
        </>
      )}
    </div>
  );
};
