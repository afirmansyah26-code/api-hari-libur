import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  HolidayProvider,
  HusniadilProvider,
  TanggalansProvider,
} from '../src/providers';
import { HolidayAggregatorService } from '../src/services/holiday-aggregator.service';

const T_DIR = path.join(__dirname, 'fixtures', 'tanggalans');
const H_DIR = path.join(__dirname, 'fixtures', 'husniadil');

class FixtureTanggalansProvider extends TanggalansProvider {
  override async fetchHolidays(year: number) {
    const html = fs.readFileSync(path.join(T_DIR, `${year}.html`), 'utf8');
    return this.parseHtml(html, year);
  }
}

class FixtureHusniadilProvider extends HusniadilProvider {
  override async fetchHolidays(year: number) {
    const html = fs.readFileSync(path.join(H_DIR, `${year}.html`), 'utf8');
    return this.parseHtml(html, year);
  }
}

describe('HolidayAggregator - Real Fixture Aggregation & Regression Tests', () => {
  const p1 = new FixtureTanggalansProvider();
  const p2 = new FixtureHusniadilProvider();
  const aggregator = new HolidayAggregatorService([p1, p2]);

  it('Year 2025: should aggregate both sources smoothly', async () => {
    const canonical = await aggregator.getHolidays(2025, { bypassCache: true });
    expect(canonical.length).toBeGreaterThanOrEqual(28);

    // Exact matches like Hari Buruh should have 2 sources
    const buruh = canonical.find((c) => c.date === '2025-05-01');
    expect(buruh).toBeDefined();
    expect(buruh?.sources).toContain('tanggalans');
    expect(buruh?.sources).toContain('husniadil');
    expect(buruh?.confidence).toBe('multi_source');
  });

  it('Year 2026: should aggregate both sources and merge multi-day Idul Fitri', async () => {
    const canonical = await aggregator.getHolidays(2026, { bypassCache: true });
    expect(canonical.length).toBeGreaterThanOrEqual(25);

    // Check Idul Fitri day 1 (2026-03-21) and day 2 (2026-03-22)
    const idulFitriDay1 = canonical.find((c) => c.date === '2026-03-21');
    const idulFitriDay2 = canonical.find((c) => c.date === '2026-03-22');

    expect(idulFitriDay1).toBeDefined();
    expect(idulFitriDay2).toBeDefined();
    expect(idulFitriDay1?.sources).toContain('tanggalans');
    expect(idulFitriDay1?.sources).toContain('husniadil');
  });

  describe('Year 2027: Specific Edge Cases and Conflict Preservation', () => {
    it('1. Idul Adha 2027: preserves both observed dates and marks date_conflict', async () => {
      const canonical = await aggregator.getHolidays(2027, { bypassCache: true });

      const idulAdha = canonical.find(
        (c) => c.name.includes('Idul Adha') || c.observedDates.some((o) => o.name.includes('Idul Adha'))
      );

      expect(idulAdha).toBeDefined();
      expect(idulAdha?.sources).toContain('tanggalans');
      expect(idulAdha?.sources).toContain('husniadil');

      // Date conflict must be recorded
      const dateConflict = idulAdha?.conflicts.find((c) => c.type === 'date_conflict');
      expect(dateConflict).toBeDefined();
      expect(dateConflict?.observedDates).toEqual([
        { sourceId: 'tanggalans', date: '2027-05-17' },
        { sourceId: 'husniadil', date: '2027-05-16' },
      ]);
    });

    it('2. Isra Mi\'raj late 2027: preserves both observed dates and marks date_conflict', async () => {
      const canonical = await aggregator.getHolidays(2027, { bypassCache: true });

      const israDec = canonical.find(
        (c) =>
          c.name.toLowerCase().includes('isra') &&
          c.observedDates.some((o) => o.date.startsWith('2027-12-'))
      );

      expect(israDec).toBeDefined();
      expect(israDec?.sources).toContain('tanggalans');
      expect(israDec?.sources).toContain('husniadil');

      const dateConflict = israDec?.conflicts.find((c) => c.type === 'date_conflict');
      expect(dateConflict).toBeDefined();
      expect(dateConflict?.observedDates).toEqual([
        { sourceId: 'tanggalans', date: '2027-12-26' },
        { sourceId: 'husniadil', date: '2027-12-25' },
      ]);
    });

    it('3. Natal 2027 on 2027-12-25: remains a distinct event from Isra Mi\'raj', async () => {
      const canonical = await aggregator.getHolidays(2027, { bypassCache: true });

      const natal = canonical.find(
        (c) => c.name.toLowerCase().includes('natal') && !c.name.toLowerCase().includes('cuti')
      );
      const israDec = canonical.find(
        (c) =>
          c.name.toLowerCase().includes('isra') &&
          c.observedDates.some((o) => o.date.startsWith('2027-12-'))
      );

      expect(natal).toBeDefined();
      expect(israDec).toBeDefined();
      expect(natal?.name).not.toBe(israDec?.name);
    });

    it('4. Paskah 2027: single-source event from Husniadil is retained', async () => {
      const canonical = await aggregator.getHolidays(2027, { bypassCache: true });

      const paskah = canonical.find((c) => c.name.toLowerCase().includes('paskah'));
      expect(paskah).toBeDefined();
      expect(paskah?.date).toBe('2027-03-28');
      expect(paskah?.sources).toEqual(['husniadil']);
      expect(paskah?.confidence).toBe('single_source');
    });
  });
});
