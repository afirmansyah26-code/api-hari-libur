import type { RawHolidayRecord } from '../domain/holiday';

/**
 * Stable identifiers for holiday data sources.
 */
export const HOLIDAY_SOURCE_IDS = {
  TANGGALANS: 'tanggalans',
  HUSNIADIL: 'husniadil',
} as const;

export type HolidaySourceId =
  (typeof HOLIDAY_SOURCE_IDS)[keyof typeof HOLIDAY_SOURCE_IDS];

/**
 * Custom error thrown when a holiday provider encounters an upstream failure.
 */
export class HolidayProviderError extends Error {
  readonly providerId: string;
  override readonly cause?: unknown;

  constructor(
    providerId: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = 'HolidayProviderError';
    this.providerId = providerId;
    this.cause = options?.cause;
  }
}

/**
 * Contract for holiday data providers.
 *
 * Rules:
 * - A successful fetch returns `Promise<RawHolidayRecord[]>`.
 * - If the upstream source is valid but contains no holidays, return `[]`.
 * - If the upstream request fails or cannot be parsed, throw `HolidayProviderError`.
 */
export interface HolidayProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;

  fetchHolidays(year: number): Promise<RawHolidayRecord[]>;
}
