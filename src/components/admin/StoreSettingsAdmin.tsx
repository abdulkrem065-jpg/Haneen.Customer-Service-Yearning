import React, { useState } from 'react';
import {
  Store,
  Clock,
  Truck,
  MapPin,
  CreditCard,
  PhoneCall,
  FileText,
  Sparkles,
  Bell,
  Bot,
  ToggleLeft,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Save,
  Globe,
  ShieldCheck,
  Building2,
  Lock
} from 'lucide-react';

interface SettingCategory {
  id: string;
  nameAr: string;
  icon: React.ElementType;
  descriptionAr: string;
}

const CATEGORIES: SettingCategory[] = [
  { id: 'identity', nameAr: 'هوية المتجر', icon: Store, descriptionAr: 'اسم المتجر، العملة، الشعار والمستندات' },
  { id: 'hours', nameAr: 'ساعات العمل', icon: Clock, descriptionAr: '24/7، الأيام، فترات العمل والتوقيت' },
  { id: 'delivery', nameAr: 'التوصيل والربط', icon: Truck, descriptionAr: 'تفعيل التوصيل، المناطق والرسوم' },
  { id: 'location', nameAr: 'الموقع والفروع', icon: MapPin, descriptionAr: 'العناوين، روابط الخرائط والإحداثيات' },
  { id: 'payment', nameAr: 'طرق الدفع', icon: CreditCard, descriptionAr: 'الحسابات البنكية، الكاش وتفعيل الوسائل' },
  { id: 'contact', nameAr: 'وسائل الاتصال', icon: PhoneCall, descriptionAr: 'الواتساب، الهاتف، الإيميل والقنوات' },
  { id: 'policies', nameAr: 'السياسات والشروط', icon: FileText, descriptionAr: 'الإرجاع، التوصيل، الخصوصية والأحكام' },
  { id: 'digital', nameAr: 'الخدمات الرقمية', icon: Sparkles, descriptionAr: 'الخدمات التجارية للعملاء وبناء المتاجر' },
  { id: 'notices', nameAr: 'التنبيهات والإعلانات', icon: Bell, descriptionAr: 'التنبيهات المباشرة وصلاحية الظهور' },
  { id: 'haneen', nameAr: 'إعدادات Haneen', icon: Bot, descriptionAr: 'الشخصية، النبرة وقواعد عدم الهلوسة' },
  { id: 'toggles', nameAr: 'مفاتيح الميزات', icon: ToggleLeft, descriptionAr: 'تفعيل وتطويق الخدمات التشغيلية' },
];

