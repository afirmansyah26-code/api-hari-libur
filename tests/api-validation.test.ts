import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';

describe('API Validation - HTTP 422 Contract', () => {
  const app = createApp({
    nowProvider: () => new Date('2026-06-01T12:00:00+07:00'),
  });

  it('should return 422 when year is earlier than 2011', async () => {
    const res = await app.request('/api?year=1990');
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.message).toBe('The given data was invalid.');
    expect(json.errors.year).toBeDefined();
    expect(json.errors.year[0]).toContain('Minimum year is 2011');
  });

  it('should return 422 when year is greater than currentYear + 1', async () => {
    const res = await app.request('/api?year=2099');
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.message).toBe('The given data was invalid.');
    expect(json.errors.year).toBeDefined();
  });

  it('should return 422 when month is invalid (e.g. 13)', async () => {
    const res = await app.request('/api?month=13');
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.message).toBe('The given data was invalid.');
    expect(json.errors.month).toBeDefined();
  });

  it('should return 422 when day is specified without month', async () => {
    const res = await app.request('/api?day=15');
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.message).toBe('The given data was invalid.');
    expect(json.errors.month).toEqual([
      'Month is required when specifying day',
    ]);
  });

  it('should return 422 when year and day are specified without month', async () => {
    const res = await app.request('/api?year=2026&day=15');
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.message).toBe('The given data was invalid.');
    expect(json.errors.month).toEqual([
      'Month is required when specifying day',
    ]);
  });

  it('should return 422 when providing invalid calendar date (e.g. Feb 31)', async () => {
    const res = await app.request('/api?year=2026&month=2&day=31');
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.message).toBe('The given data was invalid.');
    expect(json.errors.day).toEqual(['The provided date is not valid']);
  });
});
