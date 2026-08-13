import React, { useState, useEffect } from 'react';
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
  Building2,
  RefreshCw,
  AlertTriangle,
  Coins,
  Map,
  ShieldCheck,
  Edit2,
  Check
} from 'lucide-react';

interface SettingCategory {
  id: string;
  nameAr: string;
  icon: React.ElementType;
  descriptionAr: string;
}

const CATEGORIES: SettingCategory[] = [
  { id: 'identity', nameAr: 'هوية المتجر', icon: Store, descriptionAr: 'اسم المتجر، الشعار والمستندات' },
  { id: 'haneen', nameAr: 'إعدادات Haneen', icon: Bot, descriptionAr: 'الشخصية، النبرة وقواعد عدم الهلوسة' },
  { id: 'currency', nameAr: 'العملة (YER)', icon: Coins, descriptionAr: 'العملة الأساسية (الريال اليمني - YER)' },
  { id: 'hours', nameAr: 'ساعات العمل', icon: Clock, descriptionAr: '24/7، الأيام، فترات العمل والتوقيت' },
  { id: 'delivery', nameAr: 'إعدادات التوصيل', icon: Truck, descriptionAr: 'تفعيل التوصيل، الحد الأدنى والرسوم' },
  { id: 'zones', nameAr: 'مناطق التوصيل', icon: Map, descriptionAr: 'مناطق التوصيل المستقلة والرسوم' },
  { id: 'payment', nameAr: 'طرق الدفع', icon: CreditCard, descriptionAr: 'الحسابات البنكية، الكاش وتفعيل الوسائل' },
  { id: 'contact', nameAr: 'وسائل الاتصال', icon: PhoneCall, descriptionAr: 'الواتساب، الهاتف والقنوات الرسمية' },
  { id: 'location', nameAr: 'الموقع والفروع', icon: MapPin, descriptionAr: 'العناوين، روابط الخرائط والإحداثيات' },
  { id: 'policies', nameAr: 'السياسات والشروط', icon: FileText, descriptionAr: 'الإرجاع، التوصيل، الخصوصية والأحكام' },
  { id: 'digital', nameAr: 'الخدمات الرقمية', icon: Sparkles, descriptionAr: 'الخدمات الرقمية والاستشارية' },
  { id: 'notices', nameAr: 'الإعلانات والتنبيهات', icon: Bell, descriptionAr: 'التنبيهات المباشرة للعملاء' },
];

export interface PaymentMethodItem {
  id: string;
  methodType: string;
  displayName: string;
  accountDetails?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface StoreContactItem {
  id: string;
  channelType: string;
  contactValue: string;
  isActive: boolean;
  displayOrder: number;
}

export interface BusinessHourItem {
  id: string;
  dayOfWeek: string;
  isClosed: boolean;
  is24Hours?: boolean;
  openingTime?: string;
  closingTime?: string;
  shifts?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface DeliveryConfigItem {
  id: string;
  isEnabled: boolean;
  deliveryFee?: number;
  currency?: string;
  minimumOrderAmount?: number;
  estimatedDeliveryMinutes?: string | number;
  cashOnDeliveryEnabled?: boolean;
}

export interface DeliveryZoneItem {
  id: string;
  name: string;
  isActive: boolean;
  deliveryFee?: number;
  estimatedDeliveryMinutes?: string | number;
  displayOrder: number;
}

export interface StoreLocationItem {
  id: string;
  name?: string;
  address: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  displayOrder?: number;
}

export interface StorePolicyItem {
  id: string;
  policyType: string;
  title: string;
  content: string;
  isActive: boolean;
  displayOrder: number;
}

export interface DigitalServiceItem {
  id: string;
  name: string;
  serviceType: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface StoreNoticeItem {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  displayOrder: number;
}

export const StoreSettingsAdmin: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [activeCategory, setActiveCategory] = useState<string>('hours');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Authoritative Context (Read-Only UI display)
  const trustedContext = {
    tenantId: 'tnt-41f0d530',
    storeId: 'str-2c6ad81f',
    tenantName: 'متجر الذيباني',
    storeName: 'بقالة الذيباني'
  };

