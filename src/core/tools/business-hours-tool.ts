import { IDataProvider, DataOperationContext } from '../data/provider';
import { BusinessHour, BusinessHourShift } from '../data/domain';
import { NoHallucinationGuard, GuardEvaluationResult } from './no-hallucination-guard';

export interface StoreStatusDetail {
  isOpenNow: boolean;
  status: 'OPEN' | 'CLOSED' | '24_7' | 'CLOSED_TODAY' | 'OPENS_LATER_TODAY' | 'UNKNOWN';
  currentDayName: string;
  activeShift?: BusinessHourShift;
  nextShift?: BusinessHourShift;
  nextOpeningTime?: string | null;
  closingTime?: string | null;
  timezone: string;
}

export class BusinessHoursTool {
  constructor(private readonly businessHoursProvider: IDataProvider<BusinessHour>) {}

  private parseShifts(hour: BusinessHour): BusinessHourShift[] {
    if (hour.shifts) {
      if (typeof hour.shifts === 'string') {
        try {
          const parsed = JSON.parse(hour.shifts);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Attempt string format parsing "08:00-13:00,16:00-23:00"
          const parts = hour.shifts.split(',');
          const shifts: BusinessHourShift[] = [];
          for (const part of parts) {
            const [open, close] = part.split('-').map((s) => s.trim());
            if (open && close) {
              shifts.push({ openingTime: open, closingTime: close });
            }
          }
          if (shifts.length > 0) return shifts;
        }
      } else if (Array.isArray(hour.shifts)) {
        return hour.shifts;
      }
    }

    if (hour.openingTime && hour.closingTime) {
      return [{ openingTime: hour.openingTime, closingTime: hour.closingTime }];
    }

    return [];
  }

  private normalizeDayName(dayStr: string): string {
    const s = dayStr.trim().toUpperCase();
    if (s.includes('SAT') || s.includes('سبت') || s === '6') return 'SATURDAY';
    if (s.includes('SUN') || s.includes('أحد') || s.includes('احد') || s === '0') return 'SUNDAY';
    if (s.includes('MON') || s.includes('ثنين') || s === '1') return 'MONDAY';
    if (s.includes('TUE') || s.includes('ثلاثاء') || s === '2') return 'TUESDAY';
    if (s.includes('WED') || s.includes('أربعاء') || s.includes('اربعاء') || s === '3') return 'WEDNESDAY';
    if (s.includes('THU') || s.includes('خميس') || s === '4') return 'THURSDAY';
    if (s.includes('FRI') || s.includes('جمعة') || s === '5') return 'FRIDAY';
    return s;
  }

