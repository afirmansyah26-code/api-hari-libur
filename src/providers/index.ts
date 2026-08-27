export * from './holiday-provider';
export * from './tanggalans.provider';
export * from './husniadil.provider';
export * from './utils/date-validator';
export * from './utils/fetch-html';

import type { HolidayProvider } from './holiday-provider';
import { HusniadilProvider } from './husniadil.provider';
import { TanggalansProvider } from './tanggalans.provider';

/**
 * Default provider registry containing active holiday sources.
 */
export const holidayProviders: HolidayProvider[] = [
  new TanggalansProvider(),
  new HusniadilProvider(),
];