  // Live Domain States
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([
    { id: 'pm-001', methodType: 'bank', displayName: 'بنك الكريمي', accountDetails: '306493341', isActive: false, displayOrder: 1 },
    { id: 'pm-003', methodType: 'wallet', displayName: 'وان كاش', accountDetails: '770493341', isActive: true, displayOrder: 2 },
    { id: 'pm-004', methodType: 'wallet', displayName: 'جيب', accountDetails: '774780112', isActive: true, displayOrder: 3 },
    { id: 'pm-005', methodType: 'wallet', displayName: 'جوالي', accountDetails: '770493341', isActive: true, displayOrder: 4 },
    { id: 'pm-006', methodType: 'cash_on_delivery', displayName: 'الدفع كاش عند الاستلام', accountDetails: '', isActive: true, displayOrder: 5 }
  ]);

  const [storeContacts, setStoreContacts] = useState<StoreContactItem[]>([
    { id: 'cnt-001', channelType: 'whatsapp', contactValue: 'https://wa.me/967770493341', isActive: true, displayOrder: 1 },
    { id: 'cnt-002', channelType: 'phone', contactValue: 'tel:770493341', isActive: true, displayOrder: 2 }
  ]);

  const [businessHours, setBusinessHours] = useState<BusinessHourItem[]>([
    { id: 'bh-sat', dayOfWeek: 'SATURDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-sun', dayOfWeek: 'SUNDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-mon', dayOfWeek: 'MONDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-tue', dayOfWeek: 'TUESDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-wed', dayOfWeek: 'WEDNESDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-thu', dayOfWeek: 'THURSDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-fri', dayOfWeek: 'FRIDAY', isClosed: true, is24Hours: false, openingTime: '', closingTime: '', timezone: 'Asia/Aden' }
  ]);

  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfigItem>({
    id: 'dc-001',
    isEnabled: true,
    deliveryFee: 1000,
    currency: 'YER',
    minimumOrderAmount: 2000,
    estimatedDeliveryMinutes: '30 - 60',
    cashOnDeliveryEnabled: true
  });

  const [deliveryZones, setDeliveryZones] = useState<DeliveryZoneItem[]>([
    { id: 'dz-001', name: 'وسط المدينة - صنعاء', isActive: true, deliveryFee: 1000, estimatedDeliveryMinutes: '30-45', displayOrder: 1 },
    { id: 'dz-002', name: 'حي حدة والأصبحي', isActive: true, deliveryFee: 1500, estimatedDeliveryMinutes: '45-60', displayOrder: 2 }
  ]);

  const [storeLocations, setStoreLocations] = useState<StoreLocationItem[]>([
    { id: 'loc-001', name: 'الفرع الرئيسي', address: 'صنعاء - شارع الزبيري - بجوار الجسر', googleMapsUrl: 'https://maps.google.com/?q=15.3522,44.2081', latitude: 15.3522, longitude: 44.2081, isActive: true, displayOrder: 1 }
  ]);

  const [storePolicies, setStorePolicies] = useState<StorePolicyItem[]>([
    { id: 'pol-001', policyType: 'RETURN', title: 'سياسة الاسترجاع والإبدال', content: 'يمكن استبدال المنتجات التالفة أو غير المطابقة خلال 24 ساعة من الاستلام.', isActive: true, displayOrder: 1 },
    { id: 'pol-002', policyType: 'DELIVERY', title: 'سياسة التوصيل والاستلام', content: 'يتم توصيل الطلبات داخل أمانة العاصمة عبر مناديب المتجر المعتمدين.', isActive: true, displayOrder: 2 }
  ]);

  const [digitalServices, setDigitalServices] = useState<DigitalServiceItem[]>([
    { id: 'ds-001', name: 'إنشاء متاجر إلكترونية للشركات', serviceType: 'STORE_BUILDING', description: 'تصميم وبناء متاجر متكاملة مع ربط حنين لخدمة العملاء الذكية.', isActive: true, displayOrder: 1 }
  ]);

  const [storeNotices, setStoreNotices] = useState<StoreNoticeItem[]>([
    { id: 'not-001', title: 'عروض الموسم والخصومات', content: 'استمتع بتوصيل مجاني للطلبات فوق 10,000 ريال يمني.', isActive: true, displayOrder: 1 }
  ]);

