import { describe, it, expect } from 'vitest';
import { HolidayNormalizer } from '../src/services/holiday-normalizer';

describe('HolidayNormalizer', () => {
  describe('cleanText', () => {
    it('should lowercase and normalize smart quotes and punctuation', () => {
      const text = "Isra’ Mi‘raj / Nabi Muhammad (SAW)";
      const cleaned = HolidayNormalizer.cleanText(text);
      expect(cleaned).toBe('isra miraj nabi muhammad saw');
    });
  });

  describe('normalizeForComparison', () => {
    it('should normalize known religious and formal prefixes', () => {
      expect(
        HolidayNormalizer.normalizeForComparison(
          'Hari Raya Idul Fitri 1447 Hijriyah'
        )
      ).toBe('idul fitri 1447 h');

      expect(
        HolidayNormalizer.normalizeForComparison(
          'Hari Raya Idul Fitri 1447 H'
        )
      ).toBe('idul fitri 1447 h');
    });

    it('should normalize Isra Miraj variations', () => {
      const v1 = HolidayNormalizer.normalizeForComparison(
        "Isra' Mi'raj Nabi Muhammad SAW"
      );
      const v2 = HolidayNormalizer.normalizeForComparison(
        'Isra Mi\'raj Nabi Muhammad SAW'
      );
      expect(v1).toBe('isra miraj nabi muhammad saw');
      expect(v2).toBe('isra miraj nabi muhammad saw');
    });

    it('should normalize Wafat Yesus Kristus variations', () => {
      const v1 = HolidayNormalizer.normalizeForComparison(
        'Wafat Yesus Kristus / Jumat Agung'
      );
      const v2 = HolidayNormalizer.normalizeForComparison(
        'Wafat Yesus Kristus (Jumat Agung)'
      );
      expect(v1).toBe('wafat yesus kristus jumat agung');
      expect(v2).toBe('wafat yesus kristus jumat agung');
    });

    it('should normalize Gregorian year in Tahun Baru Masehi', () => {
      expect(
        HolidayNormalizer.normalizeForComparison('Tahun Baru 2026 Masehi')
      ).toBe('tahun baru masehi');
      expect(
        HolidayNormalizer.normalizeForComparison('Tahun Baru Masehi')
      ).toBe('tahun baru masehi');
    });

    it('should not over-normalize different Islamic years', () => {
      const y1447 = HolidayNormalizer.normalizeForComparison(
        'Hari Raya Idul Adha 1447 H'
      );
      const y1448 = HolidayNormalizer.normalizeForComparison(
        'Hari Raya Idul Adha 1448 H'
      );
      expect(y1447).not.toBe(y1448);
    });
  });

  describe('getSemanticKey', () => {
    it('should generate consistent semantic keys for same events', () => {
      const k1 = HolidayNormalizer.getSemanticKey(
        'Tahun Baru 2026 Masehi',
        '2026-01-01'
      );
      const k2 = HolidayNormalizer.getSemanticKey(
        'Tahun Baru Masehi',
        '2026-01-01'
      );
      expect(k1).toBe('tahun-baru-masehi');
      expect(k2).toBe('tahun-baru-masehi');
    });

    it('should differentiate Isra Miraj in Jan vs Dec (e.g. year 2027)', () => {
      const jan = HolidayNormalizer.getSemanticKey(
        "Isra' Mi'raj Nabi Muhammad SAW",
        '2027-01-05'
      );
      const dec = HolidayNormalizer.getSemanticKey(
        "Isra' Mi'raj Nabi Muhammad SAW",
        '2027-12-25'
      );
      expect(jan).toBe('isra-miraj-jan');
      expect(dec).toBe('isra-miraj-dec');
    });

    it('should map Idul Adha across different dates to the same semantic key for date conflict detection', () => {
      const k1 = HolidayNormalizer.getSemanticKey(
        'Hari Raya Idul Adha 1448 Hijriyah',
        '2027-05-17'
      );
      const k2 = HolidayNormalizer.getSemanticKey(
        'Hari Raya Idul Adha 1448 H',
        '2027-05-16'
      );
      expect(k1).toBe('idul-adha');
      expect(k2).toBe('idul-adha');
    });

    it('should keep Natal and Isra Miraj as distinct semantic keys on the same date', () => {
      const natal = HolidayNormalizer.getSemanticKey(
        'Hari Raya Natal',
        '2027-12-25'
      );
      const isra = HolidayNormalizer.getSemanticKey(
        "Isra' Mi'raj Nabi Muhammad SAW",
        '2027-12-25'
      );
      expect(natal).toBe('hari-raya-natal');
      expect(isra).toBe('isra-miraj-dec');
      expect(natal).not.toBe(isra);
    });
  });
});
