import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import type { PublicHolidayDto } from './domain/holiday';
import { zValidator } from './middleware/zod';
import { holidayProviders } from './providers';
import { dateSchema } from './schema/date_schema';
import { HolidayAggregatorService } from './services/holiday-aggregator.service';
import { getJakartaDate, getJakartaTomorrow } from './utils/timezone';
import { LANDING_PAGE_HTML } from './landing-html';

export interface AppOptions {
  aggregator?: HolidayAggregatorService;
  nowProvider?: () => Date;
}

/**
 * Application factory for creating configured Hono instances.
 */
export function createApp(options?: AppOptions): Hono {
  const aggregator =
    options?.aggregator ?? new HolidayAggregatorService(holidayProviders);
  const nowProvider = options?.nowProvider ?? (() => new Date());

  const app = new Hono();

  // 1. Middlewares
  app.use('*', logger());
  app.use(
    '/api/*',
    cors({
      origin: '*',
      allowMethods: ['GET'],
    })
  );

  // Cache-Control header for Edge CDN & browser caching
  app.use('/api/*', async (c, next) => {
    await next();
    if (c.req.method === 'GET' && c.res.status === 200) {
      c.header(
        'Cache-Control',
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
      );
    }
  });

  // 2. Error Handler
  app.onError((err: Error, c: Context) => {
    if (err instanceof HTTPException) {
      return c.json(
        {
          message: err.message,
          errors: err.cause,
        },
        err.status
      );
    }

    console.error('Unhandled app error:', err);

    return c.json(
      {
        message: 'Failed to retrieve holiday data.',
      },
      500
    );
  });

  // 3. Routes
  app.get('/', (c: Context) => {
    return c.html(LANDING_PAGE_HTML);
  });

  app.get('/index.html', (c: Context) => {
    return c.html(LANDING_PAGE_HTML);
  });

  app.get('/api', zValidator('query', dateSchema), async (c: Context) => {
    const yearQuery = c.req.query('year');
    const monthQuery = c.req.query('month');
    const dayQuery = c.req.query('day');

    const year = yearQuery
      ? parseInt(yearQuery, 10)
      : getJakartaDate(nowProvider()).year;

    const holidays = await aggregator.getHolidays(year);

    // Detail date query (e.g. /api?year=2026&month=1&day=1)
    if (dayQuery && monthQuery) {
      const monthPadded = monthQuery.padStart(2, '0');
      const dayPadded = dayQuery.padStart(2, '0');
      const formattedDate = `${year}-${monthPadded}-${dayPadded}`;

      const dayHolidays = holidays.filter((h) => h.date === formattedDate);
      const holidayList = dayHolidays.map((h) => h.name);
      const isNational = dayHolidays.some((h) => h.isNationalHoliday);

      return c.json({
        date: formattedDate,
        is_holiday: holidayList.length > 0,
        is_national_holiday: isNational,
        holiday_list: holidayList,
      });
    }

    // Month-filtered query (e.g. /api?year=2026&month=1)
    if (monthQuery) {
      const monthPadded = monthQuery.padStart(2, '0');
      const prefix = `${year}-${monthPadded}`;

      const monthHolidays = holidays.filter((h) => h.date.startsWith(prefix));
      const responseDto: PublicHolidayDto[] = monthHolidays.map((h) => ({
        name: h.name,
        date: h.date,
        is_national_holiday: h.isNationalHoliday,
      }));

      return c.json(responseDto);
    }

    // Full year query (e.g. /api or /api?year=2026)
    const responseDto: PublicHolidayDto[] = holidays.map((h) => ({
      name: h.name,
      date: h.date,
      is_national_holiday: h.isNationalHoliday,
    }));

    return c.json(responseDto);
  });

  app.get('/api/today', async (c: Context) => {
    const today = getJakartaDate(nowProvider());
    const holidays = await aggregator.getHolidays(today.year);

    const dayHolidays = holidays.filter((h) => h.date === today.dateString);
    const holidayList = dayHolidays.map((h) => h.name);
    const isNational = dayHolidays.some((h) => h.isNationalHoliday);

    return c.json({
      date: today.dateString,
      is_holiday: holidayList.length > 0,
      is_national_holiday: isNational,
      holiday_list: holidayList,
    });
  });

  app.get('/api/tomorrow', async (c: Context) => {
    const tomorrow = getJakartaTomorrow(nowProvider());
    const holidays = await aggregator.getHolidays(tomorrow.year);

    const dayHolidays = holidays.filter((h) => h.date === tomorrow.dateString);
    const holidayList = dayHolidays.map((h) => h.name);
    const isNational = dayHolidays.some((h) => h.isNationalHoliday);

    return c.json({
      date: tomorrow.dateString,
      is_holiday: holidayList.length > 0,
      is_national_holiday: isNational,
      holiday_list: holidayList,
    });
  });

  return app;
}

export const app = createApp();
