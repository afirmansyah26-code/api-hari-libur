import * as cheerio from 'cheerio';
import { MONTH_SHORT_NAME } from '../constants/month';
import type { HolidayCategory, RawHolidayRecord } from '../domain/holiday';
import {
  type HolidayProvider,
  HolidayProviderError,
  HOLIDAY_SOURCE_IDS,
} from './holiday-provider';
import { validateAndFormatDate } from './utils/date-validator';
import { fetchHtml, type FetchHtmlOptions } from './utils/fetch-html';

export class HusniadilProvider implements HolidayProvider {
  readonly id = HOLIDAY_SOURCE_IDS.HUSNIADIL;
  readonly name = 'HusniAdil.com';
  readonly baseUrl = 'https://husniadil.com';

  constructor(private readonly options?: FetchHtmlOptions) {}

  async fetchHolidays(year: number): Promise<RawHolidayRecord[]> {
    const url = `${this.baseUrl}/calendar/${year}/`;
    const html = await fetchHtml(this.id, url, this.options);
    return this.parseHtml(html, year);
  }

  parseHtml(html: string, year: number): RawHolidayRecord[] {
    const $ = cheerio.load(html);
    const records: RawHolidayRecord[] = [];

    // Find all holiday card anchors matching the calendar year
    const cardAnchors = $(`a[href*="/calendar/${year}/"]`);

    cardAnchors.each((_, el) => {
      const card = $(el);
      const h3 = card.find('h3');
      if (h3.length === 0) return; // Only process card elements containing holiday title

      const name = h3.text().replace(/\s+/g, ' ').trim();
      if (!name) return;

      const href = card.attr('href') || '';
      const slugMatch = href.match(
        new RegExp(`/calendar/${year}/([^/?#\\s]+)`)
      );
      const slug = slugMatch ? slugMatch[1] : undefined;

      // Extract day number (1-31)
      let dayNum: number | null = null;
      card.find('div').each((_, div) => {
        const text = $(div).text().trim();
        if (/^\d{1,2}$/.test(text)) {
          const num = parseInt(text, 10);
          if (num >= 1 && num <= 31) {
            dayNum = num;
            return false; // break loop
          }
        }
      });

      // Extract month short code (e.g. JAN, FEB, ..., DES)
      let monthCode: string | null = null;
      card.find('div').each((_, div) => {
        const text = $(div).text().trim().toLowerCase();
        if (text in MONTH_SHORT_NAME) {
          monthCode =
            MONTH_SHORT_NAME[text as keyof typeof MONTH_SHORT_NAME];
          return false; // break loop
        }
      });

      if (dayNum === null || !monthCode) return;

      const monthNum = parseInt(monthCode, 10);
      const formattedDate = validateAndFormatDate(year, monthNum, dayNum);
      if (!formattedDate) return;

      // Extract category metadata
      let rawCategory: string | undefined;
      card.find('div').each((_, div) => {
        const text = $(div).text().trim();
        if (
          text.includes('·') ||
          text.toUpperCase().includes('HARI LIBUR') ||
          text.toUpperCase().includes('CUTI BERSAMA')
        ) {
          rawCategory = text.replace(/\s+/g, ' ').trim();
          return false;
        }
      });

      const { category, isNationalHoliday } = this.resolveCategory(
        name,
        rawCategory
      );

      records.push({
        date: formattedDate,
        name,
        category,
        isNationalHoliday,
        sourceId: this.id,
        slug,
        rawCategory,
      });
    });

    if (records.length === 0) {
      throw new HolidayProviderError(
        this.id,
        `Failed to parse holiday data from ${this.id} for year ${year}: expected holiday list not found`
      );
    }

    return records;
  }

  private resolveCategory(
    name: string,
    rawCategory?: string
  ): { category: HolidayCategory; isNationalHoliday: boolean } {
    const lowerRaw = (rawCategory || '').toLowerCase();
    const lowerName = name.toLowerCase();

    if (
      lowerRaw.includes('cuti bersama') ||
      lowerName.includes('cuti bersama')
    ) {
      return { category: 'cuti_bersama', isNationalHoliday: false };
    }

    if (lowerRaw.includes('nasional')) {
      return { category: 'national', isNationalHoliday: true };
    }

    if (lowerRaw.includes('keagamaan')) {
      return { category: 'religious', isNationalHoliday: true };
    }

    if (lowerRaw.includes('observance')) {
      return { category: 'observance', isNationalHoliday: false };
    }

    return {
      category: 'unknown',
      isNationalHoliday: lowerRaw.includes('hari libur'),
    };
  }
}
