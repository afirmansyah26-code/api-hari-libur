import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  HolidayProviderError,
  HOLIDAY_SOURCE_IDS,
  TanggalansProvider,
} from '../src/providers';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'tanggalans');

function loadFixture(year: number): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${year}.html`), 'utf8');
}

describe('TanggalansProvider', () => {
  const provider = new TanggalansProvider();

  it('should have correct provider metadata', () => {
    expect(provider.id).toBe(HOLIDAY_SOURCE_IDS.TANGGALANS);
    expect(provider.name).toBe('Tanggalans.com');
    expect(provider.baseUrl).toBe('https://tanggalans.com');
  });

  describe('Fixture Parsing - 2025', () => {
    const html = loadFixture(2025);
    const records = provider.parseHtml(html, 2025);

    it('should parse expected number of holidays for 2025', () => {
      expect(records).toHaveLength(28);
    });

    it('should not contain any dummy or YYYY-MM-00 dates', () => {
      const invalid = records.filter(
        (r) =>
          r.date.includes('-00') ||
          r.name.toLowerCase().includes('bulan tanpa libur')
      );
      expect(invalid).toHaveLength(0);
    });

    it('should correctly parse first holiday of 2025', () => {
      const first = records[0];
      expect(first.date).toBe('2025-01-01');
      expect(first.name).toBe('Tahun Baru 2025 Masehi');
      expect(first.category).toBe('national');
      expect(first.isNationalHoliday).toBe(true);
      expect(first.sourceId).toBe('tanggalans');
    });

    it('should correctly parse cuti bersama', () => {
      const cuti = records.find((r) => r.date === '2025-01-28');
      expect(cuti).toBeDefined();
      expect(cuti?.name).toBe('Cuti Bersama Tahun Baru Imlek 2576 Kongzili');
      expect(cuti?.category).toBe('cuti_bersama');
      expect(cuti?.isNationalHoliday).toBe(false);
    });
  });

  describe('Fixture Parsing - 2026', () => {
    const html = loadFixture(2026);
    const records = provider.parseHtml(html, 2026);

    it('should parse expected number of holidays for 2026', () => {
      expect(records).toHaveLength(25);
    });

    it('should expand date ranges into individual records (e.g. 21-22 Maret Idul Fitri)', () => {
      const idulFitri21 = records.find((r) => r.date === '2026-03-21');
      const idulFitri22 = records.find((r) => r.date === '2026-03-22');

      expect(idulFitri21).toBeDefined();
      expect(idulFitri22).toBeDefined();
      expect(idulFitri21?.name).toBe('Hari Raya Idul Fitri 1447 Hijriyah');
      expect(idulFitri22?.name).toBe('Hari Raya Idul Fitri 1447 Hijriyah');
    });

    it('should correctly ignore dummy entries in months without holidays', () => {
      // July 2026 has no holidays in Tanggalans
      const julyHolidays = records.filter((r) => r.date.startsWith('2026-07-'));
      expect(julyHolidays).toHaveLength(0);
    });
  });

  describe('Fixture Parsing - 2027', () => {
    const html = loadFixture(2027);
    const records = provider.parseHtml(html, 2027);

    it('should parse expected number of holidays for 2027', () => {
      expect(records).toHaveLength(17);
    });

    it('should preserve upstream metadata verbatim (Nyepi Saka 1947 & Waisak 2569 BE)', () => {
      const nyepi = records.find((r) => r.date === '2027-03-09');
      expect(nyepi).toBeDefined();
      expect(nyepi?.name).toBe('Hari Suci Nyepi Tahun Baru Saka 1947');

      const waisak = records.find((r) => r.date === '2027-05-20');
      expect(waisak).toBeDefined();
      expect(waisak?.name).toBe('Hari Raya Waisak 2569 BE');
    });
  });

  describe('Error Handling', () => {
    it('should throw HolidayProviderError on HTTP 500 error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      const customProvider = new TanggalansProvider({ fetchFn: mockFetch });

      await expect(customProvider.fetchHolidays(2026)).rejects.toThrow(
        HolidayProviderError
      );
      await expect(customProvider.fetchHolidays(2026)).rejects.toThrow(/HTTP 500/);
    });

    it('should throw HolidayProviderError on timeout / AbortError', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      const customProvider = new TanggalansProvider({ fetchFn: mockFetch });

      await expect(customProvider.fetchHolidays(2026)).rejects.toThrow(
        HolidayProviderError
      );
      await expect(customProvider.fetchHolidays(2026)).rejects.toThrow(/timed out/);
    });

    it('should throw HolidayProviderError when HTML has missing calendar structure', () => {
      const malformedHtml = '<html><body><div>No calendar here</div></body></html>';

      expect(() => provider.parseHtml(malformedHtml, 2026)).toThrow(
        HolidayProviderError
      );
      expect(() => provider.parseHtml(malformedHtml, 2026)).toThrow(
        /expected calendar structure not found/
      );
    });
  });
});
