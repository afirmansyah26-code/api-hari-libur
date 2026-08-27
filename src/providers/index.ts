export * from './holiday-provider';
export * from './tanggalans.provider';
export * from './husniadil.provider';
export * from './utils/date-validator';
export * from './utils/fetch-html';

import type { HolidayProvider } from './holiday-provider';

/**
 * Provider registry contract.
 */
export const holidayProviders: HolidayProvider[] = [];
