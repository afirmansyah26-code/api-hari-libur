import * as cheerio from 'cheerio';
import { MONTH_NAME } from '../constants/month';
import type { RawHolidayRecord } from '../domain/holiday';
import {
  type HolidayProvider,
  HolidayProviderError,
  HOLIDAY_SOURCE_IDS,
} from './holiday-provider';
import { validateAndFormatDate } from './utils/date-validator';
import { fetchHtml, type FetchHtmlOptions } from './utils/fetch-html';

export class TanggalansProvider implements HolidayProvider {
  readonly id = HOLIDAY_SOURCE_IDS.TANGGALANS;
  readonly name = 'Tanggalans.com';
  readonly baseUrl = 'https://tanggalans.com';

  constructor(private readonly options?: FetchHtmlOptions) {}

  async fetchHolidays(year: number): Promise<RawHolidayRecord[]> {
    const url = `${this.baseUrl}/kalender-${year}`;
    const html = await fetchHtml(this.id, url, this.options);
    return this.parseHtml(html, year);
  }

  parseHtml(html: string, year: number): RawHolidayRecord[] {
    const $ = cheerio.load(html);
    const monthContainers = $('.entry-content .kalender-indo');

    if (monthContainers.length === 0) {
      // Check if any calendar block exists
      const fallbackContainers = $('.kalender-indo');
      if (fallbackContainers.length === 0) {
        throw new HolidayProviderError(
          this.id,
          `Failed to parse holiday data from ${this.id} for year ${year}: expected calendar structure not found`
        );
      }
    }

    const containers =
      monthContainers.length > 0 ? monthContainers : $('.kalender-indo');
    const records: RawHolidayRecord[] = [];

    containers.each((_, container) => {
      const titleText = $(container)
        .find('.kal-title .kal-title-link')
        .text()
        .trim();
      if (!titleText) return;

      const [monthWord] = titleText.toLowerCase().split(/\s+/);
      const monthCode =
        MONTH_NAME[monthWord as keyof typeof MONTH_NAME];
      if (!monthCode) return;

      const monthNum = parseInt(monthCode, 10);

      $(container)
        .find('.kal-libur-list li')
        .each((_, li) => {
          const dayEl = $(li).find('.kal-libur-day');
          if (dayEl.length === 0) return;

          const dayRaw = dayEl.text().trim();

          // Ignore dummy "-" entries for months without holidays
          if (dayRaw === '-' || dayRaw === '') return;

          // Extract holiday name by removing day element
          const liClone = $(li).clone();
          liClone.find('.kal-libur-day').remove();
          const name = liClone.text().replace(/\s+/g, ' ').trim();

          // Skip empty or dummy "Bulan Tanpa Libur" labels
          if (!name || name.toLowerCase().includes('bulan tanpa libur')) return;

          const isCutiBersama = name.toLowerCase().includes('cuti bersama');
          const category = isCutiBersama ? 'cuti_bersama' : 'national';
          const isNationalHoliday = !isCutiBersama;

          // Handle date range (e.g. "21-22")
          if (dayRaw.includes('-')) {
            const [startStr, endStr] = dayRaw.split('-');
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);

            if (
              !isNaN(start) &&
              !isNaN(end) &&
              start <= end &&
              start >= 1 &&
              end <= 31
            ) {
              for (let d = start; d <= end; d++) {
                const formattedDate = validateAndFormatDate(year, monthNum, d);
                if (formattedDate) {
                  records.push({
                    date: formattedDate,
                    name,
                    category,
                    isNationalHoliday,
                    sourceId: this.id,
                  });
                }
              }
            }
          } else {
            const dayNum = parseInt(dayRaw, 10);
            if (!isNaN(dayNum)) {
              const formattedDate = validateAndFormatDate(
                year,
                monthNum,
                dayNum
              );
              if (formattedDate) {
                records.push({
                  date: formattedDate,
                  name,
                  category,
                  isNationalHoliday,
                  sourceId: this.id,
                });
              }
            }
          }
        });
    });

    return records;
  }
}
