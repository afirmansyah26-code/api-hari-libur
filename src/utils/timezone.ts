export interface JakartaDateInfo {
  year: number;
  month: number;
  day: number;
  dateString: string; // Format: 'YYYY-MM-DD'
}

/**
 * Resolves the calendar year, month, day, and date string in Asia/Jakarta (WIB, UTC+7) timezone.
 */
export function getJakartaDate(date: Date = new Date()): JakartaDateInfo {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const formatted = formatter.format(date); // Output format: 'YYYY-MM-DD'
  const [yearStr, monthStr, dayStr] = formatted.split('-');

  return {
    year: parseInt(yearStr, 10),
    month: parseInt(monthStr, 10),
    day: parseInt(dayStr, 10),
    dateString: formatted,
  };
}

/**
 * Calculates tomorrow's calendar date in Asia/Jakarta timezone (current Jakarta day + 1).
 */
export function getJakartaTomorrow(date: Date = new Date()): JakartaDateInfo {
  const current = getJakartaDate(date);
  // Add 1 day deterministically in UTC calendar space at noon
  const nextDate = new Date(
    Date.UTC(current.year, current.month - 1, current.day + 1, 12, 0, 0)
  );

  return getJakartaDate(nextDate);
}
