/**
 * Utility service for normalising holiday names for comparison and semantic key generation.
 *
 * Rules:
 * - Normalisation is strictly used for comparison and grouping.
 * - Raw names are always preserved in domain records.
 */
export class HolidayNormalizer {
  /**
   * Normalises punctuation, quotes, apostrophes, and whitespace.
   */
  static cleanText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[’‘ʻʼ`']/g, '') // Remove all apostrophes for uniform matching
      .replace(/[\/\\,\-—_()"\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalises phrasing and known semantic variants for comparison.
   */
  static normalizeForComparison(name: string): string {
    let s = this.cleanText(name);

    // Normalize religious and formal prefixes
    s = s.replace(/\bhari raya\b/g, '');
    s = s.replace(/\bhari suci\b/g, '');
    s = s.replace(/\bisra\s*mi\s*raj\b/g, 'isra miraj');
    s = s.replace(/\bhijriyah\b/g, 'h');
    s = s.replace(/\bjumat agung\b/g, 'jumat agung');
    s = s.replace(/\bkebangkitan yesus kristus\s*(paskah)?\b/g, 'paskah');
    s = s.replace(/\bwafat yesus kristus\s*(jumat agung)?\b/g, 'wafat yesus kristus jumat agung');

    // Remove Gregorian year if part of "tahun baru [year] masehi"
    s = s.replace(/tahun baru 20\d\d masehi/g, 'tahun baru masehi');
    s = s.replace(/tahun baru masehi 20\d\d/g, 'tahun baru masehi');

    // Normalize cuti bersama variants
    s = s.replace(/\bcuti bersama tahun baru imlek\b/g, 'cuti bersama imlek');
    s = s.replace(/\bcuti bersama hari suci nyepi\b/g, 'cuti bersama nyepi');
    s = s.replace(/\bcuti bersama hari kemerdekaan\b/g, 'cuti bersama kemerdekaan');

    return s.replace(/\s+/g, ' ').trim();
  }

  /**
   * Generates a stable semantic key to identify a unique holiday event within a year.
   */
  static getSemanticKey(name: string, date: string): string {
    const norm = this.normalizeForComparison(name);
    const month = date.slice(5, 7);

    // Differentiate Isra Mi'raj if it occurs in January vs December (e.g. year 2027)
    if (norm.includes('isra miraj')) {
      return month === '01' ? 'isra-miraj-jan' : 'isra-miraj-dec';
    }

    if (norm.includes('tahun baru masehi')) return 'tahun-baru-masehi';
    if (norm.includes('cuti bersama imlek')) return 'cuti-bersama-imlek';
    if (norm.includes('imlek') || norm.includes('kongzili')) return 'tahun-baru-imlek';
    if (norm.includes('cuti bersama nyepi')) return 'cuti-bersama-nyepi';
    if (norm.includes('nyepi') || norm.includes('saka')) return 'hari-raya-nyepi';

    // Idul Fitri handling
    if (norm.includes('cuti bersama') && (norm.includes('idul fitri') || norm.includes('fitri'))) {
      return `cuti-bersama-idul-fitri-${date}`;
    }
    if (norm.includes('idul fitri') || norm.includes('fitri')) {
      return `idul-fitri-${date}`;
    }

    if (norm.includes('wafat yesus kristus') || norm.includes('jumat agung')) {
      return 'wafat-yesus-kristus-jumat-agung';
    }
    if (norm.includes('paskah')) return 'kebangkitan-yesus-kristus-paskah';
    if (norm.includes('hari buruh')) return 'hari-buruh-internasional';
    if (norm.includes('cuti bersama kenaikan yesus')) return 'cuti-bersama-kenaikan-yesus-kristus';
    if (norm.includes('kenaikan yesus kristus')) return 'kenaikan-yesus-kristus';

    // Idul Adha handling (matches across date conflicts like 2027-05-16 vs 2027-05-17)
    if (norm.includes('cuti bersama') && norm.includes('idul adha')) {
      return `cuti-bersama-idul-adha-${date}`;
    }
    if (norm.includes('idul adha')) {
      return 'idul-adha';
    }

    if (norm.includes('cuti bersama waisak')) return 'cuti-bersama-waisak';
    if (norm.includes('waisak')) return 'hari-raya-waisak';
    if (norm.includes('lahir pancasila')) return 'hari-lahir-pancasila';
    if (norm.includes('tahun baru islam') || norm.includes('muharram')) return 'tahun-baru-islam';
    if (norm.includes('cuti bersama kemerdekaan') || norm.includes('cuti bersama hari kemerdekaan')) {
      return 'cuti-bersama-kemerdekaan';
    }
    if (norm.includes('kemerdekaan')) return 'hari-kemerdekaan-ri';
    if (norm.includes('maulid')) return 'maulid-nabi-muhammad';
    if (norm.includes('cuti bersama natal')) return 'cuti-bersama-natal';
    if (norm.includes('natal')) return 'hari-raya-natal';

    // Default slug-like key from date and normalized text
    return `${date}-${norm.replace(/\s+/g, '-')}`;
  }
}
