export * from './holiday-provider';

import type { HolidayProvider } from './holiday-provider';

/**
 * Provider registry contract.
 * Note: Provider implementations (TanggalansProvider, HusniadilProvider) will be registered in Phase 3.
 */
export const holidayProviders: HolidayProvider[] = [];
