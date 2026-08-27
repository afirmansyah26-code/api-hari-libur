/**
 * Validates if year, month, and day form a valid calendar date.
 * Returns formatted 'YYYY-MM-DD' if valid, or null if invalid.
 */
export function validateAndFormatDate(
  year: number,
  month: number,
  day: number
): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) {
    return null;
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}
