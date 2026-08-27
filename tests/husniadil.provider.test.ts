import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  HolidayProviderError,
  HOLIDAY_SOURCE_IDS,
  HusniadilProvider,
} from '../src/providers';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'husniadil');

function loadFixture(year: number): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${year}.html`), 'utf8');
}

describe('HusniadilProvider', () => {
  const provider = new HusniadilProvider();

  it('should have correct provider metadata', () => {
    expect(provider.id).toBe(HOLIDAY_SOURCE_IDS.HUSNIADIL);
    expect(provider.name).toBe('HusniAdil.com');
    expect(provider.baseUrl).toBe('https://husniadil.com');
  });

  describe('Fixture Parsing - 2025', () => {
    const html = loadFixture(2025);
    const records = provider.parseHtml(html, 2025);

    it('should parse expected number of holidays for 2025', () => {
      expect(records).toHaveLength(28);
    });

    it('should correctly parse first holiday of 2025 with slug and category', () => {
      const first = records[0];
      expect(first.date).toBe('2025-01-01');
      expect(first.name).toBe('Tahun Baru Masehi');
      expect(first.category).toBe('national');
      expect(first.isNationalHoliday).toBe(true);
      expect(first.sourceId).toBe('husniadil');
      expect(first.slug).toBe('tahun-baru');
    });

    it('should correctly map religious category and preserve apostrophes', () => {
      const isra = records.find((r) => r.date === '2025-01-27');
      expect(isra).toBeDefined();
      expect(isra?.name).toBe("Isra' Mi'raj Nabi Muhammad SAW");
      expect(isra?.category).toBe('religious');
      expect(isra?.isNationalHoliday).toBe(true);
      expect(isra?.slug).toBe('isra-miraj');
    });

    it('should correctly map cuti_bersama category', () => {
      const cuti = records.find((r) => r.date === '2025-01-28');
      expect(cuti).toBeDefined();
      expect(cuti?.name).toBe('Cuti Bersama Imlek');
      expect(cuti?.category).toBe('cuti_bersama');
      expect(cuti?.isNationalHoliday).toBe(false);
      expect(cuti?.slug).toBe('cuti-bersama-imlek');
    });
  });

  describe('Fixture Parsing - 2026', () => {
    const html = loadFixture(2026);
    const records = provider.parseHtml(html, 2026);

    it('should parse expected number of holidays for 2026', () => {
      expect(records).toHaveLength(25);
    });

    it('should extract correct slug for each event', () => {
      const waisak = records.find((r) => r.date === '2026-05-31');
      expect(waisak).toBeDefined();
      expect(waisak?.name).toBe('Hari Raya Waisak 2570 BE');
      expect(waisak?.slug).toBe('waisak');
    });
  });

  describe('Fixture Parsing - 2027', () => {
    const html = loadFixture(2027);
    const records = provider.parseHtml(html, 2027);

    it('should parse expected number of holidays for 2027', () => {
      expect(records).toHaveLength(18);
    });

    it('should return multiple records on the same date when source has multiple events (2027-12-25)', () => {
      const dec25Holidays = records.filter((r) => r.date === '2027-12-25');
      expect(dec25Holidays).toHaveLength(2);

      const names = dec25Holidays.map((h) => h.name);
      expect(names).toContain('Hari Raya Natal');
      expect(names).toContain("Isra' Mi'raj Nabi Muhammad SAW");
    });

    it('should preserve upstream metadata verbatim (Idul Adha on 2027-05-16, Nyepi Saka 1949)', () => {
      const idulAdha = records.find((r) => r.date === '2027-05-16');
      expect(idulAdha).toBeDefined();
      expect(idulAdha?.name).toBe('Hari Raya Idul Adha 1448 H');

      const nyepi = records.find((r) => r.date === '2027-03-09');
      expect(nyepi).toBeDefined();
      expect(nyepi?.name).toBe('Hari Raya Nyepi Tahun Baru Saka 1949');
    });
  });

  describe('Error Handling', () => {
    it('should throw HolidayProviderError on HTTP 500 error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      const customProvider = new HusniadilProvider({ fetchFn: mockFetch });

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

      const customProvider = new HusniadilProvider({ fetchFn: mockFetch });

      await expect(customProvider.fetchHolidays(2026)).rejects.toThrow(
        HolidayProviderError
      );
      await expect(customProvider.fetchHolidays(2026)).rejects.toThrow(/timed out/);
    });

    it('should throw HolidayProviderError when HTML has missing holiday list', () => {
      const malformedHtml = '<html><body><div>No holiday list here</div></body></html>';

      expect(() => provider.parseHtml(malformedHtml, 2026)).toThrow(
        HolidayProviderError
      );
      expect(() => provider.parseHtml(malformedHtml, 2026)).toThrow(
        /expected holiday list not found/
      );
    });
  });
});
