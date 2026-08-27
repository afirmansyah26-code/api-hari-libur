import type { HolidayConflict } from './holiday-conflict';

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
 * Level of cross-source verification.
 */
export type HolidayConfidence = 'single_source' | 'multi_source';

/**
 * Raw holiday record returned by an individual provider.
 */
export interface RawHolidayRecord {
  date: string; // Canonical format: 'YYYY-MM-DD'
  name: string; // Original raw text from the upstream source
  category: HolidayCategory;
  isNationalHoliday: boolean;
  sourceId: string;
  slug?: string;
  rawCategory?: string;
}

/**
 * Preserved original upstream metadata from each contributing source.
 */
export interface HolidaySourceAlias {
  sourceId: string;
  name: string;
  date: string;
  category?: HolidayCategory;
  rawCategory?: string;
  slug?: string;
}

/**
 * Date evidence observed across different providers.
 */
export interface ObservedDateEvidence {
  sourceId: string;
  date: string;
  name: string;
}

/**
 * Aggregated, canonical holiday record with provenance and conflict tracking.
 */
export interface CanonicalHoliday {
  /**
   * Primary canonical date (format 'YYYY-MM-DD').
   * Note: In case of date conflict, alternate dates are preserved in `observedDates` and `conflicts`.
   */
  date: string;

  /**
   * Canonical display name.
   */
  name: string;

  /**
   * Resolved holiday category.
   */
  category: HolidayCategory;

  /**
   * Resolved national holiday flag.
   */
  isNationalHoliday: boolean;

  /**
   * List of provider IDs that confirmed this holiday event.
   */
  sources: string[];

  /**
   * Confidence level based on cross-source verification.
   */
  confidence: HolidayConfidence;

  /**
   * Preserved raw records and metadata from each source.
   */
  aliases: HolidaySourceAlias[];

  /**
   * All dates observed across providers for this semantic event.
   */
  observedDates: ObservedDateEvidence[];

  /**
   * Any detected conflicts (date conflict, name variations, category differences).
   */
  conflicts: HolidayConflict[];
}

/**
 * Public DTO for API clients (backward compatibility with existing contract).
 */
export interface PublicHolidayDto {
  name: string;
  date: string;
  is_national_holiday: boolean;
}
