/**
 * Domain model for holiday categories.
 */
export type HolidayCategory =
  | 'national'
  | 'cuti_bersama'
  | 'religious'
  | 'observance'
  | 'unknown';

/**
 * Canonical raw holiday record returned by individual providers.
 *
 * Invariants:
 * - `date` MUST always follow ISO-8601 calendar date format: 'YYYY-MM-DD'.
 * - `name` preserves the original raw text from the upstream source.
 * - `sourceId` is a stable identifier (e.g. 'tanggalans', 'husniadil').
 * - `category` is resolved to a known HolidayCategory, or 'unknown' if undetermined.
 */
export interface RawHolidayRecord {
  date: string;
  name: string;
  category: HolidayCategory;
  isNationalHoliday: boolean;
  sourceId: string;
  slug?: string;
  rawCategory?: string;
}