  private getDayOfWeekName(date: Date, timezone: string): string {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: timezone
      });
      return formatter.format(date).toUpperCase();
    } catch {
      const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      return days[date.getUTCDay()];
    }
  }

  private getTimeInMinutes(date: Date, timezone: string): number {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        timeZone: timezone
      });
      const parts = formatter.formatToParts(date);
      let hour = 0;
      let minute = 0;
      for (const p of parts) {
        if (p.type === 'hour') hour = parseInt(p.value, 10);
        if (p.type === 'minute') minute = parseInt(p.value, 10);
      }
      return hour * 60 + minute;
    } catch {
      return date.getUTCHours() * 60 + date.getUTCMinutes();
    }
  }

  private timeStringToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
    return (h || 0) * 60 + (m || 0);
  }

  async getBusinessHours(
    context: DataOperationContext,
    clientContext?: { tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<BusinessHour[]>> {
    NoHallucinationGuard.validateTrustedContext(clientContext, context);

    const result = await this.businessHoursProvider.search({}, context);
    return NoHallucinationGuard.evaluateData(result.items, { entityNameAr: 'ساعات العمل' });
  }

  async getStoreStatus(
    context: DataOperationContext,
    options?: { targetDate?: Date; timezone?: string; tenantId?: string; storeId?: string }
  ): Promise<GuardEvaluationResult<StoreStatusDetail>> {
    NoHallucinationGuard.validateTrustedContext(options, context);

    const result = await this.businessHoursProvider.search({}, context);
    const hours = result.items;

    if (hours.length === 0) {
      return {
        state: 'UNKNOWN',
        data: {
          isOpenNow: false,
          status: 'UNKNOWN',
          currentDayName: '',
          timezone: options?.timezone || 'Asia/Aden'
        },
        message: 'ساعات العمل غير محددة في بيانات المتجر.',
        isConfirmed: false
      };
    }

    const timezone = options?.timezone || hours[0]?.timezone || 'Asia/Aden';
    const targetDate = options?.targetDate || new Date();

    const currentDayName = this.getDayOfWeekName(targetDate, timezone);
    const todayHour = hours.find((h) => this.normalizeDayName(h.dayOfWeek) === currentDayName);

    if (!todayHour) {
      return {
        state: 'UNKNOWN',
        data: {
          isOpenNow: false,
          status: 'UNKNOWN',
          currentDayName,
          timezone
        },
        message: `ساعات العمل ليوم ${currentDayName} غير محددة في بيانات المتجر.`,
        isConfirmed: false
      };
    }

    if (todayHour.is24Hours) {
      return {
        state: 'KNOWN',
        data: {
          isOpenNow: true,
          status: '24_7',
          currentDayName,
          closingTime: null,
          nextOpeningTime: null,
          timezone
        },
        message: 'المتجر يعمل على مدار 24 ساعة اليوم.',
        isConfirmed: true
      };
    }

    if (todayHour.isClosed) {
      return {
        state: 'KNOWN',
        data: {
          isOpenNow: false,
          status: 'CLOSED_TODAY',
          currentDayName,
          timezone
        },
        message: 'المتجر مغلق اليوم.',
        isConfirmed: true
      };
    }

    const shifts = this.parseShifts(todayHour);
    if (shifts.length === 0) {
      return {
        state: 'UNKNOWN',
        data: {
          isOpenNow: false,
          status: 'UNKNOWN',
          currentDayName,
          timezone
        },
        message: 'أوقات العمل اليومية غير المحددة بدقة في البيانات.',
        isConfirmed: false
      };
    }

    const currentMinutes = this.getTimeInMinutes(targetDate, timezone);

    // Check if current time falls within any shift
    let activeShift: BusinessHourShift | undefined;
    let nextShift: BusinessHourShift | undefined;

    for (const shift of shifts) {
      const startMin = this.timeStringToMinutes(shift.openingTime);
      const endMin = this.timeStringToMinutes(shift.closingTime);

      if (currentMinutes >= startMin && currentMinutes < endMin) {
        activeShift = shift;
        break;
      }

      if (currentMinutes < startMin && (!nextShift || startMin < this.timeStringToMinutes(nextShift.openingTime))) {
        nextShift = shift;
      }
    }

    if (activeShift) {
      return {
        state: 'KNOWN',
        data: {
          isOpenNow: true,
          status: 'OPEN',
          currentDayName,
          activeShift,
          closingTime: activeShift.closingTime,
          timezone
        },
        message: `المتجر مفتوح الآن حتى الساعة ${activeShift.closingTime}.`,
        isConfirmed: true
      };
    }

    if (nextShift) {
      return {
        state: 'KNOWN',
        data: {
          isOpenNow: false,
          status: 'OPENS_LATER_TODAY',
          currentDayName,
          nextShift,
          nextOpeningTime: nextShift.openingTime,
          timezone
        },
        message: `المتجر مغلق حالياً وسوف يفتح اليوم الساعة ${nextShift.openingTime}.`,
        isConfirmed: true
      };
    }

    return {
      state: 'KNOWN',
      data: {
        isOpenNow: false,
        status: 'CLOSED',
        currentDayName,
        timezone
      },
      message: 'المتجر مغلق لبقية اليوم.',
      isConfirmed: true
    };
  }
}
