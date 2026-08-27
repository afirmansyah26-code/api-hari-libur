import { describe, it, expect } from 'vitest';
import { dateSchema } from '../src/schema/date_schema';

describe('Zod Schema - dateSchema', () => {
  it('should accept valid year', () => {
    const result = dateSchema.safeParse({ year: '2026' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2026);
    }
  });

  it('should accept empty query parameters', () => {
    const result = dateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject year earlier than 2011', () => {
    const result = dateSchema.safeParse({ year: '2010' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Minimum year is 2011');
    }
  });

  it('should reject year greater than currentYear + 1', () => {
    const futureYear = new Date().getFullYear() + 2;
    const result = dateSchema.safeParse({ year: String(futureYear) });
    expect(result.success).toBe(false);
  });

  it('should accept valid year and month', () => {
    const result = dateSchema.safeParse({ year: '2026', month: '5' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.month).toBe(5);
    }
  });

  it('should reject invalid month (e.g. 13)', () => {
    const result = dateSchema.safeParse({ month: '13' });
    expect(result.success).toBe(false);
  });

  it('should accept valid year, month, and day', () => {
    const result = dateSchema.safeParse({
      year: '2026',
      month: '1',
      day: '1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.day).toBe(1);
    }
  });

  it('should reject day without month', () => {
    const result = dateSchema.safeParse({ day: '15' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('month'));
      expect(issue).toBeDefined();
      expect(issue?.message).toBe('Month is required when specifying day');
    }
  });

  it('should reject invalid calendar date (e.g. Feb 31)', () => {
    const result = dateSchema.safeParse({
      year: '2026',
      month: '2',
      day: '31',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('day'));
      expect(issue).toBeDefined();
      expect(issue?.message).toBe('The provided date is not valid');
    }
  });
});
