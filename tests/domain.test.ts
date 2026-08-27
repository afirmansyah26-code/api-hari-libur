import { describe, it, expect } from 'vitest';
import type { HolidayCategory, RawHolidayRecord } from '../src/domain/holiday';

describe('Domain Model - RawHolidayRecord', () => {
  it('should represent a valid raw holiday record', () => {
    const record: RawHolidayRecord = {
      date: '2026-01-01',
      name: 'Tahun Baru 2026 Masehi',
      category: 'national',
      isNationalHoliday: true,
      sourceId: 'tanggalans',
    };

    expect(record.date).toBe('2026-01-01');
    expect(record.name).toBe('Tahun Baru 2026 Masehi');
    expect(record.category).toBe('national');
    expect(record.isNationalHoliday).toBe(true);
    expect(record.sourceId).toBe('tanggalans');
  });

  it('should support optional slug and rawCategory', () => {
    const record: RawHolidayRecord = {
      date: '2026-02-16',
      name: 'Cuti Bersama Imlek',
      category: 'cuti_bersama',
      isNationalHoliday: false,
      sourceId: 'husniadil',
      slug: 'cuti-bersama-imlek',
      rawCategory: 'CUTI BERSAMA · KEAGAMAAN · SENIN',
    };

    expect(record.slug).toBe('cuti-bersama-imlek');
    expect(record.rawCategory).toBe('CUTI BERSAMA · KEAGAMAAN · SENIN');
  });

  it('should adhere to supported category types', () => {
    const categories: HolidayCategory[] = [
      'national',
      'cuti_bersama',
      'religious',
      'observance',
      'unknown',
    ];

    expect(categories).toHaveLength(5);
  });
});
