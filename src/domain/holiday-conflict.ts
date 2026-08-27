/**
 * Types of conflicts that can arise between multiple holiday providers.
 */
export type HolidayConflictType =
  | 'name_variation'
  | 'date_conflict'
  | 'category_conflict'
  | 'national_status_conflict';

/**
 * Detailed representation of a detected conflict.
 */
export interface HolidayConflict {
  type: HolidayConflictType;
  sources: string[];
  details: string[];
  observedDates?: Array<{
    sourceId: string;
    date: string;
  }>;
}