export const StoreSettingsAdmin: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [activeCategory, setActiveCategory] = useState<string>('identity');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Simulated local state for code-only preview mode (Zero Live Sheet Writes)
  const [storeIdentity, setStoreIdentity] = useState({
    name: 'متجر الذيباني الذكي',
    baseCurrency: 'YER',
    language: 'ar',
    tagline: 'خدمة عملاء ذكية متكاملة 24/7'
  });

  const [deliverySettings, setDeliverySettings] = useState({
    isEnabled: true,
    minOrderAmount: 2000,
    estimatedETA: '30 - 60 دقيقة',
    cashOnDelivery: true
  });

  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({
    AI_AGENT: true,
    DELIVERY: true,
    DIGITAL_SERVICES: true,
    WHATSAPP: true,
    PHONE: true,
    LOCATION: true,
    PAYMENTS: true,
    SMART_NOTICES: true
  });

  const handleSimulatedSave = () => {
    setSaveStatus('تم حفظ التعديلات محلياً بنجاح (وضع المعاينة - CODE ONLY)!');
    setTimeout(() => setSaveStatus(null), 4000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 rounded-xl overflow-hidden shadow-2xl border border-slate-800" dir="rtl">
      {/* Header Bar */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600/20 p-2 rounded-lg border border-emerald-500/30 text-emerald-400">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              مركز الإعدادات التشغيلية والتحكم للمالك
              <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                CMD-034 CODE-ONLY
              </span>
            </h2>
            <p className="text-xs text-slate-400">إدارة البيانات التشغيلية لـ Haneen Customer Service دون تغيير الكود</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-xs">
            <Lock className="w-3.5 h-3.5" />
            <span>حماية البيانات: ZERO LIVE SHEET WRITES</span>
          </div>

          <button
            onClick={handleSimulatedSave}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20"
          >
            <Save className="w-4 h-4" />
            <span>حفظ الإعدادات</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {saveStatus && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/30 px-6 py-2.5 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveStatus}</span>
          </div>
          <span className="text-xs font-mono text-emerald-400/80">IStoreDataFacade Layer</span>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Categories */}
        <aside className="w-64 bg-slate-950/60 border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-400 px-3 py-2 uppercase tracking-wider">اقسام الإعدادات</p>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-right text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-medium'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <div className="truncate">
                  <div className="truncate">{cat.nameAr}</div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* View Details Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-900 space-y-6">
          {/* 1. Identity */}
          {activeCategory === 'identity' && (
            <section className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-emerald-400" />
                  هوية المتجر والإعدادات الأساسية
                </h3>
                <p className="text-sm text-slate-400">إدارة معلومات المتجر الرسمية والعملة لـ Haneen Customer Service</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">اسم المتجر الرسمي</label>
                  <input
                    type="text"
                    value={storeIdentity.name}
                    onChange={(e) => setStoreIdentity({ ...storeIdentity, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">العملة الأساسية (Base Currency)</label>
                  <select
                    value={storeIdentity.baseCurrency}
                    onChange={(e) => setStoreIdentity({ ...storeIdentity, baseCurrency: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="YER">ريال يمني (YER)</option>
                    <option value="SAR">ريال سعودي (SAR)</option>
                    <option value="USD">دولار أمريكي (USD)</option>
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-medium text-slate-300">الشعار الوصفي (Tagline / Description)</label>
                  <input
                    type="text"
                    value={storeIdentity.tagline}
                    onChange={(e) => setStoreIdentity({ ...storeIdentity, tagline: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </section>
          )}

          {/* 2. Working Hours */}
          {activeCategory === 'hours' && (
            <section className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-400" />
                  ساعات وأيام العمل (Business Hours Schedule)
                </h3>
                <p className="text-sm text-slate-400">تعتمد Haneen على هذه البيانات للإجابة بدقة دون تخمين أو اعتماد توقيت جهاز العميل</p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-sm font-medium text-white">المنطقة الزمنية المعتمدة للمتجر</span>
                  <span className="text-xs font-mono bg-slate-800 px-3 py-1 rounded-md text-emerald-400">Asia/Aden (UTC+3)</span>
                </div>

                <div className="space-y-3">
                  {[
                    { day: 'السبت - الأربعاء', status: 'مفتوح (08:00 - 13:00 / 16:00 - 23:00)', isSplit: true },
                    { day: 'الخميس', status: 'مفتوح (08:00 - 22:00)', isSplit: false },
                    { day: 'الجمعة', status: 'مغلق (يوم عطلة رسمية)', isClosed: true }
                  ].map((schedule, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-800 text-sm">
                      <span className="font-medium text-slate-200">{schedule.day}</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full ${schedule.isClosed ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                        {schedule.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 3. Delivery */}
          {activeCategory === 'delivery' && (
            <section className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-400" />
                  خدمة التوصيل والمناطق (Delivery Configuration)
                </h3>
                <p className="text-sm text-slate-400">عند تعطيل خدمة التوصيل، تلتزم Haneen بعدم عرض التوصيل للعملاء</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-white">حالة خدمة التوصيل</h4>
                    <p className="text-xs text-slate-400">تفعيل أو إيقاف استقبال طلبات التوصيل</p>
                  </div>
                  <button
                    onClick={() => setDeliverySettings({ ...deliverySettings, isEnabled: !deliverySettings.isEnabled })}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                      deliverySettings.isEnabled
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {deliverySettings.isEnabled ? 'مُفعّلة' : 'معطّلة'}
                  </button>
                </div>

                {deliverySettings.isEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-300">الحد الأدنى للطلب (YER)</label>
                      <input
                        type="number"
                        value={deliverySettings.minOrderAmount}
                        onChange={(e) => setDeliverySettings({ ...deliverySettings, minOrderAmount: Number(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-300">الزمن المتوقع للتوصيل (ETA)</label>
                      <input
                        type="text"
                        value={deliverySettings.estimatedETA}
                        onChange={(e) => setDeliverySettings({ ...deliverySettings, estimatedETA: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 4. Feature Toggles */}
          {activeCategory === 'toggles' && (
            <section className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ToggleLeft className="w-5 h-5 text-emerald-400" />
                  مفاتيح الميزات التشغيلية (Feature Toggles)
                </h3>
                <p className="text-sm text-slate-400">التحكم الديناميكي بميزات النظام والمساعد دون إعادة نشر الكود</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(featureToggles).map(([key, isEnabled]) => (
                  <div key={key} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm text-white font-semibold">{key}</span>
                      <p className="text-xs text-slate-400 mt-0.5">تطويق خدمة {key} في المساعد</p>
                    </div>

                    <button
                      onClick={() => setFeatureToggles({ ...featureToggles, [key]: !isEnabled })}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        isEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isEnabled ? 'نشط' : 'مغلق'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Generic view for remaining categories */}
          {!['identity', 'hours', 'delivery', 'toggles'].includes(activeCategory) && (
            <section className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-emerald-400" />
                  {CATEGORIES.find((c) => c.id === activeCategory)?.nameAr}
                </h3>
                <p className="text-sm text-slate-400">{CATEGORIES.find((c) => c.id === activeCategory)?.descriptionAr}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center space-y-3">
                <ShieldCheck className="w-12 h-12 text-emerald-400/80 mx-auto" />
                <h4 className="text-base font-semibold text-white">الطبقة جاهزة للإدارة البرمجية المباشرة عبر IStoreDataFacade</h4>
                <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                  هذا القسم منظم برمجياً بالكامل في الطبقة التشغيلية. التزاماً بـ CMD-034، لا توجد أي كتابات حية على Google Sheets، والبيانات مستقرة وجاهزة للإدارة من قبل المالك.
                </p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