  const fetchLiveSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/owner-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.paymentMethods && data.paymentMethods.length > 0) setPaymentMethods(data.paymentMethods);
          if (data.storeContacts && data.storeContacts.length > 0) setStoreContacts(data.storeContacts);
          if (data.businessHours && data.businessHours.length > 0) setBusinessHours(data.businessHours);
          if (data.deliveryConfiguration) setDeliveryConfig(data.deliveryConfiguration);
          if (data.deliveryZones && data.deliveryZones.length > 0) setDeliveryZones(data.deliveryZones);
          if (data.storeLocations && data.storeLocations.length > 0) setStoreLocations(data.storeLocations);
          if (data.storePolicies && data.storePolicies.length > 0) setStorePolicies(data.storePolicies);
          if (data.digitalServices && data.digitalServices.length > 0) setDigitalServices(data.digitalServices);
          if (data.storeNotices && data.storeNotices.length > 0) setStoreNotices(data.storeNotices);
        }
      }
    } catch (err) {
      console.warn('Could not fetch live settings, using local initial state.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveSettings();
  }, []);

  const handleUpdateDomainItem = async (domain: string, id: string, payload: Record<string, any>) => {
    setIsLoading(true);
    setSaveStatus(null);
    setErrorStatus(null);

    try {
      const res = await fetch('/api/admin/owner-settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, id, data: payload, ...payload })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaveStatus(`تم تحديث وحفظ الإعدادات بنجاح في جدول (${domain})`);
        fetchLiveSettings();
      } else {
        setErrorStatus(data.message || `فشلت عملية التحديث في (${domain})`);
      }
    } catch (err: any) {
      setErrorStatus(`خطأ في الاتصال: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
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
              لوحة التحكم والإعدادات التشغيلية لمالك المتجر
              <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                CMD-036 COMPLETE CONTROL
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              المتجر: {trustedContext.tenantName} ({trustedContext.tenantId}) - {trustedContext.storeName} ({trustedContext.storeId})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Trusted Context Enforced</span>
          </div>

          <button
            onClick={fetchLiveSettings}
            disabled={isLoading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث الإعدادات</span>
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

      {/* Status Notifications */}
      {saveStatus && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/30 px-6 py-2.5 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveStatus}</span>
          </div>
          <span className="text-xs font-mono text-emerald-400/80">Owner Live Control</span>
        </div>
      )}

      {errorStatus && (
        <div className="bg-red-950/80 border-b border-red-500/30 px-6 py-2.5 text-red-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorStatus}</span>
          </div>
          <span className="text-xs font-mono text-red-400/80">Security Constraint</span>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Categories */}
        <aside className="w-64 bg-slate-950/60 border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-400 px-3 py-2 uppercase tracking-wider">أقسام التحكم للمالك</p>
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
                <span className="truncate flex-1">{cat.nameAr}</span>
              </button>
            );
          })}
        </aside>

        {/* View Details Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-900 space-y-6">
          {/* Identity */}
          {activeCategory === 'identity' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-400" />
                هوية المتجر والمعلومات الأساسية
              </h3>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">اسم المتجر الرسمي</label>
                    <input readOnly value={trustedContext.storeName} className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">اسم المؤسسة/المستأجر</label>
                    <input readOnly value={trustedContext.tenantName} className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Haneen Config */}
          {activeCategory === 'haneen' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-400" />
                إعدادات المساعد الذكي (حنين)
              </h3>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3 text-sm">
                <p className="text-slate-300">اسم المساعد: <span className="font-bold text-emerald-400">حنين (Haneen)</span></p>
                <p className="text-slate-300">النبرة: <span className="text-slate-200">مهذبة، محترفة، وودودة بلهجة يمنية راقية.</span></p>
                <p className="text-xs text-slate-400">تعتمد حنين حصرياً على البيانات التشغيلية المؤكدة من أجهزة الأدوات (Tools Facade) بدون أي تخمين أو هلوسة.</p>
              </div>
            </section>
          )}

          {/* Currency */}
          {activeCategory === 'currency' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-400" />
                إعدادات العملة الأساسية (Currency)
              </h3>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2 text-sm">
                <p className="text-slate-300">العملة الأساسية للمتجر: <span className="font-bold text-emerald-400">YER (الريال اليمني)</span></p>
                <p className="text-xs text-slate-400">يتم إظهار جميع الأسعار بالريال اليمني دون إجراء أي تحويلات تلقائية أو استخدام أسعار صرف وهمية.</p>
              </div>
            </section>
          )}

          {/* Business Hours */}
          {activeCategory === 'hours' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" />
                إدارة ساعات العمل (Business Hours)
              </h3>
              <p className="text-xs text-slate-400">إدارة وضع 24/7، الأيام المغلقة، وفترات الفتح والإغلاق لكل يوم بشكل مستقل.</p>

              <div className="space-y-3">
                {businessHours.map((bh) => (
                  <div key={bh.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{bh.dayOfWeek}</span>
                      <p className="text-xs text-slate-400 mt-1">
                        {bh.is24Hours
                          ? 'مفتوح 24/7'
                          : bh.isClosed
                          ? 'مغلق طوال اليوم'
                          : `من ${bh.openingTime || '08:00'} إلى ${bh.closingTime || '23:00'}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateDomainItem('business_hours', bh.id, { is24Hours: !bh.is24Hours, isClosed: false })}
                        className={`px-3 py-1.5 rounded text-xs font-bold border ${
                          bh.is24Hours ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        24/7
                      </button>

                      <button
                        onClick={() => handleUpdateDomainItem('business_hours', bh.id, { isClosed: !bh.isClosed, is24Hours: false })}
                        className={`px-3 py-1.5 rounded text-xs font-bold border ${
                          bh.isClosed ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {bh.isClosed ? 'مغلق' : 'مفتوح'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Delivery Configuration */}
          {activeCategory === 'delivery' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                إعدادات خدمة التوصيل (Delivery Config)
              </h3>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="font-bold text-white text-base">تفعيل خدمة التوصيل العامة</span>
                    <p className="text-xs text-slate-400">عند تعطيل الخدمة لن تعرض حنين التوصيل للعملاء</p>
                  </div>
                  <button
                    onClick={() => handleUpdateDomainItem('delivery_configuration', deliveryConfig.id, { isEnabled: !deliveryConfig.isEnabled })}
                    className={`px-4 py-2 rounded-lg text-xs font-bold border ${
                      deliveryConfig.isEnabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {deliveryConfig.isEnabled ? 'توصيل مُفعّل' : 'توصيل معطّل'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">الحد الأدنى للطلب (YER)</label>
                    <input
                      type="number"
                      value={deliveryConfig.minimumOrderAmount || 0}
                      onChange={(e) => setDeliveryConfig({ ...deliveryConfig, minimumOrderAmount: parseFloat(e.target.value) || 0 })}
                      onBlur={() => handleUpdateDomainItem('delivery_configuration', deliveryConfig.id, { minimumOrderAmount: deliveryConfig.minimumOrderAmount })}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">رسوم التوصيل العامة (YER)</label>
                    <input
                      type="number"
                      value={deliveryConfig.deliveryFee || 0}
                      onChange={(e) => setDeliveryConfig({ ...deliveryConfig, deliveryFee: parseFloat(e.target.value) || 0 })}
                      onBlur={() => handleUpdateDomainItem('delivery_configuration', deliveryConfig.id, { deliveryFee: deliveryConfig.deliveryFee })}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Delivery Zones */}
          {activeCategory === 'zones' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Map className="w-5 h-5 text-emerald-400" />
                مناطق التوصيل المستقلة (Delivery Zones)
              </h3>

              <div className="space-y-3">
                {deliveryZones.map((dz) => (
                  <div key={dz.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{dz.name}</span>
                      <p className="text-xs text-slate-400 mt-1">الرسوم: {dz.deliveryFee} YER | الزمن المتوقع: {dz.estimatedDeliveryMinutes || 'غير محدد'}</p>
                    </div>

                    <button
                      onClick={() => handleUpdateDomainItem('delivery_zones', dz.id, { isActive: !dz.isActive })}
                      className={`px-3 py-1.5 rounded text-xs font-bold border ${
                        dz.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {dz.isActive ? 'منطقة نشطة' : 'معطلة'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Payment Methods */}
          {activeCategory === 'payment' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                وسائل وطرق الدفع المتاحة
              </h3>

              <div className="space-y-3">
                {paymentMethods.map((pm) => (
                  <div key={pm.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{pm.displayName}</span>
                      {pm.accountDetails && <p className="text-xs text-slate-400 mt-1">الحساب: {pm.accountDetails}</p>}
                    </div>

                    <button
                      onClick={() => handleUpdateDomainItem('payment_methods', pm.id, { isActive: !pm.isActive })}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border ${
                        pm.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {pm.isActive ? 'نشط' : 'معطل'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Store Contacts */}
          {activeCategory === 'contact' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-400" />
                وسائل الاتصال وقنوات التواصل
              </h3>

              <div className="space-y-3">
                {storeContacts.map((sc) => (
                  <div key={sc.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{sc.channelType === 'whatsapp' ? 'الواتساب الرسمي' : 'الهاتف المباشر'}</span>
                      <p className="text-xs text-slate-400 mt-1 dir-ltr text-right">{sc.contactValue}</p>
                    </div>

                    <button
                      onClick={() => handleUpdateDomainItem('store_contacts', sc.id, { isActive: !sc.isActive })}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border ${
                        sc.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {sc.isActive ? 'نشط' : 'معطل'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Store Locations */}
          {activeCategory === 'location' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-400" />
                الموقع وفروع المتجر
              </h3>

              <div className="space-y-3">
                {storeLocations.map((loc) => (
                  <div key={loc.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{loc.name || 'الفرع الرئيسي'}</span>
                      <p className="text-xs text-slate-400 mt-1">{loc.address}</p>
                      {loc.googleMapsUrl && <p className="text-xs text-emerald-400 mt-1 dir-ltr text-right">{loc.googleMapsUrl}</p>}
                    </div>

                    <button
                      onClick={() => handleUpdateDomainItem('store_locations', loc.id, { isActive: !loc.isActive })}
                      className={`px-3 py-1.5 rounded text-xs font-bold border ${
                        loc.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {loc.isActive ? 'فرع نشط' : 'معطل'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Store Policies */}
          {activeCategory === 'policies' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                سياسات وشروط المتجر
              </h3>

              <div className="space-y-3">
                {storePolicies.map((pol) => (
                  <div key={pol.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{pol.title} ({pol.policyType})</span>
                      <button
                        onClick={() => handleUpdateDomainItem('store_policies', pol.id, { isActive: !pol.isActive })}
                        className={`px-3 py-1 rounded text-xs font-bold border ${
                          pol.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {pol.isActive ? 'سياسة مفعّلة' : 'معطلة'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 bg-slate-900 p-2 rounded border border-slate-850">{pol.content}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Digital Services */}
          {activeCategory === 'digital' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                الخدمات الرقمية والتجارية
              </h3>

              <div className="space-y-3">
                {digitalServices.map((ds) => (
                  <div key={ds.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{ds.name}</span>
                      {ds.description && <p className="text-xs text-slate-400 mt-1">{ds.description}</p>}
                    </div>

                    <button
                      onClick={() => handleUpdateDomainItem('digital_services', ds.id, { isActive: !ds.isActive })}
                      className={`px-3 py-1.5 rounded text-xs font-bold border ${
                        ds.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {ds.isActive ? 'خدمة مفعّلة' : 'معطلة'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Store Notices */}
          {activeCategory === 'notices' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-emerald-400" />
                الإعلانات والتنبيهات المباشرة
              </h3>

              <div className="space-y-3">
                {storeNotices.map((not) => (
                  <div key={not.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{not.title}</span>
                      <p className="text-xs text-slate-400 mt-1">{not.content}</p>
                    </div>

                    <button
                      onClick={() => handleUpdateDomainItem('store_notices', not.id, { isActive: !not.isActive })}
                      className={`px-3 py-1.5 rounded text-xs font-bold border ${
                        not.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {not.isActive ? 'إعلان مفعّل' : 'معطل'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
