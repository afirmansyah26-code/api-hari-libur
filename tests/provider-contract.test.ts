import { describe, it, expect } from 'vitest';
import type { RawHolidayRecord } from '../src/domain/holiday';
import {
  type HolidayProvider,
  HolidayProviderError,
  HOLIDAY_SOURCE_IDS,
  holidayProviders,
} from '../src/providers';

// Fake provider implementing HolidayProvider for contract testing
class FakeHolidayProvider implements HolidayProvider {
  readonly id = HOLIDAY_SOURCE_IDS.TANGGALANS;
  readonly name = 'Fake Tanggalans Provider';
  readonly baseUrl = 'https://example.com';

  constructor(
    private readonly records: RawHolidayRecord[] = [],
    private readonly shouldThrow = false
  ) {}

  async fetchHolidays(year: number): Promise<RawHolidayRecord[]> {
    if (this.shouldThrow) {
      throw new HolidayProviderError(
        this.id,
        `Failed to fetch holidays for year ${year}`,
        { cause: new Error('Network timeout') }
      );
    }
    return this.records;
  }
}

describe('HolidayProvider Contract', () => {
  it('should define stable source IDs', () => {
    expect(HOLIDAY_SOURCE_IDS.TANGGALANS).toBe('tanggalans');
    expect(HOLIDAY_SOURCE_IDS.HUSNIADIL).toBe('husniadil');
  });

  it('should return holiday records on successful fetch', async () => {
    const mockRecords: RawHolidayRecord[] = [
      {
        date: '2026-01-01',
        name: 'Tahun Baru 2026 Masehi',
        category: 'national',
        isNationalHoliday: true,
        sourceId: HOLIDAY_SOURCE_IDS.TANGGALANS,
      },
    ];

    const provider = new FakeHolidayProvider(mockRecords);
    const result = await provider.fetchHolidays(2026);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-01-01');
    expect(result[0].name).toBe('Tahun Baru 2026 Masehi');
  });

  it('should return an empty array when source has no holidays', async () => {
    const provider = new FakeHolidayProvider([]);
    const result = await provider.fetchHolidays(2026);

    expect(result).toEqual([]);
  });

  it('should throw HolidayProviderError on upstream failure', async () => {
    const provider = new FakeHolidayProvider([], true);

    await expect(provider.fetchHolidays(2026)).rejects.toThrow(
      HolidayProviderError
    );

    try {
      await provider.fetchHolidays(2026);
    } catch (err) {
      expect(err).toBeInstanceOf(HolidayProviderError);
      const providerError = err as HolidayProviderError;
      expect(providerError.providerId).toBe('tanggalans');
      expect(providerError.message).toContain('Failed to fetch');
      expect(providerError.cause).toBeDefined();
    }
  });

  it('should expose a holidayProviders registry array', () => {
    expect(Array.isArray(holidayProviders)).toBe(true);
  });
});
