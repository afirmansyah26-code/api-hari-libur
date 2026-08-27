import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import type { RawHolidayRecord } from '../src/domain/holiday';
import type { HolidayProvider } from '../src/providers/holiday-provider';
import { HolidayAggregatorService } from '../src/services/holiday-aggregator.service';

const mockHolidays: RawHolidayRecord[] = [
  {
    date: '2026-01-01',
    name: 'Tahun Baru 2026 Masehi',
    category: 'national',
    isNationalHoliday: true,
    sourceId: 'tanggalans',
  },
  {
    date: '2026-01-16',
    name: "Isra' Mi'raj Nabi Muhammad SAW",
    category: 'religious',
    isNationalHoliday: true,
    sourceId: 'husniadil',
  },
  {
    date: '2026-05-01',
    name: 'Hari Buruh Internasional',
    category: 'national',
    isNationalHoliday: true,
    sourceId: 'tanggalans',
  },
];

class MockProvider implements HolidayProvider {
  id = 'mock';
  name = 'Mock Provider';
  baseUrl = 'http://mock.com';

  async fetchHolidays(year: number): Promise<RawHolidayRecord[]> {
    return mockHolidays.filter((h) => h.date.startsWith(`${year}-`));
  }
}

describe('API Endpoints - Integration & Backward Compatibility', () => {
  const aggregator = new HolidayAggregatorService([new MockProvider()]);
  const app = createApp({
    aggregator,
    nowProvider: () => new Date('2026-01-01T07:00:00+07:00'),
  });

  describe('GET /api', () => {
    it('should return public holiday array for default current year', async () => {
      const res = await app.request('/api');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(3);

      const first = json[0];
      expect(first).toEqual({
        name: 'Tahun Baru 2026 Masehi',
        date: '2026-01-01',
        is_national_holiday: true,
      });

      // Ensure no internal fields leaked
      expect(first.sources).toBeUndefined();
      expect(first.aliases).toBeUndefined();
      expect(first.conflicts).toBeUndefined();
      expect(first.category).toBeUndefined();
    });

    it('should include correct Cache-Control and CORS headers', async () => {
      const res = await app.request('/api?year=2026');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Cache-Control')).toBe(
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
      );
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });

    it('should filter holidays by month when month query is specified', async () => {
      const res = await app.request('/api?year=2026&month=5');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveLength(1);
      expect(json[0].date).toBe('2026-05-01');
      expect(json[0].name).toBe('Hari Buruh Internasional');
    });

    it('should return holiday detail object when day and month are specified', async () => {
      const res = await app.request('/api?year=2026&month=1&day=1');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({
        date: '2026-01-01',
        is_holiday: true,
        is_national_holiday: true,
        holiday_list: ['Tahun Baru 2026 Masehi'],
      });
    });

    it('should return is_holiday: false for non-holiday date', async () => {
      const res = await app.request('/api?year=2026&month=1&day=10');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({
        date: '2026-01-10',
        is_holiday: false,
        is_national_holiday: false,
        holiday_list: [],
      });
    });
  });

  describe('GET /api/today and GET /api/tomorrow', () => {
    it('should return holiday details for today based on Jakarta date', async () => {
      const res = await app.request('/api/today');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.date).toBe('2026-01-01');
      expect(json.is_holiday).toBe(true);
      expect(json.holiday_list).toEqual(['Tahun Baru 2026 Masehi']);
    });

    it('should return non-holiday details for tomorrow', async () => {
      const res = await app.request('/api/tomorrow');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.date).toBe('2026-01-02');
      expect(json.is_holiday).toBe(false);
      expect(json.holiday_list).toEqual([]);
    });
  });
});
