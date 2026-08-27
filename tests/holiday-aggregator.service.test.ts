import { describe, it, expect, vi } from 'vitest';
import type { RawHolidayRecord } from '../src/domain/holiday';
import type { HolidayProvider } from '../src/providers/holiday-provider';
import {
  HolidayAggregationError,
  HolidayAggregatorService,
} from '../src/services/holiday-aggregator.service';

class MockProvider implements HolidayProvider {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly baseUrl: string,
    private readonly records: RawHolidayRecord[] = [],
    private readonly shouldThrow: boolean = false
  ) {}

  async fetchHolidays(year: number): Promise<RawHolidayRecord[]> {
    if (this.shouldThrow) {
      throw new Error(`Provider ${this.id} failed for year ${year}`);
    }
    return this.records;
  }
}

describe('HolidayAggregatorService', () => {
  it('A. Exact Match: should merge identical records from both sources', async () => {
    const tRecords: RawHolidayRecord[] = [
      {
        date: '2026-05-01',
        name: 'Hari Buruh Internasional',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'tanggalans',
      },
    ];

    const hRecords: RawHolidayRecord[] = [
      {
        date: '2026-05-01',
        name: 'Hari Buruh Internasional',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'husniadil',
      },
    ];

    const p1 = new MockProvider('tanggalans', 'Tanggalans', 'http://t.com', tRecords);
    const p2 = new MockProvider('husniadil', 'Husniadil', 'http://h.com', hRecords);

    const aggregator = new HolidayAggregatorService([p1, p2]);
    const result = await aggregator.getHolidays(2026);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hari Buruh Internasional');
    expect(result[0].sources).toEqual(['tanggalans', 'husniadil']);
    expect(result[0].confidence).toBe('multi_source');
    expect(result[0].aliases).toHaveLength(2);
    expect(result[0].conflicts).toHaveLength(0);
  });

  it('B. Name Variation: should merge same-date events and track name_variation conflict', async () => {
    const tRecords: RawHolidayRecord[] = [
      {
        date: '2026-01-16',
        name: 'Isra Mi\'raj Nabi Muhammad SAW',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'tanggalans',
      },
    ];

    const hRecords: RawHolidayRecord[] = [
      {
        date: '2026-01-16',
        name: "Isra' Mi'raj Nabi Muhammad SAW",
        category: 'religious',
        isNationalHoliday: true,
        sourceId: 'husniadil',
      },
    ];

    const p1 = new MockProvider('tanggalans', 'Tanggalans', 'http://t.com', tRecords);
    const p2 = new MockProvider('husniadil', 'Husniadil', 'http://h.com', hRecords);

    const aggregator = new HolidayAggregatorService([p1, p2]);
    const result = await aggregator.getHolidays(2026);

    expect(result).toHaveLength(1);
    expect(result[0].sources).toEqual(['tanggalans', 'husniadil']);
    expect(result[0].confidence).toBe('multi_source');
    expect(result[0].aliases).toHaveLength(2);

    const nameConflict = result[0].conflicts.find((c) => c.type === 'name_variation');
    expect(nameConflict).toBeDefined();

    const catConflict = result[0].conflicts.find((c) => c.type === 'category_conflict');
    expect(catConflict).toBeDefined();
  });

  it('C. Multiple Events Same Date: should keep distinct events on the same date separated', async () => {
    const records: RawHolidayRecord[] = [
      {
        date: '2027-12-25',
        name: 'Hari Raya Natal',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'husniadil',
      },
      {
        date: '2027-12-25',
        name: "Isra' Mi'raj Nabi Muhammad SAW",
        category: 'religious',
        isNationalHoliday: true,
        sourceId: 'husniadil',
      },
    ];

    const p = new MockProvider('husniadil', 'Husniadil', 'http://h.com', records);
    const aggregator = new HolidayAggregatorService([p]);
    const result = await aggregator.getHolidays(2027);

    expect(result).toHaveLength(2);
    const names = result.map((r) => r.name);
    expect(names).toContain('Hari Raya Natal');
    expect(names).toContain("Isra' Mi'raj Nabi Muhammad SAW");
  });

  it('D. Source Only: should preserve event provided by only one source', async () => {
    const hRecords: RawHolidayRecord[] = [
      {
        date: '2027-03-28',
        name: 'Kebangkitan Yesus Kristus (Paskah)',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'husniadil',
      },
    ];

    const p1 = new MockProvider('tanggalans', 'Tanggalans', 'http://t.com', []);
    const p2 = new MockProvider('husniadil', 'Husniadil', 'http://h.com', hRecords);

    const aggregator = new HolidayAggregatorService([p1, p2]);
    const result = await aggregator.getHolidays(2027);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Kebangkitan Yesus Kristus (Paskah)');
    expect(result[0].sources).toEqual(['husniadil']);
    expect(result[0].confidence).toBe('single_source');
  });

  it('E. Partial Provider Failure: should succeed with available provider data when one fails', async () => {
    const hRecords: RawHolidayRecord[] = [
      {
        date: '2026-05-01',
        name: 'Hari Buruh',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'husniadil',
      },
    ];

    const p1 = new MockProvider('tanggalans', 'Tanggalans', 'http://t.com', [], true); // fails
    const p2 = new MockProvider('husniadil', 'Husniadil', 'http://h.com', hRecords); // succeeds

    const aggregator = new HolidayAggregatorService([p1, p2]);
    const result = await aggregator.getHolidays(2026);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hari Buruh');
    expect(result[0].sources).toEqual(['husniadil']);
  });

  it('F. Both Providers Fail: should throw HolidayAggregationError', async () => {
    const p1 = new MockProvider('tanggalans', 'Tanggalans', 'http://t.com', [], true);
    const p2 = new MockProvider('husniadil', 'Husniadil', 'http://h.com', [], true);

    const aggregator = new HolidayAggregatorService([p1, p2]);

    await expect(aggregator.getHolidays(2026)).rejects.toThrow(
      HolidayAggregationError
    );
  });

  it('G. Date Conflict: should detect date_conflict and preserve evidence from both sources', async () => {
    const tRecords: RawHolidayRecord[] = [
      {
        date: '2027-05-17',
        name: 'Hari Raya Idul Adha 1448 Hijriyah',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'tanggalans',
      },
    ];

    const hRecords: RawHolidayRecord[] = [
      {
        date: '2027-05-16',
        name: 'Hari Raya Idul Adha 1448 H',
        category: 'religious',
        isNationalHoliday: true,
        sourceId: 'husniadil',
      },
    ];

    const p1 = new MockProvider('tanggalans', 'Tanggalans', 'http://t.com', tRecords);
    const p2 = new MockProvider('husniadil', 'Husniadil', 'http://h.com', hRecords);

    const aggregator = new HolidayAggregatorService([p1, p2]);
    const result = await aggregator.getHolidays(2027);

    expect(result).toHaveLength(1);
    const event = result[0];

    expect(event.sources).toEqual(['tanggalans', 'husniadil']);
    expect(event.observedDates).toEqual([
      { sourceId: 'tanggalans', date: '2027-05-17', name: 'Hari Raya Idul Adha 1448 Hijriyah' },
      { sourceId: 'husniadil', date: '2027-05-16', name: 'Hari Raya Idul Adha 1448 H' },
    ]);

    const dateConflict = event.conflicts.find((c) => c.type === 'date_conflict');
    expect(dateConflict).toBeDefined();
    expect(dateConflict?.observedDates).toEqual([
      { sourceId: 'tanggalans', date: '2027-05-17' },
      { sourceId: 'husniadil', date: '2027-05-16' },
    ]);
  });

  it('H. Cache Integration: should serve from cache on subsequent calls', async () => {
    const fetchSpy = vi.fn().mockResolvedValue([
      {
        date: '2026-01-01',
        name: 'Tahun Baru',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'tanggalans',
      },
    ]);

    const mockP: HolidayProvider = {
      id: 'tanggalans',
      name: 'Tanggalans',
      baseUrl: 'http://t.com',
      fetchHolidays: fetchSpy,
    };

    const aggregator = new HolidayAggregatorService([mockP]);

    const first = await aggregator.getHolidays(2026);
    expect(first).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await aggregator.getHolidays(2026);
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Served from cache!
  });
});
