import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import type { RawHolidayRecord } from '../src/domain/holiday';
import type { HolidayProvider } from '../src/providers/holiday-provider';
import { HolidayAggregatorService } from '../src/services/holiday-aggregator.service';
import { getJakartaDate, getJakartaTomorrow } from '../src/utils/timezone';

class MockProvider implements HolidayProvider {
  id = 'mock';
  name = 'Mock Provider';
  baseUrl = 'http://mock.com';

  async fetchHolidays(year: number): Promise<RawHolidayRecord[]> {
    return [
      {
        date: `${year}-01-01`,
        name: `Tahun Baru ${year}`,
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'mock',
      },
      {
        date: '2026-12-25',
        name: 'Hari Raya Natal',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'mock',
      },
    ];
  }
}

describe('API Timezone - Asia/Jakarta WIB (UTC+7) Resolution', () => {
  describe('getJakartaDate and getJakartaTomorrow utilities', () => {
    it('should correctly resolve UTC 18:00 to next day 01:00 WIB in Jakarta', () => {
      // 2026-08-26 18:00:00 UTC = 2026-08-27 01:00:00 WIB
      const utcDate = new Date('2026-08-26T18:00:00Z');
      const jakarta = getJakartaDate(utcDate);

      expect(jakarta.year).toBe(2026);
      expect(jakarta.month).toBe(8);
      expect(jakarta.day).toBe(27);
      expect(jakarta.dateString).toBe('2026-08-27');
    });

    it('should handle year boundary transition deterministically (Dec 31 -> Jan 01)', () => {
      // 2026-12-31 15:00:00 UTC = 2026-12-31 22:00:00 WIB
      const nyEve = new Date('2026-12-31T15:00:00Z');
      const today = getJakartaDate(nyEve);
      const tomorrow = getJakartaTomorrow(nyEve);

      expect(today.dateString).toBe('2026-12-31');
      expect(tomorrow.dateString).toBe('2027-01-01');
      expect(tomorrow.year).toBe(2027);
    });
  });

  describe('Endpoint Behavior with Timezone Mocking', () => {
    it('should return holiday for today when UTC is previous day but WIB is holiday', async () => {
      // 2026-12-24 18:30:00 UTC = 2026-12-25 01:30:00 WIB (Christmas in Jakarta)
      const aggregator = new HolidayAggregatorService([new MockProvider()]);
      const app = createApp({
        aggregator,
        nowProvider: () => new Date('2026-12-24T18:30:00Z'),
      });

      const res = await app.request('/api/today');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.date).toBe('2026-12-25');
      expect(json.is_holiday).toBe(true);
      expect(json.holiday_list).toEqual(['Hari Raya Natal']);
    });

    it('should return tomorrow as New Year across year boundary', async () => {
      // 2026-12-31 10:00:00 UTC = 2026-12-31 17:00:00 WIB
      const aggregator = new HolidayAggregatorService([new MockProvider()]);
      const app = createApp({
        aggregator,
        nowProvider: () => new Date('2026-12-31T10:00:00Z'),
      });

      const res = await app.request('/api/tomorrow');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.date).toBe('2027-01-01');
      expect(json.is_holiday).toBe(true);
      expect(json.holiday_list).toEqual(['Tahun Baru 2027']);
    });
  });
});
