import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import type { RawHolidayRecord } from '../src/domain/holiday';
import type { HolidayProvider } from '../src/providers/holiday-provider';
import { HolidayAggregatorService } from '../src/services/holiday-aggregator.service';

class FailingProvider implements HolidayProvider {
  id = 'failing';
  name = 'Failing Provider';
  baseUrl = 'http://failing.com';

  async fetchHolidays(year: number): Promise<RawHolidayRecord[]> {
    throw new Error(`Upstream server connection failed for year ${year}`);
  }
}

class SuccessfulProvider implements HolidayProvider {
  id = 'successful';
  name = 'Successful Provider';
  baseUrl = 'http://successful.com';

  async fetchHolidays(): Promise<RawHolidayRecord[]> {
    return [
      {
        date: '2026-05-01',
        name: 'Hari Buruh Internasional',
        category: 'national',
        isNationalHoliday: true,
        sourceId: 'successful',
      },
    ];
  }
}

describe('API Error Handling - Upstream Failures', () => {
  it('should succeed with 200 when at least one provider succeeds (partial failure)', async () => {
    const aggregator = new HolidayAggregatorService([
      new FailingProvider(),
      new SuccessfulProvider(),
    ]);

    const app = createApp({ aggregator });

    const res = await app.request('/api?year=2026');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe('Hari Buruh Internasional');
  });

  it('should return 500 when all providers fail (total failure)', async () => {
    const aggregator = new HolidayAggregatorService([
      new FailingProvider(),
      new FailingProvider(),
    ]);

    const app = createApp({ aggregator });

    const res = await app.request('/api?year=2026');
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json).toEqual({
      message: 'Failed to retrieve holiday data.',
    });
  });
});
